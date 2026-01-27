import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { systemSettings } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function getSystemSetting(db: Database, key: string): Promise<string | null> {
  return withQueryLogging(
    'getSystemSetting',
    { key },
    async () => {
      const setting = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, key),
      });
      return setting?.value || null;
    }
  );
}

export async function getSystemSettingAsNumber(db: Database, key: string, defaultValue: number): Promise<number> {
  return withQueryLogging(
    'getSystemSettingAsNumber',
    { key, defaultValue },
    async () => {
      const value = await getSystemSetting(db, key);
      if (!value) return defaultValue;
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? defaultValue : parsed;
    }
  );
}

export async function getAllSystemSettings(db: Database) {
  return withQueryLogging(
    'getAllSystemSettings',
    {},
    async () => {
      return await db.query.systemSettings.findMany({
        orderBy: (settings, { asc }) => [asc(settings.key)],
      });
    }
  );
}

export async function setSystemSetting(
  db: Database,
  key: string,
  value: string,
  description?: string,
  updatedBy?: string
) {
  return withMutationLogging(
    'setSystemSetting',
    { key, value, description, updatedBy },
    async () => {
      const existing = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, key),
      });

      if (existing) {
        const [updated] = await db
          .update(systemSettings)
          .set({
            value,
            description: description !== undefined ? description : existing.description,
            updatedBy: updatedBy || existing.updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.key, key))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(systemSettings)
          .values({
            key,
            value,
            description,
            updatedBy,
          })
          .returning();
        return created;
      }
    }
  );
}


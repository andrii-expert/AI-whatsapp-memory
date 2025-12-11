import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { userFileFolders } from "../schema";
import { withMutationLogging, withQueryLogging } from "../utils/query-logger";

export async function getUserFileFolders(db: Database, userId: string) {
  return withQueryLogging(
    "getUserFileFolders",
    { userId },
    async () => {
      return db.query.userFileFolders.findMany({
        where: eq(userFileFolders.userId, userId),
        orderBy: (folders, { asc }) => [asc(folders.name)],
      });
    }
  );
}

export async function createUserFileFolder(db: Database, data: { userId: string; name: string }) {
  return withMutationLogging(
    "createUserFileFolder",
    { userId: data.userId, name: data.name },
    async () => {
      const [folder] = await db.insert(userFileFolders).values(data).returning();
      return folder;
    }
  );
}

export async function updateUserFileFolder(
  db: Database,
  folderId: string,
  userId: string,
  data: { name?: string },
) {
  return withMutationLogging(
    "updateUserFileFolder",
    { folderId, userId },
    async () => {
      const [folder] = await db
        .update(userFileFolders)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(userFileFolders.id, folderId), eq(userFileFolders.userId, userId)))
        .returning();
      return folder;
    }
  );
}

export async function deleteUserFileFolder(db: Database, folderId: string, userId: string) {
  return withMutationLogging(
    "deleteUserFileFolder",
    { folderId, userId },
    async () => {
      await db
        .delete(userFileFolders)
        .where(and(eq(userFileFolders.id, folderId), eq(userFileFolders.userId, userId)));
      return { success: true };
    }
  );
}


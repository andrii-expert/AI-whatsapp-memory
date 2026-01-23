import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { userPreferences } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function createUserPreferences(db: Database, userId: string) {
  return withMutationLogging(
    'createUserPreferences',
    { userId },
    async () => {
      const [preferences] = await db
        .insert(userPreferences)
        .values({
          userId,
        })
        .returning();
        
      return preferences;
    }
  );
}

export async function updateNotificationPreferences(
  db: Database,
  userId: string,
  preferences: {
    marketingEmails?: boolean;
    productUpdates?: boolean;
    reminderNotifications?: boolean;
    calendarNotifications?: boolean;
  }
) {
  return withMutationLogging(
    'updateNotificationPreferences',
    { userId, updates: Object.keys(preferences) },
    async () => {
      const [updated] = await db
        .update(userPreferences)
        .set({
          ...preferences,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();
        
      return updated;
    }
  );
}

export async function updateReminderSettings(
  db: Database,
  userId: string,
  settings: {
    reminderMinutes: number;
    reminderNotifications: boolean;
  }
) {
  return withMutationLogging(
    'updateReminderSettings',
    { userId, reminderMinutes: settings.reminderMinutes },
    async () => {
      const [updated] = await db
        .update(userPreferences)
        .set({
          ...settings,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();
        
      return updated;
    }
  );
}

export async function updateLocaleSettings(
  db: Database,
  userId: string,
  locale: {
    timezone?: string;
    dateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
    timeFormat?: "12h" | "24h";
  }
) {
  return withMutationLogging(
    'updateLocaleSettings',
    { userId, updates: Object.keys(locale) },
    async () => {
      const [updated] = await db
        .update(userPreferences)
        .set({
          ...locale,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();
        
      return updated;
    }
  );
}

export async function updateCalendarSettings(
  db: Database,
  userId: string,
  settings: {
    calendarNotificationMinutes?: number;
  }
) {
  return withMutationLogging(
    'updateCalendarSettings',
    { userId, calendarNotificationMinutes: settings.calendarNotificationMinutes },
    async () => {
      const [updated] = await db
        .update(userPreferences)
        .set({
          ...settings,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();

      return updated;
    }
  );
}

export async function updateWhatsAppCalendarSettings(
  db: Database,
  userId: string,
  whatsappCalendarIds: string[]
) {
  return withMutationLogging(
    'updateWhatsAppCalendarSettings',
    { userId, whatsappCalendarIds },
    async () => {
      const [updated] = await db
        .update(userPreferences)
        .set({
          whatsappCalendarIds,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();

      return updated;
    }
  );
}

export async function getWhatsAppCalendars(
  db: Database,
  userId: string
): Promise<string[]> {
  return withQueryLogging(
    'getWhatsAppCalendars',
    { userId },
    async () => {
      const preferences = await db
        .select({
          whatsappCalendarIds: userPreferences.whatsappCalendarIds,
        })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);

      return preferences[0]?.whatsappCalendarIds || [];
    }
  );
}

export async function updateVisibleCalendarSettings(
  db: Database,
  userId: string,
  visibleCalendarIds: string[]
) {
  return withMutationLogging(
    'updateVisibleCalendarSettings',
    { userId, visibleCalendarIds },
    async () => {
      const [updated] = await db
        .update(userPreferences)
        .set({
          visibleCalendarIds,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();

      return updated;
    }
  );
}

export async function getVisibleCalendars(
  db: Database,
  userId: string
): Promise<string[]> {
  return withQueryLogging(
    'getVisibleCalendars',
    { userId },
    async () => {
      const preferences = await db
        .select({
          visibleCalendarIds: userPreferences.visibleCalendarIds,
        })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);

      return preferences[0]?.visibleCalendarIds || [];
    }
  );
}

export async function setDefaultCalendar(db: Database, userId: string, calendarId: string | null) {
  return withMutationLogging(
    'setDefaultCalendar',
    { userId, calendarId },
    async () => {
      const [updated] = await db
        .update(userPreferences)
        .set({
          defaultCalendarId: calendarId,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();

      return updated;
    }
  );
}

export async function resetPreferencesToDefault(db: Database, userId: string) {
  return withMutationLogging(
    'resetPreferencesToDefault',
    { userId },
    async () => {
      const [reset] = await db
        .update(userPreferences)
        .set({
          marketingEmails: true,
          productUpdates: true,
          reminderNotifications: true,
          calendarNotifications: true,
          reminderMinutes: 10,
          calendarNotificationMinutes: 10,
          defaultCalendarId: null,
          timezone: "Africa/Johannesburg",
          dateFormat: "DD/MM/YYYY",
          timeFormat: "24h",
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();

      return reset;
    }
  );
}
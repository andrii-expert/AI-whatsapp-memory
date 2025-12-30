import { eq, and, desc, inArray, or } from "drizzle-orm";
import type { Database } from "../client";
import { calendarConnections, userPreferences } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function getUserCalendars(db: Database, userId: string) {
  return withQueryLogging(
    'getUserCalendars',
    { userId },
    () => db.query.calendarConnections.findMany({
      where: eq(calendarConnections.userId, userId),
      orderBy: [desc(calendarConnections.createdAt)],
    })
  );
}

export async function getActiveCalendars(db: Database, userId: string) {
  return withQueryLogging(
    'getActiveCalendars',
    { userId },
    () => db.query.calendarConnections.findMany({
      where: and(
        eq(calendarConnections.userId, userId),
        eq(calendarConnections.isActive, true)
      ),
    })
  );
}

export async function getCalendarById(db: Database, id: string) {
  return withQueryLogging(
    'getCalendarById',
    { calendarId: id },
    () => db.query.calendarConnections.findFirst({
      where: eq(calendarConnections.id, id),
    })
  );
}

export async function getCalendarsByIds(db: Database, calendarIds: string[]) {
  return withQueryLogging(
    'getCalendarsByIds',
    { calendarIds },
    () => db.query.calendarConnections.findMany({
      where: inArray(calendarConnections.id, calendarIds),
    })
  );
}

export async function getCalendarsByProviderCalendarIds(db: Database, userId: string, providerCalendarIds: string[]) {
  return withQueryLogging(
    'getCalendarsByProviderCalendarIds',
    { userId, providerCalendarIds },
    () => {
      // Build conditions: match by calendarId OR email
      // For calendars with null calendarId (primary calendars), match by email
      const conditions = [
        eq(calendarConnections.userId, userId),
        or(
          inArray(calendarConnections.calendarId, providerCalendarIds),
          inArray(calendarConnections.email, providerCalendarIds)
        )
      ];
      
      return db.query.calendarConnections.findMany({
        where: and(...conditions),
      });
    }
  );
}

export async function getPrimaryCalendar(db: Database, userId: string) {
  return withQueryLogging(
    'getPrimaryCalendar',
    { userId },
    () => db.query.calendarConnections.findFirst({
      where: and(
        eq(calendarConnections.userId, userId),
        eq(calendarConnections.isPrimary, true)
      ),
    })
  );
}

export async function createCalendarConnection(db: Database, data: {
  userId: string;
  provider: "google" | "microsoft";
  email: string;
  calendarId?: string;
  calendarName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  providerAccountId?: string;
  providerData?: string;
  isPrimary?: boolean; // Allow explicit primary setting
}) {
  return withMutationLogging(
    'createCalendarConnection',
    { userId: data.userId, provider: data.provider, email: data.email },
    async () => {
      // If isPrimary is explicitly set, use it; otherwise check if this is the first calendar
      let isPrimary: boolean;
      if (data.isPrimary !== undefined) {
        isPrimary = data.isPrimary;
        // If setting as primary, remove primary from all other calendars
        if (isPrimary) {
          await db
            .update(calendarConnections)
            .set({ isPrimary: false })
            .where(eq(calendarConnections.userId, data.userId));
        }
      } else {
        // Check if this is the first calendar for the user
        const existingCalendars = await getUserCalendars(db, data.userId);
        isPrimary = existingCalendars.length === 0;
      }
      
      const [calendar] = await db
        .insert(calendarConnections)
        .values({
          ...data,
          isPrimary,
        })
        .returning();
        
      return calendar;
    }
  );
}

export async function updateCalendarConnection(
  db: Database,
  id: string,
  data: {
    calendarId?: string;
    calendarName?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date;
    isActive?: boolean;
    lastSyncAt?: Date;
    lastSyncError?: string;
    syncFailureCount?: number;
  }
) {
  return withMutationLogging(
    'updateCalendarConnection',
    { calendarId: id, updates: Object.keys(data) },
    async () => {
      const [updated] = await db
        .update(calendarConnections)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(calendarConnections.id, id))
        .returning();
        
      return updated;
    }
  );
}

export async function setPrimaryCalendar(db: Database, userId: string, calendarId: string) {
  return withMutationLogging(
    'setPrimaryCalendar',
    { userId, calendarId },
    () => db.transaction(async (tx) => {
      // Remove primary from all calendars
      await tx
        .update(calendarConnections)
        .set({ isPrimary: false })
        .where(eq(calendarConnections.userId, userId));
      
      // Set new primary
      const [updated] = await tx
        .update(calendarConnections)
        .set({ 
          isPrimary: true,
          updatedAt: new Date(),
        })
        .where(and(
          eq(calendarConnections.id, calendarId),
          eq(calendarConnections.userId, userId)
        ))
        .returning();
        
      return updated;
    })
  );
}

export async function disconnectCalendar(db: Database, id: string) {
  return withMutationLogging(
    'disconnectCalendar',
    { calendarId: id },
    async () => {
      // Get the calendar to check if it's primary
      const calendar = await getCalendarById(db, id);
      const wasPrimary = calendar?.isPrimary;
      const userId = calendar?.userId;
      
      const [disconnected] = await db
        .update(calendarConnections)
        .set({
          isActive: false,
          isPrimary: false, // Remove primary status when disconnecting
          accessToken: null,
          refreshToken: null,
          updatedAt: new Date(),
        })
        .where(eq(calendarConnections.id, id))
        .returning();
      
      // If the disconnected calendar was primary, set the first active calendar as primary
      if (wasPrimary && userId) {
        const activeCalendars = await getActiveCalendars(db, userId);
        if (activeCalendars.length > 0) {
          // Set the first active calendar as primary
          await setPrimaryCalendar(db, userId, activeCalendars[0]!.id);
        }
      }
        
      return disconnected;
    }
  );
}

export async function deleteCalendarConnection(db: Database, id: string) {
  return withMutationLogging(
    'deleteCalendarConnection',
    { calendarId: id },
    async () => {
      // Get the calendar to check if it's primary
      const calendar = await getCalendarById(db, id);
      const wasPrimary = calendar?.isPrimary;
      const userId = calendar?.userId;
      
      // Delete the calendar
      await db.delete(calendarConnections).where(eq(calendarConnections.id, id));
      
      // If the deleted calendar was primary, set the first active calendar as primary
      if (wasPrimary && userId) {
        const activeCalendars = await getActiveCalendars(db, userId);
        if (activeCalendars.length > 0) {
          // Set the first active calendar as primary
          await setPrimaryCalendar(db, userId, activeCalendars[0]!.id);
        }
      }
      
      return { success: true };
    }
  );
}

export async function updateCalendarTokens(
  db: Database,
  id: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
  }
) {
  return withMutationLogging(
    'updateCalendarTokens',
    { calendarId: id },
    async () => {
      const [updated] = await db
        .update(calendarConnections)
        .set({
          ...tokens,
          updatedAt: new Date(),
        })
        .where(eq(calendarConnections.id, id))
        .returning();
      
      return updated;
    }
  );
}

export async function recordSyncError(db: Database, id: string, error: string) {
  const calendar = await getCalendarById(db, id);
  if (!calendar) return null;
  
  const newFailureCount = (calendar.syncFailureCount || 0) + 1;
  
  const [updated] = await db
    .update(calendarConnections)
    .set({
      lastSyncError: error,
      syncFailureCount: newFailureCount,
      // Disable if too many failures
      isActive: newFailureCount < 5,
      updatedAt: new Date(),
    })
    .where(eq(calendarConnections.id, id))
    .returning();
    
  return updated;
}

export async function recordSuccessfulSync(db: Database, id: string) {
  const [updated] = await db
    .update(calendarConnections)
    .set({
      lastSyncAt: new Date(),
      lastSyncError: null,
      syncFailureCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(calendarConnections.id, id))
    .returning();

  return updated;
}

export async function getUsersWithCalendarNotifications(db: Database) {
  return withQueryLogging(
    'getUsersWithCalendarNotifications',
    {},
    () => db.query.calendarConnections.findMany({
      where: and(
        eq(calendarConnections.isActive, true)
      ),
      with: {
        user: {
          with: {
            preferences: true
          }
        }
      }
    })
  );
}
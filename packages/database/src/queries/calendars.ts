import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../client";
import { calendarConnections } from "../schema";
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
}) {
  return withMutationLogging(
    'createCalendarConnection',
    { userId: data.userId, provider: data.provider, email: data.email },
    async () => {
      // Check if this is the first calendar for the user
      const existingCalendars = await getUserCalendars(db, data.userId);
      const isPrimary = existingCalendars.length === 0;
      
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
      const [disconnected] = await db
        .update(calendarConnections)
        .set({
          isActive: false,
          accessToken: null,
          refreshToken: null,
          updatedAt: new Date(),
        })
        .where(eq(calendarConnections.id, id))
        .returning();
        
      return disconnected;
    }
  );
}

export async function deleteCalendarConnection(db: Database, id: string) {
  return withMutationLogging(
    'deleteCalendarConnection',
    { calendarId: id },
    () => db.delete(calendarConnections).where(eq(calendarConnections.id, id))
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
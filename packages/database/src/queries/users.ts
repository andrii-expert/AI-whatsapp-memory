import { eq, and, ne } from "drizzle-orm";
import type { Database } from "../client";
import { users, userPreferences, subscriptions } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function getUserById(db: Database, id: string) {
  return withQueryLogging(
    'getUserById',
    { userId: id },
    () => db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        preferences: true,
        subscription: true,
      },
    })
  );
}

// Lightweight function for onboarding check - no joins, just basic user fields
export async function checkUserOnboardingStatus(db: Database, id: string) {
  return withQueryLogging(
    'checkUserOnboardingStatus',
    { userId: id },
    () => db.query.users.findFirst({
      where: eq(users.id, id),
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        name: true, // DEPRECATED - for backward compatibility
        phone: true,
      },
    })
  );
}

// Check if user has admin privileges
export async function checkUserAdminStatus(db: Database, id: string) {
  return withQueryLogging(
    'checkUserAdminStatus',
    { userId: id },
    () => db.query.users.findFirst({
      where: eq(users.id, id),
      columns: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
      },
    })
  );
}

export async function getUserByEmail(db: Database, email: string) {
  return withQueryLogging(
    'getUserByEmail',
    { email },
    () => db.query.users.findFirst({
      where: eq(users.email, email),
      with: {
        preferences: true,
      },
    })
  );
}

export async function getUserByPhone(db: Database, phone: string, excludeUserId?: string) {
  return withQueryLogging(
    'getUserByPhone',
    { phone, excludeUserId },
    () => db.query.users.findFirst({
      where: excludeUserId 
        ? and(eq(users.phone, phone), ne(users.id, excludeUserId))
        : eq(users.phone, phone),
    })
  );
}

export async function createUser(
  db: Database,
  data: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    name?: string; // DEPRECATED - for backward compatibility
    country?: string;
    ageGroup?: string;
    gender?: string;
    birthday?: Date;
    mainUse?: string;
    howHeardAboutUs?: string;
    phone?: string;
    company?: string;
    avatarUrl?: string;
  }
) {
  return withMutationLogging(
    'createUser',
    { userId: data.id, email: data.email },
    () => db.transaction(async (tx) => {
      // Convert Date to string for the birthday field
      const insertData = {
        ...data,
        birthday: data.birthday ? data.birthday.toISOString().split('T')[0] : undefined,
      };

      const [user] = await tx.insert(users).values(insertData).returning();

      if (!user) {
        throw new Error("Failed to create user");
      }

      // Create default preferences
      await tx.insert(userPreferences).values({
        userId: user.id,
      });

      return user;
    })
  );
}

export async function updateUser(
  db: Database,
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    name?: string; // DEPRECATED - for backward compatibility
    country?: string;
    ageGroup?: string;
    gender?: string;
    birthday?: Date;
    mainUse?: string;
    howHeardAboutUs?: string;
    phone?: string;
    phoneVerified?: boolean;
    company?: string;
    avatarUrl?: string;
  }
) {
  return withMutationLogging(
    'updateUser',
    { userId: id, updates: Object.keys(data) },
    async () => {
      // Convert Date to string for the birthday field (date type in DB)
      const updateData = {
        ...data,
        birthday: data.birthday ? data.birthday.toISOString().split('T')[0] : undefined,
        updatedAt: new Date(),
      };

      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning();

      return updated;
    }
  );
}

export async function deleteUser(db: Database, id: string) {
  return withMutationLogging(
    'deleteUser',
    { userId: id },
    () => db.delete(users).where(eq(users.id, id))
  );
}

export async function getAllUsers(db: Database) {
  return withQueryLogging(
    'getAllUsers',
    {},
    () => db.select().from(users)
  );
}

export async function deleteUserAndAllData(
  db: Database,
  userId: string
) {
  return withMutationLogging(
    'deleteUserAndAllData',
    { userId },
    async () => {
      const { activityLogs, payments, subscriptions, calendarConnections, whatsappNumbers } = await import('../schema');
      
      // Delete in correct order to respect foreign key constraints
      await db.delete(activityLogs).where(eq(activityLogs.userId, userId));
      await db.delete(payments).where(eq(payments.userId, userId));
      await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
      await db.delete(calendarConnections).where(eq(calendarConnections.userId, userId));
      await db.delete(whatsappNumbers).where(eq(whatsappNumbers.userId, userId));
      
      // Finally delete the user
      const result = await db.delete(users).where(eq(users.id, userId));
      
      return result;
    }
  );
}

export async function getUserPreferences(db: Database, userId: string) {
  return withQueryLogging(
    'getUserPreferences',
    { userId },
    () => db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
    })
  );
}

export async function updateUserPreferences(
  db: Database,
  userId: string,
  data: {
    marketingEmails?: boolean;
    productUpdates?: boolean;
    reminderNotifications?: boolean;
    reminderMinutes?: number;
    defaultCalendarId?: string;
    timezone?: string;
    dateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
    timeFormat?: "12h" | "24h";
  }
) {
  return withMutationLogging(
    'updateUserPreferences',
    { userId, updates: Object.keys(data) },
    async () => {
      const [updated] = await db
        .update(userPreferences)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();
      
      return updated;
    }
  );
}
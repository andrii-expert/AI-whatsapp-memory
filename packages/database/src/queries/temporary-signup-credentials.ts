import { eq, and, lt } from "drizzle-orm";
import type { Database } from "../client";
import { temporarySignupCredentials } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";
import { logger } from "@imaginecalendar/logger";

export interface CreateTemporaryCredentialsData {
  userId: string;
  email: string;
  passwordHash: string;
  deviceFingerprint: string;
  userAgent?: string;
  ipAddress?: string;
  currentStep: string;
  stepData?: Record<string, any>;
}

/**
 * Create temporary signup credentials with device info
 */
export async function createTemporarySignupCredentials(
  db: Database,
  data: CreateTemporaryCredentialsData
) {
  return withMutationLogging(
    'createTemporarySignupCredentials',
    { userId: data.userId, email: data.email },
    async () => {
      // Delete any existing credentials for this user
      await db
        .delete(temporarySignupCredentials)
        .where(eq(temporarySignupCredentials.userId, data.userId));

      // Create expiration date (7 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const [credential] = await db
        .insert(temporarySignupCredentials)
        .values({
          userId: data.userId,
          email: data.email,
          passwordHash: data.passwordHash,
          deviceFingerprint: data.deviceFingerprint,
          userAgent: data.userAgent,
          ipAddress: data.ipAddress,
          currentStep: data.currentStep,
          stepData: data.stepData || null,
          expiresAt,
        })
        .returning();

      logger.info(
        { userId: data.userId, deviceFingerprint: data.deviceFingerprint, currentStep: data.currentStep },
        "Temporary signup credentials created"
      );

      return credential;
    }
  );
}

/**
 * Get temporary credentials by device fingerprint
 */
export async function getTemporaryCredentialsByDevice(
  db: Database,
  deviceFingerprint: string
) {
  return withQueryLogging(
    'getTemporaryCredentialsByDevice',
    { deviceFingerprint },
    async () => {
      const credential = await db.query.temporarySignupCredentials.findFirst({
        where: and(
          eq(temporarySignupCredentials.deviceFingerprint, deviceFingerprint),
          // Only return non-expired credentials
          // Note: Drizzle doesn't support lt() in where clause directly, so we'll filter in the query
        ),
        orderBy: (credentials, { desc }) => [desc(credentials.createdAt)],
      });

      // Check expiration manually
      if (credential && credential.expiresAt && credential.expiresAt <= new Date()) {
        // Auto-delete expired credentials
        await db
          .delete(temporarySignupCredentials)
          .where(eq(temporarySignupCredentials.id, credential.id));
        return null;
      }

      return credential;
    }
  );
}

/**
 * Get temporary credentials by user ID
 */
export async function getTemporaryCredentialsByUserId(
  db: Database,
  userId: string
) {
  return withQueryLogging(
    'getTemporaryCredentialsByUserId',
    { userId },
    async () => {
      const credential = await db.query.temporarySignupCredentials.findFirst({
        where: eq(temporarySignupCredentials.userId, userId),
        orderBy: (credentials, { desc }) => [desc(credentials.createdAt)],
      });

      // Check expiration manually
      if (credential && credential.expiresAt && credential.expiresAt <= new Date()) {
        // Auto-delete expired credentials
        await db
          .delete(temporarySignupCredentials)
          .where(eq(temporarySignupCredentials.id, credential.id));
        return null;
      }

      return credential;
    }
  );
}

/**
 * Update temporary credentials (e.g., update current step)
 */
export async function updateTemporaryCredentials(
  db: Database,
  userId: string,
  updates: {
    currentStep?: string;
    stepData?: Record<string, any>;
  }
) {
  return withMutationLogging(
    'updateTemporaryCredentials',
    { userId },
    async () => {
      const [updated] = await db
        .update(temporarySignupCredentials)
        .set({
          ...updates,
          stepData: updates.stepData !== undefined ? updates.stepData : undefined,
          updatedAt: new Date(),
        })
        .where(eq(temporarySignupCredentials.userId, userId))
        .returning();

      return updated;
    }
  );
}

/**
 * Delete temporary credentials (called when signup is complete)
 */
export async function deleteTemporaryCredentials(
  db: Database,
  userId: string
) {
  return withMutationLogging(
    'deleteTemporaryCredentials',
    { userId },
    async () => {
      await db
        .delete(temporarySignupCredentials)
        .where(eq(temporarySignupCredentials.userId, userId));

      logger.info({ userId }, "Temporary signup credentials deleted");
    }
  );
}

/**
 * Clean up expired temporary credentials (can be run as a cron job)
 */
export async function cleanupExpiredTemporaryCredentials(db: Database) {
  return withMutationLogging(
    'cleanupExpiredTemporaryCredentials',
    {},
    async () => {
      const now = new Date();
      const result = await db
        .delete(temporarySignupCredentials)
        .where(lt(temporarySignupCredentials.expiresAt, now))
        .returning();

      logger.info(
        { deletedCount: result.length },
        "Cleaned up expired temporary signup credentials"
      );

      return result.length;
    }
  );
}


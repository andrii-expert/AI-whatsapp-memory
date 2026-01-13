import { eq, and, gt } from "drizzle-orm";
import type { Database } from "../client";
import { users } from "../schema";
import { withMutationLogging } from "../utils/query-logger";
import { logger } from "@imaginecalendar/logger";

/**
 * Generate a 6-digit email verification code for a user
 */
export async function generateEmailVerificationCode(
  db: Database,
  userId: string,
  email: string
) {
  return withMutationLogging(
    'generateEmailVerificationCode',
    { userId, email },
    async () => {
      // Generate a 6-digit verification code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Set expiry to 10 minutes from now
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Update user with verification code
      await db
        .update(users)
        .set({
          // Store code and expiry in a JSONB field or use separate fields
          // For now, we'll add these fields to the schema
          emailVerificationCode: code,
          emailVerificationExpiresAt: expiresAt,
          emailVerificationAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      logger.info({ userId, email }, 'Generated email verification code');

      return {
        code,
        expiresAt,
      };
    }
  );
}

/**
 * Verify an email verification code
 */
export async function verifyEmailCode(
  db: Database,
  userId: string,
  code: string
) {
  return withMutationLogging(
    'verifyEmailCode',
    { userId, code },
    async () => {
      // Get user with verification code
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Check if code matches
      if (user.emailVerificationCode !== code) {
        // Increment attempts
        const attempts = (user.emailVerificationAttempts || 0) + 1;
        await db
          .update(users)
          .set({
            emailVerificationAttempts: attempts,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        throw new Error("Invalid verification code");
      }

      // Check if expired
      if (user.emailVerificationExpiresAt && user.emailVerificationExpiresAt <= new Date()) {
        throw new Error("Verification code has expired");
      }

      // Mark email as verified and clear code
      await db
        .update(users)
        .set({
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiresAt: null,
          emailVerificationAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      logger.info({ userId }, 'Email verified successfully');

      return {
        success: true,
        userId: user.id,
        email: user.email,
      };
    }
  );
}

/**
 * Resend email verification code
 */
export async function resendEmailVerificationCode(
  db: Database,
  userId: string
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error("User not found");
  }

  return generateEmailVerificationCode(db, userId, user.email);
}


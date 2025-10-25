import { eq, and, gt } from "drizzle-orm";
import type { Database } from "../client";
import { whatsappNumbers, users } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function generateVerificationCode(
  db: Database,
  userId: string,
  phoneNumber?: string
) {
  // Normalize phone number if provided
  const normalizedPhone = phoneNumber ? normalizePhoneNumber(phoneNumber) : undefined;

  return withMutationLogging(
    'generateVerificationCode',
    { userId, phoneNumber, normalizedPhone },
    async () => {
      // Generate a 6-digit verification code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Set expiry to 10 minutes from now
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // If phone number is provided, update or create WhatsApp number record
      if (normalizedPhone) {
        // Check if this phone number already exists for this user
        const existingNumber = await db.query.whatsappNumbers.findFirst({
          where: and(
            eq(whatsappNumbers.userId, userId),
            eq(whatsappNumbers.phoneNumber, normalizedPhone)
          ),
        });

        if (existingNumber) {
          // Update existing record
          await db
            .update(whatsappNumbers)
            .set({
              verificationCode: code,
              verificationExpiresAt: expiresAt,
              verificationAttempts: 0,
              isVerified: false,
              updatedAt: new Date(),
            })
            .where(eq(whatsappNumbers.id, existingNumber.id));
        } else {
          // Create new record
          await db.insert(whatsappNumbers).values({
            userId,
            phoneNumber: normalizedPhone,
            verificationCode: code,
            verificationExpiresAt: expiresAt,
            verificationAttempts: 0,
            isVerified: false,
            isPrimary: true, // Set as primary if it's the first one
            isActive: true,
          });
        }
      }

      return {
        code,
        expiresAt,
      };
    }
  );
}

// Normalize phone number to handle both +27828045752 and 27828045752 formats
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // Always return with + prefix
  return `+${digits}`;
}

export async function verifyWhatsAppCode(
  db: Database,
  phoneNumber: string,
  verificationCode: string
) {
  // Normalize the phone number for consistent matching
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  return withMutationLogging(
    'verifyWhatsAppCode',
    { phoneNumber, normalizedPhone, verificationCode },
    async () => {
      // First, check if there's any record for this phone number (for debugging)
      const anyRecord = await db.query.whatsappNumbers.findFirst({
        where: eq(whatsappNumbers.phoneNumber, normalizedPhone),
      });

      if (!anyRecord) {
        throw new Error(`No verification record found for phone number: ${normalizedPhone} (original: ${phoneNumber})`);
      }

      // Check if the code matches but might be expired
      const codeMatch = await db.query.whatsappNumbers.findFirst({
        where: and(
          eq(whatsappNumbers.phoneNumber, normalizedPhone),
          eq(whatsappNumbers.verificationCode, verificationCode)
        ),
      });

      if (!codeMatch) {
        throw new Error(`Invalid verification code for phone: ${normalizedPhone}. Expected: ${anyRecord.verificationCode}, Got: ${verificationCode}`);
      }

      // Check if it's expired
      if (codeMatch.verificationExpiresAt && codeMatch.verificationExpiresAt <= new Date()) {
        throw new Error(`Verification code expired at: ${codeMatch.verificationExpiresAt}`);
      }

      // Find the WhatsApp number record with this phone and code (valid and not expired)
      const whatsappNumber = await db.query.whatsappNumbers.findFirst({
        where: and(
          eq(whatsappNumbers.phoneNumber, normalizedPhone),
          eq(whatsappNumbers.verificationCode, verificationCode),
          gt(whatsappNumbers.verificationExpiresAt, new Date())
        ),
      });

      if (!whatsappNumber) {
        throw new Error("Invalid or expired verification code");
      }

      // Mark as verified
      await db
        .update(whatsappNumbers)
        .set({
          isVerified: true,
          verifiedAt: new Date(),
          verificationCode: null, // Clear the code
          verificationExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(whatsappNumbers.id, whatsappNumber.id));

      // Update the user's phone verified status if this is their primary number
      if (whatsappNumber.isPrimary) {
        await db
          .update(users)
          .set({
            phoneVerified: true,
            phone: normalizedPhone,
            updatedAt: new Date(),
          })
          .where(eq(users.id, whatsappNumber.userId));
      }

      return {
        success: true,
        userId: whatsappNumber.userId,
        phoneNumber: whatsappNumber.phoneNumber,
        whatsappNumberId: whatsappNumber.id,
      };
    }
  );
}

export async function getUserWhatsAppNumbers(db: Database, userId: string) {
  return withQueryLogging(
    'getUserWhatsAppNumbers',
    { userId },
    () =>
      db.query.whatsappNumbers.findMany({
        where: eq(whatsappNumbers.userId, userId),
        orderBy: (whatsappNumbers, { desc }) => [
          desc(whatsappNumbers.isPrimary),
          desc(whatsappNumbers.isVerified),
          desc(whatsappNumbers.createdAt),
        ],
      })
  );
}

export async function getPrimaryWhatsAppNumber(db: Database, userId: string) {
  return withQueryLogging(
    'getPrimaryWhatsAppNumber',
    { userId },
    () =>
      db.query.whatsappNumbers.findFirst({
        where: and(
          eq(whatsappNumbers.userId, userId),
          eq(whatsappNumbers.isPrimary, true)
        ),
      })
  );
}

export async function getPendingVerification(db: Database, userId: string) {
  return withQueryLogging(
    'getPendingVerification',
    { userId },
    () =>
      db.query.whatsappNumbers.findFirst({
        where: and(
          eq(whatsappNumbers.userId, userId),
          eq(whatsappNumbers.isVerified, false),
          gt(whatsappNumbers.verificationExpiresAt, new Date())
        ),
      })
  );
}export async function getVerifiedWhatsappNumberByPhone(
  db: Database,
  phoneNumber: string
) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  return withQueryLogging(
    'getVerifiedWhatsappNumberByPhone',
    { phoneNumber, normalizedPhone },
    () =>
      db.query.whatsappNumbers.findFirst({
        where: and(
          eq(whatsappNumbers.phoneNumber, normalizedPhone),
          eq(whatsappNumbers.isVerified, true),
          eq(whatsappNumbers.isActive, true)
        ),
      })
  );
}

export async function resetWhatsAppVerification(db: Database, userId: string) {
  return withMutationLogging(
    'resetWhatsAppVerification',
    { userId },
    async () => {
      // Reset user's phoneVerified to false
      await db
        .update(users)
        .set({
          phoneVerified: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Reset all WhatsApp numbers for this user to unverified
      await db
        .update(whatsappNumbers)
        .set({
          isVerified: false,
          verifiedAt: null,
          verificationCode: null,
          verificationExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(whatsappNumbers.userId, userId));

      return { success: true };
    }
  );
}

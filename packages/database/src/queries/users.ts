import { eq, and, ne } from "drizzle-orm";
import type { Database } from "../client";
import { users, userPreferences, subscriptions, whatsappNumbers } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";
import { normalizePhoneNumber } from "./whatsapp-verification";
import { logger } from "@imaginecalendar/logger";

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
    passwordHash?: string;
    emailVerified?: boolean;
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
    timezone?: string;
    utcOffset?: string;
    setupStep?: number; // 1 = WhatsApp setup, 2 = Calendar setup, 3 = Complete
    showWelcomeModal?: boolean;
  }
) {
  return withMutationLogging(
    'createUser',
    { userId: data.id, email: data.email },
    async () => {
      try {
        return await db.transaction(async (tx) => {
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
        });
      } catch (error: any) {
        // Handle database constraint violations
        if (error?.code === '23505') { // PostgreSQL unique violation
          const constraint = error?.constraint || '';
          
          if (constraint.includes('email') || error?.message?.includes('email')) {
            logger.error({ userId: data.id, email: data.email, error }, "Email already exists");
            throw new Error("This email address is already registered. Please contact support if you believe this is an error.");
          }
          
          if (constraint.includes('phone') || error?.message?.includes('phone')) {
            logger.error({ userId: data.id, phone: data.phone, error }, "Phone already exists");
            throw new Error("This phone number is already registered. Please use a different number.");
          }
          
          logger.error({ userId: data.id, constraint, error }, "Database constraint violation");
          throw new Error(`Registration failed: ${error?.message || 'A record with this information already exists'}`);
        }
        
        // Re-throw other errors
        throw error;
      }
    }
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
    timezone?: string;
    utcOffset?: string;
    setupStep?: number; // 1 = WhatsApp setup, 2 = Calendar setup, 3 = Billing setup, 4 = Complete
    showWelcomeModal?: boolean;
  }
) {
  return withMutationLogging(
    'updateUser',
    { userId: id, updates: Object.keys(data) },
    async () => {
      // Normalize phone number if provided (used for both users and whatsapp_numbers tables)
      const normalizedPhone = data.phone !== undefined && data.phone ? normalizePhoneNumber(data.phone) : null;
      
      // If phone is being updated, sync with whatsapp_numbers table
      if (data.phone !== undefined) {
        
        // Get all existing WhatsApp numbers for this user
        const existingNumbers = await db.query.whatsappNumbers.findMany({
          where: eq(whatsappNumbers.userId, id),
        });

        if (normalizedPhone) {
          // Find if this phone number already exists for this user
          const existingNumberForPhone = existingNumbers.find(
            n => n.phoneNumber === normalizedPhone
          );

          if (existingNumberForPhone) {
            // Phone number already exists - make it the only active and primary one
            // Deactivate all other numbers
            await db
              .update(whatsappNumbers)
              .set({
                isActive: false,
                isPrimary: false,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(whatsappNumbers.userId, id),
                  ne(whatsappNumbers.id, existingNumberForPhone.id)
                )
              );

            // Activate and set as primary the existing number, sync verification status
            await db
              .update(whatsappNumbers)
              .set({
                isActive: true,
                isPrimary: true,
                isVerified: data.phoneVerified !== undefined ? data.phoneVerified : existingNumberForPhone.isVerified,
                updatedAt: new Date(),
              })
              .where(eq(whatsappNumbers.id, existingNumberForPhone.id));
          } else {
            // New phone number - update the existing primary/active number or create new one
            const primaryNumber = existingNumbers.find(
              n => n.isPrimary && n.isActive
            ) || existingNumbers[0]; // Fallback to first number if no primary exists

            if (primaryNumber) {
              // Check if the phone number actually changed
              const phoneChanged = primaryNumber.phoneNumber !== normalizedPhone;
              
              // Update the existing primary number with the new phone number
              // This handles the case when user edits their phone number
              await db
                .update(whatsappNumbers)
                .set({
                  phoneNumber: normalizedPhone,
                  // Only reset verification if phone actually changed, otherwise preserve existing status
                  isVerified: phoneChanged 
                    ? (data.phoneVerified !== undefined ? data.phoneVerified : false)
                    : primaryNumber.isVerified,
                  isActive: true,
                  isPrimary: true,
                  updatedAt: new Date(),
                })
                .where(eq(whatsappNumbers.id, primaryNumber.id));

              // Deactivate all other numbers
              if (existingNumbers.length > 1) {
                await db
                  .update(whatsappNumbers)
                  .set({
                    isActive: false,
                    isPrimary: false,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(whatsappNumbers.userId, id),
                      ne(whatsappNumbers.id, primaryNumber.id)
                    )
                  );
              }

              logger.info(
                {
                  userId: id,
                  oldPhoneNumber: primaryNumber.phoneNumber,
                  newPhoneNumber: normalizedPhone,
                },
                'Updated existing WhatsApp number record with new phone number'
              );
            } else {
              // No existing numbers - create a new one
              // Check if this phone number exists for another user (shouldn't happen, but handle it)
              const existingNumberForOtherUser = await db.query.whatsappNumbers.findFirst({
                where: eq(whatsappNumbers.phoneNumber, normalizedPhone),
              });

              if (existingNumberForOtherUser && existingNumberForOtherUser.userId !== id) {
                // Phone number belongs to another user - this shouldn't happen in normal flow
                // But we'll log it and not create a duplicate
                logger.warn(
                  {
                    phoneNumber: normalizedPhone,
                    existingUserId: existingNumberForOtherUser.userId,
                    newUserId: id,
                  },
                  'Phone number already exists for another user, cannot assign to new user'
                );
              } else {
                // Create new WhatsApp number record
                await db.insert(whatsappNumbers).values({
                  userId: id,
                  phoneNumber: normalizedPhone,
                  isVerified: data.phoneVerified ?? false,
                  isPrimary: true,
                  isActive: true,
                });
                
                logger.info(
                  {
                    userId: id,
                    phoneNumber: normalizedPhone,
                  },
                  'Created new WhatsApp number record for user'
                );
              }
            }
          }
        } else {
          // Phone is being cleared - deactivate all WhatsApp numbers for this user
          await db
            .update(whatsappNumbers)
            .set({
              isActive: false,
              isPrimary: false,
              updatedAt: new Date(),
            })
            .where(eq(whatsappNumbers.userId, id));
        }
      } else if (data.phoneVerified !== undefined) {
        // If only phoneVerified is being updated (without phone change), sync with active WhatsApp number
        const activeNumber = await db.query.whatsappNumbers.findFirst({
          where: and(
            eq(whatsappNumbers.userId, id),
            eq(whatsappNumbers.isActive, true),
            eq(whatsappNumbers.isPrimary, true)
          ),
        });

        if (activeNumber) {
          await db
            .update(whatsappNumbers)
            .set({
              isVerified: data.phoneVerified,
              updatedAt: new Date(),
            })
            .where(eq(whatsappNumbers.id, activeNumber.id));
        }
      }

      // Convert Date to string for the birthday field (date type in DB)
      // Use normalized phone number if phone was updated (normalizedPhone can be null to clear phone)
      const updateData = {
        ...data,
        ...(data.phone !== undefined ? { phone: normalizedPhone } : {}),
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
      const { 
        activityLogs, 
        payments, 
        subscriptions, 
        calendarConnections, 
        whatsappNumbers,
        userPreferences,
        taskShares,
        fileShares,
        addressShares,
        taskFolders,
        tasks,
        shoppingListFolders,
        shoppingListItems,
        noteFolders,
        notes,
        reminders,
        userFileFolders,
        userFiles,
        addressFolders,
        addresses,
        friendFolders,
        friends,
        whatsappMessageLogs,
        voiceMessageJobs,
        pendingIntents,
        conversationStates,
        eventVerificationStates,
      } = await import('../schema');
      
      // Delete in correct order to respect foreign key constraints
      // Delete shares first (they reference both owner and recipient)
      await db.delete(taskShares).where(eq(taskShares.ownerId, userId));
      await db.delete(taskShares).where(eq(taskShares.sharedWithUserId, userId));
      await db.delete(fileShares).where(eq(fileShares.ownerId, userId));
      await db.delete(fileShares).where(eq(fileShares.sharedWithUserId, userId));
      await db.delete(addressShares).where(eq(addressShares.ownerId, userId));
      await db.delete(addressShares).where(eq(addressShares.sharedWithUserId, userId));
      
      // Delete user's data
      await db.delete(activityLogs).where(eq(activityLogs.userId, userId));
      await db.delete(payments).where(eq(payments.userId, userId));
      await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
      await db.delete(calendarConnections).where(eq(calendarConnections.userId, userId));
      await db.delete(whatsappNumbers).where(eq(whatsappNumbers.userId, userId));
      await db.delete(whatsappMessageLogs).where(eq(whatsappMessageLogs.userId, userId));
      await db.delete(voiceMessageJobs).where(eq(voiceMessageJobs.userId, userId));
      await db.delete(pendingIntents).where(eq(pendingIntents.userId, userId));
      await db.delete(conversationStates).where(eq(conversationStates.userId, userId));
      await db.delete(eventVerificationStates).where(eq(eventVerificationStates.userId, userId));
      await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
      
      // Delete folders and their contents
      await db.delete(tasks).where(eq(tasks.userId, userId));
      await db.delete(taskFolders).where(eq(taskFolders.userId, userId));
      await db.delete(shoppingListItems).where(eq(shoppingListItems.userId, userId));
      await db.delete(shoppingListFolders).where(eq(shoppingListFolders.userId, userId));
      await db.delete(notes).where(eq(notes.userId, userId));
      await db.delete(noteFolders).where(eq(noteFolders.userId, userId));
      await db.delete(reminders).where(eq(reminders.userId, userId));
      await db.delete(userFiles).where(eq(userFiles.userId, userId));
      await db.delete(userFileFolders).where(eq(userFileFolders.userId, userId));
      await db.delete(addresses).where(eq(addresses.userId, userId));
      await db.delete(addressFolders).where(eq(addressFolders.userId, userId));
      await db.delete(friends).where(eq(friends.userId, userId));
      await db.delete(friendFolders).where(eq(friendFolders.userId, userId));
      
      // Finally delete the user (this will cascade to any remaining related data)
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

/**
 * Update user's last login timestamp
 */
export async function updateUserLastLogin(db: Database, userId: string) {
  return withMutationLogging(
    'updateUserLastLogin',
    { userId },
    async () => {
      const [updated] = await db
        .update(users)
        .set({
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
      
      return updated;
    }
  );
}
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@api/trpc/init";
import { 
  completeOnboardingSchema, 
  syncUserSchema, 
  verifyPhoneSchema,
  ensureUserExistsSchema
} from "@api/schemas/auth";
import type { PlanRecord } from "@imaginecalendar/database/queries";
import {
  createUser,
  getUserById,
  getUserByEmail,
  getUserByPhone,
  updateUser,
  createSubscription,
  getPlanById,
  createFolder,
  getUserFolders,
  createNoteFolder,
  getUserNoteFolders,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { z } from "zod";
import { sendWelcomeEmail } from "@api/utils/email";

function computeSubscriptionPeriods(plan: PlanRecord) {
  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date(currentPeriodStart);

  if (plan.payfastConfig.recurring && plan.payfastConfig.frequency) {
    switch (plan.payfastConfig.frequency) {
      case 1: // Daily
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 1);
        break;
      case 2: // Weekly
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 7);
        break;
      case 3: // Monthly
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
        break;
      case 4: // Quarterly
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 3);
        break;
      case 5: // Bi-annually
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 6);
        break;
      case 6: // Annually
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
        break;
      default:
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }
  } else if (plan.trialDays > 0) {
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + plan.trialDays);
  } else {
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
  }

  const trialEndsAt = plan.trialDays > 0 ? new Date(currentPeriodStart.getTime() + plan.trialDays * 24 * 60 * 60 * 1000) : null;

  return {
    currentPeriodStart,
    currentPeriodEnd,
    trialEndsAt,
  };
}

export const authRouter = createTRPCRouter({
  // Ensure user exists in database (JIT creation from session)
  ensureUserExists: protectedProcedure
    .input(ensureUserExistsSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const existingUser = await getUserById(db, session.user.id);
      
      if (existingUser) {
        return existingUser;
      }
      
      // Create user from session data
      await createUser(db, {
        id: session.user.id,
        email: input.email,
        name: input.name,
      });
      
      return getUserById(db, session.user.id);
    }),

  // Get current session info
  getSession: publicProcedure.query(async ({ ctx: { session } }) => {
    return {
      isAuthenticated: !!session,
      userId: session?.user?.id || null,
    };
  }),

  // Check if user needs onboarding (from database, not Clerk)
  checkOnboarding: protectedProcedure.query(async ({ ctx: { db, c, session } }) => {
    const checkStartTime = Date.now();
    logger.info({ 
      userId: session.user.id, 
      checkTime: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    }, "[ONBOARDING_CHECK] Starting onboarding status check");
    
    try {
      // Check database first - this is the source of truth
      const user = await getUserById(db, session.user.id);

      // User is onboarded if they exist in DB with required fields
      // Note: timezone is required but we check it separately to provide better error messages
      // Handle case where timezone fields might not exist yet (for existing users or before migration)
      const hasRequiredFields = !!(user && (user.firstName || user.name) && user.phone);
      // Safely check timezone fields - they might not exist in DB schema yet
      // For now, make timezone optional until migration is run to avoid breaking existing users
      let hasTimezone = true; // Default to true to not break existing flow
      try {
        hasTimezone = !!(user && (user as any).timezone && (user as any).utcOffset);
      } catch (err) {
        // If timezone fields don't exist in schema yet, treat as optional
        logger.warn({ error: err, userId: session.user.id }, "[ONBOARDING_CHECK] Timezone fields may not exist in DB schema yet");
        hasTimezone = true; // Allow users without timezone for now
      }
      const isOnboarded = hasRequiredFields && hasTimezone;
      
      logger.info({ 
        userId: session.user.id,
        isOnboarded,
        hasUser: !!user,
        hasName: !!(user?.firstName || user?.name),
        hasPhone: !!(user?.phone),
        hasTimezone: hasTimezone,
        userName: user?.firstName || user?.name,
        userPhone: user?.phone ? `${user.phone.substring(0, 3)}***` : null,
        userTimezone: (user as any)?.timezone || null,
        queryDuration: Date.now() - checkStartTime,
        checkTime: new Date().toISOString(),
      }, "[ONBOARDING_CHECK] Onboarding status determined");
      
      // Also update Clerk metadata in background if needed (fire and forget)
      if (isOnboarded) {
        const clerkClient = c.get('clerk');
        if (clerkClient) {
          // Update Clerk metadata asynchronously if not already set
          clerkClient.users.getUser(session.user.id).then(clerkUser => {
            if (clerkUser.publicMetadata?.onboardingComplete !== true) {
              clerkClient.users.updateUser(session.user.id, {
                publicMetadata: {
                  ...clerkUser.publicMetadata,
                  onboardingComplete: true,
                },
              }).catch(err => {
                logger.warn({ error: err, userId: session.user.id }, "Failed to sync Clerk metadata");
              });
            }
          }).catch(() => {
            // Ignore errors - Clerk is not critical for onboarding check
          });
        }
      }
      
      return { 
        needsOnboarding: !isOnboarded, 
        reason: isOnboarded ? null : "PROFILE_INCOMPLETE" 
      };
    } catch (error) {
      logger.error({ 
        error, 
        userId: session.user.id,
        queryDuration: Date.now() - checkStartTime,
        errorMessage: error instanceof Error ? error.message : String(error),
      }, "[ONBOARDING_CHECK] Error checking onboarding status");
      
      // Try to get user data directly to determine onboarding status
      // This is more reliable than assuming they need onboarding
      try {
        const user = await getUserById(db, session.user.id);
        const hasRequiredFields = !!(user && (user.firstName || user.name) && user.phone);
        
        // If user exists with required fields, they're onboarded
        // Only return needsOnboarding: true if we can confirm they're missing required fields
        if (user && !hasRequiredFields) {
          return { 
            needsOnboarding: true, 
            reason: "PROFILE_INCOMPLETE" 
          };
        }
        
        // If user exists with required fields, they're onboarded (even if timezone check failed)
        if (hasRequiredFields) {
          return { 
            needsOnboarding: false, 
            reason: null 
          };
        }
      } catch (userError) {
        logger.error({ 
          error: userError, 
          userId: session.user.id,
        }, "[ONBOARDING_CHECK] Error getting user data as fallback");
      }
      
      // Only assume user needs onboarding if we can't get user data at all
      // This is a last resort - better to let them through if we're unsure
      return { 
        needsOnboarding: false, 
        reason: null 
      };
    }
  }),

  // Complete onboarding process
  completeOnboarding: protectedProcedure
    .input(completeOnboardingSchema)
    .mutation(async ({ ctx: { db, session, c }, input }) => {
      const normalizedPlanId = input.plan.trim().toLowerCase();
      logger.info({ userId: session.user.id, plan: normalizedPlanId }, "Starting onboarding process");

      const planRecord = await getPlanById(db, normalizedPlanId);

      if (!planRecord || planRecord.status !== "active") {
        logger.warn({ userId: session.user.id, plan: normalizedPlanId }, "Attempted onboarding with unavailable plan");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected plan is not available",
        });
      }
      
      // Check if phone number is already taken by another user
      const phoneUser = await getUserByPhone(db, input.phone, session.user.id);
      if (phoneUser) {
        logger.warn({ 
          userId: session.user.id, 
          phone: input.phone, 
          existingUserId: phoneUser.id 
        }, "Phone number already in use");
        
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This phone number is already registered to another account. Please use a different number.',
        });
      }
      
      // Check if email is already taken by another user (if user doesn't exist yet)
      const existingUser = await getUserById(db, session.user.id);
      
      if (!existingUser) {
        // Check if email is already in use by another user
        const emailUser = await getUserByEmail(db, session.user.email || "");
        if (emailUser && emailUser.id !== session.user.id) {
          logger.warn({ 
            userId: session.user.id, 
            email: session.user.email, 
            existingUserId: emailUser.id 
          }, "Email already in use by another user");
          
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This email address is already registered to another account. Please contact support if you believe this is an error.',
          });
        }
      }
      
      if (!existingUser) {
        // Create user if doesn't exist (JIT creation)
        await createUser(db, {
          id: session.user.id,
          email: session.user.email || "",
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          country: input.country,
          ageGroup: input.ageGroup,
          gender: input.gender,
          birthday: input.birthday,
          mainUse: input.mainUse,
          howHeardAboutUs: input.howHeardAboutUs,
          company: input.company,
          timezone: input.timezone,
          utcOffset: input.utcOffset,
          showWelcomeModal: true, // Show welcome modal for new users
        });

        // Link any pending friend invitations for this email
        if (session.user.email) {
          const { linkPendingFriendsToUser } = await import("@imaginecalendar/database/queries");
          const linkResult = await linkPendingFriendsToUser(db, session.user.id, session.user.email);
          if (linkResult.linked > 0) {
            logger.info(
              { userId: session.user.id, email: session.user.email, linked: linkResult.linked },
              "Linked pending friends to new user"
            );
          }
        }
      } else {
        // Update existing user with onboarding data
        await updateUser(db, session.user.id, {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          country: input.country,
          ageGroup: input.ageGroup,
          gender: input.gender,
          birthday: input.birthday,
          mainUse: input.mainUse,
          howHeardAboutUs: input.howHeardAboutUs,
          company: input.company,
          timezone: input.timezone,
          utcOffset: input.utcOffset,
          showWelcomeModal: true, // Show welcome modal after completing onboarding
        });
      }

      // Get updated user
      const user = await getUserById(db, session.user.id);

      // Create subscription if needed
      if (!user?.subscription) {
        const { currentPeriodStart, currentPeriodEnd, trialEndsAt } = computeSubscriptionPeriods(planRecord);

        await createSubscription(db, {
          userId: session.user.id,
          plan: planRecord.id,
          status: "active",
          trialEndsAt: trialEndsAt ?? undefined,
          currentPeriodStart,
          currentPeriodEnd,
        });
      }

      // Create default "General" task folder if user doesn't have any folders
      const existingFolders = await getUserFolders(db, session.user.id);
      if (existingFolders.length === 0) {
        logger.info({ userId: session.user.id }, "Creating default task folder");
        await createFolder(db, {
          userId: session.user.id,
          name: "General",
          color: "#3B82F6", // Blue color
          icon: "folder",
        });
        logger.info({ userId: session.user.id }, "Default task folder created");
      }

      // Create default "General" note folder if user doesn't have any note folders
      const existingNoteFolders = await getUserNoteFolders(db, session.user.id);
      if (existingNoteFolders.length === 0) {
        logger.info({ userId: session.user.id }, "Creating default 'General' note folder");
        await createNoteFolder(db, {
          userId: session.user.id,
          name: "General",
          color: "#3B82F6", // Blue color
          icon: "folder",
        });
        logger.info({ userId: session.user.id }, "Default 'General' note folder created");
      }

      // Update Clerk metadata
      const clerkClient = c.get('clerk');
      
      if (clerkClient) {
        try {
          await clerkClient.users.updateUser(session.user.id, {
            publicMetadata: {
              onboardingComplete: true,
              onboardedAt: new Date().toISOString(),
              plan: planRecord.id,
            },
          });
          logger.info({ userId: session.user.id }, "Clerk metadata updated successfully");
        } catch (error) {
          logger.error({ error, userId: session.user.id }, "Failed to update Clerk metadata");
          // Don't fail the onboarding if metadata update fails
          // The user is already created in our database
        }
      } else {
        logger.warn({ userId: session.user.id }, "Clerk client not available, skipping metadata update");
      }

      const finalUser = await getUserById(db, session.user.id);
      
      logger.info({
        userId: session.user.id,
        userName: finalUser?.firstName ? `${finalUser.firstName} ${finalUser.lastName}` : finalUser?.name,
        userPhone: finalUser?.phone ? `${finalUser.phone.substring(0, 3)}***` : null,
        hasName: !!(finalUser?.firstName || finalUser?.name),
        hasPhone: !!(finalUser?.phone),
        completionTime: new Date().toISOString(),
      }, "[ONBOARDING_COMPLETE] Onboarding completed and verified");

      // Double-check the user is properly saved
      if (!(finalUser?.firstName || finalUser?.name) || !finalUser?.phone) {
        logger.error({
          userId: session.user.id,
          hasFirstName: !!(finalUser?.firstName),
          hasName: !!(finalUser?.name),
          hasPhone: !!(finalUser?.phone),
        }, "[ONBOARDING_COMPLETE] ERROR: User data not properly saved!");
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Onboarding data was not properly saved. Please try again.',
        });
      }

      // Send welcome email (async, non-blocking)
      // Use email from database first, fallback to session email
      const userEmail = finalUser?.email || session.user.email;
      const userFirstName = finalUser?.firstName || input.firstName;
      const userLastName = finalUser?.lastName || input.lastName;

      // Validate FROM_EMAIL format for better error reporting
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const fromEmailValid = process.env.RESEND_FROM_EMAIL 
        ? emailRegex.test(process.env.RESEND_FROM_EMAIL.trim())
        : false;

      logger.info({
        userId: session.user.id,
        dbEmail: finalUser?.email,
        sessionEmail: session.user.email,
        finalEmail: userEmail,
        hasFirstName: !!userFirstName,
        hasLastName: !!userLastName,
        resendApiKey: !!process.env.RESEND_API_KEY,
        resendFromEmail: process.env.RESEND_FROM_EMAIL,
        fromEmailValid,
        fromEmailIssue: process.env.RESEND_FROM_EMAIL && !fromEmailValid 
          ? 'RESEND_FROM_EMAIL must be a full email address (e.g., noreply@mail.crackon.ai), not just a domain'
          : null,
      }, "[WELCOME_EMAIL] Checking email prerequisites");

      if (userEmail && userFirstName && userLastName) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
          logger.error({
            userId: session.user.id,
            email: userEmail,
          }, "[WELCOME_EMAIL] Invalid email format, skipping");
        } else {
          // Send email asynchronously (fire and forget, but with proper error handling)
          sendWelcomeEmail({
            to: userEmail,
            firstName: userFirstName,
            lastName: userLastName,
          })
            .then((result) => {
              if (result && result.id) {
                logger.info({
                  userId: session.user.id,
                  email: userEmail,
                  emailId: result.id,
                  firstName: userFirstName,
                  lastName: userLastName,
                }, "[WELCOME_EMAIL] Welcome email sent successfully");
              } else {
                logger.warn({
                  userId: session.user.id,
                  email: userEmail,
                  firstName: userFirstName,
                  lastName: userLastName,
                  result: result,
                  resendApiKey: !!process.env.RESEND_API_KEY,
                  resendFromEmail: process.env.RESEND_FROM_EMAIL,
                }, "[WELCOME_EMAIL] Welcome email returned null or invalid result - check email configuration");
              }
            })
            .catch((error) => {
              logger.error({
                error: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorDetails: error,
                userId: session.user.id,
                email: userEmail,
                firstName: userFirstName,
                lastName: userLastName,
                resendApiKey: !!process.env.RESEND_API_KEY,
                resendFromEmail: process.env.RESEND_FROM_EMAIL,
                apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
              }, "[WELCOME_EMAIL] Failed to send welcome email after onboarding");
            });
          
          logger.info({
            userId: session.user.id,
            email: userEmail,
            firstName: userFirstName,
            lastName: userLastName,
            resendApiKey: !!process.env.RESEND_API_KEY,
            resendFromEmail: process.env.RESEND_FROM_EMAIL,
            fromEmailValid: fromEmailValid,
          }, "[WELCOME_EMAIL] Welcome email request initiated");
        }
      } else {
        logger.warn({
          userId: session.user.id,
          hasEmail: !!userEmail,
          email: userEmail,
          hasFirstName: !!userFirstName,
          hasLastName: !!userLastName,
          firstName: userFirstName,
          lastName: userLastName,
        }, "[WELCOME_EMAIL] Skipping welcome email - missing required user data");
      }

      return finalUser;
    }),

  // Verify phone number (can be called separately)
  verifyPhone: protectedProcedure
    .input(verifyPhoneSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      // In production, you'd send an SMS with OTP here
      return updateUser(db, session.user.id, {
        phone: input.phone,
        phoneVerified: true,
      });
    }),

  // Sync user from Clerk webhook (optional)
  syncUser: publicProcedure
    .input(syncUserSchema)
    .mutation(async ({ ctx: { db }, input }) => {
      const existingUser = await getUserById(db, input.id);
      
      if (existingUser) {
        return existingUser;
      }
      
      // Create new user with basic info
      await createUser(db, {
        id: input.id,
        email: input.email,
        name: input.name,
        phone: input.phone,
        avatarUrl: input.avatarUrl,
      });

      return getUserById(db, input.id);
    }),
});
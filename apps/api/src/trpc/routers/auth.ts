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
  getUserByPhone,
  updateUser,
  createSubscription,
  getPlanById,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { z } from "zod";

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
    
    // Check database first - this is the source of truth
    const user = await getUserById(db, session.user.id);

    // User is onboarded if they exist in DB with required fields
    const isOnboarded = !!(user && (user.firstName || user.name) && user.phone);
    
    logger.info({ 
      userId: session.user.id,
      isOnboarded,
      hasUser: !!user,
      hasName: !!(user?.name),
      hasPhone: !!(user?.phone),
      userName: user?.name,
      userPhone: user?.phone ? `${user.phone.substring(0, 3)}***` : null,
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
      
      const existingUser = await getUserById(db, session.user.id);
      
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
        });
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
import { createSubscriptionSchema, updateSubscriptionSchema, updateSubscriptionResponseSchema } from "@api/schemas/billing";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  reactivateSubscription,
  getPlanById,
} from "@imaginecalendar/database/queries";
import type { PlanRecord } from "@imaginecalendar/database/queries";
import { PayFastService } from "@imaginecalendar/payments";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";

function computeSubscriptionPeriods(plan: PlanRecord) {
  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date(currentPeriodStart);

  if (plan.payfastConfig.recurring && plan.payfastConfig.frequency) {
    switch (plan.payfastConfig.frequency) {
      case 1:
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 1);
        break;
      case 2:
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 7);
        break;
      case 3:
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
        break;
      case 4:
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 3);
        break;
      case 5:
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 6);
        break;
      case 6:
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

function isTrialPlan(plan: PlanRecord) {
  return !plan.payfastConfig.recurring && plan.trialDays > 0;
}

export const billingRouter = createTRPCRouter({
  getSubscription: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getUserSubscription(db, session.user.id);
  }),

  createSubscription: protectedProcedure
    .input(createSubscriptionSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      // Check if user already has an active subscription
      const existing = await getUserSubscription(db, session.user.id);
      
      if (existing && existing.status === "active") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User already has an active subscription",
        });
      }

      const normalizedPlanId = input.plan.trim().toLowerCase();
      const planRecord = await getPlanById(db, normalizedPlanId);

      if (!planRecord || planRecord.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected plan is not available",
        });
      }

      const { currentPeriodStart, currentPeriodEnd, trialEndsAt } = computeSubscriptionPeriods(planRecord);

      return createSubscription(db, {
        userId: session.user.id,
        plan: planRecord.id,
        status: "active",
        currentPeriodStart,
        currentPeriodEnd,
        trialEndsAt: trialEndsAt ?? undefined,
      });
    }),

  updateSubscription: protectedProcedure
    .input(updateSubscriptionSchema)
    .output(updateSubscriptionResponseSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const subscription = await getUserSubscription(db, session.user.id);

      if (!subscription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No subscription found",
        });
      }

      if (input.cancelAtPeriodEnd !== undefined) {
        const updatedSubscription = await updateSubscription(db, subscription.id, {
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        });

        if (!updatedSubscription) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update subscription",
          });
        }

        return {
          type: "success" as const,
          subscription: updatedSubscription
        };
      }

      if (input.plan) {
        const normalizedPlanId = input.plan.trim().toLowerCase();

        if (subscription.plan === normalizedPlanId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already have this plan",
          });
        }

        const [currentPlanRecord, newPlanRecord] = await Promise.all([
          getPlanById(db, subscription.plan),
          getPlanById(db, normalizedPlanId),
        ]);

        if (!newPlanRecord || newPlanRecord.status !== "active") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid plan",
          });
        }

        if (!currentPlanRecord) {
          logger.error({
            userId: session.user.id,
            subscriptionId: subscription.id,
            planId: subscription.plan,
          }, "Current subscription plan not found in database");

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to load current subscription plan",
          });
        }

        const currentPlanIsTrial = isTrialPlan(currentPlanRecord);
        const newPlanIsTrial = isTrialPlan(newPlanRecord);

        logger.info({
          userId: session.user.id,
          subscriptionId: subscription.id,
          currentPlan: subscription.plan,
          newPlan: newPlanRecord.id,
          hasPayfastToken: !!subscription.payfastToken,
          currentPlanIsTrial,
          newPlanIsTrial,
        }, 'Processing plan change request');

        if (newPlanIsTrial) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot switch to a trial plan",
          });
        }

        // Trial → Paid: Redirect to PayFast for new subscription creation
        if (currentPlanIsTrial) {
          logger.info({
            userId: session.user.id,
            targetPlan: newPlanRecord.id
          }, 'Trial user upgrading - requires PayFast payment');

          return {
            type: "requiresPayment" as const,
            message: "Redirecting to payment provider to complete subscription",
            plan: newPlanRecord.id,
          };
        }

        // Existing PayFast subscription - update via API
        if (!subscription.payfastToken) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot update subscription - missing payment information",
          });
        }

        const payfast = new PayFastService();

        const currentFrequency = currentPlanRecord.payfastConfig.frequency;
        const newFrequency = newPlanRecord.payfastConfig.frequency;

        if (!currentPlanRecord.payfastConfig.recurring || !newPlanRecord.payfastConfig.recurring || !currentFrequency || !newFrequency) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Plan change requires recurring billing information",
          });
        }

        // Apply billing rules based on plan change type
        if (currentFrequency === 3 && newFrequency === 6) {
          // Monthly → Annual: Immediate upgrade with credit calculation
          const daysIntoMonth = Math.floor(
            (new Date().getTime() - subscription.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
          );
          const daysRemainingInMonth = Math.max(0, 30 - daysIntoMonth);
          const currentPlanPrice = currentPlanRecord.amountCents / 100;
          const newPlanPrice = newPlanRecord.amountCents / 100;
          const unusedCredit = (currentPlanPrice / 30) * daysRemainingInMonth;
          const chargeAmount = newPlanPrice - unusedCredit;

          logger.info({
            userId: session.user.id,
            daysIntoMonth,
            daysRemainingInMonth,
            unusedCredit,
            chargeAmount
          }, 'Calculating prorated upgrade charge');

          // Set next run date to tomorrow for immediate billing of prorated amount
          const nextRunDate = new Date();
          nextRunDate.setDate(nextRunDate.getDate() + 1);

          const updateSuccess = await payfast.updateSubscription(subscription.payfastToken, {
            amount: newPlanRecord.amountCents,
            frequency: newFrequency,
            // run_date: nextRunDate.toISOString().split('T')[0] // Commented out to test immediate billing
          });

          if (!updateSuccess) {
            logger.error({
              userId: session.user.id,
              payfastToken: subscription.payfastToken
            }, 'Failed to update subscription via PayFast API');

            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to update subscription with payment provider",
            });
          }

          // Update local subscription record - new annual cycle starts immediately
        const now = new Date();
        const annualPeriodEnd = new Date();
        annualPeriodEnd.setFullYear(annualPeriodEnd.getFullYear() + 1);

        const updatedSubscription = await updateSubscription(db, subscription.id, {
          plan: newPlanRecord.id,
            currentPeriodStart: now,
            currentPeriodEnd: annualPeriodEnd,
          });

          if (!updatedSubscription) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to update subscription",
            });
          }

          logger.info({
            userId: session.user.id,
            subscriptionId: subscription.id,
            oldPlan: subscription.plan,
            newPlan: newPlanRecord.id,
            newPeriodEnd: annualPeriodEnd
          }, 'Monthly to annual upgrade completed successfully');

          return {
            type: "success" as const,
            subscription: updatedSubscription
          };
        }
        else if (currentFrequency === 6 && newFrequency === 3) {
          // Annual → Monthly: Scheduled downgrade - no immediate PayFast changes
          logger.info({
            userId: session.user.id,
            currentPeriodEnd: subscription.currentPeriodEnd
          }, 'Scheduling downgrade to monthly at period end');

          // Just set flag to change plan at period end - no PayFast API call needed
          const updatedSubscription = await updateSubscription(db, subscription.id, {
            cancelAtPeriodEnd: true,
          });

          if (!updatedSubscription) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to update subscription",
            });
          }

          logger.info({
            userId: session.user.id,
            subscriptionId: subscription.id,
            scheduledChangeDate: subscription.currentPeriodEnd
          }, 'Annual to monthly downgrade scheduled successfully');

          return {
            type: "success" as const,
            subscription: updatedSubscription
          };
        }
        else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid plan change combination",
          });
        }
      }

      return {
        type: "success" as const,
        subscription
      };
    }),

  cancelSubscription: protectedProcedure
    .mutation(async ({ ctx: { db, session } }) => {
      const subscription = await getUserSubscription(db, session.user.id);

      if (!subscription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No subscription found",
        });
      }

      const planRecord = await getPlanById(db, subscription.plan);
      const subscriptionPlanIsTrial = planRecord ? isTrialPlan(planRecord) : subscription.plan === "trial";

      // Trial subscriptions can be cancelled locally without PayFast
      if (subscriptionPlanIsTrial) {
        logger.info({
          userId: session.user.id,
          subscriptionId: subscription.id
        }, 'Cancelling trial subscription locally');

        return cancelSubscription(db, subscription.id, true);
      }

      // For paid subscriptions, cancel via PayFast API
      if (!subscription.payfastToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot cancel subscription - missing payment information",
        });
      }

      logger.info({
        userId: session.user.id,
        subscriptionId: subscription.id,
        payfastToken: subscription.payfastToken
      }, 'Cancelling subscription via PayFast API');

      const payfast = new PayFastService();
      const cancelSuccess = await payfast.cancelSubscription(subscription.payfastToken);

      if (!cancelSuccess) {
        logger.error({
          userId: session.user.id,
          payfastToken: subscription.payfastToken
        }, 'Failed to cancel subscription via PayFast API');

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cancel subscription with payment provider",
        });
      }

      // Update local subscription record
      const cancelledSubscription = await cancelSubscription(db, subscription.id, true);

      logger.info({
        userId: session.user.id,
        subscriptionId: subscription.id
      }, 'Subscription cancelled successfully');

      return cancelledSubscription;
    }),

  getCardUpdateUrl: protectedProcedure
    .mutation(async ({ ctx: { db, session } }) => {
      const subscription = await getUserSubscription(db, session.user.id);

      if (!subscription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No subscription found",
        });
      }

      const planRecord = await getPlanById(db, subscription.plan);
      const subscriptionPlanIsTrial = planRecord ? isTrialPlan(planRecord) : subscription.plan === "trial";

      // Only paid subscriptions have PayFast tokens for card updates
      if (subscriptionPlanIsTrial || !subscription.payfastToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No payment method on file to update",
        });
      }

      logger.info({
        userId: session.user.id,
        subscriptionId: subscription.id,
        payfastToken: subscription.payfastToken
      }, 'Generating PayFast card update URL');

      // Generate return URL for after card update
      const returnUrl = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/billing`;

      // PayFast card update URL format
      const cardUpdateUrl = `https://sandbox.payfast.co.za/eng/recurring/update/${subscription.payfastToken}?return=${encodeURIComponent(returnUrl)}`;

      logger.info({
        userId: session.user.id,
        returnUrl,
        cardUpdateUrl
      }, 'Generated PayFast card update URL');

      return {
        url: cardUpdateUrl,
        message: "Redirecting to PayFast to update your card details"
      };
    }),

  reactivateSubscription: protectedProcedure
    .mutation(async ({ ctx: { db, session } }) => {
      const subscription = await getUserSubscription(db, session.user.id);
      
      if (!subscription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No subscription found",
        });
      }

      if (subscription.status !== "active" || !subscription.cancelAtPeriodEnd) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Subscription cannot be reactivated",
        });
      }

      return reactivateSubscription(db, subscription.id);
    }),
});
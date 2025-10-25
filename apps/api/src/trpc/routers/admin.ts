import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import {
  getDashboardMetrics,
  getUsers,
  softDeleteUser,
  checkUserAdminStatus,
  getUserSubscription,
  updateSubscription,
  cancelSubscription,
  getPaymentById,
  getAllUsersForExport,
  getAllPaymentsForExport,
  toggleUserAdminStatus,
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  setPlanStatus,
  reorderPlans,
} from "@imaginecalendar/database/queries";
import { PayFastService } from "@imaginecalendar/payments";
import { logger } from "@imaginecalendar/logger";

// Admin middleware - extends protectedProcedure to check admin status
const adminProcedure = protectedProcedure.use(async (opts) => {
  const { session, db } = opts.ctx;

  // Get user with admin status
  const user = await checkUserAdminStatus(db, session.user.id);

  if (!user?.isAdmin) {
    logger.warn(
      { userId: session.user.id, email: session.user.email },
      "Unauthorized admin access attempt"
    );
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  logger.info(
    { adminUserId: user.id, adminEmail: user.email },
    "Admin procedure access granted"
  );

  return opts.next({
    ctx: {
      session,
      adminUser: user,
    },
  });
});

const planIdSchema = z
  .string()
  .min(1)
  .max(64)
  .trim()
  .regex(/^[a-z0-9_-]+$/);

const planStatusSchema = z.enum(["draft", "active", "archived"]);

const planFeatureSchema = z.object({
  label: z.string().min(1).max(160).trim(),
  position: z.number().int().min(0).optional(),
});

const payfastConfigSchema = z
  .object({
    recurring: z.boolean(),
    frequency: z.number().int().min(1).max(6).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.recurring && value.frequency == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Frequency is required when recurring is enabled",
        path: ["frequency"],
      });
    }

    if (!value.recurring && value.frequency !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Frequency must be null when recurring is disabled",
        path: ["frequency"],
      });
    }
  });

const planPayloadSchema = z.object({
  name: z.string().min(1).max(160).trim(),
  description: z.string().min(1).max(600).trim(),
  billingPeriod: z.string().min(1).max(120).trim(),
  displayPrice: z.string().min(1).max(48).trim(),
  amountCents: z.number().int().min(0).max(5_000_000_00),
  monthlyPriceCents: z.number().int().min(0).max(5_000_000_00),
  trialDays: z.number().int().min(0).max(365),
  status: planStatusSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
  payfastConfig: payfastConfigSchema,
  features: z.array(planFeatureSchema).min(1).max(20),
});

const createPlanInputSchema = planPayloadSchema.extend({
  id: planIdSchema,
});

const updatePlanInputSchema = planPayloadSchema.extend({
  id: planIdSchema,
});

const listPlansInputSchema = z
  .object({
    status: planStatusSchema.optional(),
    includeArchived: z.boolean().optional(),
  })
  .optional();

const reorderPlansInputSchema = z.object({
  plans: z
    .array(
      z.object({
        id: planIdSchema,
        sortOrder: z.number().int().min(0),
      })
    )
    .min(1)
    .max(50),
});

const adminPlansRouter = createTRPCRouter({
  list: adminProcedure
    .input(listPlansInputSchema)
    .query(async ({ ctx, input }) => {
      const { db, adminUser } = ctx;

      try {
        const status = input?.status;
        const includeArchived = input?.includeArchived;
        return await getPlans(db, { status, includeArchived });
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, input },
          "Failed to list subscription plans"
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch plans",
        });
      }
    }),
  get: adminProcedure
    .input(z.object({ id: planIdSchema }))
    .query(async ({ ctx, input }) => {
      const { db, adminUser } = ctx;

      try {
        const plan = await getPlanById(db, input.id);

        if (!plan) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Plan not found",
          });
        }

        return plan;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          { error, adminUserId: adminUser.id, planId: input.id },
          "Failed to load subscription plan"
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch plan",
        });
      }
    }),
  create: adminProcedure
    .input(createPlanInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, adminUser } = ctx;

      try {
        const normalizedId = input.id.trim().toLowerCase();
        const plan = await createPlan(db, {
          id: normalizedId,
          name: input.name,
          description: input.description,
          billingPeriod: input.billingPeriod,
          displayPrice: input.displayPrice,
          amountCents: input.amountCents,
          monthlyPriceCents: input.monthlyPriceCents,
          trialDays: input.trialDays,
          status: input.status ?? "draft",
          sortOrder: input.sortOrder,
          metadata: input.metadata ?? null,
          payfastConfig: input.payfastConfig,
          features: input.features.map((feature, index) => ({
            label: feature.label.trim(),
            position: feature.position ?? index,
          })),
        });

        logger.info(
          {
            adminUserId: adminUser.id,
            planId: plan.id,
          },
          "Subscription plan created"
        );

        return plan;
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, input },
          "Failed to create subscription plan"
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create plan",
        });
      }
    }),
  update: adminProcedure
    .input(updatePlanInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, adminUser } = ctx;

      try {
        const plan = await updatePlan(db, input.id, {
          name: input.name,
          description: input.description,
          billingPeriod: input.billingPeriod,
          displayPrice: input.displayPrice,
          amountCents: input.amountCents,
          monthlyPriceCents: input.monthlyPriceCents,
          trialDays: input.trialDays,
          status: input.status,
          sortOrder: input.sortOrder,
          metadata: input.metadata ?? null,
          payfastConfig: input.payfastConfig,
          features: input.features.map((feature, index) => ({
            label: feature.label.trim(),
            position: feature.position ?? index,
          })),
        });

        logger.info(
          {
            adminUserId: adminUser.id,
            planId: input.id,
          },
          "Subscription plan updated"
        );

        return plan;
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, input },
          "Failed to update subscription plan"
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update plan",
        });
      }
    }),
  setStatus: adminProcedure
    .input(z.object({
      id: planIdSchema,
      status: planStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, adminUser } = ctx;

      try {
        const plan = await setPlanStatus(db, input.id, input.status);

        logger.info(
          {
            adminUserId: adminUser.id,
            planId: input.id,
            status: input.status,
          },
          "Subscription plan status updated"
        );

        return plan;
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, input },
          "Failed to update subscription plan status"
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update plan status",
        });
      }
    }),
  reorder: adminProcedure
    .input(reorderPlansInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, adminUser } = ctx;

      try {
        const plans = await reorderPlans(db, input.plans);

        logger.info(
          {
            adminUserId: adminUser.id,
            planIds: input.plans.map((plan) => plan.id),
          },
          "Subscription plans reordered"
        );

        return plans;
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, input },
          "Failed to reorder subscription plans"
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to reorder plans",
        });
      }
    }),
});

export const adminRouter = createTRPCRouter({
  plans: adminPlansRouter,
  // Dashboard metrics
  getDashboardMetrics: adminProcedure.query(async ({ ctx }) => {
    const { db } = ctx;

    try {
      return await getDashboardMetrics(db);
    } catch (error) {
      logger.error({ error }, "Failed to fetch dashboard metrics");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch dashboard metrics",
      });
    }
  }),

  // Get users with pagination and search
  getUsers: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        filters: z
          .object({
            plan: z.enum(["trial", "monthly", "annual"]).optional(),
            status: z.enum(["active", "cancelled", "expired", "past_due", "paused"]).optional(),
            dateRange: z
              .object({
                from: z.date().optional(),
                to: z.date().optional(),
              })
              .optional(),
          })
          .optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { db } = ctx;

      try {
        return await getUsers(db, input);
      } catch (error) {
        logger.error({ error, input }, "Failed to fetch users");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch users",
        });
      }
    }),

  // Soft delete user
  deleteUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, adminUser } = ctx;
      const { userId, reason } = input;

      try {
        await softDeleteUser(db, userId);

        logger.info(
          {
            adminUserId: adminUser.id,
            deletedUserId: userId,
            reason,
          },
          "User soft deleted by admin"
        );

        return { success: true };
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, userId },
          "Failed to delete user"
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete user",
        });
      }
    }),

  // Pause/cancel user subscription
  pauseSubscription: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, adminUser } = ctx;
      const { userId, reason } = input;

      try {
        const subscription = await getUserSubscription(db, userId);

        if (!subscription) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User subscription not found",
          });
        }

        if (subscription.status === "paused") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Subscription is already paused",
          });
        }

        // For paid subscriptions, pause via PayFast
        if (subscription.payfastToken) {
          const payfast = new PayFastService();
          const pauseSuccess = await payfast.pauseSubscription(subscription.payfastToken);

          if (!pauseSuccess) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to pause subscription with payment provider",
            });
          }
        }

        // Update subscription status to paused
        const updatedSubscription = await updateSubscription(db, subscription.id, {
          status: "paused",
        });

        logger.info(
          {
            adminUserId: adminUser.id,
            userId,
            subscriptionId: subscription.id,
            reason,
          },
          "Subscription paused by admin"
        );

        return { success: true, subscription: updatedSubscription };
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, userId },
          "Failed to pause subscription"
        );
        throw error;
      }
    }),

  // Cancel user subscription
  cancelUserSubscription: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        reason: z.string().optional(),
        immediate: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, adminUser } = ctx;
      const { userId, reason, immediate } = input;

      try {
        const subscription = await getUserSubscription(db, userId);

        if (!subscription) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User subscription not found",
          });
        }

        if (subscription.status === "cancelled") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Subscription is already cancelled",
          });
        }

        // For paid subscriptions, cancel via PayFast
        if (subscription.payfastToken) {
          const payfast = new PayFastService();
          const cancelSuccess = await payfast.cancelSubscription(subscription.payfastToken);

          if (!cancelSuccess) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to cancel subscription with payment provider",
            });
          }
        }

        // Cancel subscription
        const cancelledSubscription = await cancelSubscription(db, subscription.id, immediate);

        logger.info(
          {
            adminUserId: adminUser.id,
            userId,
            subscriptionId: subscription.id,
            reason,
            immediate,
          },
          "Subscription cancelled by admin"
        );

        return { success: true, subscription: cancelledSubscription };
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, userId },
          "Failed to cancel subscription"
        );
        throw error;
      }
    }),

  // Process refund
  refundPayment: adminProcedure
    .input(
      z.object({
        paymentId: z.string(),
        amount: z.number().optional(), // Partial refund amount in cents
        reason: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, adminUser } = ctx;
      const { paymentId, amount, reason } = input;

      try {
        const payment = await getPaymentById(db, paymentId);

        if (!payment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payment not found",
          });
        }

        if (payment.status !== "completed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only completed payments can be refunded",
          });
        }

        const refundAmount = amount || payment.totalAmount;

        if (refundAmount > payment.totalAmount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Refund amount cannot exceed payment amount",
          });
        }

        // Process refund with PayFast (mock implementation for now)
        // TODO: Implement actual PayFast refund API
        const refundSuccess = true; // Mock success

        if (!refundSuccess) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process refund with payment provider",
          });
        }

        logger.info(
          {
            adminUserId: adminUser.id,
            paymentId,
            userId: payment.userId,
            refundAmount,
            reason,
          },
          "Payment refund processed by admin"
        );

        return {
          success: true,
          refundAmount,
          refundId: `refund_${Date.now()}`,
        };
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, paymentId },
          "Failed to process refund"
        );
        throw error;
      }
    }),

  // Export users data
  exportUsers: adminProcedure
    .input(
      z.object({
        filters: z
          .object({
            search: z.string().optional(),
            plan: z.enum(["trial", "monthly", "annual"]).optional(),
            status: z.enum(["active", "cancelled", "expired", "past_due", "paused"]).optional(),
            dateRange: z
              .object({
                from: z.date().optional(),
                to: z.date().optional(),
              })
              .optional(),
          })
          .optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { db } = ctx;

      try {
        return await getAllUsersForExport(db, input.filters);
      } catch (error) {
        logger.error({ error }, "Failed to export users");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to export users",
        });
      }
    }),

  // Export payments/invoices data
  exportPayments: adminProcedure
    .input(
      z.object({
        filters: z
          .object({
            status: z.enum(["pending", "processing", "completed", "failed", "refunded", "partially_refunded", "disputed"]).optional(),
            dateRange: z
              .object({
                from: z.date().optional(),
                to: z.date().optional(),
              })
              .optional(),
          })
          .optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { db } = ctx;

      try {
        return await getAllPaymentsForExport(db, input.filters);
      } catch (error) {
        logger.error({ error }, "Failed to export payments");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to export payments",
        });
      }
    }),

  // Toggle user admin status
  toggleUserAdmin: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, adminUser } = ctx;
      const { userId, reason } = input;

      try {
        // Prevent self-demotion
        if (userId === adminUser.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot modify your own admin status",
          });
        }

        const updatedUser = await toggleUserAdminStatus(db, userId);

        if (!updatedUser) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update user admin status",
          });
        }

        logger.info(
          {
            adminUserId: adminUser.id,
            targetUserId: userId,
            targetUserEmail: updatedUser.email,
            newAdminStatus: updatedUser.isAdmin,
            reason,
          },
          `User admin status ${updatedUser.isAdmin ? 'granted' : 'revoked'} by admin`
        );

        return {
          success: true,
          user: updatedUser,
          message: updatedUser.isAdmin ? "Admin access granted" : "Admin access revoked"
        };
      } catch (error) {
        logger.error(
          { error, adminUserId: adminUser.id, userId },
          "Failed to toggle user admin status"
        );

        if (error instanceof Error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to toggle admin status",
        });
      }
    }),
});

export type AdminRouter = typeof adminRouter;
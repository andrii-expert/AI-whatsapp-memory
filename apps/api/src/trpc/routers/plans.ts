import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@api/trpc/init";
import { getPlanById, getPlans } from "@imaginecalendar/database/queries";
import type { PlanRecord } from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";

function transformPlan(plan: PlanRecord) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    billingPeriod: plan.billingPeriod,
    displayPrice: plan.displayPrice,
    amountCents: plan.amountCents,
    monthlyPriceCents: plan.monthlyPriceCents,
    trialDays: plan.trialDays,
    status: plan.status,
    sortOrder: plan.sortOrder,
    metadata: plan.metadata ?? null,
    payfastConfig: plan.payfastConfig,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    features: plan.features.map((feature) => ({
      id: feature.id,
      label: feature.label,
      position: feature.position,
    })),
  };
}

export const plansRouter = createTRPCRouter({
  listActive: publicProcedure.query(async ({ ctx: { db } }) => {
    const plans = await getPlans(db, { status: "active" });

    return plans
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(transformPlan);
  }),

  get: publicProcedure
    .input(z.object({ id: z.string().min(1).max(128) }))
    .query(async ({ ctx: { db }, input }) => {
      const plan = await getPlanById(db, input.id.trim().toLowerCase());

      if (!plan) {
        logger.warn({ planId: input.id }, "Requested plan not found");
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Plan not found",
        });
      }

      return transformPlan(plan);
    }),
});

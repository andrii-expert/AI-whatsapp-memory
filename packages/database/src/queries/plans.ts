import { asc, eq, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { planFeatures, plans, planStatusEnum } from "../schema";
import { withMutationLogging, withQueryLogging } from "../utils/query-logger";

type PlanStatus = (typeof planStatusEnum.enumValues)[number];

export type PlanFeatureRecord = typeof planFeatures.$inferSelect;
export type PlanPayfastConfig = {
  recurring: boolean;
  frequency: number | null;
};

export type PlanRecord = Omit<typeof plans.$inferSelect, "payfastConfig"> & {
  payfastConfig: PlanPayfastConfig;
  features: PlanFeatureRecord[];
};

export interface PlanFeatureInput {
  id?: string;
  label: string;
  position?: number;
}

export interface PlanWritePayload {
  name: string;
  description: string;
  billingPeriod: string;
  displayPrice: string;
  amountCents: number;
  monthlyPriceCents: number;
  trialDays: number;
  status?: PlanStatus;
  sortOrder?: number;
  metadata?: Record<string, unknown> | null;
  payfastConfig: PlanPayfastConfig;
  features: PlanFeatureInput[];
}

function toPlanRecord(
  plan: typeof plans.$inferSelect & { features: PlanFeatureRecord[] }
): PlanRecord {
  const config = plan.payfastConfig as PlanPayfastConfig | null;

  return {
    ...plan,
    payfastConfig: config ?? { recurring: false, frequency: null },
  };
}

export async function getPlans(
  db: Database,
  options: { status?: PlanStatus; includeArchived?: boolean } = {}
) {
  const { status, includeArchived } = options;

  const whereClause = status
    ? eq(plans.status, status)
    : includeArchived
      ? undefined
      : ne(plans.status, "archived");

  return withQueryLogging(
    "getPlans",
    options,
    async () =>
      db.query.plans.findMany({
        where: whereClause,
        orderBy: [asc(plans.sortOrder), asc(plans.createdAt)],
        with: {
          features: {
            orderBy: [asc(planFeatures.position), asc(planFeatures.createdAt)],
          },
        },
      }).then((rows) => rows.map(toPlanRecord))
  );
}

export async function getPlanById(db: Database, id: string) {
  return withQueryLogging(
    "getPlanById",
    { planId: id },
    async () =>
      db.query.plans.findFirst({
        where: eq(plans.id, id),
        with: {
          features: {
            orderBy: [asc(planFeatures.position), asc(planFeatures.createdAt)],
          },
        },
      }).then((row) => (row ? toPlanRecord(row) : null))
  );
}

export async function createPlan(db: Database, input: PlanWritePayload & { id: string }) {
  return withMutationLogging(
    "createPlan",
    { planId: input.id },
    async () =>
      db.transaction(async (tx) => {
        const [aggregation] = await tx
          .select({ maxSort: sql<number>`coalesce(max(${plans.sortOrder}), 0)` })
          .from(plans);

        const currentMaxSort = aggregation?.maxSort ?? 0;
        const sortOrder = input.sortOrder ?? currentMaxSort + 1;
        const now = new Date();

        await tx.insert(plans).values({
          id: input.id,
          name: input.name,
          description: input.description,
          billingPeriod: input.billingPeriod,
          displayPrice: input.displayPrice,
          amountCents: input.amountCents,
          monthlyPriceCents: input.monthlyPriceCents,
          trialDays: input.trialDays,
          status: input.status ?? "draft",
          sortOrder,
          metadata: input.metadata ?? null,
          payfastConfig: input.payfastConfig,
          createdAt: now,
          updatedAt: now,
        });

        if (input.features.length > 0) {
          await tx.insert(planFeatures).values(
            input.features.map((feature, index) => ({
              planId: input.id,
              label: feature.label,
              position: feature.position ?? index,
            }))
          );
        }

        const createdPlan = await tx.query.plans.findFirst({
          where: eq(plans.id, input.id),
          with: {
            features: {
              orderBy: [asc(planFeatures.position), asc(planFeatures.createdAt)],
            },
          },
        });

        if (!createdPlan) {
          throw new Error("Plan creation failed");
        }

        return toPlanRecord(createdPlan);
      })
  );
}

export async function updatePlan(db: Database, planId: string, input: PlanWritePayload) {
  return withMutationLogging(
    "updatePlan",
    { planId },
    async () =>
      db.transaction(async (tx) => {
        const updateValues: Record<string, unknown> = {
          name: input.name,
          description: input.description,
          billingPeriod: input.billingPeriod,
          displayPrice: input.displayPrice,
          amountCents: input.amountCents,
          monthlyPriceCents: input.monthlyPriceCents,
          trialDays: input.trialDays,
          metadata: input.metadata ?? null,
          payfastConfig: input.payfastConfig,
          updatedAt: new Date(),
        };

        if (typeof input.sortOrder === "number") {
          updateValues.sortOrder = input.sortOrder;
        }

        if (input.status) {
          updateValues.status = input.status;
        }

        const updated = await tx
          .update(plans)
          .set(updateValues)
          .where(eq(plans.id, planId))
          .returning({ id: plans.id });

        if (updated.length === 0) {
          throw new Error("Plan not found");
        }

        await tx.delete(planFeatures).where(eq(planFeatures.planId, planId));

        if (input.features.length > 0) {
          await tx.insert(planFeatures).values(
            input.features.map((feature, index) => ({
              planId,
              label: feature.label,
              position: feature.position ?? index,
            }))
          );
        }

        const updatedPlan = await tx.query.plans.findFirst({
          where: eq(plans.id, planId),
          with: {
            features: {
              orderBy: [asc(planFeatures.position), asc(planFeatures.createdAt)],
            },
          },
        });

        if (!updatedPlan) {
          throw new Error("Plan update failed");
        }

        return toPlanRecord(updatedPlan);
      })
  );
}

export async function setPlanStatus(db: Database, planId: string, status: PlanStatus) {
  return withMutationLogging(
    "setPlanStatus",
    { planId, status },
    async () => {
      const updated = await db
        .update(plans)
        .set({ status, updatedAt: new Date() })
        .where(eq(plans.id, planId))
        .returning({ id: plans.id });

      if (updated.length === 0) {
        throw new Error("Plan not found");
      }

      return db.query.plans.findFirst({
        where: eq(plans.id, planId),
        with: {
          features: {
            orderBy: [asc(planFeatures.position), asc(planFeatures.createdAt)],
          },
        },
      }).then((row) => (row ? toPlanRecord(row) : null));
    }
  );
}

export async function reorderPlans(
  db: Database,
  order: Array<{ id: string; sortOrder: number }>
) {
  return withMutationLogging(
    "reorderPlans",
    { order },
    async () =>
      db.transaction(async (tx) => {
        const now = new Date();

        for (const item of order) {
          await tx
            .update(plans)
            .set({ sortOrder: item.sortOrder, updatedAt: now })
            .where(eq(plans.id, item.id));
        }

        return tx.query.plans.findMany({
          orderBy: [asc(plans.sortOrder), asc(plans.createdAt)],
          with: {
            features: {
              orderBy: [asc(planFeatures.position), asc(planFeatures.createdAt)],
            },
          },
        }).then((rows) => rows.map(toPlanRecord));
      })
  );
}

import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../client";
import { subscriptions } from "../schema";
import type { PlanId } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function getUserSubscription(db: Database, userId: string) {
  return withQueryLogging(
    'getUserSubscription',
    { userId },
    () => db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, userId),
      orderBy: [desc(subscriptions.createdAt)],
    })
  );
}

export async function getActiveSubscription(db: Database, userId: string) {
  return withQueryLogging(
    'getActiveSubscription',
    { userId },
    () => db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active")
      ),
    })
  );
}

export async function createSubscription(
  db: Database,
  data: {
  userId: string;
  plan: PlanId;
  status: "active" | "cancelled" | "expired" | "past_due" | "paused";
  trialEndsAt?: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  payfastSubscriptionId?: string;
  payfastToken?: string;
}) {
  return withMutationLogging(
    'createSubscription',
    { userId: data.userId, plan: data.plan, status: data.status },
    async () => {
      const [subscription] = await db
        .insert(subscriptions)
        .values(data)
        .returning();
        
      return subscription;
    }
  );
}

export async function updateSubscription(
  db: Database,
  id: string,
  data: {
    plan?: PlanId;
    status?: "active" | "cancelled" | "expired" | "past_due" | "paused";
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    trialEndsAt?: Date | null;
    cancelledAt?: Date;
    cancelAtPeriodEnd?: boolean;
    payfastSubscriptionId?: string;
    payfastToken?: string;
  }
) {
  return withMutationLogging(
    'updateSubscription',
    { subscriptionId: id, updates: Object.keys(data) },
    async () => {
      const [updated] = await db
        .update(subscriptions)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, id))
        .returning();
        
      return updated;
    }
  );
}

export async function cancelSubscription(db: Database, id: string, atPeriodEnd = true) {
  return withMutationLogging(
    'cancelSubscription',
    { subscriptionId: id, atPeriodEnd },
    async () => {
      const [cancelled] = await db
        .update(subscriptions)
        .set({
          status: atPeriodEnd ? "active" : "cancelled",
          cancelAtPeriodEnd: atPeriodEnd,
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, id))
        .returning();
        
      return cancelled;
    }
  );
}

export async function reactivateSubscription(db: Database, id: string) {
  return withMutationLogging(
    'reactivateSubscription',
    { subscriptionId: id },
    async () => {
      const [reactivated] = await db
        .update(subscriptions)
        .set({
          status: "active",
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, id))
        .returning();
        
      return reactivated;
    }
  );
}

export async function getExpiringTrials(db: Database) {
  return withQueryLogging(
    'getExpiringTrials',
    {},
    () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      return db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.plan, "trial"),
          eq(subscriptions.status, "active")
        ),
      });
    }
  );
}
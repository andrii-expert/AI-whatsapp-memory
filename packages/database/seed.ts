import { eq } from "drizzle-orm";
import { db } from "./src/client";
import { planFeatures, plans } from "./src/schema";

type SeedPlan = {
  id: string;
  name: string;
  description: string;
  billingPeriod: string;
  displayPrice: string;
  amountCents: number;
  monthlyPriceCents: number;
  trialDays: number;
  status: "draft" | "active" | "archived";
  sortOrder: number;
  metadata?: Record<string, unknown> | null;
  payfastConfig: {
    recurring: boolean;
    frequency: number | null;
  };
  features: string[];
};

const PLAN_SEEDS: SeedPlan[] = [
  {
    id: "trial",
    name: "Free Trial",
    description: "7 days free, then R99/month",
    billingPeriod: "for 7 days",
    displayPrice: "R0",
    amountCents: 0,
    monthlyPriceCents: 0,
    trialDays: 7,
    status: "active",
    sortOrder: 1,
    metadata: null,
    payfastConfig: {
      recurring: false,
      frequency: null,
    },
    features: [
      "WhatsApp integration",
      "Google Calendar sync",
      "Basic reminders",
      "Up to 50 events per month",
    ],
  },
  {
    id: "monthly",
    name: "Monthly",
    description: "Pay as you go",
    billingPeriod: "per month",
    displayPrice: "R99",
    amountCents: 99_00,
    monthlyPriceCents: 99_00,
    trialDays: 0,
    status: "active",
    sortOrder: 2,
    metadata: null,
    payfastConfig: {
      recurring: true,
      frequency: 3,
    },
    features: [
      "Everything in trial",
      "Microsoft Outlook sync",
      "Priority support",
      "Unlimited events",
    ],
  },
  {
    id: "annual",
    name: "Annual",
    description: "Save 20% with annual billing",
    billingPeriod: "per year",
    displayPrice: "R950",
    amountCents: 950_00,
    monthlyPriceCents: 7_917,
    trialDays: 0,
    status: "active",
    sortOrder: 3,
    metadata: null,
    payfastConfig: {
      recurring: true,
      frequency: 6,
    },
    features: [
      "Everything in monthly",
      "Advanced features",
      "Custom integrations",
      "Dedicated support",
    ],
  },
];

async function seedPlans() {
  for (const plan of PLAN_SEEDS) {
    await db.transaction(async (tx) => {
      const now = new Date();

      await tx
        .insert(plans)
        .values({
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
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: plans.id,
          set: {
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
            updatedAt: now,
          },
        });

      await tx.delete(planFeatures).where(eq(planFeatures.planId, plan.id));

      if (plan.features.length > 0) {
        await tx.insert(planFeatures).values(
          plan.features.map((feature, index) => ({
            planId: plan.id,
            label: feature,
            position: index,
          }))
        );
      }
    });
  }
}

async function main() {
  await seedPlans();
  console.log("Seeded subscription plans successfully");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to seed plans", error);
    process.exit(1);
  });

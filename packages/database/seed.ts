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
  limits: {
    maxEvents: number | null; // null = unlimited
    maxCalendars: number;
    hasReminders: boolean;
    hasNotes: boolean;
    hasSharedNotes: boolean;
    hasMultipleSubCalendars: boolean;
  };
};

const PLAN_SEEDS: SeedPlan[] = [
  // FREE PACKAGE
  {
    id: "free",
    name: "Free",
    description: "Perfect for getting started",
    billingPeriod: "forever",
    displayPrice: "R0",
    amountCents: 0,
    monthlyPriceCents: 0,
    trialDays: 0,
    status: "active",
    sortOrder: 1,
    metadata: { tier: "free", billingCycle: "none" },
    payfastConfig: {
      recurring: false,
      frequency: null,
    },
    features: [
      "Up to 15 calendar events",
      "WhatsApp integration",
      "Google Calendar sync",
      "Interval event reminders before meetings",
    ],
    limits: {
      maxEvents: 15,
      maxCalendars: 1,
      hasReminders: false,
      hasNotes: false,
      hasSharedNotes: false,
      hasMultipleSubCalendars: false,
    },
  },
  
  // SILVER PACKAGE - MONTHLY
  {
    id: "silver-monthly",
    name: "Silver",
    description: "Everything you need to stay organized",
    billingPeriod: "per month",
    displayPrice: "R99",
    amountCents: 99_00,
    monthlyPriceCents: 99_00,
    trialDays: 0,
    status: "active",
    sortOrder: 2,
    metadata: { tier: "silver", billingCycle: "monthly" },
    payfastConfig: {
      recurring: true,
      frequency: 3, // Monthly
    },
    features: [
      "Unlimited calendar events",
      "Multiple calendars & sub-calendars",
      "Multiple sub-calendar view",
      "Interval event reminders before meetings",
      "WhatsApp reminders (e.g., remind me in 30 mins)",
      "Google & Microsoft Calendar sync",
    ],
    limits: {
      maxEvents: null, // unlimited
      maxCalendars: 10,
      hasReminders: true,
      hasNotes: false,
      hasSharedNotes: false,
      hasMultipleSubCalendars: true,
    },
  },
  
  // SILVER PACKAGE - ANNUAL (20% discount)
  {
    id: "silver-annual",
    name: "Silver Annual",
    description: "Save 20% with annual billing",
    billingPeriod: "per year",
    displayPrice: "R950",
    amountCents: 950_00,
    monthlyPriceCents: 79_17, // R950 / 12 months
    trialDays: 0,
    status: "active",
    sortOrder: 3,
    metadata: { tier: "silver", billingCycle: "annual" },
    payfastConfig: {
      recurring: true,
      frequency: 6, // Annual
    },
    features: [
      "Unlimited calendar events",
      "Multiple calendars & sub-calendars",
      "Multiple sub-calendar view",
      "Interval event reminders before meetings",
      "WhatsApp reminders (e.g., remind me in 30 mins)",
      "Google & Microsoft Calendar sync",
      "Save 20% vs monthly",
    ],
    limits: {
      maxEvents: null, // unlimited
      maxCalendars: 10,
      hasReminders: true,
      hasNotes: false,
      hasSharedNotes: false,
      hasMultipleSubCalendars: true,
    },
  },
  
  // GOLD PACKAGE - MONTHLY
  {
    id: "gold-monthly",
    name: "Gold",
    description: "Premium features for power users",
    billingPeriod: "per month",
    displayPrice: "R199",
    amountCents: 199_00,
    monthlyPriceCents: 199_00,
    trialDays: 0,
    status: "active",
    sortOrder: 4,
    metadata: { tier: "gold", billingCycle: "monthly" },
    payfastConfig: {
      recurring: true,
      frequency: 3, // Monthly
    },
    features: [
      "Unlimited calendar events",
      "Multiple calendars & sub-calendars",
      "Multiple sub-calendar view",
      "Interval event reminders before meetings",
      "WhatsApp reminders (e.g., remind me in 30 mins)",
      "Notes & shared notes",
      "Google & Microsoft Calendar sync",
      "Priority support",
    ],
    limits: {
      maxEvents: null, // unlimited
      maxCalendars: 50,
      hasReminders: true,
      hasNotes: true,
      hasSharedNotes: true,
      hasMultipleSubCalendars: true,
    },
  },
  
  // GOLD PACKAGE - ANNUAL (20% discount)
  {
    id: "gold-annual",
    name: "Gold Annual",
    description: "Save 20% with annual billing - premium features",
    billingPeriod: "per year",
    displayPrice: "R1,910",
    amountCents: 1910_00,
    monthlyPriceCents: 159_17, // R1910 / 12 months
    trialDays: 0,
    status: "active",
    sortOrder: 5,
    metadata: { tier: "gold", billingCycle: "annual" },
    payfastConfig: {
      recurring: true,
      frequency: 6, // Annual
    },
    features: [
      "Unlimited calendar events",
      "Multiple calendars & sub-calendars",
      "Multiple sub-calendar view",
      "Interval event reminders before meetings",
      "WhatsApp reminders (e.g., remind me in 30 mins)",
      "Notes & shared notes",
      "Google & Microsoft Calendar sync",
      "Priority support",
      "Save 20% vs monthly",
    ],
    limits: {
      maxEvents: null, // unlimited
      maxCalendars: 50,
      hasReminders: true,
      hasNotes: true,
      hasSharedNotes: true,
      hasMultipleSubCalendars: true,
    },
  },
];

async function seedPlans() {
  for (const plan of PLAN_SEEDS) {
    await db.transaction(async (tx) => {
      const now = new Date();

      // Merge metadata with limits
      const planMetadata = {
        ...(plan.metadata || {}),
        limits: plan.limits,
      };

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
          metadata: planMetadata,
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
            metadata: planMetadata,
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

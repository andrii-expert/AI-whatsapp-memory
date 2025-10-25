export interface PlanRecordLike {
  id: string;
  name: string;
  description: string;
  billingPeriod: string;
  displayPrice: string;
  amountCents: number;
  monthlyPriceCents: number;
  trialDays: number;
  payfastConfig?: {
    recurring: boolean;
    frequency: number | null;
  } | null;
  sortOrder: number;
  features: Array<{ label: string }> | string[];
}

export type FallbackPlan = PlanRecordLike & {
  payfastConfig: {
    recurring: boolean;
    frequency: number | null;
  };
  features: string[];
};

export const FALLBACK_PLANS: FallbackPlan[] = [
  {
    id: "trial",
    name: "Free Trial",
    description: "7 days free, then R99/month",
    billingPeriod: "for 7 days",
    displayPrice: "R0",
    amountCents: 0,
    monthlyPriceCents: 0,
    trialDays: 7,
    payfastConfig: {
      recurring: false,
      frequency: null,
    },
    sortOrder: 1,
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
    payfastConfig: {
      recurring: true,
      frequency: 3,
    },
    sortOrder: 2,
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
    payfastConfig: {
      recurring: true,
      frequency: 6,
    },
    sortOrder: 3,
    features: [
      "Everything in monthly",
      "Advanced features",
      "Custom integrations",
      "Dedicated support",
    ],
  },
];

export function getFallbackPlanById(id: string) {
  return FALLBACK_PLANS.find((plan) => plan.id === id);
}

export interface DisplayPlan {
  id: string;
  name: string;
  description: string;
  billingPeriod: string;
  displayPrice: string;
  amountCents: number;
  monthlyPriceCents: number;
  trialDays: number;
  payfastConfig: {
    recurring: boolean;
    frequency: number | null;
  };
  sortOrder: number;
  features: string[];
  isTrial: boolean;
}

export function toDisplayPlan(plan: PlanRecordLike): DisplayPlan {
  const payfastConfig = plan.payfastConfig ?? { recurring: false, frequency: null };
  const trialDays = typeof plan.trialDays === "number" ? plan.trialDays : 0;
  const featuresArray = Array.isArray(plan.features)
    ? plan.features
        .map((feature) =>
          typeof feature === "string" ? feature : feature?.label ?? ""
        )
        .filter((feature): feature is string => feature.length > 0)
    : [];

  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    billingPeriod: plan.billingPeriod,
    displayPrice: plan.displayPrice,
    amountCents: plan.amountCents,
    monthlyPriceCents: plan.monthlyPriceCents,
    trialDays,
    payfastConfig,
    sortOrder: plan.sortOrder,
    features: featuresArray,
    isTrial: !payfastConfig.recurring && trialDays > 0,
  };
}
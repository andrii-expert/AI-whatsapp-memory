import { z } from "zod";

const planIdSchema = z.string().min(1).max(128);

export const createSubscriptionSchema = z.object({
  plan: planIdSchema,
});

export const updateSubscriptionSchema = z.object({
  plan: planIdSchema.optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});

export const subscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  plan: planIdSchema,
  status: z.enum(["active", "cancelled", "expired", "past_due", "paused"]),
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  cancelAtPeriodEnd: z.boolean(),
  trialEndsAt: z.date().nullable(),
  cancelledAt: z.date().nullable(),
  payfastSubscriptionId: z.string().nullable(),
  payfastToken: z.string().nullable(),
  metadata: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateSubscriptionResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("success"),
    subscription: subscriptionSchema,
  }),
  z.object({
    type: z.literal("requiresPayment"),
    message: z.string(),
    plan: planIdSchema,
  }),
]);
import { z } from "zod";

export const paymentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  subscriptionId: z.string().nullable(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(["pending", "completed", "failed", "refunded"]),
  invoiceNumber: z.string(),
  description: z.string(),
  vatAmount: z.number(),
  totalAmount: z.number(),
  payfastPaymentId: z.string().nullable(),
  paidAt: z.date().nullable(),
  createdAt: z.date(),
});

export const refundRequestSchema = z.object({
  reason: z.string().min(10).max(500),
});
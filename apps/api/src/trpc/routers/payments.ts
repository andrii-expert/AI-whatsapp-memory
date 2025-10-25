import { refundRequestSchema } from "@api/schemas/payments";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserPayments,
  getPaymentById,
  getPaymentByInvoiceNumber,
  getCompletedPayments,
} from "@imaginecalendar/database/queries";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const paymentsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(50),
      }).optional()
    )
    .query(async ({ ctx: { db, session }, input }) => {
      return getUserPayments(db, session.user.id, input?.limit);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const payment = await getPaymentById(db, input.id);
      
      if (!payment || payment.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found",
        });
      }

      return payment;
    }),

  getInvoice: protectedProcedure
    .input(z.object({ invoiceNumber: z.string() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const payment = await getPaymentByInvoiceNumber(db, input.invoiceNumber);
      
      if (!payment || payment.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }

      return payment;
    }),

  downloadInvoice: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      const payment = await getPaymentById(db, input.id);
      
      if (!payment || payment.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found",
        });
      }

      // TODO: Generate PDF invoice
      // For now, return the payment data
      return {
        url: `/api/invoices/${payment.invoiceNumber}.pdf`,
        payment,
      };
    }),

  requestRefund: protectedProcedure
    .input(
      z.object({
        paymentId: z.string(),
        reason: z.string().min(10).max(500),
      })
    )
    .mutation(async ({ ctx: { db, session }, input }) => {
      const payment = await getPaymentById(db, input.paymentId);
      
      if (!payment || payment.userId !== session.user.id) {
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

      // Already checked in the previous condition, remove duplicate check

      // TODO: Process refund with PayFast
      // For now, just return success
      return {
        success: true,
        message: "Refund request submitted",
        refundId: `refund_${Date.now()}`,
      };
    }),

  getCompletedPayments: protectedProcedure
    .query(async ({ ctx: { db, session } }) => {
      return getCompletedPayments(db, session.user.id);
    }),
});
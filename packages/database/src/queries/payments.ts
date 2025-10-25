import { eq, and, desc, sql, like, between } from "drizzle-orm";
import type { Database } from "../client";
import { payments } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function getUserPayments(db: Database, userId: string, limit = 50) {
  return withQueryLogging(
    'getUserPayments',
    { userId, limit },
    () => db.query.payments.findMany({
      where: eq(payments.userId, userId),
      orderBy: [desc(payments.createdAt)],
      limit,
      with: {
        subscription: true,
      },
    })
  );
}

export async function getPaymentById(db: Database, id: string) {
  return withQueryLogging(
    'getPaymentById',
    { paymentId: id },
    () => db.query.payments.findFirst({
      where: eq(payments.id, id),
      with: {
        user: true,
        subscription: true,
      },
    })
  );
}

export async function getPaymentByInvoiceNumber(db: Database, invoiceNumber: string) {
  return db.query.payments.findFirst({
    where: eq(payments.invoiceNumber, invoiceNumber),
    with: {
      user: true,
      subscription: true,
    },
  });
}

export async function getPaymentByMPaymentId(db: Database, mPaymentId: string) {
  return withQueryLogging(
    'getPaymentByMPaymentId',
    { mPaymentId },
    () => db.query.payments.findFirst({
      where: eq(payments.payfastMPaymentId, mPaymentId),
    })
  );
}

export async function createPayment(db: Database, data: {
  userId: string;
  subscriptionId?: string;
  amount: number; // Amount in cents
  currency: "ZAR" | "USD" | "EUR" | "GBP";
  description: string;
  billingPeriodStart?: Date;
  billingPeriodEnd?: Date;
  paymentMethod?: "card" | "eft" | "instant_eft" | "debit_order";
  status: "pending" | "processing" | "completed" | "failed" | "refunded" | "partially_refunded" | "disputed";
  payfastPaymentId?: string;
  payfastPaymentUuid?: string;
  payfastMPaymentId?: string;
}) {
  return withMutationLogging(
    'createPayment',
    { userId: data.userId, amount: data.amount, currency: data.currency, status: data.status },
    async () => {
      // Generate invoice number
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      
      // Get the count of payments for this year-month
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(payments)
        .where(like(payments.invoiceNumber, `INV-${year}${month}-%`));
      
      const count = result[0]?.count ?? 0;
      const invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;
      
      // Calculate VAT (15% for ZAR, 0% for others) - amount is VAT-inclusive
      const vatRate = data.currency === "ZAR" ? 15 : 0;
      const totalAmount = data.amount; // Amount paid by user (VAT-inclusive)
      const vatAmount = vatRate > 0 ? Math.round(totalAmount * vatRate / (100 + vatRate)) : 0;
      const subtotalAmount = totalAmount - vatAmount;
      
      const [payment] = await db
        .insert(payments)
        .values({
          ...data,
          amount: subtotalAmount, // Subtotal (VAT-exclusive)
          invoiceNumber,
          vatRate: String(vatRate),
          vatAmount,
          totalAmount,
        })
        .returning();
        
      return payment;
    }
  );
}

export async function updatePaymentStatus(
  db: Database,
  id: string,
  status: "pending" | "processing" | "completed" | "failed" | "refunded" | "partially_refunded" | "disputed",
  additionalData?: {
    paidAt?: Date;
    failedAt?: Date;
    refundedAt?: Date;
    refundAmount?: number;
    refundReason?: string;
  }
) {
  return withMutationLogging(
    'updatePaymentStatus',
    { paymentId: id, status },
    async () => {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };
      
      if (status === "completed" && additionalData?.paidAt) {
        updateData.paidAt = additionalData.paidAt;
      }
      
      if (status === "failed" && additionalData?.failedAt) {
        updateData.failedAt = additionalData.failedAt;
      }
      
      if ((status === "refunded" || status === "partially_refunded") && additionalData) {
        updateData.refundedAt = additionalData.refundedAt || new Date();
        updateData.refundAmount = additionalData.refundAmount;
        updateData.refundReason = additionalData.refundReason;
      }
      
      const [updated] = await db
        .update(payments)
        .set(updateData)
        .where(eq(payments.id, id))
        .returning();
        
      return updated;
    }
  );
}

export async function getPaymentsByDateRange(
  db: Database,
  userId: string,
  startDate: Date,
  endDate: Date
) {
  return db.query.payments.findMany({
    where: and(
      eq(payments.userId, userId),
      between(payments.createdAt, startDate, endDate)
    ),
    orderBy: [desc(payments.createdAt)],
  });
}

export async function getCompletedPayments(db: Database, userId: string) {
  return db.query.payments.findMany({
    where: and(
      eq(payments.userId, userId),
      eq(payments.status, "completed")
    ),
    orderBy: [desc(payments.paidAt)],
  });
}

export async function getFailedPayments(db: Database, userId: string) {
  return db.query.payments.findMany({
    where: and(
      eq(payments.userId, userId),
      eq(payments.status, "failed")
    ),
    orderBy: [desc(payments.createdAt)],
    limit: 10,
  });
}
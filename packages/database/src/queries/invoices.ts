import { eq, and, desc, sql, like, between, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { payments, users, subscriptions } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// Get paginated invoices for a user
export async function getUserInvoices(
  db: Database,
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }
) {
  return withQueryLogging(
    'getUserInvoices',
    { userId, ...options },
    async () => {
      const conditions = [eq(payments.userId, userId)];
      
      if (options?.status) {
        conditions.push(eq(payments.status, options.status as any));
      }
      
      if (options?.startDate && options?.endDate) {
        conditions.push(between(payments.createdAt, options.startDate, options.endDate));
      }
      
      const invoices = await db.query.payments.findMany({
        where: and(...conditions),
        orderBy: [desc(payments.createdAt)],
        limit: options?.limit || 10,
        offset: options?.offset || 0,
        with: {
          subscription: true,
        },
      });
      
      // Get total count for pagination
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(payments)
        .where(and(...conditions));
      
      const totalCount = countResult[0]?.count ?? 0;
      
      return {
        invoices,
        totalCount,
        pageSize: options?.limit || 10,
        currentPage: Math.floor((options?.offset || 0) / (options?.limit || 10)) + 1,
        totalPages: Math.ceil(totalCount / (options?.limit || 10)),
      };
    }
  );
}

// Get single invoice with full details
export async function getInvoiceById(db: Database, invoiceId: string, userId?: string) {
  return withQueryLogging(
    'getInvoiceById',
    { invoiceId, userId },
    async () => {
      const conditions = [eq(payments.id, invoiceId)];
      
      // If userId provided, ensure invoice belongs to user
      if (userId) {
        conditions.push(eq(payments.userId, userId));
      }
      
      return db.query.payments.findFirst({
        where: and(...conditions),
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              company: true,
              phone: true,
            },
          },
          subscription: true,
        },
      });
    }
  );
}

// Get invoice by invoice number
export async function getInvoiceByNumber(db: Database, invoiceNumber: string) {
  return withQueryLogging(
    'getInvoiceByNumber',
    { invoiceNumber },
    () => db.query.payments.findFirst({
      where: eq(payments.invoiceNumber, invoiceNumber),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            company: true,
            phone: true,
          },
        },
        subscription: true,
      },
    })
  );
}

// Get invoice statistics for user
export async function getUserInvoiceStats(db: Database, userId: string) {
  return withQueryLogging(
    'getUserInvoiceStats',
    { userId },
    async () => {
      // Get counts by status
      const statusCounts = await db
        .select({
          status: payments.status,
          count: sql<number>`count(*)`,
        })
        .from(payments)
        .where(eq(payments.userId, userId))
        .groupBy(payments.status);
      
      // Get total amounts
      const [totals] = await db
        .select({
          totalPaid: sql<number>`sum(case when status = 'completed' then total_amount else 0 end)`,
          totalPending: sql<number>`sum(case when status = 'pending' then total_amount else 0 end)`,
          totalFailed: sql<number>`sum(case when status = 'failed' then total_amount else 0 end)`,
          totalAmount: sql<number>`sum(total_amount)`,
          totalVat: sql<number>`sum(vat_amount)`,
        })
        .from(payments)
        .where(eq(payments.userId, userId));
      
      // Get recent invoices
      const recentInvoices = await db.query.payments.findMany({
        where: eq(payments.userId, userId),
        orderBy: [desc(payments.createdAt)],
        limit: 5,
        columns: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          status: true,
          createdAt: true,
        },
      });
      
      return {
        counts: {
          total: statusCounts.reduce((acc, curr) => acc + curr.count, 0),
          completed: statusCounts.find(s => s.status === 'completed')?.count || 0,
          pending: statusCounts.find(s => s.status === 'pending')?.count || 0,
          failed: statusCounts.find(s => s.status === 'failed')?.count || 0,
        },
        amounts: {
          totalPaid: totals?.totalPaid || 0,
          totalPending: totals?.totalPending || 0,
          totalFailed: totals?.totalFailed || 0,
          totalAmount: totals?.totalAmount || 0,
          totalVat: totals?.totalVat || 0,
        },
        recentInvoices,
      };
    }
  );
}

// Get invoices for export (CSV/Excel)
export async function getInvoicesForExport(
  db: Database,
  userId: string,
  invoiceIds?: string[]
) {
  return withQueryLogging(
    'getInvoicesForExport',
    { userId, invoiceIds },
    () => {
      const conditions = [eq(payments.userId, userId)];
      
      if (invoiceIds && invoiceIds.length > 0) {
        conditions.push(inArray(payments.id, invoiceIds));
      }
      
      return db.query.payments.findMany({
        where: and(...conditions),
        orderBy: [desc(payments.createdAt)],
        with: {
          subscription: true,
        },
      });
    }
  );
}

// Check if user has access to invoice (for public token validation)
export async function validateInvoiceAccess(
  db: Database,
  invoiceId: string,
  userId?: string,
  token?: string
) {
  return withQueryLogging(
    'validateInvoiceAccess',
    { invoiceId, userId, hasToken: !!token },
    async () => {
      // If userId provided, check ownership
      if (userId) {
        const invoice = await db.query.payments.findFirst({
          where: and(
            eq(payments.id, invoiceId),
            eq(payments.userId, userId)
          ),
          columns: { id: true },
        });
        
        return !!invoice;
      }
      
      // If token provided, validate it (implement token validation later)
      if (token) {
        // TODO: Implement secure token validation
        // For now, just check if invoice exists
        const invoice = await db.query.payments.findFirst({
          where: eq(payments.id, invoiceId),
          columns: { id: true },
        });
        
        return !!invoice;
      }
      
      return false;
    }
  );
}
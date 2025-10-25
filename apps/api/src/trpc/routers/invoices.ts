import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import { 
  getUserInvoices, 
  getInvoiceById, 
  getInvoiceByNumber,
  getUserInvoiceStats,
  getInvoicesForExport,
  validateInvoiceAccess
} from "@imaginecalendar/database/queries";
import { TRPCError } from "@trpc/server";

export const invoicesRouter = createTRPCRouter({
  // Get paginated list of user's invoices
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      status: z.enum(["pending", "processing", "completed", "failed", "refunded", "partially_refunded", "disputed"]).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }).optional())
    .query(async ({ ctx: { db, session }, input }) => {
      const offset = ((input?.page || 1) - 1) * (input?.limit || 10);
      
      return getUserInvoices(db, session.user.id, {
        limit: input?.limit || 10,
        offset,
        status: input?.status,
        startDate: input?.startDate,
        endDate: input?.endDate,
      });
    }),

  // Get single invoice by ID
  getById: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx: { db, session }, input }) => {
      const invoice = await getInvoiceById(db, input.id, session.user.id);
      
      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }
      
      return invoice;
    }),

  // Get invoice by invoice number
  getByNumber: protectedProcedure
    .input(z.object({
      invoiceNumber: z.string(),
    }))
    .query(async ({ ctx: { db, session }, input }) => {
      const invoice = await getInvoiceByNumber(db, input.invoiceNumber);
      
      if (!invoice || invoice.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }
      
      return invoice;
    }),

  // Get invoice statistics
  stats: protectedProcedure
    .query(async ({ ctx: { db, session } }) => {
      return getUserInvoiceStats(db, session.user.id);
    }),

  // Get invoices for export
  export: protectedProcedure
    .input(z.object({
      invoiceIds: z.array(z.string()).optional(),
      format: z.enum(["csv", "json"]).default("csv"),
    }))
    .query(async ({ ctx: { db, session }, input }) => {
      const invoices = await getInvoicesForExport(db, session.user.id, input.invoiceIds);
      
      if (input.format === "json") {
        return invoices;
      }
      
      // Convert to CSV format
      if (invoices.length === 0) {
        return "";
      }
      
      // CSV headers
      const headers = [
        "Invoice Number",
        "Date",
        "Description",
        "Amount",
        "VAT",
        "Total",
        "Currency",
        "Status",
        "Paid Date",
      ];
      
      // CSV rows
      const rows = invoices.map(invoice => [
        invoice.invoiceNumber,
        invoice.createdAt?.toISOString().split('T')[0] || "",
        invoice.description || "",
        (invoice.amount / 100).toFixed(2),
        (invoice.vatAmount / 100).toFixed(2),
        (invoice.totalAmount / 100).toFixed(2),
        invoice.currency,
        invoice.status,
        invoice.paidAt?.toISOString().split('T')[0] || "",
      ]);
      
      // Combine headers and rows
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
      ].join("\n");
      
      return csvContent;
    }),

  // Validate invoice access (for public PDF download)
  validateAccess: protectedProcedure
    .input(z.object({
      invoiceId: z.string(),
      token: z.string().optional(),
    }))
    .query(async ({ ctx: { db, session }, input }) => {
      const hasAccess = await validateInvoiceAccess(
        db,
        input.invoiceId,
        session.user.id,
        input.token
      );
      
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }
      
      return { hasAccess: true };
    }),

  // Get invoice data for PDF generation
  getForPdf: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx: { db, session }, input }) => {
      // Need to get invoice with user data
      const invoice = await getInvoiceById(db, input.id, session.user.id);
      
      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }
      
      // Format invoice data for PDF template
      return {
        // Company details (static for now, can be made configurable)
        company: {
          name: "CrackOn",
          address: "",
          email: "support@crackon.ai",
          phone: "",
          taxNumber: "",
          logo: "/logo.png", // Will be replaced with actual logo
        },
        
        // Invoice metadata
        invoice: {
          number: invoice.invoiceNumber,
          date: invoice.createdAt,
          dueDate: invoice.createdAt ? new Date(invoice.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null, // 30 days
          status: invoice.status,
        },
        
        // Customer details - invoice includes user from the query
        customer: {
          name: invoice.user?.name || "Customer",
          email: invoice.user?.email || "",
          company: invoice.user?.company || "",
          phone: invoice.user?.phone || "",
        },
        
        // Line items - subscription.plan is an enum value, not a relation
        lineItems: [
          {
            description: invoice.description || `${invoice.subscription?.plan || "Subscription"} - ${formatBillingPeriod(invoice.billingPeriodStart, invoice.billingPeriodEnd)}`,
            quantity: 1,
            unitPrice: invoice.amount,
            total: invoice.amount,
          },
        ],
        
        // Totals
        totals: {
          subtotal: invoice.amount,
          vatRate: parseFloat(invoice.vatRate || "0"),
          vatAmount: invoice.vatAmount,
          total: invoice.totalAmount,
          currency: invoice.currency,
        },
        
        // Payment details
        payment: {
          method: invoice.paymentMethod || "Card",
          status: invoice.status,
          paidAt: invoice.paidAt,
          reference: invoice.payfastPaymentId || invoice.id,
        },
        
        // Additional info
        notes: invoice.status === "completed" 
          ? "Thank you for your payment!" 
          : invoice.status === "pending"
          ? "Payment is being processed."
          : "Please contact support if you have any questions.",
      };
    }),
});

// Helper function to format billing period
function formatBillingPeriod(start: Date | null, end: Date | null): string {
  if (!start || !end) return "Current Period";
  
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', options);
  const endStr = end.toLocaleDateString('en-US', options);
  
  return `${startStr} - ${endStr}`;
}
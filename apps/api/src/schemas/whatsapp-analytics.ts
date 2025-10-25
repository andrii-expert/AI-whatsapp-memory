import { z } from "zod";

// Input schemas for query parameters
export const whatsappCostTrendsInputSchema = z.object({
  days: z.number().min(1).max(365).default(30),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const whatsappCostOverviewInputSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const userWhatsappCostsInputSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(50),
  search: z.string().optional(),
  sortBy: z.enum(["totalCost", "messageCount", "lastMessage"]).default("totalCost"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const userWhatsappCostDetailsInputSchema = z.object({
  userId: z.string().min(1),
});

export const whatsappCostExportInputSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// Output schemas for API responses
export const whatsappCostOverviewSchema = z.object({
  totalOutgoingMessages: z.number(),
  totalCostCents: z.number(),
  currentMonthMessages: z.number(),
  currentMonthCostCents: z.number(),
  lastMonthMessages: z.number(),
  lastMonthCostCents: z.number(),
  todayMessages: z.number(),
  todayCostCents: z.number(),
  costPerMessageCents: z.number(),
  usdToZarRate: z.number(),
});

export const whatsappCostTrendSchema = z.object({
  date: z.string(),
  messageCount: z.number(),
  costCents: z.number(),
});

export const whatsappCostTrendsSchema = z.array(whatsappCostTrendSchema);

export const userWhatsappCostSchema = z.object({
  userId: z.string(),
  userName: z.string().nullable(),
  userEmail: z.string(),
  phoneNumber: z.string(),
  outgoingMessageCount: z.number(),
  totalCostCents: z.number(),
  currentMonthCostCents: z.number(),
  lastOutgoingMessageAt: z.date().nullable(),
  costTrackingStartAt: z.date(),
});

export const paginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const userWhatsappCostsSchema = z.object({
  users: z.array(userWhatsappCostSchema),
  pagination: paginationSchema,
});

export const whatsappMessageLogSchema = z.object({
  id: z.string(),
  messageId: z.string().nullable(),
  messageType: z.string(),
  costCents: z.number(),
  exchangeRate: z.number().nullable(),
  createdAt: z.date(),
  processed: z.boolean(),
});

export const monthlyBreakdownSchema = z.object({
  month: z.string(),
  messageCount: z.number(),
  costCents: z.number(),
});

export const userWhatsappCostDetailsSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string(),
  }),
  phoneNumber: z.string(),
  totalStats: z.object({
    outgoingMessageCount: z.number(),
    totalCostCents: z.number(),
    currentMonthCostCents: z.number(),
    lastOutgoingMessageAt: z.date().nullable(),
    costTrackingStartAt: z.date(),
  }),
  recentMessages: z.array(whatsappMessageLogSchema),
  monthlyBreakdown: z.array(monthlyBreakdownSchema),
}).nullable();

export const whatsappCostExportSchema = z.array(
  z.object({
    messageId: z.string().nullable(),
    userId: z.string(),
    userName: z.string().nullable(),
    userEmail: z.string(),
    phoneNumber: z.string(),
    messageType: z.string(),
    costCents: z.number(),
    exchangeRate: z.number().nullable(),
    createdAt: z.date(),
    processed: z.boolean(),
  })
);
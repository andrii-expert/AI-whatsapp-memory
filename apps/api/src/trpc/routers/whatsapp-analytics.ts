import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import {
  getWhatsAppCostOverview,
  getWhatsAppCostTrends,
  getUserWhatsAppCosts,
  getUserWhatsAppCostDetails,
  getWhatsAppCostExportData,
  checkUserAdminStatus,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import {
  whatsappCostTrendsInputSchema,
  whatsappCostOverviewInputSchema,
  userWhatsappCostsInputSchema,
  userWhatsappCostDetailsInputSchema,
  whatsappCostExportInputSchema,
} from "../../schemas/whatsapp-analytics";

// Admin middleware - extends protectedProcedure to check admin status
const adminProcedure = protectedProcedure.use(async (opts) => {
  const { session, db } = opts.ctx;

  // Get user with admin status
  const user = await checkUserAdminStatus(db, session.user.id);

  if (!user?.isAdmin) {
    logger.warn(
      { userId: session.user.id, email: session.user.email },
      "Unauthorized admin access attempt to WhatsApp analytics"
    );
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  logger.info(
    { adminUserId: user.id, adminEmail: user.email },
    "Admin WhatsApp analytics access granted"
  );

  return opts.next({
    ctx: {
      session,
      adminUser: user,
    },
  });
});

export const whatsappAnalyticsRouter = createTRPCRouter({
  // Get WhatsApp cost overview
  getCostOverview: adminProcedure
    .input(whatsappCostOverviewInputSchema)
    .query(async ({ input, ctx }) => {
      const { db } = ctx;

      try {
        logger.info({ from: input.from, to: input.to }, "Fetching WhatsApp cost overview");
        
        let dateRange: { from: Date; to: Date } | undefined;
        if (input.from && input.to) {
          dateRange = {
            from: new Date(input.from),
            to: new Date(input.to),
          };
        }
        
        return await getWhatsAppCostOverview(db, dateRange);
      } catch (error) {
        logger.error({ error }, "Failed to fetch WhatsApp cost overview");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch WhatsApp cost overview",
        });
      }
    }),

  // Get WhatsApp cost trends
  getCostTrends: adminProcedure
    .input(whatsappCostTrendsInputSchema)
    .query(async ({ input, ctx }) => {
      const { db } = ctx;

      try {
        logger.info({ days: input.days, from: input.from, to: input.to }, "Fetching WhatsApp cost trends");
        
        let dateRange: { from: Date; to: Date } | undefined;
        if (input.from && input.to) {
          dateRange = {
            from: new Date(input.from),
            to: new Date(input.to),
          };
        }
        
        return await getWhatsAppCostTrends(db, input.days, dateRange);
      } catch (error) {
        logger.error({ error, input }, "Failed to fetch WhatsApp cost trends");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch WhatsApp cost trends",
        });
      }
    }),

  // Get user WhatsApp costs with pagination and search
  getUserCosts: adminProcedure
    .input(userWhatsappCostsInputSchema)
    .query(async ({ input, ctx }) => {
      const { db } = ctx;

      try {
        logger.info(
          {
            page: input.page,
            limit: input.limit,
            search: input.search,
            sortBy: input.sortBy,
            sortOrder: input.sortOrder
          },
          "Fetching user WhatsApp costs"
        );

        return await getUserWhatsAppCosts(db, {
          page: input.page,
          limit: input.limit,
          search: input.search,
          sortBy: input.sortBy,
          sortOrder: input.sortOrder,
        });
      } catch (error) {
        logger.error({ error, input }, "Failed to fetch user WhatsApp costs");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch user WhatsApp costs",
        });
      }
    }),

  // Get detailed WhatsApp costs for a specific user
  getUserCostDetails: adminProcedure
    .input(userWhatsappCostDetailsInputSchema)
    .query(async ({ input, ctx }) => {
      const { db } = ctx;

      try {
        logger.info(
          { userId: input.userId },
          "Fetching user WhatsApp cost details"
        );

        const details = await getUserWhatsAppCostDetails(db, input.userId);

        if (!details) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User WhatsApp data not found",
          });
        }

        return details;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({ error, input }, "Failed to fetch user WhatsApp cost details");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch user WhatsApp cost details",
        });
      }
    }),

  // Export WhatsApp cost data
  exportCostData: adminProcedure
    .input(whatsappCostExportInputSchema)
    .query(async ({ input, ctx }) => {
      const { db } = ctx;

      try {
        logger.info(
          { from: input.from, to: input.to },
          "Exporting WhatsApp cost data"
        );

        let dateRange: { from: Date; to: Date } | undefined;
        if (input.from && input.to) {
          dateRange = {
            from: new Date(input.from),
            to: new Date(input.to),
          };
        }

        const exportData = await getWhatsAppCostExportData(db, dateRange);

        logger.info(
          { recordCount: exportData.length },
          "WhatsApp cost data export completed"
        );

        return exportData;
      } catch (error) {
        logger.error({ error, input }, "Failed to export WhatsApp cost data");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to export WhatsApp cost data",
        });
      }
    }),

  // Get cost statistics for dashboard widgets
  getCostStats: adminProcedure
    .input(whatsappCostOverviewInputSchema)
    .query(async ({ input, ctx }) => {
      const { db } = ctx;

      try {
        logger.info({ from: input.from, to: input.to }, "Fetching WhatsApp cost statistics");

        let dateRange: { from: Date; to: Date } | undefined;
        if (input.from && input.to) {
          dateRange = {
            from: new Date(input.from),
            to: new Date(input.to),
          };
        }

        const overview = await getWhatsAppCostOverview(db, dateRange);
        const trends = await getWhatsAppCostTrends(db, 7, dateRange); // Last 7 days

      // Calculate growth percentages
      const currentMonthGrowth = overview.lastMonthCostCents > 0
        ? ((overview.currentMonthCostCents - overview.lastMonthCostCents) / overview.lastMonthCostCents) * 100
        : 0;

      const messageGrowth = overview.lastMonthMessages > 0
        ? ((overview.currentMonthMessages - overview.lastMonthMessages) / overview.lastMonthMessages) * 100
        : 0;

      // Calculate average daily cost from trends
      const avgDailyCost = trends.length > 0
        ? trends.reduce((sum, day) => sum + day.costCents, 0) / trends.length
        : 0;

      return {
        ...overview,
        growth: {
          costGrowthPercent: Math.round(currentMonthGrowth * 100) / 100,
          messageGrowthPercent: Math.round(messageGrowth * 100) / 100,
        },
        avgDailyCostCents: Math.round(avgDailyCost),
        weeklyTrends: trends,
      };
    } catch (error) {
      logger.error({ error }, "Failed to fetch WhatsApp cost statistics");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch WhatsApp cost statistics",
      });
    }
  }),
});
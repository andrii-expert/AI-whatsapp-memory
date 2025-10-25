import { eq, desc, and, gte, lte, sum, count, sql, asc } from "drizzle-orm";
import type { Database } from "../client";
import {
  whatsappNumbers,
  whatsappMessageLogs,
  users
} from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// $0.0076 USD per message = 0.76 cents
const COST_PER_MESSAGE_CENTS = Math.round(0.0076 * 100); // 1 cent = $0.01
const DEFAULT_USD_TO_ZAR_RATE = 18.5; // Approximate rate, should be fetched from API

// WhatsApp Business 24-hour window for free messages
const FREE_MESSAGE_WINDOW_HOURS = 24;

export async function getWhatsAppCostOverview(
  db: Database,
  dateRange?: { from: Date; to: Date }
) {
  return withQueryLogging(
    'getWhatsAppCostOverview',
    { dateRange },
    async () => {
      const now = new Date();
      const startOfMonth = dateRange ? dateRange.from : new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = dateRange ? dateRange.to : now;
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Get total outgoing messages and costs
      const totalStats = await db
        .select({
          totalOutgoingMessages: sum(whatsappNumbers.outgoingMessageCount),
          totalCostCents: sum(whatsappNumbers.totalCostCents),
        })
        .from(whatsappNumbers)
        .where(eq(whatsappNumbers.isActive, true));

      // Get current period outgoing messages and costs
      const currentPeriodStats = await db
        .select({
          messageCount: count(whatsappMessageLogs.id),
          costCents: sum(whatsappMessageLogs.costCents),
        })
        .from(whatsappMessageLogs)
        .where(
          and(
            eq(whatsappMessageLogs.direction, 'outgoing'),
            gte(whatsappMessageLogs.createdAt, startOfMonth),
            lte(whatsappMessageLogs.createdAt, endOfMonth)
          )
        );

      // Get last month stats from message logs
      const lastMonthStats = await db
        .select({
          lastMonthMessages: count(whatsappMessageLogs.id),
          lastMonthCostCents: sum(whatsappMessageLogs.costCents),
        })
        .from(whatsappMessageLogs)
        .where(
          and(
            eq(whatsappMessageLogs.direction, 'outgoing'),
            gte(whatsappMessageLogs.createdAt, startOfLastMonth),
            lte(whatsappMessageLogs.createdAt, endOfLastMonth)
          )
        );

      // Get today's stats
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayStats = await db
        .select({
          todayMessages: count(whatsappMessageLogs.id),
          todayCostCents: sum(whatsappMessageLogs.costCents),
        })
        .from(whatsappMessageLogs)
        .where(
          and(
            eq(whatsappMessageLogs.direction, 'outgoing'),
            gte(whatsappMessageLogs.createdAt, startOfDay)
          )
        );

      return {
        totalOutgoingMessages: Number(totalStats[0]?.totalOutgoingMessages) || 0,
        totalCostCents: Number(totalStats[0]?.totalCostCents) || 0,
        currentMonthMessages: Number(currentPeriodStats[0]?.messageCount) || 0,
        currentMonthCostCents: Number(currentPeriodStats[0]?.costCents) || 0,
        lastMonthMessages: Number(lastMonthStats[0]?.lastMonthMessages) || 0,
        lastMonthCostCents: Number(lastMonthStats[0]?.lastMonthCostCents) || 0,
        todayMessages: Number(todayStats[0]?.todayMessages) || 0,
        todayCostCents: Number(todayStats[0]?.todayCostCents) || 0,
        costPerMessageCents: COST_PER_MESSAGE_CENTS,
        usdToZarRate: DEFAULT_USD_TO_ZAR_RATE,
      };
    }
  );
}

export async function getWhatsAppCostTrends(
  db: Database,
  days = 30,
  dateRange?: { from: Date; to: Date }
) {
  return withQueryLogging(
    'getWhatsAppCostTrends',
    { days, dateRange },
    async () => {
      const endDate = dateRange ? dateRange.to : new Date();
      const startDate = dateRange ? dateRange.from : new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      const trends = await db
        .select({
          date: sql<string>`DATE(${whatsappMessageLogs.createdAt})`,
          messageCount: count(whatsappMessageLogs.id),
          costCents: sum(whatsappMessageLogs.costCents),
        })
        .from(whatsappMessageLogs)
        .where(
          and(
            eq(whatsappMessageLogs.direction, 'outgoing'),
            gte(whatsappMessageLogs.createdAt, startDate),
            lte(whatsappMessageLogs.createdAt, endDate)
          )
        )
        .groupBy(sql`DATE(${whatsappMessageLogs.createdAt})`)
        .orderBy(asc(sql`DATE(${whatsappMessageLogs.createdAt})`));

      return trends.map(trend => ({
        date: trend.date,
        messageCount: Number(trend.messageCount),
        costCents: Number(trend.costCents) || 0,
      }));
    }
  );
}

export async function getUserWhatsAppCosts(
  db: Database,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: 'totalCost' | 'messageCount' | 'lastMessage';
    sortOrder?: 'asc' | 'desc';
  } = {}
) {
  return withQueryLogging(
    'getUserWhatsAppCosts',
    options,
    async () => {
      const {
        page = 1,
        limit = 50,
        search = '',
        sortBy = 'totalCost',
        sortOrder = 'desc'
      } = options;

      const offset = (page - 1) * limit;

      // Build search condition
      let searchCondition = eq(whatsappNumbers.isActive, true);
      if (search) {
        const searchFilter = sql`(
          ${users.name} ILIKE ${`%${search}%`} OR
          ${users.email} ILIKE ${`%${search}%`} OR
          ${whatsappNumbers.phoneNumber} ILIKE ${`%${search}%`}
        )`;
        searchCondition = and(searchCondition, searchFilter)!;
      }

      // Build sort condition
      let sortCondition;
      switch (sortBy) {
        case 'messageCount':
          sortCondition = sortOrder === 'desc'
            ? desc(whatsappNumbers.outgoingMessageCount)
            : asc(whatsappNumbers.outgoingMessageCount);
          break;
        case 'lastMessage':
          sortCondition = sortOrder === 'desc'
            ? desc(whatsappNumbers.lastOutgoingMessageAt)
            : asc(whatsappNumbers.lastOutgoingMessageAt);
          break;
        case 'totalCost':
        default:
          sortCondition = sortOrder === 'desc'
            ? desc(whatsappNumbers.totalCostCents)
            : asc(whatsappNumbers.totalCostCents);
      }

      const userCosts = await db
        .select({
          userId: users.id,
          userName: users.name,
          userEmail: users.email,
          phoneNumber: whatsappNumbers.phoneNumber,
          outgoingMessageCount: whatsappNumbers.outgoingMessageCount,
          totalCostCents: whatsappNumbers.totalCostCents,
          currentMonthCostCents: whatsappNumbers.currentMonthCostCents,
          lastOutgoingMessageAt: whatsappNumbers.lastOutgoingMessageAt,
          costTrackingStartAt: whatsappNumbers.costTrackingStartAt,
        })
        .from(whatsappNumbers)
        .innerJoin(users, eq(whatsappNumbers.userId, users.id))
        .where(searchCondition)
        .orderBy(sortCondition)
        .limit(limit)
        .offset(offset);

      // Get total count for pagination
      const totalCount = await db
        .select({ count: count() })
        .from(whatsappNumbers)
        .innerJoin(users, eq(whatsappNumbers.userId, users.id))
        .where(searchCondition);

      const totalRecords = Number(totalCount[0]?.count) || 0;
      const totalPages = Math.ceil(totalRecords / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        users: userCosts,
        pagination: {
          page,
          limit,
          totalCount: totalRecords,
          totalPages,
          hasNextPage,
          hasPreviousPage,
        },
      };
    }
  );
}

export async function getUserWhatsAppCostDetails(db: Database, userId: string) {
  return withQueryLogging(
    'getUserWhatsAppCostDetails',
    { userId },
    async () => {
      // Get user's WhatsApp number and basic stats
      const userNumber = await db.query.whatsappNumbers.findFirst({
        where: and(
          eq(whatsappNumbers.userId, userId),
          eq(whatsappNumbers.isActive, true)
        ),
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
            }
          }
        }
      });

      if (!userNumber) {
        return null;
      }

      // Get recent message logs (last 100)
      const recentMessages = await db.query.whatsappMessageLogs.findMany({
        where: and(
          eq(whatsappMessageLogs.whatsappNumberId, userNumber.id),
          eq(whatsappMessageLogs.direction, 'outgoing')
        ),
        orderBy: [desc(whatsappMessageLogs.createdAt)],
        limit: 100,
      });

      // Get monthly breakdown for the last 12 months
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const monthlyBreakdown = await db
        .select({
          month: sql<string>`TO_CHAR(${whatsappMessageLogs.createdAt}, 'YYYY-MM')`,
          messageCount: count(whatsappMessageLogs.id),
          costCents: sum(whatsappMessageLogs.costCents),
        })
        .from(whatsappMessageLogs)
        .where(
          and(
            eq(whatsappMessageLogs.whatsappNumberId, userNumber.id),
            eq(whatsappMessageLogs.direction, 'outgoing'),
            gte(whatsappMessageLogs.createdAt, twelveMonthsAgo)
          )
        )
        .groupBy(sql`TO_CHAR(${whatsappMessageLogs.createdAt}, 'YYYY-MM')`)
        .orderBy(asc(sql`TO_CHAR(${whatsappMessageLogs.createdAt}, 'YYYY-MM')`));

      return {
        user: userNumber.user,
        phoneNumber: userNumber.phoneNumber,
        totalStats: {
          outgoingMessageCount: userNumber.outgoingMessageCount,
          totalCostCents: userNumber.totalCostCents,
          currentMonthCostCents: userNumber.currentMonthCostCents,
          lastOutgoingMessageAt: userNumber.lastOutgoingMessageAt,
          costTrackingStartAt: userNumber.costTrackingStartAt,
        },
        recentMessages: recentMessages.map(msg => ({
          id: msg.id,
          messageId: msg.messageId,
          messageType: msg.messageType,
          costCents: msg.costCents,
          exchangeRate: msg.exchangeRateUsdToZar,
          createdAt: msg.createdAt,
          processed: msg.processed,
        })),
        monthlyBreakdown: monthlyBreakdown.map(month => ({
          month: month.month,
          messageCount: Number(month.messageCount),
          costCents: Number(month.costCents) || 0,
        })),
      };
    }
  );
}

export async function getWhatsAppCostExportData(
  db: Database,
  dateRange?: { from: Date; to: Date }
) {
  return withQueryLogging(
    'getWhatsAppCostExportData',
    { dateRange },
    async () => {
      let whereCondition = eq(whatsappMessageLogs.direction, 'outgoing');

      if (dateRange) {
        whereCondition = and(
          whereCondition,
          gte(whatsappMessageLogs.createdAt, dateRange.from),
          lte(whatsappMessageLogs.createdAt, dateRange.to)
        )!;
      }

      const exportData = await db
        .select({
          messageId: whatsappMessageLogs.messageId,
          userId: whatsappMessageLogs.userId,
          userName: users.name,
          userEmail: users.email,
          phoneNumber: whatsappNumbers.phoneNumber,
          messageType: whatsappMessageLogs.messageType,
          costCents: whatsappMessageLogs.costCents,
          exchangeRate: whatsappMessageLogs.exchangeRateUsdToZar,
          createdAt: whatsappMessageLogs.createdAt,
          processed: whatsappMessageLogs.processed,
        })
        .from(whatsappMessageLogs)
        .innerJoin(whatsappNumbers, eq(whatsappMessageLogs.whatsappNumberId, whatsappNumbers.id))
        .innerJoin(users, eq(whatsappMessageLogs.userId, users.id))
        .where(whereCondition)
        .orderBy(desc(whatsappMessageLogs.createdAt));

      return exportData;
    }
  );
}

export async function logOutgoingWhatsAppMessage(
  db: Database,
  data: {
    whatsappNumberId: string;
    userId: string;
    messageId?: string;
    messageType: 'text' | 'voice' | 'image' | 'document' | 'interactive';
    isFreeMessage?: boolean; // If true, cost = 0 (within 24-hour window)
  }
) {
  return withMutationLogging(
    'logOutgoingWhatsAppMessage',
    { userId: data.userId, messageType: data.messageType, isFree: data.isFreeMessage },
    async () => {
      // Determine if this message is free (within 24-hour window)
      let costCents = 0;
      if (!data.isFreeMessage) {
        costCents = COST_PER_MESSAGE_CENTS;
      }

      // Log the message
      await db.insert(whatsappMessageLogs).values({
        whatsappNumberId: data.whatsappNumberId,
        userId: data.userId,
        messageId: data.messageId,
        direction: 'outgoing',
        messageType: data.messageType,
        costCents,
        exchangeRateUsdToZar: DEFAULT_USD_TO_ZAR_RATE.toString(),
        processed: true,
      });

      // Update the WhatsApp number totals
      await db
        .update(whatsappNumbers)
        .set({
          outgoingMessageCount: sql`${whatsappNumbers.outgoingMessageCount} + 1`,
          totalCostCents: sql`${whatsappNumbers.totalCostCents} + ${costCents}`,
          currentMonthCostCents: sql`${whatsappNumbers.currentMonthCostCents} + ${costCents}`,
          lastOutgoingMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(whatsappNumbers.id, data.whatsappNumberId));

      return {
        messageLogged: true,
        costCents,
        isFreeMessage: data.isFreeMessage || false,
      };
    }
  );
}

export async function isWithinFreeMessageWindow(
  db: Database,
  whatsappNumberId: string
): Promise<boolean> {
  return withQueryLogging(
    'isWithinFreeMessageWindow',
    { whatsappNumberId },
    async () => {
      const cutoffTime = new Date(Date.now() - (FREE_MESSAGE_WINDOW_HOURS * 60 * 60 * 1000));

      // Check if there's any incoming message within the last 24 hours
      const recentIncomingMessage = await db.query.whatsappMessageLogs.findFirst({
        where: and(
          eq(whatsappMessageLogs.whatsappNumberId, whatsappNumberId),
          eq(whatsappMessageLogs.direction, 'incoming'),
          gte(whatsappMessageLogs.createdAt, cutoffTime)
        ),
        orderBy: [desc(whatsappMessageLogs.createdAt)],
      });

      return !!recentIncomingMessage;
    }
  );
}

export async function logIncomingWhatsAppMessage(
  db: Database,
  data: {
    whatsappNumberId: string;
    userId: string;
    messageId?: string;
    messageType: 'text' | 'voice' | 'image' | 'document' | 'interactive';
  }
) {
  return withMutationLogging(
    'logIncomingWhatsAppMessage',
    { userId: data.userId, messageType: data.messageType },
    async () => {
      // Log the incoming message (no cost for incoming)
      await db.insert(whatsappMessageLogs).values({
        whatsappNumberId: data.whatsappNumberId,
        userId: data.userId,
        messageId: data.messageId,
        direction: 'incoming',
        messageType: data.messageType,
        costCents: 0, // Incoming messages are free
        processed: true,
      });

      // Update the WhatsApp number message count
      await db
        .update(whatsappNumbers)
        .set({
          messageCount: sql`${whatsappNumbers.messageCount} + 1`,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(whatsappNumbers.id, data.whatsappNumberId));

      return {
        messageLogged: true,
        costCents: 0,
        direction: 'incoming',
      };
    }
  );
}
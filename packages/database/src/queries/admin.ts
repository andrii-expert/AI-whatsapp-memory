import { eq, isNull, desc, and, gte, or, lt, ne, like, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { users, subscriptions, payments } from "../schema";
import type { PlanId } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

export async function getDashboardMetrics(db: Database) {
  return withQueryLogging(
    'getDashboardMetrics',
    {},
    async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get all active subscriptions
      const activeSubscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.status, "active"),
          isNull(subscriptions.deletedAt)
        ),
        with: {
          user: {
            columns: {
              id: true,
              createdAt: true,
            }
          }
        }
      });

      // Count active trials
      const activeTrials = activeSubscriptions.filter(
        sub => sub.plan === "trial" && sub.trialEndsAt && sub.trialEndsAt > now
      ).length;

      // Count paying users (monthly and annual plans with active status)
      const payingUsers = activeSubscriptions.filter(
        sub => (sub.plan === "monthly" || sub.plan === "annual")
      ).length;

      // Calculate MRR (Monthly Recurring Revenue) from actual payment amounts
      let mrr = 0;

      for (const subscription of activeSubscriptions) {
        if (subscription.plan === "trial") continue;

        // Get the most recent successful payment for this subscription
        const recentPayment = await db.query.payments.findFirst({
          where: and(
            eq(payments.subscriptionId, subscription.id),
            eq(payments.status, "completed"),
            isNull(payments.deletedAt)
          ),
          orderBy: [desc(payments.createdAt)],
          columns: {
            amount: true,
            vatAmount: true,
            totalAmount: true,
          }
        });

        if (recentPayment) {
          if (subscription.plan === "monthly") {
            // For monthly subscriptions, add the full amount
            mrr += recentPayment.amount;
          } else if (subscription.plan === "annual") {
            // For annual subscriptions, divide by 12 to get monthly amount
            mrr += Math.round(recentPayment.amount / 12);
          }
        }
      }

      // Get cancelled subscriptions this month for churn rate
      const cancelledThisMonth = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.status, "cancelled"),
          gte(subscriptions.cancelledAt, startOfMonth),
          isNull(subscriptions.deletedAt)
        ),
        columns: { id: true }
      });

      // Calculate churn rate (cancelled this month / total active at start of month * 100)
      const totalActiveAtStartOfMonth = activeSubscriptions.filter(
        sub => sub.plan !== "trial"
      ).length;

      const churnRate = totalActiveAtStartOfMonth > 0
        ? Math.round((cancelledThisMonth.length / totalActiveAtStartOfMonth) * 100)
        : 0;

      // Get signups in last 7 and 30 days
      const allUsers = await db.query.users.findMany({
        where: isNull(users.deletedAt),
        columns: {
          id: true,
          createdAt: true,
        }
      });

      const signupsLast7Days = allUsers.filter(
        user => user.createdAt >= sevenDaysAgo
      ).length;

      const signupsLast30Days = allUsers.filter(
        user => user.createdAt >= thirtyDaysAgo
      ).length;

      return {
        activeTrials,
        payingUsers,
        mrr,
        churnRate,
        signupsLast7Days,
        signupsLast30Days,
      };
    }
  );
}

export async function getUsers(
  db: Database,
  options: {
    search?: string;
    page: number;
    limit: number;
    filters?: {
      plan?: PlanId;
      status?: "active" | "cancelled" | "expired" | "past_due" | "paused";
      dateRange?: {
        from?: Date;
        to?: Date;
      };
    };
  }
) {
  const { search, page, limit, filters } = options;
  const offset = (page - 1) * limit;

  return withQueryLogging(
    'getUsers',
    { search, page, limit, filters },
    async () => {
      // Build where conditions
      const whereConditions = [isNull(users.deletedAt)];

      // Add search filter for email, name, or phone
      if (search && search.trim()) {
        const searchCondition = or(
          like(users.email, `%${search}%`),
          like(users.name, `%${search}%`),
          like(users.phone, `%${search}%`)
        );
        if (searchCondition) {
          whereConditions.push(searchCondition);
        }
      }

      // Add date range filter
      if (filters?.dateRange?.from) {
        whereConditions.push(gte(users.createdAt, filters.dateRange.from));
      }
      if (filters?.dateRange?.to) {
        whereConditions.push(lte(users.createdAt, filters.dateRange.to));
      }

      // Get users with subscriptions
      const usersList = await db.query.users.findMany({
        where: and(...whereConditions),
        orderBy: [desc(users.createdAt)],
        with: {
          subscription: true,
        },
      });

      // Filter by plan and status in memory (since these are in the subscription relation)
      let filteredUsers = usersList;

      if (filters?.plan) {
        filteredUsers = filteredUsers.filter(user => user.subscription?.plan === filters.plan);
      }

      if (filters?.status) {
        filteredUsers = filteredUsers.filter(user => {
          if (!user.subscription) return false;
          
          // Handle "cancelled" status to show cancelAtPeriodEnd
          if (filters.status === "cancelled") {
            return user.subscription.cancelAtPeriodEnd === true;
          }
          
          return user.subscription.status === filters.status;
        });
      }

      // Apply pagination to filtered results
      const totalCount = filteredUsers.length;
      const paginatedUsers = filteredUsers.slice(offset, offset + limit);
      const totalPages = Math.ceil(totalCount / limit);

      return {
        users: paginatedUsers.map(user => ({
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          company: user.company,
          createdAt: user.createdAt,
          isAdmin: user.isAdmin,
          plan: user.subscription?.plan || null,
          subscriptionStatus: user.subscription?.cancelAtPeriodEnd ? 'cancelled' : (user.subscription?.status || null),
          currentPeriodEnd: user.subscription?.currentPeriodEnd || null,
          cancelAtPeriodEnd: user.subscription?.cancelAtPeriodEnd || false,
          cancelledAt: user.subscription?.cancelledAt || null,
        })),
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    }
  );
}

export async function softDeleteUser(db: Database, userId: string) {
  return withMutationLogging(
    'softDeleteUser',
    { userId },
    async () => {
      const now = new Date();

      // Soft delete the user
      const [deletedUser] = await db
        .update(users)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId))
        .returning();

      // Also soft delete their subscription
      await db
        .update(subscriptions)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(subscriptions.userId, userId));

      return deletedUser;
    }
  );
}

export async function getAllUsersForExport(
  db: Database,
  filters?: {
    search?: string;
    plan?: PlanId;
    status?: "active" | "cancelled" | "expired" | "past_due" | "paused";
    dateRange?: {
      from?: Date;
      to?: Date;
    };
  }
) {
  return withQueryLogging(
    'getAllUsersForExport',
    { filters },
    async () => {
      const usersList = await db.query.users.findMany({
        where: isNull(users.deletedAt),
        orderBy: [desc(users.createdAt)],
        with: {
          subscription: true,
          payments: {
            where: eq(payments.status, "completed"),
            limit: 1,
            orderBy: [desc(payments.createdAt)],
          },
        },
      });

      return usersList.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name || "",
        phone: user.phone || "",
        company: user.company || "",
        plan: user.subscription?.plan || "trial",
        subscriptionStatus: user.subscription?.cancelAtPeriodEnd ? 'cancelled' : (user.subscription?.status || "active"),
        createdAt: user.createdAt,
        currentPeriodEnd: user.subscription?.currentPeriodEnd || null,
        totalSpent: user.payments?.reduce((sum, payment) => sum + payment.totalAmount, 0) || 0,
        lastPaymentDate: user.payments?.[0]?.paidAt || null,
        cancelAtPeriodEnd: user.subscription?.cancelAtPeriodEnd || false,
        cancelledAt: user.subscription?.cancelledAt || null,
      }));
    }
  );
}

export async function toggleUserAdminStatus(db: Database, userId: string) {
  return withMutationLogging(
    'toggleUserAdminStatus',
    { userId },
    async () => {
      const now = new Date();

      // First get the current user to check their admin status
      const user = await db.query.users.findFirst({
        where: and(eq(users.id, userId), isNull(users.deletedAt)),
        columns: {
          id: true,
          email: true,
          name: true,
          isAdmin: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Toggle the admin status
      const newAdminStatus = !user.isAdmin;

      const updatedUsers = await db
        .update(users)
        .set({
          isAdmin: newAdminStatus,
          updatedAt: now,
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          isAdmin: users.isAdmin,
        });

      if (!updatedUsers.length) {
        throw new Error("Failed to update user admin status");
      }

      return updatedUsers[0];
    }
  );
}

export async function getAllPaymentsForExport(
  db: Database,
  filters?: {
    status?: "pending" | "processing" | "completed" | "failed" | "refunded" | "partially_refunded" | "disputed";
    dateRange?: {
      from?: Date;
      to?: Date;
    };
  }
) {
  return withQueryLogging(
    'getAllPaymentsForExport',
    { filters },
    async () => {
      let whereConditions = [isNull(payments.deletedAt)];

      if (filters?.status) {
        whereConditions.push(eq(payments.status, filters.status));
      }

      if (filters?.dateRange?.from) {
        whereConditions.push(gte(payments.createdAt, filters.dateRange.from));
      }

      if (filters?.dateRange?.to) {
        whereConditions.push(lt(payments.createdAt, filters.dateRange.to));
      }

      const paymentsList = await db.query.payments.findMany({
        where: and(...whereConditions),
        orderBy: [desc(payments.createdAt)],
        with: {
          user: {
            columns: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      return paymentsList.map(payment => ({
        invoiceNumber: payment.invoiceNumber,
        userEmail: payment.user.email,
        userName: payment.user.name || "",
        amount: payment.amount,
        vatAmount: payment.vatAmount,
        totalAmount: payment.totalAmount,
        currency: payment.currency,
        status: payment.status,
        description: payment.description,
        createdAt: payment.createdAt,
        paidAt: payment.paidAt,
        billingPeriodStart: payment.billingPeriodStart,
        billingPeriodEnd: payment.billingPeriodEnd,
        paymentMethod: payment.paymentMethod,
      }));
    }
  );
}
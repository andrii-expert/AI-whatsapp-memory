"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { getPlanLimits, getPlanTier, type PlanLimits, type PlanTier } from "@imaginecalendar/database/queries";

export interface UsePlanLimitsReturn {
  limits: PlanLimits;
  tier: PlanTier;
  isLoading: boolean;
  hasFeature: (feature: keyof PlanLimits) => boolean;
  canAddEvent: (currentCount: number) => boolean;
  canAddCalendar: (currentCount: number) => boolean;
  getEventsRemaining: (currentCount: number) => number | null;
  getCalendarsRemaining: (currentCount: number) => number;
  canAddFriend: (currentCount: number) => boolean;
  getFriendsRemaining: (currentCount: number) => number | null;
}

/**
 * Hook to get current user's plan limits and feature access
 */
export function usePlanLimits(): UsePlanLimitsReturn {
  const trpc = useTRPC();
  
  const { data: subscription, isLoading: isLoadingSubscription } = useQuery(
    trpc.billing.getSubscription.queryOptions()
  );
  
  const { data: plans = [], isLoading: isLoadingPlans } = useQuery(
    trpc.plans.listActive.queryOptions()
  );
  
  // Try to get the plan from active plans first
  let currentPlan = plans.find(p => p.id === subscription?.plan);
  
  // If plan not found in active plans but we have a subscription, try to fetch it directly
  const planId = subscription?.plan;
  const { data: planById, isLoading: isLoadingPlanById } = useQuery({
    ...trpc.plans.get.queryOptions({ id: planId || '' }),
    enabled: !!planId && !currentPlan && !isLoadingPlans,
    retry: false, // Don't retry if plan not found
  });
  
  // Use the plan from direct fetch if we couldn't find it in active plans
  // Ignore errors (plan might be archived/inactive, but we still want to use its metadata)
  if (!currentPlan && planById) {
    currentPlan = planById;
  }
  
  const metadata = (currentPlan?.metadata as Record<string, unknown> | null) || null;
  
  // Get tier from metadata, but fallback to plan ID if metadata doesn't have tier
  let tier = getPlanTier(metadata);
  // Fallback: if tier is 'free' but plan ID suggests otherwise, infer tier from plan ID
  if (tier === 'free' && subscription?.plan) {
    const planId = subscription.plan;
    if (planId === 'beta') {
      tier = 'beta';
    } else if (planId.startsWith('silver')) {
      tier = 'silver';
    } else if (planId.startsWith('gold')) {
      tier = 'gold';
    }
  }
  
  // Get limits from metadata
  let limits = getPlanLimits(metadata);
  
  // CRITICAL: If tier is not free (silver/pro, gold, or beta), ensure maxFriends is null (unlimited)
  // This is a safety check in case metadata has incorrect limits
  if (tier !== 'free' && limits.maxFriends !== null && limits.maxFriends !== undefined) {
    limits = {
      ...limits,
      maxFriends: null,
    };
  }
  
  const isLoading = isLoadingSubscription || isLoadingPlans || isLoadingPlanById;

  return {
    limits,
    tier,
    isLoading,
    hasFeature: (feature: keyof PlanLimits) => {
      if (feature === 'maxEvents' || feature === 'maxCalendars') {
        throw new Error('Use canAddEvent or canAddCalendar for limit checks');
      }
      return limits[feature];
    },
    canAddEvent: (currentCount: number) => {
      if (limits.maxEvents === null) return true; // unlimited
      return currentCount < limits.maxEvents;
    },
    canAddCalendar: (currentCount: number) => {
      return currentCount < limits.maxCalendars;
    },
    getEventsRemaining: (currentCount: number) => {
      if (limits.maxEvents === null) return null; // unlimited
      const remaining = limits.maxEvents - currentCount;
      return Math.max(0, remaining);
    },
    getCalendarsRemaining: (currentCount: number) => {
      const remaining = limits.maxCalendars - currentCount;
      return Math.max(0, remaining);
    },
    canAddFriend: (currentCount: number) => {
      if (limits.maxFriends === null || limits.maxFriends === undefined) return true;
      return currentCount < limits.maxFriends;
    },
    getFriendsRemaining: (currentCount: number) => {
      if (limits.maxFriends === null || limits.maxFriends === undefined) return null;
      const remaining = limits.maxFriends - currentCount;
      return Math.max(0, remaining);
    },
  };
}


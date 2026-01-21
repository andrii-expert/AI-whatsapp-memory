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
  
  const currentPlan = plans.find(p => p.id === subscription?.plan);
  const metadata = (currentPlan?.metadata as Record<string, unknown> | null) || null;
  
  const limits = getPlanLimits(metadata);
  const tier = getPlanTier(metadata);
  const isLoading = isLoadingSubscription || isLoadingPlans;

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


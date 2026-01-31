/**
 * Plan Limits and Feature Gating Utilities
 * 
 * This file contains helper functions for checking plan limits and features
 */

export type PlanLimits = {
  maxEvents: number | null; // null = unlimited
  maxCalendars: number;
  hasReminders: boolean;
  hasNotes: boolean;
  hasSharedNotes: boolean;
  hasMultipleSubCalendars: boolean;
  maxFriends?: number | null; // null = unlimited friends
};

export type PlanTier = 'free' | 'silver' | 'gold' | 'beta';
export type BillingCycle = 'none' | 'monthly' | 'annual';

export interface PlanMetadata {
  tier?: PlanTier;
  billingCycle?: BillingCycle;
  limits?: PlanLimits;
}

/**
 * Extract plan limits from plan metadata
 */
export function getPlanLimits(metadata: Record<string, unknown> | null): PlanLimits {
  // Keep tier detection consistent with getPlanTier:
  // if no metadata or no explicit tier, treat as "free".
  const tier = (metadata?.tier as PlanTier | undefined) ?? "free";

  // Default limits; friends default depends on tier
  // Beta users are treated the same as silver/pro users
  const defaultLimits: PlanLimits = {
    maxEvents: 15,
    maxCalendars: 10, // Allow multiple calendars by default
    hasReminders: false,
    hasNotes: false,
    hasSharedNotes: false,
    hasMultipleSubCalendars: false,
    // Free plan: explicitly limit friends to 2 unless overridden in metadata
    // Beta and silver/pro plans get unlimited friends (null)
    maxFriends: tier === "free" ? 2 : null,
  };

  if (!metadata || !metadata.limits) {
    return defaultLimits;
  }

  const limits = metadata.limits as PlanLimits;
  // For maxFriends, if not explicitly set in limits, use tier-based default
  // This ensures silver/beta plans get unlimited friends even if maxFriends is not in limits object
  // IMPORTANT: If tier is not 'free', always set maxFriends to null (unlimited) regardless of what's in limits
  let maxFriends: number | null;
  if (tier !== 'free') {
    // Silver/pro, gold, and beta users always get unlimited friends
    maxFriends = null;
  } else {
    // For free tier, use the value from limits if set, otherwise use default (2)
    maxFriends = limits.maxFriends !== undefined 
      ? limits.maxFriends 
      : defaultLimits.maxFriends;
  }
  
  return {
    maxEvents: limits.maxEvents ?? defaultLimits.maxEvents,
    maxCalendars: limits.maxCalendars ?? defaultLimits.maxCalendars,
    hasReminders: limits.hasReminders ?? defaultLimits.hasReminders,
    hasNotes: limits.hasNotes ?? defaultLimits.hasNotes,
    hasSharedNotes: limits.hasSharedNotes ?? defaultLimits.hasSharedNotes,
    hasMultipleSubCalendars: limits.hasMultipleSubCalendars ?? defaultLimits.hasMultipleSubCalendars,
    maxFriends: maxFriends,
  };
}

/**
 * Get plan tier from metadata
 */
export function getPlanTier(metadata: Record<string, unknown> | null): PlanTier {
  if (!metadata || !metadata.tier) {
    return 'free';
  }
  return metadata.tier as PlanTier;
}

/**
 * Get billing cycle from metadata
 */
export function getBillingCycle(metadata: Record<string, unknown> | null): BillingCycle {
  if (!metadata || !metadata.billingCycle) {
    return 'none';
  }
  return metadata.billingCycle as BillingCycle;
}

/**
 * Check if user can add more events
 */
export function canAddEvent(currentEventCount: number, limits: PlanLimits): boolean {
  if (limits.maxEvents === null) return true; // unlimited
  return currentEventCount < limits.maxEvents;
}

/**
 * Check if user can add more calendars
 */
export function canAddCalendar(currentCalendarCount: number, limits: PlanLimits): boolean {
  return currentCalendarCount < limits.maxCalendars;
}

/**
 * Get events remaining count
 */
export function getEventsRemaining(currentEventCount: number, limits: PlanLimits): number | null {
  if (limits.maxEvents === null) return null; // unlimited
  const remaining = limits.maxEvents - currentEventCount;
  return Math.max(0, remaining);
}

/**
 * Get calendars remaining count
 */
export function getCalendarsRemaining(currentCalendarCount: number, limits: PlanLimits): number {
  const remaining = limits.maxCalendars - currentCalendarCount;
  return Math.max(0, remaining);
}

/**
 * Check if feature is available in plan
 */
export function hasFeature(feature: keyof PlanLimits, limits: PlanLimits): boolean {
  if (feature === 'maxEvents' || feature === 'maxCalendars') {
    throw new Error('Use canAddEvent or canAddCalendar for limit checks');
  }
  return limits[feature];
}

/**
 * Get upgrade message for a locked feature
 */
export function getUpgradeMessage(feature: string, currentTier: PlanTier): string {
  const messages: Record<string, Record<PlanTier, string>> = {
    reminders: {
      free: 'Upgrade to Pro to unlock WhatsApp reminders',
      silver: 'Available in your plan',
      gold: 'Available in your plan',
      beta: 'Available in your plan',
    },
    notes: {
      free: 'Upgrade to Gold to unlock Notes & Shared Notes',
      silver: 'Upgrade to Gold to unlock Notes & Shared Notes',
      gold: 'Available in your plan',
      beta: 'Available in your plan',
    },
    multipleCalendars: {
      free: 'Upgrade to Pro to unlock multiple calendars',
      silver: 'Available in your plan',
      gold: 'Available in your plan',
      beta: 'Available in your plan',
    },
    unlimitedEvents: {
      free: 'Upgrade to Pro for unlimited events',
      silver: 'Available in your plan',
      gold: 'Available in your plan',
      beta: 'Available in your plan',
    },
  };

  return messages[feature]?.[currentTier] || 'Upgrade to unlock this feature';
}

/**
 * Get required plan tier for a feature
 */
export function getRequiredTier(feature: string): PlanTier {
  const tierMap: Record<string, PlanTier> = {
    reminders: 'silver',
    notes: 'gold',
    sharedNotes: 'gold',
    multipleCalendars: 'silver',
    unlimitedEvents: 'silver',
    multipleSubCalendars: 'silver',
  };

  return tierMap[feature] || 'free';
}

/**
 * Check if user needs to upgrade for a feature
 */
export function needsUpgrade(currentTier: PlanTier, requiredTier: PlanTier): boolean {
  const tierOrder: Record<PlanTier, number> = {
    free: 0,
    silver: 1,
    gold: 2,
    beta: 1, // Beta is treated the same as silver/pro for feature access
  };

  return tierOrder[currentTier] < tierOrder[requiredTier];
}


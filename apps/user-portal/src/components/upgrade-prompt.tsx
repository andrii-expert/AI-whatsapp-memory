"use client";

import { Alert, AlertDescription, AlertTitle } from "@imaginecalendar/ui/alert";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent } from "@imaginecalendar/ui/card";
import { Lock, ArrowRight, Sparkles, Zap, Crown } from "lucide-react";
import Link from "next/link";
import { cn } from "@imaginecalendar/ui/cn";

interface UpgradePromptProps {
  feature: string;
  requiredTier: 'pro' | 'gold';
  variant?: 'alert' | 'card' | 'inline';
  className?: string;
}

const TIER_INFO = {
  pro: {
    name: 'Pro',
    icon: Zap,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  gold: {
    name: 'Gold',
    icon: Crown,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
};

export function UpgradePrompt({ feature, requiredTier, variant = 'alert', className }: UpgradePromptProps) {
  const tierInfo = TIER_INFO[requiredTier];
  const Icon = tierInfo.icon;
  const isFriendsFeature = feature.toLowerCase() === 'friends';

  if (variant === 'inline') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Lock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Requires {tierInfo.name}
        </span>
        <Button asChild size="sm" variant="link" className="h-auto p-0">
          <Link href="/billing">
            Upgrade
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <Card className={cn("border-2", tierInfo.borderColor, className)}>
        <CardContent className={cn("p-6", tierInfo.bgColor)}>
          <div className="flex items-start gap-4">
            <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", tierInfo.bgColor)}>
              <Icon className={cn("h-6 w-6", tierInfo.color)} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">
                {feature} - {tierInfo.name} Feature
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upgrade to {tierInfo.name} to unlock {feature.toLowerCase()} and more premium features.
              </p>
              <Button
                variant="blue-primary"
                className="flex w-full sm:w-auto"
                size="lg"
              >
                <Link href="/billing">
                  Upgrade to {tierInfo.name}
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default: alert variant
  return (
    <Alert className={cn(tierInfo.borderColor, className)}>
      <Lock className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", tierInfo.color)} />
        {tierInfo.name} Feature Required
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between mt-2">
        <span className="text-sm">
          {isFriendsFeature ? (
            <>
              On the Free plan you can add up to 2 friends. Upgrade to {tierInfo.name} to add more friends and make planning your trips even easier.
            </>
          ) : (
            <>Upgrade to {tierInfo.name} to access {feature.toLowerCase()}</>
          )}
        </span>
        <Button asChild size="sm" variant="default">
          <Link href="/billing">
            Upgrade Now
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

interface FeatureLockedOverlayProps {
  requiredTier: 'pro' | 'gold';
  className?: string;
  children?: React.ReactNode;
}

export function FeatureLockedOverlay({ requiredTier, className, children }: FeatureLockedOverlayProps) {
  const tierInfo = TIER_INFO[requiredTier];
  const Icon = tierInfo.icon;

  return (
    <div className={cn("relative", className)}>
      {/* Blurred/disabled content */}
      <div className="pointer-events-none opacity-40 blur-sm">
        {children}
      </div>
      
      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
        <Card className={cn("border-2 shadow-lg max-w-sm", tierInfo.borderColor)}>
          <CardContent className="p-6 text-center">
            <div className={cn("h-16 w-16 rounded-full mx-auto mb-4 flex items-center justify-center", tierInfo.bgColor)}>
              <Lock className={cn("h-8 w-8", tierInfo.color)} />
            </div>
            <h3 className="font-bold text-xl mb-2">
              {tierInfo.name} Feature
            </h3>
            <p className="text-muted-foreground mb-4">
              Upgrade to {tierInfo.name} to unlock this feature
            </p>
            <Button
                variant="blue-primary"
                className="flex w-full sm:w-auto"
                size="lg"
              >
                <Link href="/billing">
                  Upgrade to {tierInfo.name}
                </Link>
              </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


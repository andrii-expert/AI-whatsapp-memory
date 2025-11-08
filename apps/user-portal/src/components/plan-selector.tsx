"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import { Button } from "@imaginecalendar/ui/button";
import { Switch } from "@imaginecalendar/ui/switch";
import { Check, Sparkles, Crown, Zap } from "lucide-react";
import { cn } from "@imaginecalendar/ui/cn";

interface PlanFeature {
  label: string;
  included: boolean;
}

interface PlanOption {
  id: string;
  tier: 'free' | 'silver' | 'gold';
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  features: PlanFeature[];
  isPopular?: boolean;
  limits?: {
    maxEvents?: number | null;
    maxCalendars?: number;
  };
}

interface PlanSelectorProps {
  currentPlanId?: string;
  onSelectPlan: (planId: string, billingCycle: 'monthly' | 'annual') => void;
  isLoading?: boolean;
}

const PLAN_OPTIONS: PlanOption[] = [
  {
    id: 'free',
    tier: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    limits: {
      maxEvents: 15,
      maxCalendars: 1,
    },
    features: [
      { label: 'Up to 15 calendar events', included: true },
      { label: 'WhatsApp integration', included: true },
      { label: 'Google Calendar sync', included: true },
      { label: 'Interval event reminders', included: true },
      { label: 'WhatsApp reminders', included: false },
      { label: 'Multiple calendars', included: false },
      { label: 'Notes & shared notes', included: false },
    ],
  },
  {
    id: 'silver',
    tier: 'silver',
    name: 'Silver',
    monthlyPrice: 99,
    annualPrice: 950,
    isPopular: true,
    limits: {
      maxEvents: null, // unlimited
      maxCalendars: 10,
    },
    features: [
      { label: 'Unlimited calendar events', included: true },
      { label: 'Up to 10 calendars', included: true },
      { label: 'Multiple sub-calendars', included: true },
      { label: 'Interval event reminders', included: true },
      { label: 'WhatsApp reminders', included: true },
      { label: 'Google & Microsoft sync', included: true },
      { label: 'Notes & shared notes', included: false },
    ],
  },
  {
    id: 'gold',
    tier: 'gold',
    name: 'Gold',
    monthlyPrice: 199,
    annualPrice: 1910,
    limits: {
      maxEvents: null, // unlimited
      maxCalendars: 50,
    },
    features: [
      { label: 'Unlimited calendar events', included: true },
      { label: 'Up to 50 calendars', included: true },
      { label: 'Multiple sub-calendars', included: true },
      { label: 'Interval event reminders', included: true },
      { label: 'WhatsApp reminders', included: true },
      { label: 'Notes & shared notes', included: true },
      { label: 'Priority support', included: true },
    ],
  },
];

export function PlanSelector({ currentPlanId, onSelectPlan, isLoading }: PlanSelectorProps) {
  const [isAnnual, setIsAnnual] = useState(false);

  const getPlanIcon = (tier: 'free' | 'silver' | 'gold') => {
    switch (tier) {
      case 'free':
        return Sparkles;
      case 'silver':
        return Zap;
      case 'gold':
        return Crown;
    }
  };

  const formatPrice = (cents: number) => {
    return `R${(cents / 100).toFixed(0)}`;
  };

  const getAnnualSavings = (monthly: number, annual: number) => {
    const yearlyCostMonthly = monthly * 12;
    const savings = yearlyCostMonthly - annual;
    const percentage = Math.round((savings / yearlyCostMonthly) * 100);
    return { savings, percentage };
  };

  return (
    <div className="space-y-8">
      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={cn("text-sm font-medium", !isAnnual && "text-primary")}>
          Monthly
        </span>
        <Switch
          checked={isAnnual}
          onCheckedChange={setIsAnnual}
          className="data-[state=checked]:bg-primary"
        />
        <span className={cn("text-sm font-medium", isAnnual && "text-primary")}>
          Annual
        </span>
        {isAnnual && (
          <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
            Save 20%
          </Badge>
        )}
      </div>

      {/* Plans Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {PLAN_OPTIONS.map((plan) => {
          const Icon = getPlanIcon(plan.tier);
          const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
          const displayPrice = formatPrice(price);
          const isCurrentPlan = currentPlanId?.startsWith(plan.id);
          const savings = plan.tier !== 'free' ? getAnnualSavings(plan.monthlyPrice, plan.annualPrice) : null;

          return (
            <Card
              key={plan.id}
              className={cn(
                "relative overflow-hidden transition-all",
                plan.isPopular && "border-2 border-primary shadow-lg",
                isCurrentPlan && "ring-2 ring-primary"
              )}
            >
              {plan.isPopular && (
                <div className="absolute top-0 left-0 right-0 bg-primary text-white text-xs font-semibold py-1 px-4 text-center">
                  Most Popular
                </div>
              )}
              
              <CardHeader className={cn(plan.isPopular && "pt-8")}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    plan.tier === 'free' && "bg-blue-100",
                    plan.tier === 'silver' && "bg-purple-100",
                    plan.tier === 'gold' && "bg-yellow-100"
                  )}>
                    <Icon className={cn(
                      "h-5 w-5",
                      plan.tier === 'free' && "text-blue-600",
                      plan.tier === 'silver' && "text-purple-600",
                      plan.tier === 'gold' && "text-yellow-600"
                    )} />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    {isCurrentPlan && (
                      <Badge variant="secondary" className="mt-1">Current Plan</Badge>
                    )}
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{displayPrice}</span>
                    {plan.tier !== 'free' && (
                      <span className="text-muted-foreground">
                        /{isAnnual ? 'year' : 'month'}
                      </span>
                    )}
                  </div>
                  {isAnnual && plan.tier !== 'free' && savings && (
                    <p className="text-sm text-green-600 font-medium mt-1">
                      Save {formatPrice(savings.savings)}/year
                    </p>
                  )}
                  {!isAnnual && plan.tier !== 'free' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      or {formatPrice(plan.annualPrice)}/year (save 20%)
                    </p>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className={cn(
                        "h-5 w-5 flex-shrink-0 mt-0.5",
                        feature.included ? "text-green-600" : "text-gray-300"
                      )} />
                      <span className={cn(
                        "text-sm",
                        feature.included ? "text-foreground" : "text-muted-foreground line-through"
                      )}>
                        {feature.label}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => onSelectPlan(
                    plan.tier === 'free' ? 'free' : `${plan.id}-${isAnnual ? 'annual' : 'monthly'}`,
                    isAnnual ? 'annual' : 'monthly'
                  )}
                  disabled={isCurrentPlan || isLoading}
                  variant={plan.isPopular ? "default" : "outline"}
                  className="w-full"
                  size="lg"
                >
                  {isCurrentPlan ? 'Current Plan' : 
                   plan.tier === 'free' ? 'Downgrade to Free' :
                   'Upgrade Now'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


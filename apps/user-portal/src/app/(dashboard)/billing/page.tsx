"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import { Button } from "@imaginecalendar/ui/button";
import { useToast } from "@imaginecalendar/ui/use-toast";
import {
  CreditCard,
  CheckCircle,
  Loader2,
  AlertCircle,
  Check,
  Home,
  ChevronLeft,
  Sparkles,
  Zap,
  Crown
} from "lucide-react";
import Link from "next/link";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FALLBACK_PLANS, getFallbackPlanById, toDisplayPlan } from "@/utils/plans";
import type { DisplayPlan, PlanRecordLike } from "@/utils/plans";
import { Switch } from "@imaginecalendar/ui/switch";
import { RadioGroup, RadioGroupItem } from "@imaginecalendar/ui/radio-group";
import { cn } from "@imaginecalendar/ui/cn";

function getStatusBadgeProps(status: string) {
  switch (status) {
    case 'active':
      return { variant: 'secondary' as const, className: 'bg-green-100 text-green-800 border-green-200', text: 'Active' };
    case 'trial':
      return { variant: 'secondary' as const, className: 'bg-blue-100 text-blue-800 border-blue-200', text: 'Trial' };
    case 'cancelled':
      return { variant: 'secondary' as const, className: 'bg-yellow-100 text-yellow-800 border-yellow-200', text: 'Cancelled' };
    case 'expired':
      return { variant: 'destructive' as const, className: '', text: 'Expired' };
    case 'past_due':
      return { variant: 'destructive' as const, className: '', text: 'Past Due' };
    case 'paused':
      return { variant: 'secondary' as const, className: 'bg-gray-100 text-gray-800 border-gray-200', text: 'Paused' };
    default:
      return { variant: 'secondary' as const, className: 'bg-gray-100 text-gray-800 border-gray-200', text: status };
  }
}

function calculateRemainingDays(endDate: Date | string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

function formatCurrency(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`;
}

const USE_DB_PLANS = process.env.NEXT_PUBLIC_USE_DB_PLANS !== "false";

export default function BillingPage() {
  const { toast } = useToast();
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isAnnual, setIsAnnual] = useState(false);

  const plansQueryOptions = trpc.plans.listActive.queryOptions();
  const plansQuery = useQuery(plansQueryOptions);

  const plans = useMemo<DisplayPlan[]>(() => {
    const candidateData = plansQuery.data;
    const source: PlanRecordLike[] = USE_DB_PLANS && Array.isArray(candidateData) && candidateData.length > 0
      ? (candidateData as PlanRecordLike[])
      : FALLBACK_PLANS;

    return source
      .map((plan) => toDisplayPlan(plan))
      .filter((plan) => Boolean(plan.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [plansQuery.data]);

  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  const {
    data: subscription,
    isLoading: isLoadingSubscription,
    error: subscriptionError
  } = useQuery(trpc.billing.getSubscription.queryOptions());

  const updateSubscriptionMutation = useMutation(
    trpc.billing.updateSubscription.mutationOptions({
      onSuccess: (result) => {
        // Handle trial users who need to be redirected to PayFast
        if (result.type === "requiresPayment") {
          toast({
            title: "Redirecting to Payment",
            description: result.message,
          });

          // Create form and submit to payment redirect endpoint
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = '/api/payment/redirect';
          form.style.display = 'none';

          const planInput = document.createElement('input');
          planInput.type = 'hidden';
          planInput.name = 'plan';
          planInput.value = result.plan;
          form.appendChild(planInput);

          // Add billing flow flag to use billing-specific return URLs
          const billingFlowInput = document.createElement('input');
          billingFlowInput.type = 'hidden';
          billingFlowInput.name = 'isBillingFlow';
          billingFlowInput.value = 'true';
          form.appendChild(billingFlowInput);

          document.body.appendChild(form);
          form.submit();
          return;
        }

        // Handle successful plan updates for existing subscribers
        if (result.type === "success") {
          toast({
            title: "Plan Updated",
            description: "Your plan has been updated successfully.",
          });
        }
        // Note: invalidate is handled by React Query
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to update plan.",
          variant: "destructive",
        });
      },
    })
  );

  const cancelSubscriptionMutation = useMutation(
    trpc.billing.cancelSubscription.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Subscription Cancelled",
          description: "Your subscription will be cancelled at the end of the current period.",
        });
        // Note: invalidate is handled by React Query
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to cancel subscription.",
          variant: "destructive",
        });
      },
    })
  );

  const reactivateSubscriptionMutation = useMutation(
    trpc.billing.reactivateSubscription.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Subscription Reactivated",
          description: "Your subscription has been reactivated successfully.",
        });
        // Note: invalidate is handled by React Query
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to reactivate subscription.",
          variant: "destructive",
        });
      },
    })
  );

  const getCardUpdateUrlMutation = useMutation(
    trpc.billing.getCardUpdateUrl.mutationOptions({
      onSuccess: (result) => {
        toast({
          title: "Redirecting to PayFast",
          description: result.message,
        });

        // Redirect to PayFast card update page
        window.location.href = result.url;
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Unable to update card details.",
          variant: "destructive",
        });
      },
    })
  );

  const [selectedPlanForChange, setSelectedPlanForChange] = useState<string | null>(null);

  const handlePlanSelect = (planId: string) => {
    setSelectedPlanForChange(planId);
  };

  const confirmPlanChange = () => {
    if (!subscription || updateSubscriptionMutation.isPending || !selectedPlanForChange) return;

    // Use tRPC for all plan changes - it will handle the different scenarios
    updateSubscriptionMutation.mutate({
      plan: selectedPlanForChange as any,
    });
  };

  const handleCancelSubscription = () => {
    if (!subscription || cancelSubscriptionMutation.isPending) return;
    cancelSubscriptionMutation.mutate();
  };

  const handleReactivateSubscription = () => {
    if (!subscription || reactivateSubscriptionMutation.isPending) return;
    reactivateSubscriptionMutation.mutate();
  };

  const handleUpdateCardDetails = () => {
    if (!subscription || getCardUpdateUrlMutation.isPending) return;
    getCardUpdateUrlMutation.mutate();
  };

  // Handle return from PayFast (both payment and card update)
  useEffect(() => {
    const status = searchParams.get('status');
    const message = searchParams.get('message');
    const cardUpdateStatus = searchParams.get('card_update');
    const cancelled = searchParams.get('cancelled');

    // Handle payment return (from billing-success or billing-cancel routes)
    if (status && message) {
      if (status === 'success') {
        toast({
          title: "Payment Successful",
          description: message,
          variant: "success",
        });
      } else if (status === 'cancelled') {
        toast({
          title: "Payment Cancelled",
          description: message,
        });
      }

      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('status');
      newUrl.searchParams.delete('message');
      router.replace(newUrl.pathname + newUrl.search);
    }

    // Handle card update return
    else if (cardUpdateStatus || cancelled) {
      if (cardUpdateStatus === 'success') {
        toast({
          title: "Card Updated",
          description: "Your payment method has been updated successfully.",
        });
      } else if (cardUpdateStatus === 'cancelled' || cancelled === 'true') {
        toast({
          title: "Update Cancelled",
          description: "Card update was cancelled.",
          variant: "destructive",
        });
      } else if (cardUpdateStatus === 'failed') {
        toast({
          title: "Update Failed",
          description: "Failed to update your payment method. Please try again.",
          variant: "destructive",
        });
      } else {
        // Generic return from PayFast (we don't know the exact status)
        toast({
          title: "Returned from PayFast",
          description: "You have returned from the payment method update process.",
        });
      }

      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('card_update');
      newUrl.searchParams.delete('cancelled');
      router.replace(newUrl.pathname + newUrl.search);
    }
  }, [searchParams, router, toast]);

  const currentPlanId = subscription?.plan ?? plans[0]?.id ?? "trial";
  const fallbackPlan = getFallbackPlanById(currentPlanId);
  const currentPlan = planMap.get(currentPlanId) ?? (fallbackPlan ? toDisplayPlan(fallbackPlan) : undefined);
  const isOnTrial = currentPlan?.isTrial ?? false;
  const statusBadge = getStatusBadgeProps(
    isOnTrial ? 'trial' :
    (subscription?.cancelAtPeriodEnd ? 'cancelled' : (subscription?.status || 'active'))
  );
  const isCancelled = subscription?.status === 'cancelled' || subscription?.cancelAtPeriodEnd;
  const remainingDays = subscription?.currentPeriodEnd
    ? calculateRemainingDays(subscription.currentPeriodEnd)
    : (subscription?.trialEndsAt ? calculateRemainingDays(subscription.trialEndsAt) : 0);

  // Loading state
  if (isLoadingSubscription) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Loading billing details...</div>
      </div>
    );
  }

  // Error state
  if (subscriptionError) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <div>
                <h3 className="font-medium">Error Loading Subscription</h3>
                <p className="text-sm text-muted-foreground">
                  {subscriptionError.message || "Unable to load subscription details."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoadingPlans = USE_DB_PLANS && plansQuery.isLoading && plans.length === 0;
  const planLoadError = USE_DB_PLANS && plansQuery.isError;

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
        <span className="font-medium">Billing & Subscription</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Billing & Subscription</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription and payment details
        </p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
          <CardDescription>
            Your active subscription details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Plan</p>
              <p className="font-semibold">{currentPlan?.name || 'Unknown Plan'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className="font-semibold">
                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", statusBadge.className)}>
                  {statusBadge.text}
                </span>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Price</p>
              <p className="font-semibold">{currentPlan?.displayPrice || 'R0'}/{currentPlan?.billingPeriod || 'month'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{isCancelled ? 'Expires' : 'Renews'}</p>
              <p className="font-semibold">
                {subscription?.currentPeriodEnd 
                  ? format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')
                  : (subscription?.trialEndsAt 
                    ? format(new Date(subscription.trialEndsAt), 'MMM d, yyyy')
                    : 'N/A')}
              </p>
            </div>
          </div>

          {/* Update Card Details - Only for paid subscribers */}
          {!isOnTrial && subscription?.payfastToken && (
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Payment Method</p>
                  <p className="text-sm text-muted-foreground">Update your card details with PayFast</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUpdateCardDetails}
                  disabled={getCardUpdateUrlMutation.isPending}
                >
                  {getCardUpdateUrlMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Update Card
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Features */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Features</CardTitle>
          <CardDescription>
            What's included in your current plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {currentPlan?.features?.map((feature: string, index: number) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Change Plan</CardTitle>
          <CardDescription>
            {currentPlanId === 'free' 
              ? 'Upgrade to unlock premium features' 
              : 'Switch to a different subscription plan'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Monthly/Annual Toggle */}
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <p className="text-base font-medium">
                Billing Cycle
              </p>
              <p className="text-sm text-muted-foreground">
                {isAnnual 
                  ? "Annual billing (Save 20%)" 
                  : "Monthly billing"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("text-sm", !isAnnual && "font-semibold")}>
                Monthly
              </span>
              <Switch
                checked={isAnnual}
                onCheckedChange={setIsAnnual}
              />
              <span className={cn("text-sm", isAnnual && "font-semibold")}>
                Annual
              </span>
            </div>
          </div>

          {planLoadError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
              We couldn't load the latest plans. Showing default options instead.
            </div>
          )}

          {isLoadingPlans ? (
            <div className="text-center text-muted-foreground py-8">Loading available plans...</div>
          ) : (
            <RadioGroup
              value={selectedPlanForChange || currentPlanId}
              onValueChange={handlePlanSelect}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4"
            >
              {/* Free Plan */}
              {(() => {
                const freePlan = plans.find(p => p.id === 'free');
                if (!freePlan) return null;
                const isSelected = (selectedPlanForChange || currentPlanId) === 'free';
                const isCurrentPlan = currentPlanId === 'free';
                
                return (
                  <label
                    key="free"
                    htmlFor="plan-free"
                    className={cn(
                      "relative flex flex-col p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-xl",
                      isSelected
                        ? "border-blue-500 bg-blue-500 shadow-xl scale-105"
                        : "border-gray-300 hover:border-blue-400 bg-white"
                    )}
                  >
                    <RadioGroupItem
                      value="free"
                      id="plan-free"
                      className={cn(
                        "absolute top-4 right-4",
                        isSelected && "!border-white !text-white [&_svg]:!fill-white"
                      )}
                    />

                    <div className={cn("text-center mb-6", isCurrentPlan && !isSelected && "mt-6")}>
                      <div className={cn(
                        "h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center",
                        isSelected ? "bg-white/20" : "bg-blue-100"
                      )}>
                        <Sparkles className={cn("h-6 w-6", isSelected ? "text-white" : "text-blue-600")} />
                      </div>
                      <h4 className={cn("text-xl font-bold mb-3", isSelected ? "text-white" : "text-primary")}>
                        {freePlan.name}
                      </h4>
                      <div className="mb-3">
                        <span className={cn("text-4xl font-bold", isSelected ? "text-white" : "text-primary")}>
                          {freePlan.displayPrice}
                        </span>
                        <span className={cn("text-base ml-1", isSelected ? "text-white/90" : "text-primary/80")}>
                          /{freePlan.billingPeriod}
                        </span>
                      </div>
                      <p className={cn("text-sm font-medium", isSelected ? "text-white/90" : "text-primary/80")}>
                        {freePlan.description}
                      </p>
                    </div>

                    <div className={cn(
                      "pt-4 flex-1",
                      isSelected ? "border-t-2 border-white/30" : "border-t-2 border-gray-200"
                    )}>
                      <ul className="space-y-3">
                        {freePlan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm">
                            <Check className={cn("w-5 h-5 mt-0.5 flex-shrink-0", isSelected ? "text-white" : "text-green-600")} />
                            <span className={cn(isSelected ? "text-white" : "text-foreground")}>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </label>
                );
              })()}

              {/* Silver Plan */}
              {(() => {
                const planId = isAnnual ? 'silver-annual' : 'silver-monthly';
                const silverPlan = plans.find(p => p.id === planId);
                if (!silverPlan) return null;
                const isSelected = (selectedPlanForChange || currentPlanId) === planId;
                const isCurrentPlan = currentPlanId === planId;
                
                const silverMonthly = plans.find(p => p.id === 'silver-monthly');
                const monthlyEquivalent = silverPlan.monthlyPriceCents / 100;
                const savings = silverMonthly && isAnnual 
                  ? (silverMonthly.amountCents * 12 - silverPlan.amountCents) / 100
                  : 0;

                return (
                  <label
                    key={planId}
                    htmlFor={`plan-${planId}`}
                    className={cn(
                      "relative flex flex-col p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-xl",
                      isSelected
                        ? "border-purple-500 bg-purple-500 shadow-xl scale-105"
                        : "border-gray-300 hover:border-purple-400 bg-white"
                    )}
                  >
                    <RadioGroupItem
                      value={planId}
                      id={`plan-${planId}`}
                      className={cn(
                        "absolute top-4 right-4",
                        isSelected && "!border-white !text-white [&_svg]:!fill-white"
                      )}
                    />

                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className={cn(
                        "text-xs font-bold px-4 py-1.5 rounded-full shadow-md",
                        isCurrentPlan && !isSelected 
                          ? "bg-green-500 text-white"
                          : "bg-accent text-white"
                      )}>
                        {isCurrentPlan && !isSelected ? "Your Current Plan" : "Most Popular"}
                      </span>
                    </div>

                    <div className="text-center mb-6 mt-4">
                      <div className={cn(
                        "h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center",
                        isSelected ? "bg-white/20" : "bg-purple-100"
                      )}>
                        <Zap className={cn("h-6 w-6", isSelected ? "text-white" : "text-purple-600")} />
                      </div>
                      <h4 className={cn("text-xl font-bold mb-3", isSelected ? "text-white" : "text-primary")}>
                        {silverPlan.name.replace(' Annual', '')}
                      </h4>
                      <div className="mb-1">
                        <span className={cn("text-4xl font-bold", isSelected ? "text-white" : "text-primary")}>
                          {silverPlan.displayPrice}
                        </span>
                        <span className={cn("text-base ml-1", isSelected ? "text-white/90" : "text-primary/80")}>
                          /{silverPlan.billingPeriod}
                        </span>
                      </div>
                      {isAnnual && monthlyEquivalent && (
                        <p className={cn("text-xs mb-1", isSelected ? "text-white/80" : "text-muted-foreground")}>
                          R{monthlyEquivalent.toFixed(0)}/month when paid annually
                        </p>
                      )}
                      <p className={cn("text-sm font-medium", isSelected ? "text-white/90" : isAnnual && savings > 0 ? "text-green-600" : "text-primary/80")}>
                        {isAnnual && savings > 0 ? `💰 Save R${savings.toFixed(0)}/year` : silverPlan.description}
                      </p>
                    </div>

                    <div className={cn(
                      "pt-4 flex-1",
                      isSelected ? "border-t-2 border-white/30" : "border-t-2 border-gray-200"
                    )}>
                      <ul className="space-y-3">
                        {silverPlan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm">
                            <Check className={cn("w-5 h-5 mt-0.5 flex-shrink-0", isSelected ? "text-white" : "text-green-600")} />
                            <span className={cn(isSelected ? "text-white" : "text-foreground")}>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </label>
                );
              })()}

              {/* Gold Plan */}
              {(() => {
                const planId = isAnnual ? 'gold-annual' : 'gold-monthly';
                const goldPlan = plans.find(p => p.id === planId);
                if (!goldPlan) return null;
                const isSelected = (selectedPlanForChange || currentPlanId) === planId;
                const isCurrentPlan = currentPlanId === planId;
                
                const goldMonthly = plans.find(p => p.id === 'gold-monthly');
                const monthlyEquivalent = goldPlan.monthlyPriceCents / 100;
                const savings = goldMonthly && isAnnual 
                  ? (goldMonthly.amountCents * 12 - goldPlan.amountCents) / 100
                  : 0;

                return (
                  <label
                    key={planId}
                    htmlFor={`plan-${planId}`}
                    className={cn(
                      "relative flex flex-col p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-xl",
                      isSelected
                        ? "border-yellow-500 bg-yellow-500 shadow-xl scale-105"
                        : "border-gray-300 hover:border-yellow-400 bg-white"
                    )}
                  >
                    <RadioGroupItem
                      value={planId}
                      id={`plan-${planId}`}
                      className={cn(
                        "absolute top-4 right-4",
                        isSelected && "!border-white !text-white [&_svg]:!fill-white"
                      )}
                    />

                    <div className={cn("text-center mb-6", isCurrentPlan && !isSelected && "mt-6")}>
                      <div className={cn(
                        "h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center",
                        isSelected ? "bg-white/20" : "bg-yellow-100"
                      )}>
                        <Crown className={cn("h-6 w-6", isSelected ? "text-white" : "text-yellow-600")} />
                      </div>
                      <h4 className={cn("text-xl font-bold mb-3", isSelected ? "text-white" : "text-primary")}>
                        {goldPlan.name.replace(' Annual', '')}
                      </h4>
                      <div className="mb-1">
                        <span className={cn("text-4xl font-bold", isSelected ? "text-white" : "text-primary")}>
                          {goldPlan.displayPrice}
                        </span>
                        <span className={cn("text-base ml-1", isSelected ? "text-white/90" : "text-primary/80")}>
                          /{goldPlan.billingPeriod}
                        </span>
                      </div>
                      {isAnnual && monthlyEquivalent && (
                        <p className={cn("text-xs mb-1", isSelected ? "text-white/80" : "text-muted-foreground")}>
                          R{monthlyEquivalent.toFixed(0)}/month when paid annually
                        </p>
                      )}
                      <p className={cn("text-sm font-medium", isSelected ? "text-white/90" : isAnnual && savings > 0 ? "text-green-600" : "text-primary/80")}>
                        {isAnnual && savings > 0 ? `💰 Save R${savings.toFixed(0)}/year` : goldPlan.description}
                      </p>
                    </div>

                    <div className={cn(
                      "pt-4 flex-1",
                      isSelected ? "border-t-2 border-white/30" : "border-t-2 border-gray-200"
                    )}>
                      <ul className="space-y-3">
                        {goldPlan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm">
                            <Check className={cn("w-5 h-5 mt-0.5 flex-shrink-0", isSelected ? "text-white" : "text-green-600")} />
                            <span className={cn(isSelected ? "text-white" : "text-foreground")}>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </label>
                );
              })()}
            </RadioGroup>
          )}

          {/* Confirm Plan Change Button */}
          {selectedPlanForChange && selectedPlanForChange !== currentPlanId && !isLoadingPlans && (
            <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t">
              <Button
                variant="outline"
                onClick={() => setSelectedPlanForChange(null)}
                disabled={updateSubscriptionMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmPlanChange}
                disabled={updateSubscriptionMutation.isPending}
                variant="blue-primary"
                size="lg"
              >
                {updateSubscriptionMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Confirm Plan Change'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription Management */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription Actions</CardTitle>
          <CardDescription>
            Manage your subscription
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCancelled ? (
            <>
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                Your subscription is scheduled to cancel. You can reactivate it anytime before the end date.
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleReactivateSubscription}
                  disabled={reactivateSubscriptionMutation.isPending}
                  variant="blue-primary"
                >
                  {reactivateSubscriptionMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reactivating...
                    </>
                  ) : (
                    'Reactivate Subscription'
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              {currentPlanId !== 'free' ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Your subscription is active and will auto-renew. You can cancel anytime.
                  </p>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={handleCancelSubscription}
                      disabled={cancelSubscriptionMutation.isPending}
                    >
                      {cancelSubscriptionMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Cancelling...
                        </>
                      ) : (
                        'Cancel Subscription'
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You're on the free plan. No subscription to manage.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
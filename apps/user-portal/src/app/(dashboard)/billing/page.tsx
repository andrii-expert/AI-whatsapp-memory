"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import { Button } from "@imaginecalendar/ui/button";
import { useToast } from "@imaginecalendar/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@imaginecalendar/ui/alert-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";

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

type Currency = "ZAR" | "USD" | "EUR" | "GBP" | "CAD" | "AUD";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  ZAR: "R",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "AU$",
};

// Default exchange rates (fallback if API fails) - these are approximate and should not be used
const DEFAULT_EXCHANGE_RATES: Record<Currency, number> = {
  ZAR: 1,
  USD: 0.0584, // 1 ZAR = 0.0584 USD (approximately 1 USD = 17.1 ZAR)
  EUR: 0.0503,  // 1 ZAR = 0.0503 EUR (approximately 1 EUR = 19.9 ZAR)
  GBP: 0.0443, // 1 ZAR = 0.0443 GBP (approximately 1 GBP = 22.6 ZAR)
  CAD: 0.0819, // 1 ZAR = 0.0819 CAD (approximately 1 CAD = 12.2 ZAR)
  AUD: 0.0897, // 1 ZAR = 0.0897 AUD (approximately 1 AUD = 11.1 ZAR)
};

// Fetch real-time exchange rates from exchangerate-api.io (free, no API key required)
async function fetchExchangeRates(): Promise<Record<Currency, number> | null> {
  try {
    // Using exchangerate-api.io free endpoint (no API key required)
    // This fetches rates with USD as base, so we'll convert to ZAR base
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/ZAR');
    
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rates');
    }
    
    const data = await response.json();
    
    // Verify we have the rates object
    if (!data.rates) {
      throw new Error('Invalid API response: missing rates');
    }
    
    // Convert to our Currency type format (ZAR as base = 1)
    const rates: Record<Currency, number> = {
      ZAR: 1,
      USD: data.rates.USD ?? DEFAULT_EXCHANGE_RATES.USD,
      EUR: data.rates.EUR ?? DEFAULT_EXCHANGE_RATES.EUR,
      GBP: data.rates.GBP ?? DEFAULT_EXCHANGE_RATES.GBP,
      CAD: data.rates.CAD ?? DEFAULT_EXCHANGE_RATES.CAD,
      AUD: data.rates.AUD ?? DEFAULT_EXCHANGE_RATES.AUD,
    };
    
    // Log for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Exchange rates fetched:', {
        USD: rates.USD,
        EUR: rates.EUR,
        GBP: rates.GBP,
        CAD: rates.CAD,
        AUD: rates.AUD,
      });
    }
    
    return rates;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return null;
  }
}

function formatCurrency(cents: number, currency: Currency, exchangeRates: Record<Currency, number> | null): string {
  if (!exchangeRates) {
    return '...';
  }
  const amount = (cents / 100) * exchangeRates[currency];
  const symbol = CURRENCY_SYMBOLS[currency];
  return `${symbol}${amount.toFixed(2)}`;
}

function convertPrice(cents: number, currency: Currency, exchangeRates: Record<Currency, number>): number {
  return (cents / 100) * exchangeRates[currency];
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
        setShowCancelDialog(false);
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
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  
  // Currency state - default to ZAR for all users
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("ZAR");

  // Load saved currency preference on mount, otherwise use ZAR as default
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if user has a saved currency preference
    const saved = localStorage.getItem("billing-currency");
    if (saved && ["ZAR", "USD", "EUR", "GBP", "CAD", "AUD"].includes(saved)) {
      // User has a saved preference, use it
      setSelectedCurrency(saved as Currency);
    } else {
      // No saved preference - use ZAR as default
      setSelectedCurrency("ZAR");
      localStorage.setItem("billing-currency", "ZAR");
    }
  }, []);

  // Exchange rates state - only use real-time rates, no defaults
  const [exchangeRates, setExchangeRates] = useState<Record<Currency, number> | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(true);
  const [ratesLastUpdated, setRatesLastUpdated] = useState<Date | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  // Fetch exchange rates on mount and periodically
  useEffect(() => {
    const loadExchangeRates = async () => {
      setIsLoadingRates(true);
      setRatesError(null);
      const rates = await fetchExchangeRates();
      if (rates) {
        setExchangeRates(rates);
        setRatesLastUpdated(new Date());
        setRatesError(null);
      } else {
        setRatesError('Failed to fetch exchange rates. Please refresh the page.');
      }
      setIsLoadingRates(false);
    };

    // Load immediately
    loadExchangeRates();

    // Refresh rates every 1 hour (3600000 ms)
    const interval = setInterval(loadExchangeRates, 3600000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("billing-currency", selectedCurrency);
    }
  }, [selectedCurrency]);

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

  const handleCancelSubscription = async () => {
    if (!subscription || cancelSubscriptionMutation.isPending) return;
    try {
      await cancelSubscriptionMutation.mutateAsync();
    } catch (error) {
      // Error is handled by the mutation's onError callback
    }
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

  // If subscription query failed, log it and fall back to treating the user as on the free plan
  if (subscriptionError) {
    console.error("Billing subscription load error:", subscriptionError);
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

      {/* Current Subscription and Plan Features - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Subscription */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="font-bold">Current Subscription</CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Your active subscription details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Subscription Details in 2-column grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Plan</p>
                <p className="font-bold text-base">{currentPlan?.name || 'Unknown Plan'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Status</p>
                <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-3 py-1 text-sm font-semibold">
                  {statusBadge.text}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Price</p>
                <p className="font-bold text-base">
                  {isLoadingRates || !exchangeRates ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </span>
                  ) : currentPlan?.amountCents !== undefined ? (
                    `${formatCurrency(currentPlan.amountCents, selectedCurrency, exchangeRates)} ${currentPlan?.billingPeriod || 'month'}`
                  ) : (
                    'N/A'
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">{isCancelled ? 'Expires' : 'Renews'}</p>
                <p className="font-bold text-base">
                  {subscription?.currentPeriodEnd 
                    ? format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')
                    : (subscription?.trialEndsAt 
                      ? format(new Date(subscription.trialEndsAt), 'MMM d, yyyy')
                      : 'N/A')}
                </p>
              </div>
            </div>
                        {/* Payment Method Section */}
                        {!isOnTrial && subscription?.payfastToken && (
              <div>
                <p className="font-bold text-base mb-1">Payment Method</p>
                <p className="text-sm text-gray-600 mb-4">Update your card details with PayFast</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUpdateCardDetails}
                  disabled={getCardUpdateUrlMutation.isPending}
                  className="border-orange-500 text-orange-600 hover:bg-orange-50"
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
            )}
          </CardContent>
        </Card>

        {/* Plan Features */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="font-bold">Plan Features</CardTitle>
            <CardDescription className="text-sm text-gray-600">
              What's included in your current plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {currentPlan?.features?.map((feature: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-800">{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Available Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle>Change Plan</CardTitle>
              <CardDescription>
                {currentPlanId === 'free' 
                  ? 'Upgrade to unlock premium features' 
                  : 'Switch to a different subscription plan'}
              </CardDescription>
            </div>
            {/* Currency Selector */}
            <div className="flex-shrink-0">
              <div className="flex items-center justify-end gap-2 mb-2">
                {isLoadingRates && (
                  <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                )}
                {ratesLastUpdated && !isLoadingRates && exchangeRates && (
                  <p className="text-xs text-gray-400">
                    Updated {format(ratesLastUpdated, 'HH:mm')}
                  </p>
                )}
              </div>
              <Select value={selectedCurrency} onValueChange={(value) => setSelectedCurrency(value as Currency)} disabled={isLoadingRates || !exchangeRates}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZAR">ZAR (R) - South African Rand</SelectItem>
                  <SelectItem value="USD">USD ($) - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR (€) - Euro</SelectItem>
                  <SelectItem value="GBP">GBP (£) - British Pound</SelectItem>
                  <SelectItem value="CAD">CAD (CA$) - Canadian Dollar</SelectItem>
                  <SelectItem value="AUD">AUD (AU$) - Australian Dollar</SelectItem>
                </SelectContent>
              </Select>
              {ratesError && (
                <p className="text-xs text-red-600 mt-1 text-right">{ratesError}</p>
              )}
            </div>
          </div>
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
                        ? "border-gray-500 bg-gray-500 shadow-xl scale-105"
                        : "border-gray-300 hover:border-gray-400 bg-white"
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
                        isSelected ? "bg-white/20" : "bg-gray-100"
                      )}>
                        <Sparkles className={cn("h-6 w-6", isSelected ? "text-white" : "text-gray-600")} />
                      </div>
                      <h4 className={cn("text-xl font-bold mb-3", isSelected ? "text-white" : "text-primary")}>
                        {freePlan.name}
                      </h4>
                      <div className="mb-3">
                        {isLoadingRates || !exchangeRates ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className={cn("h-6 w-6 animate-spin", isSelected ? "text-white" : "text-primary")} />
                            <span className={cn("text-sm", isSelected ? "text-white/90" : "text-primary/80")}>Loading price...</span>
                          </div>
                        ) : (
                          <>
                            <span className={cn("text-4xl font-bold", isSelected ? "text-white" : "text-primary")}>
                              {formatCurrency(freePlan.amountCents, selectedCurrency, exchangeRates)}
                            </span>
                            <span className={cn("text-base ml-1", isSelected ? "text-white/90" : "text-primary/80")}>
                              /{freePlan.billingPeriod}
                            </span>
                          </>
                        )}
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
                        {isLoadingRates || !exchangeRates ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className={cn("h-6 w-6 animate-spin", isSelected ? "text-white" : "text-primary")} />
                            <span className={cn("text-sm", isSelected ? "text-white/90" : "text-primary/80")}>Loading price...</span>
                          </div>
                        ) : (
                          <>
                            <span className={cn("text-4xl font-bold", isSelected ? "text-white" : "text-primary")}>
                              {formatCurrency(silverPlan.amountCents, selectedCurrency, exchangeRates)}
                            </span>
                            <span className={cn("text-base ml-1", isSelected ? "text-white/90" : "text-primary/80")}>
                              /{silverPlan.billingPeriod}
                            </span>
                          </>
                        )}
                      </div>
                      {!isLoadingRates && exchangeRates && isAnnual && monthlyEquivalent && (
                        <p className={cn("text-xs mb-1", isSelected ? "text-white/80" : "text-muted-foreground")}>
                          {formatCurrency(Math.round(monthlyEquivalent * 100), selectedCurrency, exchangeRates)}/month when paid annually
                        </p>
                      )}
                      {!isLoadingRates && exchangeRates && (
                        <p className={cn("text-sm font-medium", isSelected ? "text-white/90" : isAnnual && savings > 0 ? "text-green-600" : "text-primary/80")}>
                          {isAnnual && savings > 0 ? `💰 Save ${formatCurrency(Math.round(savings * 100), selectedCurrency, exchangeRates)}/year` : silverPlan.description}
                        </p>
                      )}
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
                        ? "border-blue-500 bg-blue-500 shadow-xl scale-105"
                        : "border-gray-300 hover:border-blue-400 bg-white"
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

                    <div className={cn("text-center mb-6", isCurrentPlan && !isSelected && "mt-6")}>
                      <div className={cn(
                        "h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center",
                        isSelected ? "bg-white/20" : "bg-blue-100"
                      )}>
                        <Crown className={cn("h-6 w-6", isSelected ? "text-white" : "text-blue-600")} />
                      </div>
                      <h4 className={cn("text-xl font-bold mb-3", isSelected ? "text-white" : "text-primary")}>
                        {goldPlan.name.replace(' Annual', '')}
                      </h4>
                      <div className="mb-1">
                        {isLoadingRates || !exchangeRates ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className={cn("h-6 w-6 animate-spin", isSelected ? "text-white" : "text-primary")} />
                            <span className={cn("text-sm", isSelected ? "text-white/90" : "text-primary/80")}>Loading price...</span>
                          </div>
                        ) : (
                          <>
                            <span className={cn("text-4xl font-bold", isSelected ? "text-white" : "text-primary")}>
                              {formatCurrency(goldPlan.amountCents, selectedCurrency, exchangeRates)}
                            </span>
                            <span className={cn("text-base ml-1", isSelected ? "text-white/90" : "text-primary/80")}>
                              /{goldPlan.billingPeriod}
                            </span>
                          </>
                        )}
                      </div>
                      {!isLoadingRates && exchangeRates && isAnnual && monthlyEquivalent && (
                        <p className={cn("text-xs mb-1", isSelected ? "text-white/80" : "text-muted-foreground")}>
                          {formatCurrency(Math.round(monthlyEquivalent * 100), selectedCurrency, exchangeRates)}/month when paid annually
                        </p>
                      )}
                      {!isLoadingRates && exchangeRates && (
                        <p className={cn("text-sm font-medium", isSelected ? "text-white/90" : isAnnual && savings > 0 ? "text-green-600" : "text-primary/80")}>
                          {isAnnual && savings > 0 ? `💰 Save ${formatCurrency(Math.round(savings * 100), selectedCurrency, exchangeRates)}/year` : goldPlan.description}
                        </p>
                      )}
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
                variant="outline"
                size="lg"
                className="border-orange-500 text-orange-600 hover:bg-orange-50"
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
                      disabled={cancelSubscriptionMutation.isPending}
                      className="border-red-500 text-red-600 hover:bg-red-50"
                      onClick={() => setShowCancelDialog(true)}
                    >
                      Cancel Subscription
                    </Button>
                    <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to cancel your subscription? Your subscription will remain active until the end of your current billing period ({subscription?.currentPeriodEnd 
                              ? format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')
                              : 'N/A'}). You can reactivate it anytime before then.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel 
                            disabled={cancelSubscriptionMutation.isPending}
                          >
                            Keep Subscription
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.preventDefault();
                              handleCancelSubscription();
                            }}
                            disabled={cancelSubscriptionMutation.isPending}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            {cancelSubscriptionMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Cancelling...
                              </>
                            ) : (
                              'Yes, Cancel Subscription'
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
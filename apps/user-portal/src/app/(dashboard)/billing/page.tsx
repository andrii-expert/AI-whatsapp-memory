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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isAnnual, setIsAnnual] = useState(false);
  
  const handleSelectPlan = (planId: string) => {
    // Gold plan is not yet available
    if (planId.startsWith("gold")) {
      toast({
        title: "Gold plan coming soon",
        description: "The Gold package will be available soon. Please select the Free or Silver plan for now.",
      });
      return;
    }
    setSelectedPlanForChange(planId);
  };

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

  const createSubscriptionMutation = useMutation(
    trpc.billing.createSubscription.mutationOptions({
      onSuccess: async (result) => {
        // Handle payment redirect for paid plans
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

        // Handle successful subscription creation (free plans)
        if (result.type === "success") {
          toast({
            title: "Plan Updated",
            description: "Your plan has been updated successfully.",
          });
          setSelectedPlanForChange(null);
          // Invalidate queries to refresh subscription data
          queryClient.invalidateQueries({ queryKey: trpc.billing.getSubscription.queryKey() });
          queryClient.invalidateQueries({ queryKey: trpc.plans.listActive.queryKey() });
        }
      },
      onError: (error) => {
        console.error("Create subscription error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to create subscription.",
          variant: "destructive",
        });
      },
    })
  );

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
          setSelectedPlanForChange(null);
          // Invalidate queries to refresh subscription data
          queryClient.invalidateQueries({ queryKey: trpc.billing.getSubscription.queryKey() });
          queryClient.invalidateQueries({ queryKey: trpc.plans.listActive.queryKey() });
        }
      },
      onError: (error) => {
        console.error("Update subscription error:", error);
        
        // If error is "No subscription found", try creating a new subscription instead
        if (error.message?.includes("No subscription found") || error.data?.code === "NOT_FOUND") {
          // User doesn't have a subscription yet, use createSubscription instead
          if (selectedPlanForChange) {
            console.log("No subscription found, creating new subscription for plan:", selectedPlanForChange);
            createSubscriptionMutation.mutate({
              plan: selectedPlanForChange as any,
            });
          } else {
            toast({
              title: "Error",
              description: "No plan selected. Please select a plan first.",
              variant: "destructive",
            });
          }
          return;
        }
        
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
    handleSelectPlan(planId);
  };

  const confirmPlanChange = () => {
    if ((updateSubscriptionMutation.isPending || createSubscriptionMutation.isPending) || !selectedPlanForChange) {
      if (!selectedPlanForChange) {
        toast({
          title: "No plan selected",
          description: "Please select a plan to change to.",
          variant: "destructive",
        });
      }
      return;
    }

    // Prevent gold plan selection
    if (selectedPlanForChange.startsWith("gold")) {
      toast({
        title: "Gold plan coming soon",
        description: "The Gold package will be available soon. Please select the Free or Silver plan for now.",
      });
      return;
    }

    // If user has no subscription, use createSubscription
    // Otherwise, use updateSubscription
    if (!subscription) {
      createSubscriptionMutation.mutate({
        plan: selectedPlanForChange as any,
      });
    } else {
      // User has existing subscription, use updateSubscription
      updateSubscriptionMutation.mutate({
        plan: selectedPlanForChange as any,
      });
    }
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
    <div className="bg-white">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 p-4 sm:p-6 shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)] rounded-xl">
          <h1 className="text-xl font-bold text-gray-900">Billing & Subscription</h1>
        </div>

        {/* Current Subscription Section */}
        <div className="mb-8 px-4 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Current Subscription</h2>
          
          {/* Current Subscription and Plan Features - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Subscription */}
            <Card className="rounded-2xl border-2 border-gray-200">
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
            <Card className="rounded-2xl border-2 border-gray-200">
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
        </div>

        {/* Available Plans */}
        <div className="mb-8 px-4 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Change Plan</h2>
          
          <div className="space-y-8">
            {/* Currency Selector and Billing Cycle Toggle */}
            <div className="flex flex-col items-start sm:items-center justify-between gap-4">
              {/* Billing cycle toggle */}
              <div className="w-full flex-shrink-0">
                <div className="flex items-center justify-between bg-gray-100 rounded-full p-1 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsAnnual(false)}
                    className={cn(
                      "flex-1 py-2 text-sm rounded-full transition",
                      !isAnnual ? "bg-white shadow text-gray-900" : "text-gray-600"
                    )}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAnnual(true)}
                    className={cn(
                      "flex-1 py-2 text-sm rounded-full transition relative",
                      isAnnual ? "bg-white shadow text-gray-900" : "text-gray-600"
                    )}
                  >
                    Yearly
                    {!isAnnual && (
                      <span className="absolute -top-5 inset-x-0 mx-auto text-[10px] text-blue-600 font-semibold">
                        Save 20%
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Currency Selector */}
              <div className="flex w-full flex justify-center items-start">
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
                  <p className="text-xs text-red-600 mt-1 text-center sm:text-right">{ratesError}</p>
                )}
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
              <>
              <RadioGroup
                value={selectedPlanForChange && !selectedPlanForChange.startsWith("gold") ? selectedPlanForChange : (currentPlanId && !currentPlanId.startsWith("gold") ? currentPlanId : undefined)}
                onValueChange={handlePlanSelect}
                className="space-y-4"
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
                      "relative flex flex-col p-5 rounded-2xl border-2 cursor-pointer transition-all",
                      isSelected
                        ? "border-gray-500 bg-gray-500 text-white"
                        : "border-gray-200 bg-gray-50 hover:border-gray-300"
                    )}
                    onClick={() => handleSelectPlan('free')}
                  >
                    <RadioGroupItem
                      value="free"
                      id="plan-free"
                      className={cn(
                        "absolute top-4 right-4",
                        isSelected && "!border-white !text-white [&_svg]:!fill-white"
                      )}
                    />

                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className={cn("h-5 w-5", isSelected ? "text-white" : "text-gray-600")} />
                        <span className="font-semibold text-lg">{freePlan.name}</span>
                      </div>
                      {isCurrentPlan && (
                        <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                          Current Plan
                        </span>
                      )}
                    </div>
                    <div className={cn("text-3xl font-bold", isSelected ? "text-white" : "text-gray-900")}>
                      {isLoadingRates || !exchangeRates ? (
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className={cn("h-6 w-6 animate-spin", isSelected ? "text-white" : "text-gray-600")} />
                          <span className={cn("text-sm", isSelected ? "text-white/90" : "text-gray-500")}>Loading...</span>
                        </div>
                      ) : (
                        <>
                          {formatCurrency(freePlan.amountCents, selectedCurrency, exchangeRates)}
                          <span className="text-sm text-gray-600 ml-1"> / {freePlan.billingPeriod}</span>
                        </>
                      )}
                    </div>
                    <p className={cn("mt-1 text-xs", isSelected ? "text-white/80" : "text-gray-500")}>
                      {freePlan.description}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm">
                      {freePlan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-white" : "text-green-600")} />
                          <span className={isSelected ? "text-white" : "text-gray-700"}>{feature}</span>
                        </li>
                      ))}
                    </ul>
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
                      "relative flex flex-col p-5 rounded-2xl border-2 cursor-pointer transition-all",
                      isSelected
                        ? "border-purple-500 bg-purple-500 text-white shadow-xl"
                        : "border-gray-200 bg-white hover:border-purple-300"
                    )}
                    onClick={() => handleSelectPlan(planId)}
                  >
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="text-xs font-bold px-4 py-1.5 rounded-full bg-accent text-white shadow-md">
                        Most Popular
                      </span>
                    </div>
                    <RadioGroupItem
                      value={planId}
                      id={`plan-${planId}`}
                      className={cn(
                        "absolute top-4 right-4",
                        isSelected && "!border-white !text-white [&_svg]:!fill-white"
                      )}
                    />

                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className={cn("h-5 w-5", isSelected ? "text-white" : "text-purple-600")} />
                        <span className="font-semibold text-lg">{silverPlan.name.replace(' Annual', '')}</span>
                      </div>
                      {isCurrentPlan && (
                        <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                          Current Plan
                        </span>
                      )}
                    </div>
                    <div className={cn("text-3xl font-bold", isSelected ? "text-white" : "text-gray-900")}>
                      {isLoadingRates || !exchangeRates ? (
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className={cn("h-6 w-6 animate-spin", isSelected ? "text-white" : "text-gray-600")} />
                          <span className={cn("text-sm", isSelected ? "text-white/90" : "text-gray-500")}>Loading...</span>
                        </div>
                      ) : (
                        <>
                          {formatCurrency(silverPlan.amountCents, selectedCurrency, exchangeRates)}
                          <span className="text-sm text-gray-600 ml-1"> / {silverPlan.billingPeriod}</span>
                        </>
                      )}
                    </div>
                    {!isLoadingRates && exchangeRates && isAnnual && silverPlan.monthlyPriceCents > 0 && (
                      <p className={cn("text-xs mt-1", isSelected ? "text-white/80" : "text-purple-700")}>
                        {formatCurrency(silverPlan.monthlyPriceCents, selectedCurrency, exchangeRates)}/month when paid annually
                      </p>
                    )}
                    <p className={cn("mt-1 text-xs", isSelected ? "text-white/80" : "text-gray-500")}>
                      {silverPlan.description}
                    </p>

                    <ul className="mt-4 space-y-2 text-sm">
                      {silverPlan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-white" : "text-green-600")} />
                          <span className={isSelected ? "text-white" : "text-gray-700"}>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </label>
                );
              })()}

              {/* Gold Plan (disabled / coming soon) - Outside RadioGroup */}
              {(() => {
                const planId = isAnnual ? 'gold-annual' : 'gold-monthly';
                const goldPlan = plans.find(p => p.id === planId);
                if (!goldPlan) return null;
                const isCurrentPlan = currentPlanId === planId;
                const isSelected = (selectedPlanForChange || currentPlanId) === planId;

                return (
                  <div
                    key={planId}
                    className={cn(
                      "relative flex flex-col p-5 rounded-2xl border-2 cursor-not-allowed opacity-70 transition-all",
                      isSelected
                        ? "border-blue-500 bg-blue-500 text-white shadow-xl"
                        : "border-gray-200 bg-white hover:border-blue-300"
                    )}
                    onClick={() => handleSelectPlan(planId)}
                  >
                    <div className="flex items-center justify-between mb-2 mt-2">
                      <div className="flex items-center gap-2">
                        <Crown className={cn("h-5 w-5", isSelected ? "text-white" : "text-blue-600")} />
                        <span className="font-semibold text-lg">{goldPlan.name.replace(' Annual', '')}</span>
                      </div>
                      {isCurrentPlan && (
                        <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                          Current Plan
                        </span>
                      )}
                    </div>
                    <div className={cn("text-3xl font-bold", isSelected ? "text-white" : "text-gray-900")}>
                      {isLoadingRates || !exchangeRates ? (
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className={cn("h-6 w-6 animate-spin", isSelected ? "text-white" : "text-gray-600")} />
                          <span className={cn("text-sm", isSelected ? "text-white/90" : "text-gray-500")}>Loading...</span>
                        </div>
                      ) : (
                        <>
                          {formatCurrency(goldPlan.amountCents, selectedCurrency, exchangeRates)}
                          <span className="text-sm text-gray-600 ml-1"> / {goldPlan.billingPeriod}</span>
                        </>
                      )}
                    </div>
                    {!isLoadingRates && exchangeRates && isAnnual && goldPlan.monthlyPriceCents > 0 && (
                      <p className={cn("text-xs mt-1", isSelected ? "text-white/80" : "text-blue-700")}>
                        {formatCurrency(goldPlan.monthlyPriceCents, selectedCurrency, exchangeRates)}/month when paid annually
                      </p>
                    )}
                    <p className={cn("mt-1 text-xs", isSelected ? "text-white/80" : "text-gray-500")}>
                      {goldPlan.description}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm">
                      {goldPlan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-white" : "text-green-600")} />
                          <span className={isSelected ? "text-white" : "text-gray-700"}>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              </RadioGroup>
              </>
            )}

          {/* Confirm Plan Change Button */}
          {selectedPlanForChange && selectedPlanForChange !== currentPlanId && !isLoadingPlans && (
            <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t">
              <Button
                variant="outline"
                onClick={() => setSelectedPlanForChange(null)}
                disabled={updateSubscriptionMutation.isPending || createSubscriptionMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmPlanChange}
                disabled={updateSubscriptionMutation.isPending || createSubscriptionMutation.isPending}
                variant="outline"
                size="lg"
                className="border-orange-500 text-orange-600 hover:bg-orange-50"
              >
                {(updateSubscriptionMutation.isPending || createSubscriptionMutation.isPending) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {subscription ? "Updating..." : "Creating..."}
                  </>
                ) : (
                  subscription ? 'Confirm Plan Change' : 'Subscribe to Plan'
                )}
              </Button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
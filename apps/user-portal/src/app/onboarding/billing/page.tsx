"use client";

// Force dynamic rendering - this page requires authentication
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@imaginecalendar/ui/button";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Check, Crown, MoreVertical } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FALLBACK_PLANS, getFallbackPlanById, toDisplayPlan } from "@/utils/plans";
import type { DisplayPlan, PlanRecordLike } from "@/utils/plans";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { Label } from "@imaginecalendar/ui/label";
import { cn } from "@imaginecalendar/ui/cn";

type Currency = "ZAR" | "USD" | "EUR" | "GBP" | "CAD" | "AUD";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  ZAR: "R",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "AU$",
};

const DEFAULT_EXCHANGE_RATES: Record<Currency, number> = {
  ZAR: 1,
  USD: 0.0584,
  EUR: 0.0503,
  GBP: 0.0443,
  CAD: 0.0819,
  AUD: 0.0897,
};

async function fetchExchangeRates(): Promise<Record<Currency, number> | null> {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/ZAR');
    if (!response.ok) throw new Error('Failed to fetch exchange rates');
    const data = await response.json();
    if (!data.rates) throw new Error('Invalid API response');
    return {
      ZAR: 1,
      USD: data.rates.USD ?? DEFAULT_EXCHANGE_RATES.USD,
      EUR: data.rates.EUR ?? DEFAULT_EXCHANGE_RATES.EUR,
      GBP: data.rates.GBP ?? DEFAULT_EXCHANGE_RATES.GBP,
      CAD: data.rates.CAD ?? DEFAULT_EXCHANGE_RATES.CAD,
      AUD: data.rates.AUD ?? DEFAULT_EXCHANGE_RATES.AUD,
    };
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return null;
  }
}

function formatCurrency(cents: number, currency: Currency, exchangeRates: Record<Currency, number> | null): string {
  if (!exchangeRates) return '...';
  const amount = (cents / 100) * exchangeRates[currency];
  const symbol = CURRENCY_SYMBOLS[currency];
  return `${symbol}${amount.toFixed(2)}`;
}

const USE_DB_PLANS = process.env.NEXT_PUBLIC_USE_DB_PLANS !== "false";

function BillingOnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isLoaded } = useAuth();
  const trpc = useTRPC();
  const [isAnnual, setIsAnnual] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("ZAR");
  const [exchangeRates, setExchangeRates] = useState<Record<Currency, number> | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const updateUserMutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Setup complete!",
          description: "Your account has been set up successfully.",
        });
        router.push("/dashboard");
        router.refresh();
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to complete setup",
          variant: "destructive",
        });
      },
    })
  );

  // Handle payment return
  useEffect(() => {
    const status = searchParams.get('status');
    const message = searchParams.get('message');
    
    if (status === 'success' && message) {
      toast({
        title: "Payment Successful",
        description: message,
        variant: "success",
      });
      
      // Complete setup after successful payment
      updateUserMutation.mutate({
        setupStep: 4,
      });
      
      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('status');
      newUrl.searchParams.delete('message');
      router.replace(newUrl.pathname + newUrl.search);
    } else if (status === 'cancelled') {
      toast({
        title: "Payment Cancelled",
        description: message || "Payment was cancelled. You can try again or skip for now.",
      });
      
      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('status');
      newUrl.searchParams.delete('message');
      router.replace(newUrl.pathname + newUrl.search);
    }
  }, [searchParams, router, toast, updateUserMutation]);

  // Redirect if user has already completed this step or is on wrong step
  useEffect(() => {
    if (!isLoaded) return;
    
    if (!user) {
      router.push("/sign-in");
      return;
    }

    const setupStep = user.setupStep ?? 1;

    if (setupStep === 1) {
      router.push("/onboarding/whatsapp");
      return;
    } else if (setupStep === 2) {
      router.push("/onboarding/calendar");
      return;
    } else if (setupStep === 4) {
      router.push("/dashboard");
      return;
    }
  }, [user, isLoaded, router]);

  // Load currency preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("billing-currency");
    if (saved && ["ZAR", "USD", "EUR", "GBP", "CAD", "AUD"].includes(saved)) {
      setSelectedCurrency(saved as Currency);
    }
  }, []);

  // Fetch exchange rates
  useEffect(() => {
    const loadExchangeRates = async () => {
      setIsLoadingRates(true);
      const rates = await fetchExchangeRates();
      if (rates) {
        setExchangeRates(rates);
      }
      setIsLoadingRates(false);
    };
    loadExchangeRates();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("billing-currency", selectedCurrency);
    }
  }, [selectedCurrency]);

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

  const updateSubscriptionMutation = useMutation(
    trpc.billing.updateSubscription.mutationOptions({
      onSuccess: (result) => {
        if (result.type === "requiresPayment") {
          toast({
            title: "Redirecting to Payment",
            description: result.message,
          });

          const form = document.createElement('form');
          form.method = 'POST';
          form.action = '/api/payment/redirect';
          form.style.display = 'none';

          const planInput = document.createElement('input');
          planInput.type = 'hidden';
          planInput.name = 'plan';
          planInput.value = result.plan;
          form.appendChild(planInput);

          const onboardingFlowInput = document.createElement('input');
          onboardingFlowInput.type = 'hidden';
          onboardingFlowInput.name = 'isOnboardingFlow';
          onboardingFlowInput.value = 'true';
          form.appendChild(onboardingFlowInput);

          document.body.appendChild(form);
          form.submit();
          return;
        }

        if (result.type === "success") {
          // Update setupStep to 4 (Complete)
          updateUserMutation.mutate({
            setupStep: 4,
          });
        }
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to subscribe.",
          variant: "destructive",
        });
        setIsSubscribing(false);
      },
    })
  );

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const setupStep = user.setupStep ?? 1;
  
  if (setupStep !== 3) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const freePlan = plans.find(p => p.id === 'free');
  const premiumPlanId = isAnnual ? 'gold-annual' : 'gold-monthly';
  const premiumPlan = plans.find(p => p.id === premiumPlanId) || plans.find(p => p.id === 'gold-monthly');

  const handleSkip = async () => {
    updateUserMutation.mutate({
      setupStep: 4,
    });
  };

  const handleSubscribe = async () => {
    if (!premiumPlan) {
      toast({
        title: "Error",
        description: "Premium plan not available",
        variant: "destructive",
      });
      return;
    }

    setIsSubscribing(true);
    updateSubscriptionMutation.mutate({
      plan: premiumPlan.id as any,
    });
  };

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Billing and Subscription</h1>
            <p className="text-sm sm:text-base text-gray-600">Manage your subscription and payment details</p>
          </div>
          <Button variant="ghost" size="icon" className="hidden sm:flex">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>

        {/* Billing Cycle and Currency */}
        <div className="space-y-4 sm:space-y-6">
          {/* Billing Cycle */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <Label className="text-sm font-medium text-gray-900">Billing Cycle</Label>
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setIsAnnual(false)}
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  !isAnnual
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-colors relative",
                  isAnnual
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                Yearly
                {!isAnnual && (
                  <span className="ml-1 text-xs text-blue-600 font-normal">20% off</span>
                )}
              </button>
            </div>
          </div>

          {/* Currency */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <Label className="text-sm font-medium text-gray-900">Currency</Label>
            <Select 
              value={selectedCurrency} 
              onValueChange={(value) => setSelectedCurrency(value as Currency)}
              disabled={isLoadingRates || !exchangeRates}
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ZAR">ZAR (R) South Africa</SelectItem>
                <SelectItem value="USD">USD ($) United States</SelectItem>
                <SelectItem value="EUR">EUR (€) Europe</SelectItem>
                <SelectItem value="GBP">GBP (£) United Kingdom</SelectItem>
                <SelectItem value="CAD">CAD (CA$) Canada</SelectItem>
                <SelectItem value="AUD">AUD (AU$) Australia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Free Plan Card */}
          {freePlan && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Free</h3>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full text-xs sm:text-sm font-medium">
                  Current Plan
                </span>
              </div>
              
              <div className="mb-4">
                {isLoadingRates || !exchangeRates ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    <span className="text-gray-500">Loading...</span>
                  </div>
                ) : (
                  <>
                    <span className="text-3xl sm:text-4xl font-bold text-gray-900">
                      {formatCurrency(freePlan.amountCents, selectedCurrency, exchangeRates)}
                    </span>
                    <span className="text-base sm:text-lg text-gray-600 ml-1">/month</span>
                  </>
                )}
              </div>

              <p className="text-sm text-gray-500 mb-4 sm:mb-6">Trying it out</p>

              <ul className="space-y-2 sm:space-y-3">
                {freePlan.features.slice(0, 4).map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm sm:text-base">
                    <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Premium Plan Card */}
          {premiumPlan && (
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 sm:p-6 relative">
              <div className="flex items-center gap-2 mb-4">
                <Crown className="h-5 w-5 text-orange-600" />
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Premium Plan</h3>
              </div>
              
              <div className="mb-2">
                {isLoadingRates || !exchangeRates ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    <span className="text-gray-500">Loading...</span>
                  </div>
                ) : (
                  <>
                    <span className="text-3xl sm:text-4xl font-bold text-gray-900">
                      {formatCurrency(premiumPlan.amountCents, selectedCurrency, exchangeRates)}
                    </span>
                    <span className="text-base sm:text-lg text-gray-600 ml-1">/month</span>
                  </>
                )}
              </div>

              {isAnnual && (
                <p className="text-sm text-orange-600 mb-4 sm:mb-6">
                  Save {formatCurrency(
                    Math.round((premiumPlan.monthlyPriceCents * 12 - premiumPlan.amountCents)),
                    selectedCurrency,
                    exchangeRates
                  )} for yearly subscription
                </p>
              )}

              <Button
                onClick={handleSubscribe}
                disabled={isSubscribing || isLoadingRates || !exchangeRates}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white mb-4 sm:mb-6 py-2 sm:py-3 text-sm sm:text-base font-medium"
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Subscribe"
                )}
              </Button>

              <ul className="space-y-2 sm:space-y-3">
                {premiumPlan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm sm:text-base">
                    <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Skip Button */}
        <div className="flex justify-center pt-4">
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={updateUserMutation.isPending}
            className="text-gray-600 hover:text-gray-900"
          >
            {updateUserMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Completing...
              </>
            ) : (
              "Skip for Now"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BillingOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <BillingOnboardingForm />
    </Suspense>
  );
}


/* Onboarding Step 4 - Billing & Subscription
 * This page shows a simplified billing experience for onboarding:
 * - Two subscription cards (Free & Premium)
 * - Complete Setup + Skip for now buttons
 * - Uses tRPC billing.createSubscription to create a subscription
 * - Uses /api/onboarding/complete to mark setup_step = 4 and send WhatsApp message
 */

"use client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@imaginecalendar/ui/button";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Check, Crown, Sparkles, Zap, CheckCircle2, Lock } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FALLBACK_PLANS, toDisplayPlan } from "@/utils/plans";
import type { DisplayPlan, PlanRecordLike } from "@/utils/plans";
import { cn } from "@imaginecalendar/ui/cn";
import { OnboardingLoading } from "@/components/onboarding-loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@imaginecalendar/ui/accordion";
import { format } from "date-fns";

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

function BillingOnboardingContent() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const trpc = useTRPC();
  const { toast } = useToast();

  // Poll user setupStep every 1 second to detect when user advances to next step
  const { data: polledUser } = useQuery({
    ...trpc.user.me.queryOptions(),
    refetchInterval: 1000, // Check every 1 second
    enabled: isLoaded && !!user && (user.setupStep ?? 1) === 3, // Only poll while on step 3
  });

  const [isAnnual, setIsAnnual] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [expandedPlans, setExpandedPlans] = useState<string[]>([]); // Track which plans are expanded
  
  // Currency state - default to ZAR for all users
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("ZAR");

  // Exchange rates state - only use real-time rates, no defaults
  const [exchangeRates, setExchangeRates] = useState<Record<Currency, number> | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(true);
  const [ratesLastUpdated, setRatesLastUpdated] = useState<Date | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const handleSelectPlan = (planId: string) => {
    // Gold plan is not yet available in onboarding
    if (planId.startsWith("gold")) {
      toast({
        title: "Coming Soon",
        description: "The Gold package will be available soon!",
      });
      return;
    }

    // Check if user is trying to select Beta and has already used it
    if (planId === "beta" && currentUserData?.betaUsedAt) {
      toast({
        title: "Beta plan already used",
        description: "The Beta plan can only be subscribed to once per user.",
        variant: "destructive",
      });
      return;
    }

    setSelectedPlanId(planId);
  };

  // Check for payment success and complete onboarding if needed
  useEffect(() => {
    if (!isLoaded || !user) return;
    
    const searchParams = new URLSearchParams(window.location.search);
    const status = searchParams.get('status');
    
    if (status === 'success' && (user.setupStep ?? 1) < 4) {
      // Payment was successful and user is still in onboarding
      // Complete onboarding
      fetch("/api/onboarding/complete", {
        method: "POST",
      })
        .then((res) => {
          if (res.ok) {
            // Redirect to success page
            router.push("/onboarding/success");
          } else {
            console.error("Failed to complete onboarding after payment");
          }
        })
        .catch((err) => {
          console.error("Failed to complete onboarding after payment:", err);
        });
      
      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('status');
      newUrl.searchParams.delete('message');
      router.replace(newUrl.pathname + newUrl.search);
    }
  }, [isLoaded, user, router]);

  // Ensure user is on the correct onboarding step
  // Also check polled user data for setupStep changes
  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.push("/sign-in");
      return;
    }
    
    // Use polled user data if available (for real-time updates), otherwise use user from useAuth
    const currentUser = polledUser || user;
    const setupStep = currentUser.setupStep ?? 1;
    
    if (setupStep < 3) {
      // Should have completed WhatsApp and Calendar first
      if (setupStep === 1) {
        router.push("/onboarding/whatsapp");
      } else if (setupStep === 2) {
        router.push("/onboarding/calendar");
      }
    } else if (setupStep > 4) {
      router.push("/dashboard");
    } else if (setupStep === 4) {
      // User completed onboarding, redirect to dashboard
      router.push("/dashboard");
    }
  }, [isLoaded, user, polledUser, router]);

  // Fetch current subscription data (used to detect existing plan, but never blocks UI)
  // Use the single-argument tRPC helper form to avoid server-side defaultQueryOptions issues.
  const { data: subscription, isSuccess: subscriptionLoaded } = useQuery(
    trpc.billing.getSubscription.queryOptions()
  );

  // Get user data to check if beta has been used (use polledUser if available, otherwise fetch)
  const { data: userData } = useQuery({
    ...trpc.user.me.queryOptions(),
    enabled: isLoaded && !!user,
  });
  
  // Use polledUser if available (for real-time updates), otherwise use userData
  const currentUserData = polledUser || userData;

  // Load plans (with fallback)
  const plansQuery = useQuery(trpc.plans.listActive.queryOptions());
  const plans: DisplayPlan[] = useMemo(() => {
    const candidateData = plansQuery.data;
    const source: PlanRecordLike[] =
      plansQuery.isSuccess && Array.isArray(candidateData) && candidateData.length > 0
        ? (candidateData as PlanRecordLike[])
        : FALLBACK_PLANS;
    return source
      .map((p) => toDisplayPlan(p))
      .filter((p) => !!p.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [plansQuery.data, plansQuery.isSuccess]);

  const freePlan = plans.find((p) => p.id === "free");
  const silverPlanId = isAnnual ? "silver-annual" : "silver-monthly";
  const silverPlan = plans.find((p) => p.id === silverPlanId) || plans.find((p) => p.id === "silver-monthly");
  const betaPlan = plans.find((p) => p.id === "beta");
  const goldPlanId = isAnnual ? "gold-annual" : "gold-monthly";
  const goldPlan = plans.find((p) => p.id === goldPlanId) || plans.find((p) => p.id === "gold-monthly");

  const currentPlanId = subscription?.plan ?? freePlan?.id ?? "free";
  
  // Initialize selected plan to current plan when subscription data is available
  useEffect(() => {
    // Wait for subscription query to complete before setting selected plan
    if (subscriptionLoaded && !selectedPlanId) {
      // If user has a subscription, select their current plan
      if (subscription?.plan) {
        setSelectedPlanId(subscription.plan);
      } else {
        // No subscription, default to free plan
        setSelectedPlanId(freePlan?.id ?? "free");
      }
    }
  }, [subscriptionLoaded, subscription?.plan, selectedPlanId, freePlan?.id]);

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

  const createSubscriptionMutation = useMutation(
    trpc.billing.createSubscription.mutationOptions({
      onSuccess: async (result) => {
        // Handle payment redirect for paid plans
        if (result.type === "requiresPayment") {
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

          // Add billing flow flag (false for onboarding flow)
          const billingFlowInput = document.createElement('input');
          billingFlowInput.type = 'hidden';
          billingFlowInput.name = 'isBillingFlow';
          billingFlowInput.value = 'false';
          form.appendChild(billingFlowInput);

          document.body.appendChild(form);
          form.submit();
          setIsSubscribing(false);
          return;
        }

        // For free plans, subscription is created directly - complete onboarding
        if (result.type === "success") {
          try {
            const res = await fetch("/api/onboarding/complete", {
              method: "POST",
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data?.error || "Failed to complete setup");
            }
            // After subscription + onboarding complete, show success screen
            router.push("/onboarding/success");
          } catch (error: any) {
            console.error("Failed to complete setup:", error);
          } finally {
            setIsSubscribing(false);
          }
        }
      },
      onError: (error) => {
        setIsSubscribing(false);
        console.error("Subscription error:", error);
      },
    })
  );

  const handleCompleteWithoutChange = async () => {
    setIsCompleting(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to complete setup");
      }
      // After completing onboarding without changing plan, show success screen
      router.push("/onboarding/success");
    } catch (error: any) {
      console.error("Failed to complete setup:", error);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSubscribe = (planId: string) => {
    if (!planId || planId === "free") {
      // For free plan, just complete setup without subscription
      handleCompleteWithoutChange();
      return;
    }

    // Prevent beta plan subscription if already used
    if (planId === "beta" && currentUserData?.betaUsedAt) {
      toast({
        title: "Beta plan already used",
        description: "The Beta plan can only be subscribed to once per user.",
        variant: "destructive",
      });
      return;
    }
    
    const plan = plans.find((p) => p.id === planId);
    if (!plan) {
      return;
    }
    
    if (isSubscribing || planId === currentPlanId) return;
    
    setIsSubscribing(true);
    createSubscriptionMutation.mutate({ plan: planId as any });
  };

  // If authentication is still loading
  if (!isLoaded || !user) {
    return <OnboardingLoading />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Billing cards - Full width */}
      <div className="w-full flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-md space-y-4">
          {/* Title */}
          <div>
            <div className="flex flex-col items-center justify-between gap-4 mb-4">
              <div className="flex-1 w-full sm:w-auto">
                <p className="text-md font-medium tracking-wide text-gray-400 mb-1 text-center">
                  Step 4 of 4
                </p>
                <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center sm:text-left">Billing and Subscription</h1>
                <p className="text-gray-600 text-md leading-relaxed mb-3 text-center sm:text-left">
                  Manage your subscription and payment details
                </p>
              </div>
            </div>
          </div>

          {/* Billing cycle toggle */}
          <div className="w-full flex items-center justify-between bg-gray-100 rounded-full p-1 w-full">
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

                        {/* Currency Selector */}
              <div className="flex-shrink-0 w-full sm:w-auto flex flex-col items-center sm:items-end">
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

          {/* Plan cards - Collapsible */}
          <Accordion type="multiple" value={expandedPlans} onValueChange={setExpandedPlans} className="space-y-4">
            {/* Free plan */}
            {freePlan && (
              <AccordionItem value="free" className="border-none">
                <div
                  className={cn(
                    "rounded-2xl border-2 p-5 cursor-pointer transition-all",
                    selectedPlanId === "free"
                      ? "border-gray-500 bg-gray-500 text-white"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300"
                  )}
                  onClick={() => handleSelectPlan("free")}
                >
                  <AccordionTrigger className="hover:no-underline py-0">
                    <div className="flex items-center justify-between w-full mr-2 gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className={cn("h-5 w-5", selectedPlanId === "free" ? "text-white" : "text-gray-600")} />
                        <span className="font-semibold text-lg">{freePlan.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentPlanId === "free" && (
                          <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                            Current Plan
                          </span>
                        )}
                        <div className={cn("text-md font-bold", selectedPlanId === "free" ? "text-white" : "text-gray-900")}>
                          {isLoadingRates || !exchangeRates ? (
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className={cn("h-6 w-6 animate-spin", selectedPlanId === "free" ? "text-white" : "text-gray-600")} />
                              <span className={cn("text-sm", selectedPlanId === "free" ? "text-white/90" : "text-gray-500")}>Loading...</span>
                            </div>
                          ) : (
                            <>
                              {formatCurrency(freePlan.amountCents, selectedCurrency, exchangeRates)}
                              <span className="text-sm text-gray-600 ml-1"> / {freePlan.billingPeriod}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className={cn("mt-1 text-xs", selectedPlanId === "free" ? "text-white/80" : "text-gray-500")}>
                      {freePlan.description}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm">
                      {freePlan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className={cn("h-4 w-4 flex-shrink-0", selectedPlanId === "free" ? "text-white" : "text-green-600")} />
                          <span className={selectedPlanId === "free" ? "text-white" : "text-gray-700"}>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}

            {/* Silver plan */}
            {silverPlan && (
              <AccordionItem value="silver" className="border-none">
                <div
                  className={cn(
                    "rounded-2xl border-2 p-5 cursor-pointer transition-all relative",
                    selectedPlanId === silverPlan.id
                      ? "border-purple-500 bg-purple-500 text-white shadow-xl"
                      : "border-gray-200 bg-white hover:border-purple-300"
                  )}
                  onClick={() => handleSelectPlan(silverPlan.id)}
                >
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="text-xs font-bold px-4 py-1.5 rounded-full bg-accent text-white shadow-md">
                      Most Popular
                    </span>
                  </div>
                  <AccordionTrigger className="hover:no-underline py-0">
                    <div className="flex items-center justify-between w-full mr-2">
                      <div className="flex items-center gap-2">
                        <Zap className={cn("h-5 w-5", selectedPlanId === silverPlan.id ? "text-white" : "text-purple-600")} />
                        <span className="font-semibold text-lg">{silverPlan.name.replace(" Annual", "")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentPlanId === silverPlan.id && (
                          <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                            Current Plan
                          </span>
                        )}
                        <div className={cn("text-md font-bold", selectedPlanId === silverPlan.id ? "text-white" : "text-gray-900")}>
                          {isLoadingRates || !exchangeRates ? (
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className={cn("h-6 w-6 animate-spin", selectedPlanId === silverPlan.id ? "text-white" : "text-gray-600")} />
                              <span className={cn("text-sm", selectedPlanId === silverPlan.id ? "text-white/90" : "text-gray-500")}>Loading...</span>
                            </div>
                          ) : (
                            <>
                              {formatCurrency(silverPlan.amountCents, selectedCurrency, exchangeRates)}
                              <span className="text-sm text-gray-600 ml-1"> / {silverPlan.billingPeriod}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {!isLoadingRates && exchangeRates && isAnnual && silverPlan.monthlyPriceCents > 0 && (
                      <p className={cn("text-xs mt-1", selectedPlanId === silverPlan.id ? "text-white/80" : "text-purple-700")}>
                        {formatCurrency(silverPlan.monthlyPriceCents, selectedCurrency, exchangeRates)}/month when paid annually
                      </p>
                    )}
                    <p className={cn("mt-1 text-xs", selectedPlanId === silverPlan.id ? "text-white/80" : "text-gray-500")}>
                      {silverPlan.description}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm">
                      {silverPlan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className={cn("h-4 w-4 flex-shrink-0", selectedPlanId === silverPlan.id ? "text-white" : "text-green-600")} />
                          <span className={selectedPlanId === silverPlan.id ? "text-white" : "text-gray-700"}>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}

            {/* Beta plan */}
            {betaPlan && (
              <AccordionItem value="beta" className="border-none">
                <div
                  className={cn(
                    "rounded-lg border-2 p-5 transition-all relative",
                    currentUserData?.betaUsedAt && selectedPlanId !== "beta"
                      ? "cursor-not-allowed border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100/50"
                      : selectedPlanId === "beta"
                      ? "cursor-pointer border-orange-500 bg-orange-500 text-white shadow-xl"
                      : "cursor-pointer border-gray-200 bg-white hover:border-orange-300"
                  )}
                  onClick={() => !currentUserData?.betaUsedAt && handleSelectPlan("beta")}
                >
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                    <span className={cn(
                      "text-xs font-bold px-4 py-1.5 rounded-full shadow-md flex items-center gap-1.5",
                      currentUserData?.betaUsedAt && selectedPlanId !== "beta"
                        ? "bg-orange-100 text-orange-700 border border-orange-200"
                        : selectedPlanId === "beta" 
                        ? "bg-white text-orange-500" 
                        : "bg-orange-500 text-white"
                    )}>
                      {currentUserData?.betaUsedAt && selectedPlanId !== "beta" && <Lock className="h-3 w-3" />}
                      Beta
                    </span>
                  </div>
                  
                  {/* Disabled overlay pattern */}
                  {currentUserData?.betaUsedAt && selectedPlanId !== "beta" && (
                    <div 
                      className="absolute inset-0 opacity-30 pointer-events-none rounded-lg overflow-hidden"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23f97316' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                      }}
                    />
                  )}
                  <AccordionTrigger 
                    className="hover:no-underline py-0 relative z-10" 
                    disabled={currentUserData?.betaUsedAt && selectedPlanId !== "beta"}
                  >
                    <div className="flex items-center justify-between w-full mr-2">
                      <div className="flex items-center gap-2">
                        <Zap className={cn(
                          "h-5 w-5",
                          currentUserData?.betaUsedAt && selectedPlanId !== "beta" 
                            ? "text-orange-400" 
                            : selectedPlanId === "beta" 
                            ? "text-white" 
                            : "text-orange-600"
                        )} />
                        <span className={cn(
                          "font-semibold text-lg",
                          currentUserData?.betaUsedAt && selectedPlanId !== "beta"
                            ? "text-gray-600"
                            : selectedPlanId === "beta"
                            ? "text-white"
                            : "text-gray-900"
                        )}>
                          {betaPlan.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentPlanId === "beta" && (
                          <span className="text-xs px-3 py-1 rounded-lg bg-green-100 text-green-700 font-medium border border-green-200">
                            Current Plan
                          </span>
                        )}
                        {currentUserData?.betaUsedAt && selectedPlanId !== "beta" && (
                          <span className="text-xs px-3 py-1 rounded-lg bg-orange-100 text-orange-700 font-medium border border-orange-200 flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Previously Used
                          </span>
                        )}
                        <div className={cn(
                          "text-md font-bold",
                          currentUserData?.betaUsedAt && selectedPlanId !== "beta"
                            ? "text-gray-500"
                            : selectedPlanId === "beta"
                            ? "text-white"
                            : "text-gray-900"
                        )}>
                          {isLoadingRates || !exchangeRates ? (
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className={cn("h-6 w-6 animate-spin", selectedPlanId === "beta" ? "text-white" : "text-gray-600")} />
                              <span className={cn("text-sm", selectedPlanId === "beta" ? "text-white/90" : "text-gray-500")}>Loading...</span>
                            </div>
                          ) : (
                            <>
                              {formatCurrency(betaPlan.amountCents, selectedCurrency, exchangeRates)}
                              <span className={cn(
                                "text-sm ml-1",
                                currentUserData?.betaUsedAt && selectedPlanId !== "beta"
                                  ? "text-gray-400"
                                  : selectedPlanId === "beta"
                                  ? "text-white/80"
                                  : "text-gray-600"
                              )}>
                                / {betaPlan.billingPeriod}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="relative z-10">
                    <p className={cn(
                      "mt-1 text-xs",
                      currentUserData?.betaUsedAt && selectedPlanId !== "beta"
                        ? "text-gray-500"
                        : selectedPlanId === "beta"
                        ? "text-white/80"
                        : "text-gray-500"
                    )}>
                      {betaPlan.description}
                    </p>
                    {currentUserData?.betaUsedAt && selectedPlanId !== "beta" && (
                      <div className="mt-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs font-medium text-orange-900">
                              Beta Access Completed
                            </p>
                            <p className="text-xs text-orange-700 mt-0.5">
                              You've already enjoyed the Beta experience. Thank you for helping us improve!
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    <ul className={cn("mt-4 space-y-2 text-sm", currentUserData?.betaUsedAt && selectedPlanId !== "beta" && "opacity-75")}>
                      {betaPlan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className={cn(
                            "h-4 w-4 flex-shrink-0",
                            currentUserData?.betaUsedAt && selectedPlanId !== "beta"
                              ? "text-orange-300"
                              : selectedPlanId === "beta"
                              ? "text-white"
                              : "text-green-600"
                          )} />
                          <span className={cn(
                            currentUserData?.betaUsedAt && selectedPlanId !== "beta"
                              ? "text-gray-600"
                              : selectedPlanId === "beta"
                              ? "text-white"
                              : "text-gray-700"
                          )}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}

            {/* Gold plan (disabled / coming soon) */}
            {goldPlan && (
              <AccordionItem value="gold" className="border-none">
                <div
                  className={cn(
                    "rounded-2xl border-2 p-5 cursor-not-allowed opacity-70 transition-all relative",
                    selectedPlanId === goldPlan.id
                      ? "border-blue-500 bg-blue-500 text-white shadow-xl"
                      : "border-gray-200 bg-white hover:border-blue-300"
                  )}
                  onClick={() => handleSelectPlan(goldPlan.id)}
                >
                  <AccordionTrigger className="hover:no-underline py-0">
                    <div className="flex items-center justify-between w-full mr-2">
                      <div className="flex items-center gap-2">
                        <Crown className={cn("h-5 w-5", selectedPlanId === goldPlan.id ? "text-white" : "text-blue-600")} />
                        <span className="font-semibold text-lg">{goldPlan.name.replace(" Annual", "")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentPlanId === goldPlan.id && (
                          <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                            Current Plan
                          </span>
                        )}
                        <div className={cn("text-md font-bold", selectedPlanId === goldPlan.id ? "text-white" : "text-gray-900")}>
                          {isLoadingRates || !exchangeRates ? (
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className={cn("h-6 w-6 animate-spin", selectedPlanId === goldPlan.id ? "text-white" : "text-gray-600")} />
                              <span className={cn("text-sm", selectedPlanId === goldPlan.id ? "text-white/90" : "text-gray-500")}>Loading...</span>
                            </div>
                          ) : (
                            <>
                              {formatCurrency(goldPlan.amountCents, selectedCurrency, exchangeRates)}
                              <span className="text-sm text-gray-600 ml-1"> / {goldPlan.billingPeriod}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {!isLoadingRates && exchangeRates && isAnnual && goldPlan.monthlyPriceCents > 0 && (
                      <p className={cn("text-xs mt-1", selectedPlanId === goldPlan.id ? "text-white/80" : "text-blue-700")}>
                        {formatCurrency(goldPlan.monthlyPriceCents, selectedCurrency, exchangeRates)}/month when paid annually
                      </p>
                    )}
                    <p className={cn("mt-1 text-xs", selectedPlanId === goldPlan.id ? "text-white/80" : "text-gray-500")}>
                      {goldPlan.description}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm">
                      {goldPlan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className={cn("h-4 w-4 flex-shrink-0", selectedPlanId === goldPlan.id ? "text-white" : "text-green-600")} />
                          <span className={selectedPlanId === goldPlan.id ? "text-white" : "text-gray-700"}>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}
          </Accordion>
          
          {/* Action buttons */}
          <div className="space-y-3">
            {/* Subscribe button for selected plan (if different from current) */}
            {selectedPlanId && selectedPlanId !== currentPlanId ? (
              <Button
                type="button"
                className={cn(
                  "w-full text-white py-3 text-sm font-medium",
                  selectedPlanId === "free" 
                    ? "bg-gray-600 hover:bg-gray-700"
                    : selectedPlanId === "beta"
                    ? "bg-orange-600 hover:bg-orange-700"
                    : selectedPlanId?.includes("silver")
                    ? "bg-purple-600 hover:bg-purple-700"
                    : "bg-blue-600 hover:bg-blue-700"
                )}
                disabled={isSubscribing || isCompleting}
                onClick={() => handleSubscribe(selectedPlanId)}
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : selectedPlanId === "free" ? (
                  "Continue with Free Plan"
                ) : selectedPlanId === "beta" ? (
                  "Subscribe to Beta"
                ) : (
                  `Subscribe to ${plans.find(p => p.id === selectedPlanId)?.name.replace(" Annual", "") || "Plan"}`
                )}
              </Button>
            ) : (
              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-sm font-medium"
                onClick={handleCompleteWithoutChange}
                disabled={isCompleting || isSubscribing}
              >
                {isCompleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Completing...
                  </>
                ) : (
                  "Complete Setup"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

export default function BillingOnboardingPage() {
  return <BillingOnboardingContent />;
}



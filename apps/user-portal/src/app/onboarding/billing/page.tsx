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
import Image from "next/image";
import { Button } from "@imaginecalendar/ui/button";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Check, Crown, Sparkles, Zap } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FALLBACK_PLANS, toDisplayPlan } from "@/utils/plans";
import type { DisplayPlan, PlanRecordLike } from "@/utils/plans";
import { cn } from "@imaginecalendar/ui/cn";
import { OnboardingLoading } from "@/components/onboarding-loading";

function BillingOnboardingContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoaded } = useAuth();
  const trpc = useTRPC();

  const [isAnnual, setIsAnnual] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const handleSelectPlan = (planId: string) => {
    // Gold plan is not yet available in onboarding
    if (planId.startsWith("gold")) {
      toast({
        title: "Gold plan coming soon",
        description:
          "The Gold package will be available soon. Please select the Free or Silver plan for now.",
      });
      return;
    }

    setSelectedPlanId(planId);
  };

  // Ensure user is on the correct onboarding step
  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.push("/sign-in");
      return;
    }
    const setupStep = user.setupStep ?? 1;
    if (setupStep < 3) {
      // Should have completed WhatsApp and Calendar first
      if (setupStep === 1) {
        router.push("/onboarding/whatsapp");
      } else if (setupStep === 2) {
        router.push("/onboarding/calendar");
      }
    } else if (setupStep > 4) {
      router.push("/dashboard");
    }
  }, [isLoaded, user, router]);

  // Fetch current subscription data (used to detect existing plan, but never blocks UI)
  // Use the single-argument tRPC helper form to avoid server-side defaultQueryOptions issues.
  const { data: subscription } = useQuery(
    trpc.billing.getSubscription.queryOptions()
  );

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
  const goldPlanId = isAnnual ? "gold-annual" : "gold-monthly";
  const goldPlan = plans.find((p) => p.id === goldPlanId) || plans.find((p) => p.id === "gold-monthly");

  const currentPlanId = subscription?.plan ?? freePlan?.id ?? "free";
  
  // Initialize selected plan to current plan or free
  useEffect(() => {
    if (!selectedPlanId && currentPlanId) {
      setSelectedPlanId(currentPlanId);
    }
  }, [currentPlanId, selectedPlanId]);

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
            toast({
              title: "Setup complete!",
              description: "Your subscription has been created and setup is finished.",
            });
            // After subscription + onboarding complete, show success screen
            router.push("/onboarding/success");
          } catch (error: any) {
            toast({
              title: "Error",
              description: error.message || "Failed to complete setup",
              variant: "destructive",
            });
          } finally {
            setIsSubscribing(false);
          }
        }
      },
      onError: (error) => {
        setIsSubscribing(false);
        toast({
          title: "Subscription error",
          description: error.message || "Failed to create subscription",
          variant: "destructive",
        });
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
      toast({
        title: "Setup complete!",
        description: "You can manage your billing at any time from the dashboard.",
      });
      // After completing onboarding without changing plan, show success screen
      router.push("/onboarding/success");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to complete setup",
        variant: "destructive",
      });
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
    
    const plan = plans.find((p) => p.id === planId);
    if (!plan) {
      toast({
        title: "Plan not available",
        description: "Selected plan is not available. Please try another plan.",
        variant: "destructive",
      });
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
    <div className="flex min-h-screen flex-col lg:flex-row bg-white">
      {/* Left column – billing cards */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-md space-y-8">
          {/* Title */}
          <div>
            <p className="text-md font-medium tracking-wide text-gray-400 mb-1 text-center sm:text-left">
              Step 4 of 4
            </p>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Billing and Subscription</h1>
            <p className="text-gray-600 text-md leading-relaxed mb-3">
              Manage your subscription and payment details
            </p>
          </div>

          {/* Billing cycle toggle */}
          <div className="flex items-center justify-between bg-gray-100 rounded-full p-1 w-full max-w-xs">
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

          {/* Plan cards */}
          <div className="space-y-4">
            {/* Free plan */}
            {freePlan && (
              <div
                className={cn(
                  "rounded-2xl border-2 p-5 cursor-pointer transition-all",
                  selectedPlanId === "free"
                    ? "border-gray-500 bg-gray-500 text-white"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300"
                )}
                onClick={() => handleSelectPlan("free")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className={cn("h-5 w-5", selectedPlanId === "free" ? "text-white" : "text-gray-600")} />
                    <span className="font-semibold text-lg">{freePlan.name}</span>
                  </div>
                  {currentPlanId === "free" && (
                    <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                      Current Plan
                    </span>
                  )}
                </div>
                <div className={cn("text-3xl font-bold", selectedPlanId === "free" ? "text-white" : "text-gray-900")}>
                  {freePlan.displayPrice}
                  <span className="text-sm text-gray-600 ml-1"> / {freePlan.billingPeriod}</span>
                </div>
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
              </div>
            )}

            {/* Silver plan */}
            {silverPlan && (
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
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className={cn("h-5 w-5", selectedPlanId === silverPlan.id ? "text-white" : "text-purple-600")} />
                    <span className="font-semibold text-lg">{silverPlan.name.replace(" Annual", "")}</span>
                  </div>
                  {currentPlanId === silverPlan.id && (
                    <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                      Current Plan
                    </span>
                  )}
                </div>
                <div className={cn("text-3xl font-bold", selectedPlanId === silverPlan.id ? "text-white" : "text-gray-900")}>
                  {silverPlan.displayPrice}
                  <span className="text-sm text-gray-600 ml-1"> / {silverPlan.billingPeriod}</span>
                </div>
                {isAnnual && silverPlan.monthlyPriceCents > 0 && (
                  <p className={cn("text-xs mt-1", selectedPlanId === silverPlan.id ? "text-white/80" : "text-purple-700")}>
                    {silverPlan.monthlyPriceCents / 100}/month when paid annually
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
              </div>
            )}

            {/* Gold plan (disabled / coming soon) */}
            {goldPlan && (
              <div
                className={cn(
                  "rounded-2xl border-2 p-5 cursor-not-allowed opacity-70 transition-all relative",
                  selectedPlanId === goldPlan.id
                    ? "border-blue-500 bg-blue-500 text-white shadow-xl"
                    : "border-gray-200 bg-white hover:border-blue-300"
                )}
                onClick={() => handleSelectPlan(goldPlan.id)}
              >
                <div className="flex items-center justify-between mb-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Crown className={cn("h-5 w-5", selectedPlanId === goldPlan.id ? "text-white" : "text-blue-600")} />
                    <span className="font-semibold text-lg">{goldPlan.name.replace(" Annual", "")}</span>
                  </div>
                  {currentPlanId === goldPlan.id && (
                    <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                      Current Plan
                    </span>
                  )}
                </div>
                <div className={cn("text-3xl font-bold", selectedPlanId === goldPlan.id ? "text-white" : "text-gray-900")}>
                  {goldPlan.displayPrice}
                  <span className="text-sm text-gray-600 ml-1"> / {goldPlan.billingPeriod}</span>
                </div>
                {isAnnual && goldPlan.monthlyPriceCents > 0 && (
                  <p className={cn("text-xs mt-1", selectedPlanId === goldPlan.id ? "text-white/80" : "text-blue-700")}>
                    {goldPlan.monthlyPriceCents / 100}/month when paid annually
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
              </div>
            )}
          </div>
          
          {/* Action buttons */}
          <div className="pt-4 space-y-3">
            {/* Subscribe button for selected plan (if different from current) */}
            {selectedPlanId && selectedPlanId !== currentPlanId ? (
              <Button
                type="button"
                className={cn(
                  "w-full text-white py-3 text-sm font-medium",
                  selectedPlanId === "free" 
                    ? "bg-gray-600 hover:bg-gray-700"
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
            <button
              type="button"
              onClick={handleCompleteWithoutChange}
              disabled={isCompleting || isSubscribing}
              className="w-full text-center text-sm text-gray-600 hover:text-gray-900"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>

      {/* Right column – same as first and second steps */}
      <div className="w-full lg:w-1/2 bg-blue-600 flex items-center justify-center p-10">
        <div className="max-w-md text-center text-white space-y-8">
          <h2 className="text-3xl font-bold tracking-wide">
            REMIND. ORGANISE. CRACKON.
          </h2>
          <div className="flex justify-center">
            <Image
              src="/phone.png"
              alt="CrackOn on mobile"
              width={320}
              height={640}
              className="w-auto h-auto max-h-[420px] object-contain drop-shadow-2xl"
              priority
            />
          </div>
          <p className="text-sm sm:text-base leading-relaxed">
            CrackOn is your smart WhatsApp friend that helps you stay organised
            without leaving your favourite chat app. Upgrade your plan to
            unlock unlimited calendars, reminders, and more.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BillingOnboardingPage() {
  return <BillingOnboardingContent />;
}



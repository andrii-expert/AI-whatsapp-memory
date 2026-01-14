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
import { Loader2, Check, Crown } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FALLBACK_PLANS, toDisplayPlan } from "@/utils/plans";
import type { DisplayPlan, PlanRecordLike } from "@/utils/plans";
import { cn } from "@imaginecalendar/ui/cn";

function BillingOnboardingContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoaded } = useAuth();
  const trpc = useTRPC();

  const [isAnnual, setIsAnnual] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

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
  const { data: subscription } = useQuery(
    trpc.billing.getSubscription.queryOptions(),
    {
      // Do not retry endlessly; onboarding should still work without subscription data
      retry: 1,
    }
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
  const premiumPlanId = isAnnual ? "gold-annual" : "gold-monthly";
  const premiumPlan =
    plans.find((p) => p.id === premiumPlanId) ||
    plans.find((p) => p.id === "gold-monthly") ||
    plans.find((p) => p.id !== "free");

  const currentPlanId = subscription?.plan ?? freePlan?.id ?? "free";

  const createSubscriptionMutation = useMutation(
    trpc.billing.createSubscription.mutationOptions({
      onSuccess: async (sub) => {
        // After creating subscription, complete onboarding
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
          router.push("/dashboard");
          router.refresh();
        } catch (error: any) {
          toast({
            title: "Error",
            description: error.message || "Failed to complete setup",
            variant: "destructive",
          });
        } finally {
          setIsSubscribing(false);
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
      router.push("/dashboard");
      router.refresh();
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

  const handleSubscribe = () => {
    if (!premiumPlan) {
      toast({
        title: "Plan not available",
        description: "No premium plan is configured. Please contact support.",
        variant: "destructive",
      });
      return;
    }
    if (isSubscribing) return;
    setIsSubscribing(true);
    createSubscriptionMutation.mutate({ plan: premiumPlan.id as any });
  };

  // If authentication is still loading
  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-white">
      {/* Left column – billing cards */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-md space-y-8">
          {/* Title */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Billing and Subscription</h1>
            <p className="text-sm text-gray-600">
              Choose a plan to get started with CrackOn. You can always change or cancel later.
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
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">Free</span>
                  {currentPlanId === "free" && (
                    <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                      Current Plan
                    </span>
                  )}
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  R0<span className="text-base font-normal">.00</span>
                  <span className="text-sm text-gray-600"> / month</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">Trying it out</p>
                <ul className="mt-4 space-y-1 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" /> 15 calendar entries per month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" /> 2 shopping lists
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" /> 15 reminders per month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h4 w-4 text-green-600" /> 2 friends
                  </li>
                </ul>
              </div>
            )}

            {/* Premium plan */}
            {premiumPlan && (
              <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-orange-600" />
                  <span className="font-semibold text-gray-900">Premium Plan</span>
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  R75<span className="text-base font-normal">.00</span>
                  <span className="text-sm text-gray-600"> / month</span>
                </div>
                {isAnnual && (
                  <p className="text-xs text-orange-700">
                    Save R25.00 for yearly subscription
                  </p>
                )}
                <Button
                  type="button"
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white mt-2"
                  disabled={
                    isSubscribing ||
                    isCompleting ||
                    currentPlanId === premiumPlan.id
                  }
                  onClick={handleSubscribe}
                >
                  {isSubscribing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : currentPlanId === premiumPlan.id ? (
                    "Current Plan"
                  ) : (
                    "Subscribe"
                  )}
                </Button>

                <ul className="mt-4 space-y-1 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" /> Unlimited calendar events
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" /> Multiple calendars & sub-calendars
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" /> Unlimited reminders
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" /> Unlimited shopping lists
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" /> Unlimited contacts & sharing
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Complete / Skip */}
          <div className="pt-4 space-y-3">
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



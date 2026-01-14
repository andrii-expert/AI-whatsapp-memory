"use client";

// Force dynamic rendering - this page requires authentication
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import BillingPage from "@/app/(dashboard)/billing/page";
import { useAuth } from "@/hooks/use-auth";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";

function BillingOnboardingInner() {
  const { user, isLoaded } = useAuth();
  const trpc = useTRPC();

  // Fetch current subscription data
  const { data: subscription, isLoading } = useQuery(
    trpc.billing.getSubscription.queryOptions()
  );

  // When subscription is active and user is on step 3, mark onboarding as complete (step 4)
  const updateUserMutation = useMutation(
    trpc.user.update.mutationOptions({})
  );

  useEffect(() => {
    if (!isLoaded || !user || isLoading) return;

    const setupStep = user.setupStep ?? 1;

    if (setupStep === 3 && subscription?.status === "active") {
      updateUserMutation.mutate({ setupStep: 4 });
    }
  }, [isLoaded, user, isLoading, subscription, updateUserMutation]);

  if (!isLoaded || !user || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // UI and behavior are exactly the same as the main billing page
  return <BillingPage />;
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
      <BillingOnboardingInner />
    </Suspense>
  );
}



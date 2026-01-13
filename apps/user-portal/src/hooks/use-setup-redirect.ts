"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./use-auth";

/**
 * Hook to redirect users to the appropriate onboarding step if setup is incomplete
 * Should be used in all dashboard pages
 */
export function useSetupRedirect() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    
    if (!user) {
      router.push("/sign-in");
      return;
    }

    // Default to 1 if setupStep is null/undefined
    const setupStep = user.setupStep ?? 1;

    // Redirect to appropriate onboarding step if setup is incomplete
    if (setupStep < 3) {
      if (setupStep === 1) {
        router.push("/onboarding/whatsapp");
      } else if (setupStep === 2) {
        router.push("/onboarding/calendar");
      }
    }
  }, [user, isLoaded, router]);
}


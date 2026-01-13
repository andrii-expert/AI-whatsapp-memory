"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./use-auth";

/**
 * Hook to redirect users to the appropriate onboarding step if setup is incomplete
 * Should be used in all dashboard pages
 * 
 * This hook must be called unconditionally at the top level of the component
 */
export function useSetupRedirect() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const hasRedirected = useRef(false);
  const routerRef = useRef(router);

  // Keep router ref updated
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    // Prevent multiple redirects
    if (hasRedirected.current) return;
    
    if (!isLoaded) return;
    
    if (!user) {
      hasRedirected.current = true;
      routerRef.current.push("/sign-in");
      return;
    }

    // Default to 1 if setupStep is null/undefined
    const setupStep = user.setupStep ?? 1;

    // Redirect to appropriate onboarding step if setup is incomplete
    if (setupStep < 3) {
      hasRedirected.current = true;
      if (setupStep === 1) {
        routerRef.current.push("/onboarding/whatsapp");
      } else if (setupStep === 2) {
        routerRef.current.push("/onboarding/calendar");
      }
    }
  }, [user, isLoaded]);
}


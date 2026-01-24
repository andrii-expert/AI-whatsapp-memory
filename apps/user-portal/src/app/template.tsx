"use client";

import { OnboardingLoading } from "@/components/onboarding-loading";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Define public routes that don't require auth check
const publicRoutes = [
  "/sign-in",
  "/sign-up",
  "/verify-email",
];

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Only show loading for protected routes (not public routes)
    if (isPublicRoute(pathname)) {
      setIsChecking(false);
      return;
    }

    // Show loading during route transitions (including middleware auth checks)
    setIsChecking(true);
    
    // Check if user has auth token - if not, middleware will redirect
    // Show loading during this check
    const checkAuth = () => {
      // Small delay to allow middleware to process
      const timer = setTimeout(() => {
        setIsChecking(false);
      }, 150);

      return () => clearTimeout(timer);
    };

    const cleanup = checkAuth();
    return cleanup;
  }, [pathname]);

  // Show full-page loading during auth checks (middleware processing)
  if (isChecking && !isPublicRoute(pathname)) {
    return <OnboardingLoading />;
  }

  return <>{children}</>;
}


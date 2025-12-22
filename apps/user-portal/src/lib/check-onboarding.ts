import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { trpc, getQueryClient } from "@/trpc/server";

/**
 * Server Component utility to check if user is authenticated and onboarded
 * Uses tRPC calls to stay consistent with app architecture
 * Redirects to appropriate page if not
 * @returns User data if fully onboarded
 */
export async function requireOnboarding() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  const queryClient = getQueryClient();
  
  // Use existing tRPC endpoint to check onboarding
  try {
    const onboardingCheck = await queryClient.fetchQuery(
      trpc.auth.checkOnboarding.queryOptions()
    );
    
    if (onboardingCheck.needsOnboarding) {
      redirect("/onboarding");
    }
    
    // Get user data if onboarded
    const user = await queryClient.fetchQuery(
      trpc.user.me.queryOptions()
    );
    return user;
  } catch (error) {
    // Log the error for debugging
    console.error("[requireOnboarding] Error checking onboarding status:", error);
    
    // Only redirect to onboarding if it's a specific error indicating the user needs onboarding
    // For other errors (network, API issues), try to get user data directly
    try {
      // Try to get user data directly - if user exists and has required fields, they're onboarded
      const user = await queryClient.fetchQuery(
        trpc.user.me.queryOptions()
      );
      
      // If we can get user data and they have required fields, they're onboarded
      if (user && (user.firstName || user.name) && user.phone) {
        return user;
      }
      
      // User exists but missing required fields - needs onboarding
      redirect("/onboarding");
    } catch (userError) {
      // If we can't get user data either, it's likely a temporary API/database issue
      // Don't redirect to onboarding - let the user continue (they might already be onboarded)
      // Log the error but don't block access - this prevents false redirects
      const errorMessage = userError instanceof Error ? userError.message : String(userError);
      console.error("[requireOnboarding] Error getting user data as fallback:", errorMessage);
      
      // Try one more time with a simpler check - just verify user exists
      // If user doesn't exist at all, they definitely need onboarding
      try {
        // Use ensureUserExists as a last resort - this will create user if needed
        // But we don't want to create users here, so we'll just let them through
        // The page components can handle missing user data gracefully
        // Better to allow access than to redirect incorrectly
        return null;
      } catch {
        // If everything fails, don't redirect - let the user through
        // They might already be onboarded and we're just having temporary issues
        return null;
      }
    }
  }
}

/**
 * Check onboarding status without redirecting
 * Useful for conditional rendering or optional checks
 */
export async function checkOnboardingStatus() {
  const { userId } = await auth();
  
  if (!userId) {
    return { isAuthenticated: false, isOnboarded: false, user: null };
  }
  
  const queryClient = getQueryClient();
  
  try {
    const onboardingCheck = await queryClient.fetchQuery(
      trpc.auth.checkOnboarding.queryOptions()
    );
    
    const user = onboardingCheck.needsOnboarding 
      ? null 
      : await queryClient.fetchQuery(trpc.user.me.queryOptions());
    
    return {
      isAuthenticated: true,
      isOnboarded: !onboardingCheck.needsOnboarding,
      user,
    };
  } catch (error) {
    return {
      isAuthenticated: true,
      isOnboarded: false,
      user: null,
    };
  }
}
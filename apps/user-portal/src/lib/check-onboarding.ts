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
    // If there's an error, redirect to onboarding to be safe
    redirect("/onboarding");
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
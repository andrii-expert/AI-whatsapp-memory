import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { trpc, getQueryClient } from "@/trpc/server";

/**
 * Server Component utility to check if user is authenticated
 * Redirects to sign-in if not authenticated
 * Redirects to appropriate onboarding step if setup is incomplete
 * @param allowOnboardingPages - If true, allows access to onboarding pages even if setup is incomplete
 * @returns User data if authenticated
 */
export async function requireAuth(allowOnboardingPages: boolean = false) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  
  if (!token) {
    redirect("/sign-in");
  }
  
  const payload = verifyToken(token);
  if (!payload) {
    redirect("/sign-in");
  }
  
  // Get user data
  const queryClient = getQueryClient();
  
  try {
    const user = await queryClient.fetchQuery(
      trpc.user.me.queryOptions()
    );
    
    // Redirect based on setup step
    // setupStep 1 = WhatsApp setup required, 2 = Calendar setup required, 3 = Billing setup required, 4 = Complete
    // Default to 1 if setupStep is null/undefined (for existing users without setupStep)
    const setupStep = user?.setupStep ?? 1;
    
    if (setupStep < 4) {
      if (!allowOnboardingPages) {
        // If user is trying to access dashboard pages, redirect to appropriate onboarding step
        if (setupStep === 1) {
          redirect("/onboarding/whatsapp");
        } else if (setupStep === 2) {
          redirect("/onboarding/calendar");
        } else if (setupStep === 3) {
          redirect("/onboarding/billing");
        }
      }
    }
    
    return user;
  } catch (error) {
    // If we can't get user data, still allow access (user is authenticated)
    // The page components can handle missing user data gracefully
    console.error("[requireAuth] Error getting user data:", error);
    return null;
  }
}


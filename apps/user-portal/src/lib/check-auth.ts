import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { trpc, getQueryClient } from "@/trpc/server";

/**
 * Server Component utility to check if user is authenticated
 * Redirects to sign-in if not authenticated
 * @returns User data if authenticated
 */
export async function requireAuth() {
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
    return user;
  } catch (error) {
    // If we can't get user data, still allow access (user is authenticated)
    // The page components can handle missing user data gracefully
    console.error("[requireAuth] Error getting user data:", error);
    return null;
  }
}


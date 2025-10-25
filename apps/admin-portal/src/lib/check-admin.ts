import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { trpc, getQueryClient } from "@/trpc/server";

/**
 * Server Component utility to check if user is authenticated and has admin privileges
 * Uses tRPC calls to stay consistent with app architecture
 * Redirects to appropriate page if not authorized
 * @returns Admin user data if authorized
 */
export async function requireAdmin() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const queryClient = getQueryClient();

  try {
    // Get user data to check admin status
    const user = await queryClient.fetchQuery(
      trpc.user.me.queryOptions()
    );

    // If user doesn't exist in database (new Clerk user), redirect to unauthorized
    if (!user) {
      redirect("/unauthorized");
    }

    if (!user?.isAdmin) {
      redirect("/unauthorized");
    }

    return user;
  } catch (error) {
    // Log the error for debugging
    console.error("Error checking admin status:", error);
    // If there's an error fetching user, redirect to unauthorized
    // This prevents infinite loops between sign-in and dashboard
    redirect("/unauthorized");
  }
}

/**
 * Check admin status without redirecting
 * Useful for conditional rendering or optional checks
 */
export async function checkAdminStatus() {
  const { userId } = await auth();

  if (!userId) {
    return { isAuthenticated: false, isAdmin: false, user: null };
  }

  const queryClient = getQueryClient();

  try {
    const user = await queryClient.fetchQuery(
      trpc.user.me.queryOptions()
    );

    return {
      isAuthenticated: true,
      isAdmin: user?.isAdmin || false,
      user,
    };
  } catch (error) {
    return {
      isAuthenticated: true,
      isAdmin: false,
      user: null,
    };
  }
}
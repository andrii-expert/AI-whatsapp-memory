import { redirect } from "next/navigation";
import { getAuthUser } from "./auth";
import { trpc, getQueryClient } from "@/trpc/server";

/**
 * Server Component utility to check if user is authenticated and has admin privileges
 * Uses JWT token from cookies
 * Redirects to appropriate page if not authorized
 * @returns Admin user data if authorized
 */
export async function requireAdmin() {
  const authUser = await getAuthUser();

  if (!authUser) {
    redirect("/sign-in");
  }

  if (!authUser.isAdmin) {
    redirect("/unauthorized");
  }

  const queryClient = getQueryClient();

  try {
    // Get full user data from database
    const user = await queryClient.fetchQuery(
      trpc.user.me.queryOptions()
    );

    if (!user) {
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
  const authUser = await getAuthUser();

  if (!authUser) {
    return { isAuthenticated: false, isAdmin: false, user: null };
  }

  if (!authUser.isAdmin) {
    return { isAuthenticated: true, isAdmin: false, user: null };
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
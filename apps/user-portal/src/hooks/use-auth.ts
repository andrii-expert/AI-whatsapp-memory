"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/trpc/client";

interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  setupStep?: number | null;
}

interface AuthState {
  user: User | null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoaded: false,
    isSignedIn: false,
  });

  // Use tRPC to get user data (includes setupStep)
  const { data: user, isLoading, error } = trpc.user.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isLoading) return;
    
    if (error || !user) {
      setAuthState({
        user: null,
        isLoaded: true,
        isSignedIn: false,
      });
    } else {
      setAuthState({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.name,
          avatarUrl: user.avatarUrl,
          setupStep: user.setupStep ?? undefined,
        },
        isLoaded: true,
        isSignedIn: true,
      });
    }
  }, [user, isLoading, error]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { 
        method: "POST",
        credentials: 'include', // Ensure cookies are sent
      });
      
      // Clear all query cache
      queryClient.clear();
      
      // Reset auth state
      setAuthState({
        user: null,
        isLoaded: true,
        isSignedIn: false,
      });
      
      // Redirect to home
      router.push("/sign-in");
      router.refresh();
    } catch (error) {
      console.error("Sign out error:", error);
      // Still clear cache and redirect even if request fails
      queryClient.clear();
      setAuthState({
        user: null,
        isLoaded: true,
        isSignedIn: false,
      });
      router.push("/sign-in");
      router.refresh();
    }
  }, [router, queryClient]);

  return {
    ...authState,
    signOut,
  };
}


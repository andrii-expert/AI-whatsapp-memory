"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
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

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        setAuthState({
          user: data.user,
          isLoaded: true,
          isSignedIn: data.isAuthenticated,
        });
      })
      .catch(() => {
        setAuthState({
          user: null,
          isLoaded: true,
          isSignedIn: false,
        });
      });
  }, []);

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


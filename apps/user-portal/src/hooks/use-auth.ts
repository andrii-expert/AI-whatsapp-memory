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

  // Use session API to get user data (works during SSR and client-side)
  useEffect(() => {
    let mounted = true;

    fetch("/api/auth/session", {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        
        if (data.isAuthenticated && data.user) {
          setAuthState({
            user: {
              id: data.user.id,
              email: data.user.email,
              firstName: data.user.firstName,
              lastName: data.user.lastName,
              name: data.user.name,
              avatarUrl: data.user.avatarUrl,
              setupStep: data.user.setupStep ?? undefined,
            },
            isLoaded: true,
            isSignedIn: true,
          });
        } else {
          setAuthState({
            user: null,
            isLoaded: true,
            isSignedIn: false,
          });
        }
      })
      .catch(() => {
        if (!mounted) return;
        setAuthState({
          user: null,
          isLoaded: true,
          isSignedIn: false,
        });
      });

    return () => {
      mounted = false;
    };
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


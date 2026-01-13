"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}

interface AuthState {
  user: User | null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

export function useAuth() {
  const router = useRouter();
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

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    setAuthState({
      user: null,
      isLoaded: true,
      isSignedIn: false,
    });
    router.push("/");
    router.refresh();
  };

  return {
    ...authState,
    signOut,
  };
}


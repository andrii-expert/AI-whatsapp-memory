"use client";

// Force dynamic rendering - this page requires authentication
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@imaginecalendar/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Check } from "lucide-react";
import { useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { OnboardingLoading } from "@/components/onboarding-loading";

// Microsoft Icon Component
const MicrosoftIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 23 23"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M0 0h11.5v11.5H0V0z" fill="#F25022" />
    <path d="M11.5 0H23v11.5H11.5V0z" fill="#7FBA00" />
    <path d="M0 11.5h11.5V23H0V11.5z" fill="#00A4EF" />
    <path d="M11.5 11.5H23V23H11.5V11.5z" fill="#FFB900" />
  </svg>
);

function CalendarConnectionForm() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const trpc = useTRPC();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  // Poll user setupStep every 1 second to detect when user advances to next step
  const { data: polledUser } = useQuery({
    ...trpc.user.me.queryOptions(),
    refetchInterval: 1000, // Check every 1 second
    enabled: isLoaded && !!user && (user.setupStep ?? 1) === 2, // Only poll while on step 2
  });

  // Fetch user's calendar connections to check sync status
  const { data: calendars = [], refetch: refetchCalendars } = useQuery(
    trpc.calendar.list.queryOptions()
  );

  // Connect calendar mutation for OAuth callback handling
  const connectCalendarMutation = useMutation(
    trpc.calendar.connect.mutationOptions({
      onSuccess: async () => {
        setConnectingProvider(null);
        // Refetch calendars to update the UI immediately
        await refetchCalendars();
      },
      onError: (error) => {
        console.error("Connection failed:", error);
        setConnectingProvider(null);
      },
    })
  );

  // Handle OAuth callback from cookies (when redirected back from OAuth provider)
  useEffect(() => {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) {
        const cookieValue = parts.pop()?.split(';').shift();
        return cookieValue ? decodeURIComponent(cookieValue) : null;
      }
      return null;
    };

    const deleteCookie = (name: string) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    };

    const oauthCallbackCookie = getCookie('oauth_callback');
    const oauthErrorCookie = getCookie('oauth_error');

    if (oauthErrorCookie) {
      try {
        const errorData = JSON.parse(oauthErrorCookie);
        console.error("Authorization failed:", errorData);
        deleteCookie('oauth_error');
        setConnectingProvider(null);
      } catch (e) {
        deleteCookie('oauth_error');
        setConnectingProvider(null);
      }
      return;
    }

    if (oauthCallbackCookie && user) {
      try {
        const callbackData = JSON.parse(oauthCallbackCookie);
        const redirectUri = `${window.location.origin}/api/calendars/callback`;
        connectCalendarMutation.mutate({
          provider: callbackData.provider,
          code: callbackData.code,
          redirectUri,
        });
        deleteCookie('oauth_callback');
      } catch (e) {
        deleteCookie('oauth_callback');
        setConnectingProvider(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Check if a calendar provider is connected and synced
  const isCalendarSynced = (provider: "google" | "microsoft") => {
    return calendars.some(
      (cal) => cal.provider === provider && cal.isActive && cal.accessToken
    );
  };

  const updateUserMutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: () => {
        router.push("/onboarding/billing");
        router.refresh();
      },
      onError: (error) => {
        console.error("Failed to update setup step:", error);
      },
    })
  );

  // Redirect if user has already completed this step or is on wrong step
  // Also check polled user data for setupStep changes
  useEffect(() => {
    if (!isLoaded) return;
    
    if (!user) {
      router.push("/sign-in");
      return;
    }

    // Use polled user data if available (for real-time updates), otherwise use user from useAuth
    const currentUser = polledUser || user;
    // Default to 1 if setupStep is null/undefined
    const setupStep = currentUser.setupStep ?? 1;

    // If setupStep is 1, redirect to WhatsApp setup
    if (setupStep === 1) {
      router.push("/onboarding/whatsapp");
      return;
    } else if (setupStep === 3) {
      router.push("/onboarding/billing");
      return;
    } else if (setupStep === 4) {
      router.push("/dashboard");
      return;
    }
    // If setupStep is 2, stay on this page (correct step)
    
    // Update temporary credentials step when landing on this page
    if (setupStep === 2) {
      fetch("/api/auth/update-signup-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentStep: "calendar" }),
      }).catch((err) => {
        // Silently fail - step update is not critical
        console.error("Failed to update signup step:", err);
      });
    }
  }, [user, polledUser, isLoaded, router]);

  if (!isLoaded || !user) {
    return <OnboardingLoading />;
  }

  // Default to 1 if setupStep is null/undefined
  const setupStep = user.setupStep ?? 1;
  
  // If user is on wrong step, show loading (redirect will happen in useEffect)
  if (setupStep !== 2) {
    return <OnboardingLoading />;
  }

  const handleConnectCalendar = async (provider: "google" | "microsoft") => {
    if (!user) {
      return;
    }

    setConnectingProvider(provider);

    try {
      // Include "onboarding" flag in state to indicate we're in onboarding flow
      const state = `onboarding:${provider}:${user.id}`;
      const response = await fetch(`/api/calendars/auth?provider=${provider}&state=${encodeURIComponent(state)}`);
      
      if (!response.ok) {
        throw new Error("Failed to get authorization URL");
      }

      const { authUrl } = await response.json();
      window.location.href = authUrl;
    } catch (error: any) {
      console.error("Connection failed:", error);
      setConnectingProvider(null);
    }
  };

  const handleNextStep = async () => {
    setIsCompleting(true);
    try {
      await updateUserMutation.mutateAsync({
        setupStep: 3, // Move to next step: Billing setup
      });

      // Update temporary credentials step
      try {
        await fetch("/api/auth/update-signup-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ currentStep: "billing" }),
        });
      } catch (err) {
        // Silently fail - step update is not critical
        console.error("Failed to update signup step:", err);
      }
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSkip = async () => {
    setIsCompleting(true);
    try {
      await updateUserMutation.mutateAsync({
        setupStep: 3, // Move to next step: Billing setup
      });

      // Update temporary credentials step
      try {
        await fetch("/api/auth/update-signup-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ currentStep: "billing" }),
        });
      } catch (err) {
        // Silently fail - step update is not critical
        console.error("Failed to update signup step:", err);
      }
    } finally {
      setIsCompleting(false);
    }
  };

  // Check if any calendar is connected
  const hasConnectedCalendar = calendars.some(
    (cal) => cal.isActive && cal.accessToken
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 bg-white flex sm:items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md space-y-6 sm:space-y-8 py-4 sm:py-8">
          {/* Title */}
          <div>
            <p className="text-md font-medium tracking-wide text-gray-400 mb-1 text-center sm:text-left">
              Step 3 of 4
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">Link Calendar</h1>
            <p className="text-gray-600 text-md leading-relaxed mb-3">
              Link CrackOn to create meetings directly in your work or personal calendar.
            </p>
          </div>

          {/* Calendar Connection Buttons */}
          <div className="space-y-4 sm:space-y-5">
            {/* Google Calendar */}
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-3 h-12 sm:h-14 bg-white border border-gray-300 rounded-lg px-4"
                onClick={() => handleConnectCalendar("google")}
                disabled={connectingProvider !== null}
              >
                <div className="flex items-center gap-3">
                  {connectingProvider === "google" ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  )}
                  <span className="text-sm sm:text-base font-medium text-gray-800">
                    Connect to Google Calendar
                  </span>
                </div>
                {isCalendarSynced("google") && (
                  <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-full">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-green-700">Synced</span>
                  </div>
                )}
              </Button>
            </div>

            {/* Microsoft Calendar */}
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-3 h-12 sm:h-14 bg-white border border-gray-300 rounded-lg px-4"
                onClick={() => handleConnectCalendar("microsoft")}
                disabled={connectingProvider !== null}
              >
                <div className="flex items-center gap-3">
                  {connectingProvider === "microsoft" ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                  ) : (
                    <MicrosoftIcon className="h-5 w-5 flex-shrink-0" />
                  )}
                  <span className="text-sm sm:text-base font-medium text-gray-800">
                    Connect to Microsoft Calendar
                  </span>
                </div>
                {isCalendarSynced("microsoft") && (
                  <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-full">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-green-700">Synced</span>
                  </div>
                )}
              </Button>
            </div>
          </div>

          {/* Next Step and Skip Buttons */}
          <div className="pt-4 space-y-3">
            <Button
              type="button"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 sm:py-6 text-sm sm:text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleNextStep}
              disabled={isCompleting || !hasConnectedCalendar}
            >
              {isCompleting ? "Saving..." : "Next Step"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-gray-600 hover:text-gray-900 hover:bg-gray-50 py-3 text-sm font-medium"
              onClick={handleSkip}
              disabled={isCompleting}
            >
              Skip
            </Button>
          </div>
        </div>
      </div>

      {/* Right Side - Promotional Content (same as other steps) */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-600 flex-col items-center justify-center p-8 xl:p-12 relative overflow-hidden">
        {/* Slogan */}
        <div className="text-center mb-6 xl:mb-8">
          <h2 className="text-3xl xl:text-4xl font-bold text-white tracking-wide mb-4">
            REMIND. ORGANISE. CRACKON.
          </h2>
        </div>

        {/* Phone Image */}
        <div className="relative mb-6 xl:mb-8 flex justify-center">
          <Image
            src="/phone.png"
            alt="CrackOn Phone Mockup"
            width={300}
            height={600}
            className="w-auto h-auto max-w-[250px] xl:max-w-[300px] object-contain"
            priority
          />
        </div>

        {/* Description Text */}
        <div className="text-center max-w-md px-4">
          <p className="text-white text-base xl:text-lg leading-relaxed">
            CrackOn is your smart WhatsApp friend that helps you stay organised without leaving your favourite chat app.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CalendarConnectionPage() {
  // This page must be client-side only due to useAuth hook
  return <CalendarConnectionForm />;
}


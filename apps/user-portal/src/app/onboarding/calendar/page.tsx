"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@imaginecalendar/ui/button";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

function CalendarConnectionForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoaded } = useAuth();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  // Redirect if user has already completed this step or is on wrong step
  useEffect(() => {
    if (!isLoaded) return;
    
    if (!user) {
      router.push("/sign-in");
      return;
    }

    // Default to 1 if setupStep is null/undefined
    const setupStep = user.setupStep ?? 1;

    // If setupStep is 1, redirect to WhatsApp setup
    if (setupStep === 1) {
      router.push("/onboarding/whatsapp");
      return;
    } else if (setupStep === 3) {
      router.push("/dashboard");
      return;
    }
    // If setupStep is 2, stay on this page (correct step)
  }, [user, isLoaded, router]);

  if (!isLoaded || !user) {
    return (
      <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  // Default to 1 if setupStep is null/undefined
  const setupStep = user.setupStep ?? 1;
  
  // If user is on wrong step, show loading (redirect will happen in useEffect)
  if (setupStep !== 2) {
    return (
      <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  const handleConnectCalendar = async (provider: "google" | "microsoft") => {
    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please sign in to connect your calendar",
        variant: "destructive",
      });
      return;
    }

    setConnectingProvider(provider);

    try {
      const state = `${provider}:${user.id}`;
      const response = await fetch(`/api/calendars/auth?provider=${provider}&state=${encodeURIComponent(state)}`);
      
      if (!response.ok) {
        throw new Error("Failed to get authorization URL");
      }

      const { authUrl } = await response.json();
      window.location.href = authUrl;
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to start calendar connection",
        variant: "destructive",
      });
      setConnectingProvider(null);
    }
  };

  const handleCompleteSetup = async () => {
    setIsCompleting(true);

    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to complete setup");
      }

      toast({
        title: "Setup complete!",
        description: "Your account has been set up successfully.",
      });

      // Redirect to dashboard
      router.push("/dashboard");
      router.refresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to complete setup",
        variant: "destructive",
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSkip = async () => {
    await handleCompleteSetup();
  };

  return (
    <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image 
            src="/crackon_logo_pngs-16.png" 
            alt="CrackOn" 
            width={300} 
            height={100}
            className="w-full max-w-[300px] h-auto" 
          />
        </div>

        {/* Calendar Connection Form */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center mb-2">Connect Your Calendar</h1>
          <p className="text-center text-gray-600 mb-6">
            Connect your calendar to sync events and receive reminders. You can skip this step and do it later.
          </p>

          <div className="space-y-4">
            {/* Google Calendar */}
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-center gap-3 h-14"
              onClick={() => handleConnectCalendar("google")}
              disabled={connectingProvider !== null}
            >
              {connectingProvider === "google" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
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
              <span>Connect Google Calendar</span>
            </Button>

            {/* Microsoft Calendar */}
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-center gap-3 h-14"
              onClick={() => handleConnectCalendar("microsoft")}
              disabled={connectingProvider !== null}
            >
              {connectingProvider === "microsoft" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#00A4EF">
                  <path d="M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.628h11.377V24H0zm12.623 0H24V24H12.623z"/>
                </svg>
              )}
              <span>Connect Microsoft Calendar</span>
            </Button>

            {/* Complete Setup Button */}
            <div className="pt-4 space-y-2">
              <Button
                type="button"
                className="w-full"
                onClick={handleCompleteSetup}
                disabled={isCompleting}
              >
                {isCompleting ? "Completing..." : "Complete Setup"}
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleSkip}
                disabled={isCompleting}
              >
                Skip for Now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CalendarConnectionPage() {
  return (
    <Suspense fallback={
      <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4">
        <div className="text-center">Loading...</div>
      </div>
    }>
      <CalendarConnectionForm />
    </Suspense>
  );
}


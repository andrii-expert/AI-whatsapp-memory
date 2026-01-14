"use client";

// Force dynamic rendering - this page requires authentication
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import { PhoneInput } from "@imaginecalendar/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@imaginecalendar/ui/select";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { WhatsAppVerificationSection } from "@/components/whatsapp-verification-section";
import { normalizePhoneNumber } from "@imaginecalendar/ui/phone-utils";
import { useAuth } from "@/hooks/use-auth";

// Component to handle phone saving and verification flow
function PhoneVerificationFlow({
  phoneNumber,
  userPhone,
  onVerified,
  savePhoneMutation,
}: {
  phoneNumber: string;
  userPhone?: string | null;
  onVerified: () => void;
  savePhoneMutation: any;
}) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const trpc = useTRPC();
  
  // Poll for verification status
  const { data: whatsappNumbers = [], refetch } = useQuery(
    trpc.whatsapp.getMyNumbers.queryOptions()
  );

  // Check if phone needs to be saved
  useEffect(() => {
    if (normalizedPhone && normalizedPhone !== userPhone && !phoneSaved && !isSaving) {
      setIsSaving(true);
      savePhoneMutation.mutate(
        { phone: normalizedPhone },
        {
          onSuccess: () => {
            setPhoneSaved(true);
            setIsSaving(false);
          },
          onError: () => {
            setIsSaving(false);
          },
        }
      );
    } else if (normalizedPhone === userPhone) {
      setPhoneSaved(true);
    }
  }, [normalizedPhone, userPhone, phoneSaved, isSaving, savePhoneMutation]);

  useEffect(() => {
    const verified = whatsappNumbers.some((num: any) => num.isVerified);
    if (verified) {
      onVerified();
    }
  }, [whatsappNumbers, onVerified]);

  // Poll every 3 seconds if not verified
  useEffect(() => {
    if (!phoneSaved) return;
    
    const interval = setInterval(() => {
      const verified = whatsappNumbers.some((num: any) => num.isVerified);
      if (!verified) {
        refetch();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [phoneSaved, whatsappNumbers, refetch]);

  if (!phoneSaved || isSaving) {
    return (
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-sm text-blue-800">
          {isSaving ? "Saving phone number..." : "Preparing verification..."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <WhatsAppVerificationSection
        phoneNumber={normalizedPhone}
        alwaysGenerateNewCode={true}
        redirectFrom="onboarding"
      />
    </div>
  );
}

function WhatsAppLinkingForm() {
  const router = useRouter();
  const { toast } = useToast();
  const trpc = useTRPC();
  
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const [phoneNumber, setPhoneNumber] = useState("");
  const [timezone, setTimezone] = useState("");
  const [utcOffset, setUtcOffset] = useState("");
  const [timezones, setTimezones] = useState<string[]>([]);
  const [isVerified, setIsVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // Fetch user data using useAuth
  const { user, isLoaded } = useAuth();

  // Fetch WhatsApp numbers
  const { data: whatsappNumbers = [], refetch: refetchNumbers } = useQuery(
    trpc.whatsapp.getMyNumbers.queryOptions()
  );

  // Redirect if user has already completed this step or is on wrong step
  useEffect(() => {
    if (!isLoaded) return;
    
    if (!user) {
      router.push("/sign-in");
      return;
    }

    // Default to 1 if setupStep is null/undefined
    const setupStep = user.setupStep ?? 1;

    // If setupStep is 2 or 3, redirect to appropriate page
    if (setupStep === 2) {
      router.push("/onboarding/calendar");
      return;
    } else if (setupStep === 3) {
      router.push("/dashboard");
      return;
    }
    // If setupStep is 1, stay on this page (correct step)
  }, [user, isLoaded, router]);

  // Check if user has verified WhatsApp
  useEffect(() => {
    const verified = whatsappNumbers.some((num: any) => num.isVerified);
    setIsVerified(verified);
  }, [whatsappNumbers]);

  // Fetch timezones
  useEffect(() => {
    const fetchTimezones = async () => {
      try {
        const response = await fetch("https://worldtimeapi.org/api/timezone");
        if (response.ok) {
          const data = await response.json();
          setTimezones(data);
        }
      } catch (error) {
        console.error("Failed to fetch timezones:", error);
      }
    };
    fetchTimezones();
  }, []);

  // Fetch UTC offset when timezone changes
  const { data: timezoneData } = useQuery(
    timezone ? trpc.user.getTimezoneDetails.queryOptions({ timezone }) : { enabled: false }
  );

  useEffect(() => {
    if (timezoneData?.utcOffset) {
      setUtcOffset(timezoneData.utcOffset);
    }
  }, [timezoneData]);

  // Save phone number mutation
  const savePhoneMutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: () => {
        // Phone saved, verification section will handle the rest
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to save phone number",
          variant: "destructive",
        });
      },
    })
  );

  // Update user mutation for timezone
  const updateUserMutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Settings saved!",
          description: "Your WhatsApp number and timezone have been saved.",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to save settings",
          variant: "destructive",
        });
      },
    })
  );

  // NOW we can have conditional returns after all hooks are called
  // Show loading if user data is not loaded
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
  if (setupStep !== 1) {
    return (
      <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  const handleNext = async () => {
    if (!isVerified) {
      toast({
        title: "WhatsApp not verified",
        description: "Please verify your WhatsApp number before continuing.",
        variant: "destructive",
      });
      return;
    }

    if (!timezone) {
      toast({
        title: "Timezone required",
        description: "Please select your timezone.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Update user timezone and set setupStep to 2 (Calendar setup required)
      await updateUserMutation.mutateAsync({
        timezone,
        utcOffset,
        setupStep: 2, // Move to next step: Calendar setup
      });

      // Redirect to calendar connection page
      router.push("/onboarding/calendar");
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Title */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Link WhatsApp</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              In order to maximise CrackOn and all its features, link and verify your WhatsApp number below
            </p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {/* Phone Number Input */}
            <div>
              <Label htmlFor="phone" className="text-sm font-medium text-gray-700 mb-2 block">
                Phone Number
              </Label>
              <div className="flex gap-2">
                <PhoneInput
                  id="phone"
                  value={phoneNumber}
                  onChange={(value) => {
                    setPhoneNumber(value);
                    setShowVerification(false);
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={async () => {
                    if (!phoneNumber) {
                      toast({
                        title: "Phone number required",
                        description: "Please enter your phone number first.",
                        variant: "destructive",
                      });
                      return;
                    }

                    setIsSavingPhone(true);
                    const normalizedPhone = normalizePhoneNumber(phoneNumber);
                    
                    try {
                      await savePhoneMutation.mutateAsync({ phone: normalizedPhone });
                      setShowVerification(true);
                      toast({
                        title: "Phone number saved",
                        description: "Now verify your number to continue.",
                        variant: "success",
                      });
                    } catch (error: any) {
                      toast({
                        title: "Error",
                        description: error?.message || "Failed to save phone number",
                        variant: "destructive",
                      });
                    } finally {
                      setIsSavingPhone(false);
                    }
                  }}
                  disabled={!phoneNumber || isSavingPhone}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                >
                  {isSavingPhone ? "Saving..." : "Verify"}
                </Button>
              </div>
            </div>

            {/* WhatsApp Verification - Show after clicking Verify button */}
            {showVerification && phoneNumber && (
              <PhoneVerificationFlow
                phoneNumber={phoneNumber}
                userPhone={user?.phone}
                onVerified={() => {
                  setIsVerified(true);
                  refetchNumbers();
                  toast({
                    title: "WhatsApp verified!",
                    description: "Your WhatsApp number has been successfully verified. You can continue to the next step.",
                    variant: "success",
                  });
                }}
                savePhoneMutation={savePhoneMutation}
              />
            )}

            {/* Timezone Selection */}
            <div>
              <Label htmlFor="timezone" className="text-sm font-medium text-gray-700 mb-2 block">
                Timezone
              </Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select your timezone" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Next Step Button */}
            <div className="pt-2">
              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-base font-medium"
                onClick={handleNext}
                disabled={!isVerified || !timezone || isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Next Step"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Promotional Content */}
      <div className="hidden lg:flex lg:flex-1 bg-blue-600 items-center justify-center p-12 relative overflow-hidden">
        <div className="max-w-lg space-y-8 z-10">
          {/* Main Heading */}
          <h2 className="text-5xl font-bold text-white leading-tight">
            REMIND.<br />
            ORGANISE.<br />
            CRACKON.
          </h2>

          {/* Phone Illustration */}
          <div className="relative">
            <div className="bg-white rounded-[2.5rem] p-4 shadow-2xl transform rotate-3">
              <div className="bg-gray-100 rounded-[2rem] overflow-hidden">
                {/* WhatsApp Interface Mockup */}
                <div className="bg-white h-[500px] flex flex-col">
                  {/* Header */}
                  <div className="bg-green-600 text-white p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">WhatsApp</h3>
                    </div>
                    <div className="bg-white/20 rounded-lg px-3 py-2 text-sm">
                      Q Ask Meta AI or Search
                    </div>
                  </div>
                  
                  {/* Filter Tabs */}
                  <div className="flex gap-2 p-3 bg-gray-50 border-b">
                    <span className="px-3 py-1 bg-white rounded-full text-xs font-medium">All</span>
                    <span className="px-3 py-1 text-xs text-gray-600">Unread</span>
                    <span className="px-3 py-1 text-xs text-gray-600">Favourites</span>
                    <span className="px-3 py-1 text-xs text-gray-600">Groups</span>
                  </div>
                  
                  {/* Chat List */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-xl">⚙️</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">CrackOn</span>
                          <span className="text-xs text-gray-500">13:34</span>
                        </div>
                        <p className="text-xs text-gray-500">Scheduled event</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">Grant</span>
                          <span className="text-xs text-gray-500">12:15</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">Paul</span>
                          <span className="text-xs text-gray-500">11:22</span>
                        </div>
                        <p className="text-xs text-gray-500">Reminder</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">Talita</span>
                          <span className="text-xs text-gray-500">Yesterday</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">Jane</span>
                          <span className="text-xs text-gray-500">Yesterday</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">Marie</span>
                          <span className="text-xs text-gray-500">2 days ago</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Bottom Navigation */}
                  <div className="flex justify-around border-t bg-gray-50 p-2">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 bg-green-600 rounded-full mb-1"></div>
                      <span className="text-xs text-green-600 font-medium">Chats</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 bg-gray-400 rounded-full mb-1"></div>
                      <span className="text-xs text-gray-500">Updates</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 bg-gray-400 rounded-full mb-1"></div>
                      <span className="text-xs text-gray-500">Communities</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 bg-gray-400 rounded-full mb-1"></div>
                      <span className="text-xs text-gray-500">Calls</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-white text-lg leading-relaxed">
            CrackOn is your smart WhatsApp friend that helps you stay organised without leaving your favourite chat app.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppLinkingPage() {
  // This page must be client-side only due to useAuth hook
  return <WhatsAppLinkingForm />;
}


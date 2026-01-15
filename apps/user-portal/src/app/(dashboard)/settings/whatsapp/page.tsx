"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Home, ChevronLeft, CheckCircle2, Edit2, X, Check, Calendar } from "lucide-react";
import { WhatsAppVerificationSection } from "@/components/whatsapp-verification-section";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import { Badge } from "@imaginecalendar/ui/badge";
import { PhoneInput } from "@imaginecalendar/ui/phone-input";
import { Checkbox } from "@imaginecalendar/ui/checkbox";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { normalizePhoneNumber } from "@imaginecalendar/ui/phone-utils";
import { cn } from "@imaginecalendar/ui/cn";

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
  const [hasNotifiedVerified, setHasNotifiedVerified] = useState(false);
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
    // Call onVerified only once, when we first detect verification
    if (verified && !hasNotifiedVerified) {
      setHasNotifiedVerified(true);
      onVerified();
    }
  }, [whatsappNumbers, onVerified, hasNotifiedVerified]);

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
      <div className="mt-4 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs sm:text-sm text-blue-800">
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
        redirectFrom="settings"
      />
    </div>
  );
}

function WhatsAppVerificationPageContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectFrom = searchParams.get("from");
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // Fetch current user data to get phone number
  const { data: user, isLoading: userLoading, error: userError } = useQuery(
    trpc.user.me.queryOptions()
  );

  // Fetch connected WhatsApp numbers with polling to detect verification completion
  const { data: whatsappNumbers = [], isLoading: numbersLoading, error: numbersError, refetch: refetchNumbers } = useQuery({
    ...trpc.whatsapp.getMyNumbers.queryOptions(),
    // Poll every 5 seconds if user has unverified WhatsApp number
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const hasUnverified = data?.some((num: any) => !num.isVerified);
      return hasUnverified ? 5000 : false; // Poll every 5s if unverified, stop if all verified
    },
  });

  const isLoading = userLoading || numbersLoading;
  const hasError = userError || numbersError;

  // Check onboarding status and redirect if needed (only if not already in onboarding flow)
  useEffect(() => {
    if (isLoading || !user || redirectFrom === "onboarding") return;

    // If email not verified, redirect to email verification
    if (!user.emailVerified) {
      router.push("/verify-email");
      return;
    }

    // If email verified but no WhatsApp number or timezone, redirect to onboarding
    const hasVerifiedWhatsApp = whatsappNumbers?.some((num: any) => num.isVerified);
    const hasPhone = user.phone;
    const hasTimezone = user.timezone;

    // Only redirect if completely missing (not just unverified)
    // Allow users to be on settings page even if not verified, as long as they have a phone number
    if (!hasPhone && !hasTimezone && !hasVerifiedWhatsApp) {
      router.push("/onboarding/whatsapp");
      return;
    }
  }, [user, whatsappNumbers, isLoading, router, redirectFrom]);

  // Find verified WhatsApp number
  const verifiedNumber = whatsappNumbers?.find((num: any) => num.isVerified) || whatsappNumbers?.[0];

  // Initialize phone number from user data or verified WhatsApp number
  useEffect(() => {
    if (user?.phone && !phoneNumber) {
      setPhoneNumber(user.phone);
    }
    const verifiedNum = whatsappNumbers.find((num: any) => num.isVerified);
    if (verifiedNum?.phoneNumber && !phoneNumber) {
      setPhoneNumber(verifiedNum.phoneNumber);
    }
  }, [user?.phone, whatsappNumbers, phoneNumber]);

  // Check if user has verified WhatsApp
  useEffect(() => {
    const verified = whatsappNumbers.some((num: any) => num.isVerified);
    setIsVerified(verified);
    // If already verified, hide verification section
    if (verified) {
      setShowVerification(false);
    }
  }, [whatsappNumbers]);

  // Fetch connected calendars
  const { data: calendars = [], isLoading: calendarsLoading } = useQuery(
    trpc.calendar.list.queryOptions()
  );

  // Fetch user preferences for WhatsApp calendar selection
  const { data: preferences, isLoading: preferencesLoading } = useQuery(
    trpc.preferences.get.queryOptions()
  );

  // WhatsApp calendar selection state
  const [selectedWhatsAppCalendars, setSelectedWhatsAppCalendars] = useState<string[]>([]);
  const [isUpdatingCalendars, setIsUpdatingCalendars] = useState(false);

  // Update selected calendars when preferences load
  React.useEffect(() => {
    if (preferences && preferences.whatsappCalendarIds && Array.isArray(preferences.whatsappCalendarIds) && preferences.whatsappCalendarIds.length > 0) {
      setSelectedWhatsAppCalendars(preferences.whatsappCalendarIds as string[]);
    } else {
      // Default to all active calendars if none selected
      const activeCalendars = calendars.filter((cal: any) => cal.isActive);
      setSelectedWhatsAppCalendars(activeCalendars.map(cal => cal.id));
    }
  }, [preferences, calendars]);

  // Update WhatsApp calendar selection
  const updateWhatsAppCalendarsMutation = useMutation(
    trpc.preferences.update.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Calendars updated",
          description: `Selected ${selectedWhatsAppCalendars.length} calendar${selectedWhatsAppCalendars.length === 1 ? '' : 's'} for WhatsApp events.`,
          variant: "success",
        });
        setIsUpdatingCalendars(false);
        queryClient.invalidateQueries({ queryKey: trpc.preferences.get.queryKey() });
      },
      onError: (error) => {
        toast({
          title: "Update failed",
          description: error.message || "Failed to update calendar selection.",
          variant: "error",
          duration: 3500,
        });
        setIsUpdatingCalendars(false);
      },
    })
  );

  const handleUpdateWhatsAppCalendars = () => {
    if (selectedWhatsAppCalendars.length === 0) {
      toast({
        title: "No calendars selected",
        description: "Please select at least one calendar for WhatsApp events.",
        variant: "error",
        duration: 3500,
      });
      return;
    }

    setIsUpdatingCalendars(true);
    updateWhatsAppCalendarsMutation.mutate({
      reminders: {
        whatsappCalendarIds: selectedWhatsAppCalendars,
      },
    });
  };

  // Save phone number mutation
  const savePhoneMutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: () => {
        // Phone saved, verification section will handle the rest
      },
      onError: (error) => {
        // Error handling without toast
        console.error("Failed to save phone number:", error);
      },
    })
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex min-h-screen flex-col lg:flex-row">
        <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12 min-h-screen lg:min-h-0">
          <div className="w-full max-w-md space-y-6 sm:space-y-8 py-4 sm:py-8">
            <div className="text-center">
              <p className="text-destructive mb-4">
                {userError ? "Failed to load user data." : "Failed to load WhatsApp numbers."}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  if (userError) {
                    queryClient.invalidateQueries({ queryKey: trpc.user.me.queryKey() });
                  }
                  if (numbersError) {
                    refetchNumbers();
                  }
                }}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
        <div className="hidden lg:flex lg:w-1/2 bg-blue-600 flex-col items-center justify-center p-8 xl:p-12 relative overflow-hidden">
          <div className="text-center mb-6 xl:mb-8">
            <h2 className="text-3xl xl:text-4xl font-bold text-white tracking-wide mb-4">
              REMIND. ORGANISE. CRACKON.
            </h2>
          </div>
          <div className="relative mb-6 xl:mb-8 flex justify-center">
            <Image
              src="/phone.png"
              alt="WhatsApp Phone Mockup"
              width={300}
              height={600}
              className="w-auto h-auto max-w-[250px] xl:max-w-[300px] object-contain"
              priority
            />
          </div>
          <div className="text-center max-w-md px-4">
            <p className="text-white text-base xl:text-lg leading-relaxed">
              CrackOn is your smart WhatsApp friend that helps you stay organised without leaving your favourite chat app.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md space-y-6 sm:space-y-8 py-4 sm:py-8">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">Link WhatsApp</h1>
            <p className="text-gray-600 text-md leading-relaxed mb-3">
              Maximise CrackOn and all its features, link and verify your WhatsApp number below
            </p>
          </div>

          {/* Form */}
          <div className="space-y-4 sm:space-y-6">
            {/* Phone Number Input - Hide when verified */}
            {!isVerified && (
              <div>
                <Label htmlFor="phone" className="text-sm font-medium text-gray-700 mb-2 block">
                  WhatsApp Number
                </Label>
                <div className="flex gap-2 relative">
                  <div className="flex-1">
                    <PhoneInput
                      id="phone"
                      value={phoneNumber}
                      onChange={(value) => {
                        setPhoneNumber(value);
                        setShowVerification(false);
                      }}
                      className="w-full"
                      disabled={isVerified}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!phoneNumber || !phoneNumber.trim()) {
                        return;
                      }

                      // Validate phone number has at least some digits
                      const digitsOnly = phoneNumber.replace(/\D/g, '');
                      if (digitsOnly.length < 7) {
                        return;
                      }

                      setIsSavingPhone(true);
                      const normalizedPhone = normalizePhoneNumber(phoneNumber);
                      
                      // Double-check normalized phone is valid
                      if (!normalizedPhone || normalizedPhone === '+' || normalizedPhone.length < 8) {
                        setIsSavingPhone(false);
                        return;
                      }
                      
                      try {
                        await savePhoneMutation.mutateAsync({ phone: normalizedPhone });
                        setShowVerification(true);
                      } catch (error: any) {
                        console.error("Error saving phone number:", error);
                      } finally {
                        setIsSavingPhone(false);
                      }
                    }}
                    disabled={!phoneNumber || isSavingPhone || isVerified}
                    className={cn(
                      "whitespace-nowrap h-8 px-4 sm:px-8 absolute right-[2px] top-[7px]",
                      isVerified 
                        ? "bg-green-600 hover:bg-green-700 text-white cursor-default" 
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    )}
                  >
                    {isSavingPhone ? "Saving..." : isVerified ? "Verified" : "Get code"}
                  </Button>
                </div>
              </div>
            )}

            {/* WhatsApp Verification - Show after clicking Get code button, but hide when verified */}
            {showVerification && phoneNumber && !isVerified && (
              <PhoneVerificationFlow
                phoneNumber={phoneNumber}
                userPhone={user?.phone}
                onVerified={() => {
                  setIsVerified(true);
                  setShowVerification(false); // Hide verification section when verified
                  refetchNumbers();
                }}
                savePhoneMutation={savePhoneMutation}
              />
            )}

            {/* WhatsApp Verification Success Message - Show only when verified */}
            {isVerified && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-green-800 leading-relaxed">
                      Congratulations, WhatsApp is now connected.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* WhatsApp Calendar Selection - Only show when verified */}
            {isVerified && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">
                    WhatsApp Calendar Selection
                  </Label>
                  <p className="text-xs text-gray-600 mb-3">
                    Choose which calendars you want to use for creating events via WhatsApp.
                  </p>
                  {calendarsLoading || preferencesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-pulse text-sm text-gray-500">Loading calendars...</div>
                    </div>
                  ) : calendars.filter((cal: any) => cal.isActive).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border border-gray-200 rounded-lg">
                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No active calendars found.</p>
                      <p className="text-xs mt-1">Please connect a calendar first.</p>
                      <Link
                        href="/calendars"
                        className="text-blue-600 hover:text-blue-700 font-medium mt-2 inline-block text-sm"
                      >
                        Go to Calendar Settings
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {calendars
                        .filter((cal: any) => cal.isActive)
                        .map((calendar: any) => (
                          <div
                            key={calendar.id}
                            className={`flex items-start space-x-3 p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                              selectedWhatsAppCalendars.includes(calendar.id)
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                            onClick={() => {
                              if (selectedWhatsAppCalendars.includes(calendar.id)) {
                                setSelectedWhatsAppCalendars(prev => prev.filter(id => id !== calendar.id));
                              } else {
                                setSelectedWhatsAppCalendars(prev => [...prev, calendar.id]);
                              }
                            }}
                          >
                            <Checkbox
                              id={`whatsapp-calendar-${calendar.id}`}
                              checked={selectedWhatsAppCalendars.includes(calendar.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedWhatsAppCalendars(prev => [...prev, calendar.id]);
                                } else {
                                  setSelectedWhatsAppCalendars(prev => prev.filter(id => id !== calendar.id));
                                }
                              }}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <Label
                                htmlFor={`whatsapp-calendar-${calendar.id}`}
                                className="flex items-center gap-2 font-medium cursor-pointer text-sm"
                              >
                                {calendar.calendarName || calendar.email}
                                {selectedWhatsAppCalendars.includes(calendar.id) && (
                                  <Check className="h-4 w-4 text-blue-600" />
                                )}
                              </Label>
                              <p className="text-xs text-muted-foreground mt-1">
                                {calendar.email}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary" className="text-xs">
                                  {calendar.provider === "google" ? "Google" : "Microsoft"}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                  {calendars.filter((cal: any) => cal.isActive).length > 0 && (
                    <div className="flex justify-end pt-4 border-t">
                      <Button
                        onClick={handleUpdateWhatsAppCalendars}
                        disabled={
                          selectedWhatsAppCalendars.length === 0 ||
                          isUpdatingCalendars ||
                          updateWhatsAppCalendarsMutation.isPending
                        }
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {isUpdatingCalendars || updateWhatsAppCalendarsMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Saving...
                          </>
                        ) : (
                          "Save Calendar Selection"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Side - Promotional Content */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-600 flex-col items-center justify-center p-8 xl:p-12 relative overflow-hidden">
        {/* Slogan */}
        <div className="text-center mb-6 xl:mb-8">
          <h2 className="text-3xl xl:text-4xl font-bold text-white tracking-wide mb-4">
            REMIND. ORGANISE. CRACKON.
          </h2>
        </div>

        {/* WhatsApp Phone Image */}
        <div className="relative mb-6 xl:mb-8 flex justify-center">
          <Image
            src="/phone.png"
            alt="WhatsApp Phone Mockup"
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

export default function WhatsAppVerificationPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Loading...</div>
      </div>
    }>
      <WhatsAppVerificationPageContent />
    </Suspense>
  );
}

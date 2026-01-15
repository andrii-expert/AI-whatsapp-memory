"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { WhatsAppVerificationSection } from "@/components/whatsapp-verification-section";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Button } from "@imaginecalendar/ui/button";
import { Label } from "@imaginecalendar/ui/label";
import { Badge } from "@imaginecalendar/ui/badge";
import { PhoneInput } from "@imaginecalendar/ui/phone-input";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { normalizePhoneNumber } from "@imaginecalendar/ui/phone-utils";

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
    // Check if the specific phone number is verified
    const verified = whatsappNumbers.some((num: any) => 
      num.isVerified && normalizePhoneNumber(num.phoneNumber) === normalizedPhone
    );
    // Call onVerified only once, when we first detect verification
    if (verified && !hasNotifiedVerified) {
      setHasNotifiedVerified(true);
      onVerified();
    }
  }, [whatsappNumbers, onVerified, hasNotifiedVerified, normalizedPhone]);

  // Poll every 3 seconds if not verified
  useEffect(() => {
    if (!phoneSaved) return;
    
    const interval = setInterval(() => {
      const verified = whatsappNumbers.some((num: any) => 
        num.isVerified && normalizePhoneNumber(num.phoneNumber) === normalizedPhone
      );
      if (!verified) {
        refetch();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [phoneSaved, whatsappNumbers, refetch, normalizedPhone]);

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
  const [showChangeNumberForm, setShowChangeNumberForm] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState<string | null>(null);

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

  // Calculate display phone number (must be defined before useEffects that use it)
  const displayPhone = verifiedNumber?.phoneNumber || user?.phone || "";

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

  // Check if user has verified WhatsApp - check for the current or new phone number
  useEffect(() => {
    // If we have a new phone number being verified, check verification for that number
    if (newPhoneNumber) {
      const newPhoneNormalized = normalizePhoneNumber(newPhoneNumber);
      const verified = whatsappNumbers.some((num: any) => 
        num.isVerified && normalizePhoneNumber(num.phoneNumber) === newPhoneNormalized
      );
      setIsVerified(verified);
      // If new number is verified, hide verification section
      if (verified) {
        setShowVerification(false);
      }
      return;
    }

    // Otherwise, check verification for the current display phone number
    if (!displayPhone) {
      setIsVerified(false);
      return;
    }

    const currentPhoneNormalized = normalizePhoneNumber(displayPhone);
    const verified = whatsappNumbers.some((num: any) => 
      num.isVerified && normalizePhoneNumber(num.phoneNumber) === currentPhoneNormalized
    );
    
    setIsVerified(verified);
    
    // If already verified for current number, hide verification section
    if (verified) {
      setShowVerification(false);
    }
  }, [whatsappNumbers, displayPhone, newPhoneNumber]);

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

  // Format phone number for display (e.g., +27-825648508)
  const formatPhoneForDisplay = (phone: string) => {
    if (!phone) return "";
    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, "");
    // Format as +XX-XXXXXXXXX (country code + rest)
    if (cleaned.startsWith("+")) {
      const countryCode = cleaned.match(/^\+\d{1,3}/)?.[0] || "";
      const rest = cleaned.slice(countryCode.length);
      if (rest.length > 0) {
        return `${countryCode}-${rest}`;
      }
      return countryCode;
    }
    return cleaned;
  };

  const formattedPhone = formatPhoneForDisplay(displayPhone);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="min-h-screen bg-white p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
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
    );
  }

  return (
    <div className="bg-white">
      <div className="max-w-2xl mx-auto">
        {/* Header with Back Button */}
        <div className="flex items-center gap-3 mb-6 p-4 sm:p-6 shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)] rounded-xl">
          {/* <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="h-10 w-10 rounded-lg bg-gray-100 hover:bg-gray-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button> */}
          <h1 className="text-xl font-bold text-gray-900">WhatsApp settings</h1>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-8 px-4 sm:px-6">
          Manage your WhatsApp connection and verify your phone number
        </p>

        {/* WhatsApp Number Section */}
        <div className="mb-8 px-4 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">WhatsApp Number</h2>
          {displayPhone ? (
            <div className="relative">
              <div className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg bg-white">
                <span className="text-base text-gray-900">{formattedPhone}</span>
                {isVerified && (
                  <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1.5 px-2.5 py-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Verified</span>
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 border border-gray-200 rounded-lg bg-gray-50">
              <span className="text-base text-gray-400">No phone number added</span>
            </div>
          )}
        </div>

        {/* Change Number Form - Show when clicking Change number button */}
        {showChangeNumberForm && !showVerification && (
          <div className="mb-8 px-4 sm:px-6">
            <Label htmlFor="new-phone" className="text-sm font-medium text-gray-700 mb-2 block">
              WhatsApp Number
            </Label>
            <div className="flex gap-2 relative">
              <div className="flex-1">
                <PhoneInput
                  id="new-phone"
                  value={phoneNumber}
                  onChange={(value) => {
                    setPhoneNumber(value);
                    setShowVerification(false);
                  }}
                  className="w-full"
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

                  // Check if the phone number is actually different
                  const currentPhone = normalizePhoneNumber(displayPhone);
                  if (normalizedPhone === currentPhone) {
                    setIsSavingPhone(false);
                    toast({
                      title: "No change",
                      description: "This is already your current phone number.",
                      variant: "default",
                    });
                    setShowChangeNumberForm(false);
                    return;
                  }
                  
                  try {
                    await savePhoneMutation.mutateAsync({ phone: normalizedPhone });
                    // Set the new phone number and reset verification status
                    setNewPhoneNumber(normalizedPhone);
                    setIsVerified(false);
                    setShowVerification(true);
                    setShowChangeNumberForm(false);
                    // Invalidate queries to get fresh data
                    await queryClient.invalidateQueries({ queryKey: trpc.user.me.queryKey() });
                    await refetchNumbers();
                  } catch (error: any) {
                    toast({
                      title: "Error",
                      description: error?.message || "Failed to update phone number",
                      variant: "destructive",
                    });
                  } finally {
                    setIsSavingPhone(false);
                  }
                }}
                disabled={!phoneNumber || isSavingPhone}
                className="whitespace-nowrap h-8 px-4 sm:px-8 absolute right-[2px] top-[7px] bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSavingPhone ? "Saving..." : "Get code"}
              </Button>
            </div>
          </div>
        )}

        {/* WhatsApp Verification - Show after clicking Get code button, but hide when verified */}
        {showVerification && (newPhoneNumber || phoneNumber) && (
          <PhoneVerificationFlow
            phoneNumber={newPhoneNumber || phoneNumber}
            userPhone={user?.phone}
            onVerified={() => {
              setIsVerified(true);
              setShowVerification(false); // Hide verification section when verified
              setNewPhoneNumber(null);
              // Invalidate queries to get fresh data
              queryClient.invalidateQueries({ queryKey: trpc.user.me.queryKey() });
              refetchNumbers();
              toast({
                title: "WhatsApp verified!",
                description: "Your WhatsApp number has been successfully verified.",
                variant: "success",
              });
            }}
            savePhoneMutation={savePhoneMutation}
          />
        )}

        {/* WhatsApp Verification Success Message - Show only when verified */}
        {isVerified && displayPhone && (
          <div className="mb-8 px-4 sm:px-6 bg-green-50 border border-green-200 rounded-md">
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

        {/* Change/Add Number Button */}
        {!showVerification && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => {
                if (showChangeNumberForm) {
                  setShowChangeNumberForm(false);
                  setPhoneNumber(displayPhone);
                  setNewPhoneNumber(null);
                } else {
                  setShowChangeNumberForm(true);
                  setPhoneNumber(displayPhone);
                }
              }}
              className="w-full sm:w-auto min-w-[200px] border-gray-300 text-gray-900 hover:bg-gray-50 hover:text-gray-900 font-normal hover:font-semibold transition-all"
            >
              {showChangeNumberForm ? "Cancel" : displayPhone ? "Change number" : "Add number"}
            </Button>
          </div>
        )}
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

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
import { OnboardingLoading } from "@/components/onboarding-loading";
import { cn } from "@imaginecalendar/ui/cn";
import { countryCodes, type CountryCode } from "@imaginecalendar/ui/country-codes";
import { 
  getTimezonesForCountry, 
  getCountryFromTimezone,
  getTimezoneDetailsForCountry,
  getTimezoneDisplayName,
  getTimezoneUtcOffset,
  type TimezoneInfo
} from "@/utils/country-timezones";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@imaginecalendar/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@imaginecalendar/ui/command";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

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
  const [selectedCountry, setSelectedCountry] = useState<CountryCode | null>(null);
  const [timezone, setTimezone] = useState("");
  const [utcOffset, setUtcOffset] = useState("");
  const [availableTimezones, setAvailableTimezones] = useState<string[]>([]);
  const [isVerified, setIsVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [countrySelectorOpen, setCountrySelectorOpen] = useState(false);

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

    // If setupStep is 2, 3, or 4, redirect to appropriate page
    if (setupStep === 2) {
      router.push("/onboarding/calendar");
      return;
    } else if (setupStep === 3) {
      router.push("/onboarding/billing");
      return;
    } else if (setupStep === 4) {
      router.push("/dashboard");
      return;
    }
    // If setupStep is 1, stay on this page (correct step)
  }, [user, isLoaded, router]);

  // Initialize phone number from user data or verified WhatsApp number
  useEffect(() => {
    if (user?.phone && !phoneNumber) {
      setPhoneNumber(user.phone);
    }
    const verifiedNumber = whatsappNumbers.find((num: any) => num.isVerified);
    if (verifiedNumber?.phoneNumber && !phoneNumber) {
      setPhoneNumber(verifiedNumber.phoneNumber);
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

  // Initialize country from existing timezone or default to South Africa
  useEffect(() => {
    if (timezone && !selectedCountry) {
      const countryCode = getCountryFromTimezone(timezone);
      if (countryCode) {
        const country = countryCodes.find((c: CountryCode) => c.code === countryCode);
        if (country) {
          setSelectedCountry(country);
          setAvailableTimezones(getTimezonesForCountry(countryCode));
        }
      }
    } else if (!selectedCountry) {
      // Default to South Africa
      const defaultCountry = countryCodes.find((c: CountryCode) => c.code === "ZA");
      if (defaultCountry) {
        setSelectedCountry(defaultCountry);
        setAvailableTimezones(getTimezonesForCountry("ZA"));
      }
    }
  }, [timezone, selectedCountry]);

  // Update available timezones when country changes
  useEffect(() => {
    if (selectedCountry) {
      const timezones = getTimezonesForCountry(selectedCountry.code);
      setAvailableTimezones(timezones);
      // If current timezone is not in the new country's timezones, clear it
      if (timezone && !timezones.includes(timezone)) {
        setTimezone("");
        setUtcOffset("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry]);

  // Fetch UTC offset when timezone changes
  const timezoneQueryOptions = timezone 
    ? trpc.user.getTimezoneDetails.queryOptions({ timezone })
    : null;
  const { data: timezoneData } = useQuery(
    timezoneQueryOptions || {
      queryKey: ["timezone-details"],
      queryFn: async () => ({ timezone: null, utcOffset: null }),
      enabled: false,
    }
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
    return <OnboardingLoading />;
  }

  // Default to 1 if setupStep is null/undefined
  const setupStep = user.setupStep ?? 1;
  
  // If user is on wrong step, show loading (redirect will happen in useEffect)
  if (setupStep !== 1) {
    return <OnboardingLoading />;
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
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md space-y-6 sm:space-y-8 py-4 sm:py-8">
          {/* Title */}
          <div className="text-center">
            <p className="text-md font-medium tracking-wide text-gray-400 mb-1">
              Step 2 of 4
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">Link WhatsApp</h1>
            <p className="text-gray-600 text-md leading-relaxed mb-3">
              Maximise CrackOn and all its features, link and verify your WhatsApp number below
            </p>
          </div>

          {/* Form */}
          <div className="space-y-4 sm:space-y-6">
            {/* Phone Number Input */}
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
                      // Extract error message from tRPC error
                      const errorMessage = error?.message || error?.data?.message || "Failed to save phone number";
                      toast({
                        title: "Error",
                        description: errorMessage,
                        variant: "destructive",
                      });
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

            {/* WhatsApp Verification - Show after clicking Get code button, but hide when verified */}
            {showVerification && phoneNumber && !isVerified && (
              <PhoneVerificationFlow
                phoneNumber={phoneNumber}
                userPhone={user?.phone}
                onVerified={() => {
                  setIsVerified(true);
                  setShowVerification(false); // Hide verification section when verified
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
              <div className="flex gap-0 border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                {/* Country Selector */}
                <Popover open={countrySelectorOpen} onOpenChange={setCountrySelectorOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      role="combobox"
                      aria-expanded={countrySelectorOpen}
                      className={cn(
                        "h-10 px-3 py-2 border-0 border-r border-gray-300 rounded-none font-normal hover:bg-gray-50 focus:ring-0",
                        !selectedCountry && "text-muted-foreground"
                      )}
                      type="button"
                    >
                      {selectedCountry ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-lg">{selectedCountry.flag}</span>
                          <span className="text-sm hidden sm:inline text-gray-700">{selectedCountry.name}</span>
                        </span>
                      ) : (
                        <span>Select country...</span>
                      )}
                      <ChevronDownIcon className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search country..." className="h-9" />
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        <CommandList className="max-h-[300px] overflow-y-auto">
                          {countryCodes.map((country: CountryCode) => (
                            <CommandItem
                              key={country.code}
                              value={`${country.name} ${country.code}`}
                              onSelect={() => {
                                setSelectedCountry(country);
                                setCountrySelectorOpen(false);
                              }}
                            >
                              <span className="flex items-center gap-2 flex-1">
                                <span className="text-lg">{country.flag}</span>
                                <span className="flex-1">{country.name}</span>
                              </span>
                              <CheckIcon
                                className={cn(
                                  "ml-2 h-4 w-4",
                                  selectedCountry?.code === country.code
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandList>
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Timezone Selector */}
                <Select 
                  value={timezone || undefined} 
                  onValueChange={(value) => {
                    // Only set timezone if value is not empty
                    if (value && value.trim() !== "") {
                      setTimezone(value);
                    } else {
                      setTimezone("");
                    }
                  }}
                  disabled={!selectedCountry || availableTimezones.length === 0}
                >
                  <SelectTrigger className="flex-1 border-0 rounded-none focus:ring-0">
                    <SelectValue placeholder={selectedCountry ? "Select timezone" : "Select country first"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {availableTimezones.length > 0 ? (
                      availableTimezones
                        .filter((tz) => tz && tz.trim() !== "") // Filter out empty or invalid timezones
                        .map((tz) => {
                          // Double-check we have a valid non-empty value
                          if (!tz || tz.trim() === "") {
                            return null;
                          }
                          
                          // Use detailed timezone information if available
                          const tzDetails = getTimezoneDetailsForCountry(selectedCountry?.code || "");
                          const tzInfo = tzDetails?.timezones.find((info) => info.timezone === tz);
                          
                          // Get display name with UTC offset if available
                          const displayName = tzInfo 
                            ? `${tzInfo.displayName} (${tzInfo.utcOffset})`
                            : getTimezoneDisplayName(tz);
                          
                          return (
                            <SelectItem key={tz} value={tz}>
                              {displayName}
                            </SelectItem>
                          );
                        })
                        .filter(Boolean) // Remove any null values
                    ) : (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
                        {selectedCountry ? "No timezones available for this country" : "Please select a country first"}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Next Step Button */}
            <div className="pt-2">
              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 sm:py-6 text-sm sm:text-base font-medium"
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

export default function WhatsAppLinkingPage() {
  // This page must be client-side only due to useAuth hook
  return <WhatsAppLinkingForm />;
}



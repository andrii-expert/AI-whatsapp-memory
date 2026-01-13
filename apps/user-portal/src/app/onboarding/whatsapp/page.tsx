"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@imaginecalendar/ui/select";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { WhatsAppVerificationSection } from "@/components/whatsapp-verification-section";
import { normalizePhoneNumber } from "@imaginecalendar/ui/phone-utils";

function WhatsAppLinkingForm() {
  const router = useRouter();
  const { toast } = useToast();
  const trpc = useTRPC();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [timezone, setTimezone] = useState("");
  const [utcOffset, setUtcOffset] = useState("");
  const [timezones, setTimezones] = useState<string[]>([]);
  const [isVerified, setIsVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch user data
  const { data: user } = useQuery(trpc.user.me.queryOptions());

  // Fetch WhatsApp numbers
  const { data: whatsappNumbers = [], refetch: refetchNumbers } = useQuery(
    trpc.whatsapp.getMyNumbers.queryOptions()
  );

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

  // Update user mutation
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
      // Update user timezone
      await updateUserMutation.mutateAsync({
        timezone,
        utcOffset,
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

        {/* WhatsApp Linking Form */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center mb-2">Link Your WhatsApp</h1>
          <p className="text-center text-gray-600 mb-6">
            Connect your WhatsApp number to receive notifications and reminders.
          </p>

          <div className="space-y-6">
            {/* Phone Number Input */}
            <div>
              <Label htmlFor="phone">WhatsApp Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Include country code (e.g., +1 for US, +27 for South Africa)
              </p>
            </div>

            {/* WhatsApp Verification */}
            {phoneNumber && (
              <div className="mt-4">
                <WhatsAppVerificationSection
                  phoneNumber={normalizePhoneNumber(phoneNumber)}
                  alwaysGenerateNewCode={true}
                />
              </div>
            )}

            {/* Timezone Selection */}
            <div>
              <Label htmlFor="timezone">Timezone *</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="mt-1">
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
            <div className="pt-4">
              <Button
                type="button"
                className="w-full"
                onClick={handleNext}
                disabled={!isVerified || !timezone || isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Next Step"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppLinkingPage() {
  return (
    <Suspense fallback={
      <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4">
        <div className="text-center">Loading...</div>
      </div>
    }>
      <WhatsAppLinkingForm />
    </Suspense>
  );
}


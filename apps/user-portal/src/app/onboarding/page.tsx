"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Input } from "@imaginecalendar/ui/input";
import { PhoneInput } from "@imaginecalendar/ui/phone-input";
import { normalizePhoneNumber, isValidPhoneNumber } from "@imaginecalendar/ui/phone-utils";
import { Label } from "@imaginecalendar/ui/label";
import { RadioGroup, RadioGroupItem } from "@imaginecalendar/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@imaginecalendar/ui/select";
import { Switch } from "@imaginecalendar/ui/switch";
import { Badge } from "@imaginecalendar/ui/badge";
import { Calendar } from "@imaginecalendar/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@imaginecalendar/ui/popover";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useZodForm } from "@/hooks/use-zod-form";
import {
  AGE_GROUP_OPTIONS,
  MAIN_USE_OPTIONS,
  HOW_HEARD_OPTIONS,
  GENDER_OPTIONS,
  COUNTRY_OPTIONS
} from "@imaginecalendar/database/constants/onboarding";
import { format } from "date-fns";
import { CalendarIcon, Check, Sparkles, Zap, Crown } from "lucide-react";
import { z } from "zod";
import { cn } from "@imaginecalendar/ui/cn";
import { FALLBACK_PLANS, toDisplayPlan } from "@/utils/plans";
import type { DisplayPlan, PlanRecordLike } from "@/utils/plans";

const USE_DB_PLANS = process.env.NEXT_PUBLIC_USE_DB_PLANS !== "false";

// Define the form schema with new fields
const formSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string()
    .min(1, "Phone number is required")
    .refine(
      (val) => isValidPhoneNumber(val),
      "Please enter a valid phone number"
    )
    .transform((val) => normalizePhoneNumber(val)),
  country: z.string().min(1, "Country is required"),
  ageGroup: z.enum(["18-25", "26-35", "36-45", "46 and over"]),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  birthday: z.date().optional(),
  mainUse: z.string().min(1, "Please select your main use"),
  howHeardAboutUs: z.string().min(1, "Please let us know how you heard about us"),
  company: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  utcOffset: z.string().min(1, "UTC offset is required"),
  plan: z.string().min(1, "Please select a plan").default("free"),
});

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [birthdayPopoverOpen, setBirthdayPopoverOpen] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [isDetectingTimezone, setIsDetectingTimezone] = useState(true);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const plansQueryOpts = trpc.plans.listActive.queryOptions();
  const plansQuery = useQuery(plansQueryOpts);

  // Check if user is already onboarded and redirect to dashboard
  const onboardingCheck = useQuery(trpc.auth.checkOnboarding.queryOptions());

  useEffect(() => {
    if (onboardingCheck.data && !onboardingCheck.data.needsOnboarding) {
      // User is already onboarded, redirect to dashboard
      router.push("/dashboard");
    }
  }, [onboardingCheck.data, router]);

  const completeOnboardingMutation = useMutation(
    trpc.auth.completeOnboarding.mutationOptions({
      onSuccess: async (userData) => {
        toast({
          title: "Welcome aboard!",
          description: "Your account is all set up.",
          variant: "success",
          duration: 2000,
        });

        // Onboarding complete

        setIsSubmitting(false);

        // Welcome modal flag is now set in the database during onboarding completion
        router.push("/dashboard");
      },
      onError: (error) => {
        const errorMessage = error.message || "Failed to complete onboarding. Please try again.";
        const isDuplicatePhone = errorMessage.includes("phone number is already registered");

        toast({
          title: isDuplicatePhone ? "Phone Number Already in Use" : "Onboarding Failed",
          description: errorMessage,
          variant: "error",
          duration: 4000,
        });
        setIsSubmitting(false);
      },
    })
  );

  const form = useZodForm(formSchema, {
    defaultValues: {
      firstName: "",
      lastName: "",
      plan: "free",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utcOffset: "",
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    getValues,
    watch,
  } = form;

  const plans = useMemo<DisplayPlan[]>(() => {
    const candidateData = plansQuery.data;
    const source: PlanRecordLike[] = USE_DB_PLANS && Array.isArray(candidateData) && candidateData.length > 0
      ? (candidateData as PlanRecordLike[])
      : FALLBACK_PLANS;

    return source
      .map((plan) => toDisplayPlan(plan))
      .filter((plan) => Boolean(plan.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [plansQuery.data]);

  // Fetch timezone list on mount
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

  // Auto-detect timezone from IP on mount
  useEffect(() => {
    const detectTimezone = async () => {
      setIsDetectingTimezone(true);
      try {
        const queryOpts = trpc.user.detectTimezone.queryOptions();
        const result = await queryClient.fetchQuery(queryOpts);
        if (result.timezone && result.utcOffset) {
          setValue("timezone", result.timezone, { shouldDirty: false, shouldValidate: true });
          setValue("utcOffset", result.utcOffset, { shouldDirty: false, shouldValidate: true });
        }
      } catch (error) {
        console.error("Failed to detect timezone:", error);
        // Fallback to browser timezone
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setValue("timezone", browserTimezone, { shouldDirty: false, shouldValidate: true });
        // Try to get UTC offset for browser timezone
        try {
          const queryOpts = trpc.user.getTimezoneDetails.queryOptions({ timezone: browserTimezone });
          const result = await queryClient.fetchQuery(queryOpts);
          if (result.utcOffset) {
            setValue("utcOffset", result.utcOffset, { shouldDirty: false, shouldValidate: true });
          } else {
            // Fallback: calculate UTC offset manually
            try {
              const now = new Date();
              const formatter = new Intl.DateTimeFormat('en', {
                timeZone: browserTimezone,
                timeZoneName: 'shortOffset'
              });
              const parts = formatter.formatToParts(now);
              const offsetPart = parts.find(part => part.type === 'timeZoneName');
              if (offsetPart) {
                const offset = offsetPart.value.replace('GMT', '').trim();
                setValue("utcOffset", offset, { shouldDirty: false, shouldValidate: true });
              }
            } catch (err) {
              console.error("Failed to calculate UTC offset:", err);
            }
          }
        } catch (err) {
          console.error("Failed to get UTC offset for browser timezone:", err);
          // Try to calculate it manually as last resort
          try {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en', {
              timeZone: browserTimezone,
              timeZoneName: 'shortOffset'
            });
            const parts = formatter.formatToParts(now);
            const offsetPart = parts.find(part => part.type === 'timeZoneName');
            if (offsetPart) {
              const offset = offsetPart.value.replace('GMT', '').trim();
              setValue("utcOffset", offset, { shouldDirty: false, shouldValidate: true });
            }
          } catch (calcErr) {
            console.error("Failed to calculate UTC offset:", calcErr);
          }
        }
      } finally {
        setIsDetectingTimezone(false);
      }
    };
    detectTimezone();
  }, [trpc, queryClient, setValue]);

  // Fetch UTC offset when timezone changes
  const currentTimezone = watch("timezone");
  useEffect(() => {
    if (currentTimezone) {
      const fetchUtcOffset = async () => {
        try {
          const queryOpts = trpc.user.getTimezoneDetails.queryOptions({ timezone: currentTimezone });
          const result = await queryClient.fetchQuery(queryOpts);
          if (result.utcOffset) {
            setValue("utcOffset", result.utcOffset, { shouldDirty: false, shouldValidate: true });
          } else {
            // Fallback: calculate UTC offset from timezone
            try {
              const now = new Date();
              const formatter = new Intl.DateTimeFormat('en', {
                timeZone: currentTimezone,
                timeZoneName: 'shortOffset'
              });
              const parts = formatter.formatToParts(now);
              const offsetPart = parts.find(part => part.type === 'timeZoneName');
              if (offsetPart) {
                const offset = offsetPart.value.replace('GMT', '').trim();
                setValue("utcOffset", offset, { shouldDirty: false, shouldValidate: true });
              }
            } catch (err) {
              console.error("Failed to calculate UTC offset:", err);
            }
          }
        } catch (error) {
          console.error("Failed to fetch UTC offset:", error);
          // Try to calculate it manually as fallback
          try {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en', {
              timeZone: currentTimezone,
              timeZoneName: 'shortOffset'
            });
            const parts = formatter.formatToParts(now);
            const offsetPart = parts.find(part => part.type === 'timeZoneName');
            if (offsetPart) {
              const offset = offsetPart.value.replace('GMT', '').trim();
              setValue("utcOffset", offset, { shouldDirty: false, shouldValidate: true });
            }
          } catch (err) {
            console.error("Failed to calculate UTC offset:", err);
          }
        }
      };
      fetchUtcOffset();
    }
  }, [currentTimezone, trpc, queryClient, setValue]);

  useEffect(() => {
    if (plans.length === 0) {
      return;
    }

    const currentPlanId = getValues("plan");
    if (!currentPlanId || !plans.some(plan => plan.id === currentPlanId)) {
      const firstPlan = plans[0];
      if (firstPlan) {
        setValue("plan", firstPlan.id, { shouldDirty: false });
      }
    }
  }, [plans, getValues, setValue]);

  // Update selected plan when billing cycle changes
  useEffect(() => {
    const currentPlan = getValues("plan");

    // If user toggles annual/monthly, update to the correct plan variant
    if (currentPlan && currentPlan !== 'free') {
      // Extract tier from current plan (silver or gold)
      let tier = 'silver';
      if (currentPlan.includes('gold')) {
        tier = 'gold';
      } else if (currentPlan.includes('silver')) {
        tier = 'silver';
      }

      // Generate new plan ID based on billing cycle
      const newPlanId = isAnnual ? `${tier}-annual` : `${tier}-monthly`;

      // Only update if the new plan exists and is different from current
      if (plans.some(p => p.id === newPlanId) && currentPlan !== newPlanId) {
        setValue("plan", newPlanId, { shouldDirty: false });
      }
    }
  }, [isAnnual, getValues, setValue, plans]);

  const freePlanId = useMemo(
    () => plans.find(plan => plan.id === 'free')?.id ?? "free",
    [plans]
  );

  const selectedPlan = watch("plan");
  const selectedPlanData = plans.find(plan => plan.id === selectedPlan);
  const isFreeSelected = selectedPlan === 'free';
  const selectedBirthday = watch("birthday");

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  async function handlePaidPlanSelection(values: z.infer<typeof formSchema>) {
    try {
      // Complete onboarding with free plan first, then redirect to payment
      await completeOnboardingMutation.mutateAsync({
        ...values,
        plan: freePlanId,
      });

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/payment/redirect';

      const planInput = document.createElement('input');
      planInput.type = 'hidden';
      planInput.name = 'plan';
      planInput.value = values.plan;

      form.appendChild(planInput);
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      setIsSubmitting(false);
    }
  }

  function onSubmit(values: z.infer<typeof formSchema>) {
    // Double-check required fields are present
    if (!values.firstName || !values.lastName || !values.phone || !values.country || 
        !values.ageGroup || !values.mainUse || !values.howHeardAboutUs || 
        !values.timezone || !values.utcOffset || !values.plan) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields before continuing.",
        variant: "error",
        duration: 4000,
      });
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);

    const isFree = values.plan === 'free';

    if (isFree) {
      // Free plan - complete onboarding directly
      completeOnboardingMutation.mutate(values);
    } else {
      // Paid plan - complete onboarding then redirect to payment
      handlePaidPlanSelection(values);
    }
  }

  return (
    <div className="bg-white min-h-screen">
      {/* Header matching dashboard style */}
      <header className="bg-primary text-white shadow-md">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Image src="/crack-on-logo.png" alt="CrackOn" width={180} height={45} />
            </div>
            <div className="text-sm text-white/90">
              Need help? Contact support
            </div>
          </div>
        </div>
      </header>

      <div className="container max-w-7xl mx-auto p-6">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold mb-2">Welcome! Let's Get Started</h2>
          <p className="text-muted-foreground">
            Set up your account and choose the perfect plan for your needs
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Tell us a bit about yourself</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    {...register("firstName")}
                    placeholder="John"
                    className={errors.firstName ? "border-red-500" : ""}
                  />
                  {errors.firstName && (
                    <p className="text-sm text-red-500 mt-1">{errors.firstName.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    {...register("lastName")}
                    placeholder="Doe"
                    className={errors.lastName ? "border-red-500" : ""}
                  />
                  {errors.lastName && (
                    <p className="text-sm text-red-500 mt-1">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.primaryEmailAddress?.emailAddress || ""}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div>
                <Label htmlFor="phone">WhatsApp Phone Number *</Label>
                <PhoneInput
                  id="phone"
                  value={watch("phone")}
                  onChange={(value) => setValue("phone", value, { shouldValidate: true })}
                  error={!!errors.phone}
                  defaultCountry="ZA"
                />
                {errors.phone && (
                  <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  We'll use this number to connect your WhatsApp account
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Select 
                    value={watch("country") || ""} 
                    onValueChange={(value) => setValue("country", value, { shouldValidate: true })}
                  >
                    <SelectTrigger className={errors.country ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.country && (
                    <p className="text-sm text-red-500 mt-1">{errors.country.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="ageGroup">Age Group *</Label>
                  <Select 
                    value={watch("ageGroup") || ""} 
                    onValueChange={(value) => setValue("ageGroup", value as any, { shouldValidate: true })}
                  >
                    <SelectTrigger className={errors.ageGroup ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select age group" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_GROUP_OPTIONS.map((age: string) => (
                        <SelectItem key={age} value={age}>
                          {age}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.ageGroup && (
                    <p className="text-sm text-red-500 mt-1">{errors.ageGroup.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="gender">Gender (Optional)</Label>
                  <Select 
                    value={watch("gender") || ""} 
                    onValueChange={(value) => setValue("gender", value as any, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((gender: string) => (
                        <SelectItem key={gender} value={gender}>
                          {gender.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="birthday">Birthday (Optional)</Label>
                  <Popover open={birthdayPopoverOpen} onOpenChange={setBirthdayPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedBirthday ? format(selectedBirthday, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedBirthday}
                        onSelect={(date) => {
                          setValue("birthday", date)
                          setBirthdayPopoverOpen(false)
                        }}
                        captionLayout="dropdown"
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div>
                <Label htmlFor="mainUse">Main Use *</Label>
                <Select 
                  value={watch("mainUse") || ""} 
                  onValueChange={(value) => setValue("mainUse", value, { shouldValidate: true })}
                >
                  <SelectTrigger className={errors.mainUse ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select main use" />
                  </SelectTrigger>
                  <SelectContent>
                    {MAIN_USE_OPTIONS.map((use: string) => (
                      <SelectItem key={use} value={use}>
                        {use}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.mainUse && (
                  <p className="text-sm text-red-500 mt-1">{errors.mainUse.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="howHeardAboutUs">How did you hear about us? *</Label>
                <Select 
                  value={watch("howHeardAboutUs") || ""} 
                  onValueChange={(value) => setValue("howHeardAboutUs", value, { shouldValidate: true })}
                >
                  <SelectTrigger className={errors.howHeardAboutUs ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOW_HEARD_OPTIONS.map((option: string) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.howHeardAboutUs && (
                  <p className="text-sm text-red-500 mt-1">{errors.howHeardAboutUs.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="company">Company (Optional)</Label>
                <Input
                  id="company"
                  {...register("company")}
                  placeholder="Acme Inc."
                />
              </div>

              <div>
                <Label htmlFor="timezone">Timezone *</Label>
                {isDetectingTimezone ? (
                  <div className="text-sm text-muted-foreground py-2">
                    Detecting your timezone...
                  </div>
                ) : (
                  <Select
                    value={watch("timezone") || ""}
                    onValueChange={(value) => {
                      setValue("timezone", value, { shouldValidate: true });
                    }}
                  >
                    <SelectTrigger className={errors.timezone ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {timezones.length > 0 ? (
                        timezones.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz.replace(/_/g, " ")}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value={watch("timezone") || ""} disabled>
                          {watch("timezone") || "Loading timezones..."}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
                {errors.timezone && (
                  <p className="text-sm text-red-500 mt-1">{errors.timezone.message}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  Your timezone helps us schedule events at the right time
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Plan Selection - Free/Silver/Gold with Monthly/Annual Toggle */}
          <div className="mb-8">
            <h3 className="text-2xl font-bold mb-2 text-center">Choose Your Plan</h3>
            <p className="text-muted-foreground text-center mb-6">Select the plan that works best for you</p>

            {/* Monthly/Annual Toggle */}
            <div className="flex flex-col items-center gap-3 mb-8">
              <div className="flex items-center gap-4">
                <span className={cn("text-base font-semibold transition-colors", !isAnnual ? "text-primary" : "text-muted-foreground")}>
                  Monthly Billing
                </span>
                <Switch
                  checked={isAnnual}
                  onCheckedChange={setIsAnnual}
                  className="data-[state=checked]:bg-primary"
                />
                <span className={cn("text-base font-semibold transition-colors", isAnnual ? "text-primary" : "text-muted-foreground")}>
                  Annual Billing
                </span>
                {isAnnual && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 animate-in fade-in">
                    💰 Save 20%
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isAnnual
                  ? "Pay upfront for a full year and save 20% compared to monthly billing"
                  : "Pay month-to-month with no long-term commitment"}
              </p>
            </div>

            {USE_DB_PLANS && plansQuery.isError && (
              <div className="mb-4 text-sm text-red-500">
                We couldn't load the latest plans. Showing default options instead.
              </div>
            )}

            {USE_DB_PLANS && plansQuery.isLoading && plans.length === 0 ? (
              <div className="text-center text-muted-foreground">Loading plans...</div>
            ) : plans.length === 0 ? (
              <div className="text-center text-muted-foreground">No plans are currently available. Please contact support.</div>
            ) : (
              <RadioGroup
                value={selectedPlan}
                onValueChange={(value) => setValue("plan", value as any)}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                {/* Free Plan */}
                {(() => {
                  const freePlan = plans.find(p => p.id === 'free');
                  if (!freePlan) return null;
                  const isSelected = selectedPlan === 'free';

                  return (
                    <label
                      key="free"
                      htmlFor="free"
                      className={cn(
                        "relative flex flex-col p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-xl",
                        isSelected
                          ? "border-blue-500 bg-blue-500 shadow-xl scale-105"
                          : "border-gray-300 hover:border-blue-400 bg-white"
                      )}
                    >
                      <RadioGroupItem
                        value="free"
                        id="free"
                        className={cn(
                          "absolute top-4 right-4",
                          isSelected && "!border-white !text-white [&_svg]:!fill-white"
                        )}
                      />

                      <div className="text-center mb-6">
                        <div className={cn(
                          "h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center",
                          isSelected ? "bg-white/20" : "bg-blue-100"
                        )}>
                          <Sparkles className={cn("h-6 w-6", isSelected ? "text-white" : "text-blue-600")} />
                        </div>
                        <h4 className={cn("text-xl font-bold mb-3", isSelected ? "text-white" : "text-primary")}>
                          {freePlan.name}
                        </h4>
                        <div className="mb-3">
                          <span className={cn("text-4xl font-bold", isSelected ? "text-white" : "text-primary")}>
                            {freePlan.displayPrice}
                          </span>
                          <span className={cn("text-base ml-1", isSelected ? "text-white/90" : "text-primary/80")}>
                            /{freePlan.billingPeriod}
                          </span>
                        </div>
                        <p className={cn("text-sm font-medium", isSelected ? "text-white/90" : "text-primary/80")}>
                          {freePlan.description}
                        </p>
                      </div>

                      <div className={cn(
                        "pt-4 flex-1",
                        isSelected ? "border-t-2 border-white/30" : "border-t-2 border-gray-200"
                      )}>
                        <ul className="space-y-3">
                          {freePlan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm">
                              <Check className={cn("w-5 h-5 mt-0.5 flex-shrink-0", isSelected ? "text-white" : "text-green-600")} />
                              <span className={cn(isSelected ? "text-white" : "text-foreground")}>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </label>
                  );
                })()}

                {/* Silver Plan */}
                {(() => {
                  const planId = isAnnual ? 'silver-annual' : 'silver-monthly';
                  const silverPlan = plans.find(p => p.id === planId);
                  if (!silverPlan) return null;
                  const isSelected = selectedPlan === planId;

                  // Get monthly plan for savings calculation
                  const silverMonthly = plans.find(p => p.id === 'silver-monthly');
                  const monthlyEquivalent = silverPlan.monthlyPriceCents / 100;
                  const savings = silverMonthly && isAnnual
                    ? (silverMonthly.amountCents * 12 - silverPlan.amountCents) / 100
                    : 0;

                  return (
                    <label
                      key={planId}
                      htmlFor={planId}
                      className={cn(
                        "relative flex flex-col p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-xl",
                        isSelected
                          ? "border-purple-500 bg-purple-500 shadow-xl scale-105"
                          : "border-gray-300 hover:border-purple-400 bg-white"
                      )}
                    >
                      <RadioGroupItem
                        value={planId}
                        id={planId}
                        className={cn(
                          "absolute top-4 right-4",
                          isSelected && "!border-white !text-white [&_svg]:!fill-white"
                        )}
                      />

                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <span className="bg-accent text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md">
                          Most Popular
                        </span>
                      </div>

                      <div className="text-center mb-6">
                        <div className={cn(
                          "h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center",
                          isSelected ? "bg-white/20" : "bg-purple-100"
                        )}>
                          <Zap className={cn("h-6 w-6", isSelected ? "text-white" : "text-purple-600")} />
                        </div>
                        <h4 className={cn("text-xl font-bold mb-3", isSelected ? "text-white" : "text-primary")}>
                          {silverPlan.name.replace(' Annual', '')}
                        </h4>
                        <div className="mb-1">
                          <span className={cn("text-4xl font-bold", isSelected ? "text-white" : "text-primary")}>
                            {silverPlan.displayPrice}
                          </span>
                          <span className={cn("text-base ml-1", isSelected ? "text-white/90" : "text-primary/80")}>
                            /{silverPlan.billingPeriod}
                          </span>
                        </div>
                        {isAnnual && monthlyEquivalent && (
                          <p className={cn("text-xs mb-1", isSelected ? "text-white/80" : "text-muted-foreground")}>
                            R{monthlyEquivalent.toFixed(0)}/month when paid annually
                          </p>
                        )}
                        <p className={cn("text-sm font-medium", isSelected ? "text-white/90" : isAnnual && savings > 0 ? "text-green-600" : "text-primary/80")}>
                          {isAnnual && savings > 0 ? `💰 Save R${savings.toFixed(0)}/year` : silverPlan.description}
                        </p>
                      </div>

                      <div className={cn(
                        "pt-4 flex-1",
                        isSelected ? "border-t-2 border-white/30" : "border-t-2 border-gray-200"
                      )}>
                        <ul className="space-y-3">
                          {silverPlan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm">
                              <Check className={cn("w-5 h-5 mt-0.5 flex-shrink-0", isSelected ? "text-white" : "text-green-600")} />
                              <span className={cn(isSelected ? "text-white" : "text-foreground")}>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </label>
                  );
                })()}

                {/* Gold Plan */}
                {(() => {
                  const planId = isAnnual ? 'gold-annual' : 'gold-monthly';
                  const goldPlan = plans.find(p => p.id === planId);
                  if (!goldPlan) return null;
                  const isSelected = selectedPlan === planId;

                  // Get monthly plan for savings calculation
                  const goldMonthly = plans.find(p => p.id === 'gold-monthly');
                  const monthlyEquivalent = goldPlan.monthlyPriceCents / 100;
                  const savings = goldMonthly && isAnnual
                    ? (goldMonthly.amountCents * 12 - goldPlan.amountCents) / 100
                    : 0;

                  return (
                    <label
                      key={planId}
                      htmlFor={planId}
                      className={cn(
                        "relative flex flex-col p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-xl",
                        isSelected
                          ? "border-yellow-500 bg-yellow-500 shadow-xl scale-105"
                          : "border-gray-300 hover:border-yellow-400 bg-white"
                      )}
                    >
                      <RadioGroupItem
                        value={planId}
                        id={planId}
                        className={cn(
                          "absolute top-4 right-4",
                          isSelected && "!border-white !text-white [&_svg]:!fill-white"
                        )}
                      />

                      <div className="text-center mb-6">
                        <div className={cn(
                          "h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center",
                          isSelected ? "bg-white/20" : "bg-yellow-100"
                        )}>
                          <Crown className={cn("h-6 w-6", isSelected ? "text-white" : "text-yellow-600")} />
                        </div>
                        <h4 className={cn("text-xl font-bold mb-3", isSelected ? "text-white" : "text-primary")}>
                          {goldPlan.name.replace(' Annual', '')}
                        </h4>
                        <div className="mb-1">
                          <span className={cn("text-4xl font-bold", isSelected ? "text-white" : "text-primary")}>
                            {goldPlan.displayPrice}
                          </span>
                          <span className={cn("text-base ml-1", isSelected ? "text-white/90" : "text-primary/80")}>
                            /{goldPlan.billingPeriod}
                          </span>
                        </div>
                        {isAnnual && monthlyEquivalent && (
                          <p className={cn("text-xs mb-1", isSelected ? "text-white/80" : "text-muted-foreground")}>
                            R{monthlyEquivalent.toFixed(0)}/month when paid annually
                          </p>
                        )}
                        <p className={cn("text-sm font-medium", isSelected ? "text-white/90" : isAnnual && savings > 0 ? "text-green-600" : "text-primary/80")}>
                          {isAnnual && savings > 0 ? `💰 Save R${savings.toFixed(0)}/year` : goldPlan.description}
                        </p>
                      </div>

                      <div className={cn(
                        "pt-4 flex-1",
                        isSelected ? "border-t-2 border-white/30" : "border-t-2 border-gray-200"
                      )}>
                        <ul className="space-y-3">
                          {goldPlan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm">
                              <Check className={cn("w-5 h-5 mt-0.5 flex-shrink-0", isSelected ? "text-white" : "text-green-600")} />
                              <span className={cn(isSelected ? "text-white" : "text-foreground")}>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </label>
                  );
                })()}
              </RadioGroup>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button
              type="submit"
              variant="blue-primary"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Processing..."
                : isFreeSelected
                  ? "Start with Free Plan"
                  : "Continue to Payment"
              }
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

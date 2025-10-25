"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
import { updateClerkOnboardingMetadata } from "@/app/actions/onboarding";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Input } from "@imaginecalendar/ui/input";
import { PhoneInput } from "@imaginecalendar/ui/phone-input";
import { normalizePhoneNumber, isValidPhoneNumber } from "@imaginecalendar/ui/phone-utils";
import { Label } from "@imaginecalendar/ui/label";
import { RadioGroup, RadioGroupItem } from "@imaginecalendar/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@imaginecalendar/ui/select";
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
import { CalendarIcon } from "lucide-react";
import { z } from "zod";
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
  timezone: z.string().default("Africa/Johannesburg"),
  plan: z.string().min(1, "Please select a plan").default("trial"),
});

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [birthdayPopoverOpen, setBirthdayPopoverOpen] = useState(false);
  const trpc = useTRPC();
  const plansQueryOpts = trpc.plans.listActive.queryOptions();
  const plansQuery = useQuery(plansQueryOpts);

  const completeOnboardingMutation = useMutation(
    trpc.auth.completeOnboarding.mutationOptions({
      onSuccess: async (userData) => {
        toast({
          title: "Welcome aboard!",
          description: "Your account is all set up.",
          variant: "success",
          duration: 2000,
        });

        updateClerkOnboardingMetadata().catch(() => {});

        setIsSubmitting(false);
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
      plan: "trial",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

  const trialPlanId = useMemo(
    () => plans.find(plan => plan.isTrial)?.id ?? "trial",
    [plans]
  );

  const selectedPlan = watch("plan");
  const selectedPlanData = plans.find(plan => plan.id === selectedPlan);
  const isTrialSelected = selectedPlanData?.isTrial ?? false;
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
      await completeOnboardingMutation.mutateAsync({
        ...values,
        plan: trialPlanId,
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
    setIsSubmitting(true);

    const chosenPlan = plans.find((plan) => plan.id === values.plan);
    const isTrial = chosenPlan ? chosenPlan.isTrial : values.plan === trialPlanId;

    if (isTrial) {
      completeOnboardingMutation.mutate(values);
    } else {
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

      <div className="container max-w-6xl mx-auto p-6">
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
                onChange={(value) => setValue("phone", value)}
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
                <Select onValueChange={(value) => setValue("country", value)}>
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
                <Select onValueChange={(value) => setValue("ageGroup", value as any)}>
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
                <Select onValueChange={(value) => setValue("gender", value as any)}>
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
              <Select onValueChange={(value) => setValue("mainUse", value)}>
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
              <Select onValueChange={(value) => setValue("howHeardAboutUs", value)}>
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
          </CardContent>
        </Card>

        {/* Plan Selection - 3 Column Layout */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold mb-2 text-center">Choose Your Plan</h3>
          <p className="text-muted-foreground text-center mb-6">Select the plan that works best for you</p>

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
              {plans.map((plan) => {
                const isSelected = selectedPlan === plan.id;
                const isTrial = plan.isTrial;

                return (
                  <label
                    key={plan.id}
                    htmlFor={plan.id}
                    className={`relative flex flex-col p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-xl ${
                      isSelected
                        ? isTrial
                          ? "border-accent bg-accent shadow-xl scale-105"
                          : "border-primary bg-primary shadow-xl scale-105"
                        : "border-gray-300 hover:border-primary/50 bg-white"
                    }`}
                  >
                    <RadioGroupItem
                      value={plan.id}
                      id={plan.id}
                      className={`absolute top-4 right-4 ${
                        isSelected ? "!border-white !text-white [&_svg]:!fill-white" : ""
                      }`}
                    />

                    {(plan.id === "monthly" || plan.sortOrder === 2) && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <span className="bg-accent text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="text-center mb-6">
                      <h4 className={`text-xl font-bold mb-3 ${isSelected ? "text-white" : "text-primary"}`}>
                        {plan.name}
                      </h4>
                      <div className="mb-3">
                        <span className={`text-4xl font-bold ${isSelected ? "text-white" : "text-primary"}`}>
                          {plan.displayPrice}
                        </span>
                        <span className={`text-base ml-1 ${isSelected ? "text-white/90" : "text-primary/80"}`}>
                          /{plan.billingPeriod}
                        </span>
                      </div>
                      <p className={`text-sm font-medium ${isSelected ? "text-white/90" : "text-primary/80"}`}>
                        {plan.description}
                      </p>
                    </div>

                    <div className={`pt-4 flex-1 ${isSelected ? "border-t-2 border-white/30" : "border-t-2 border-gray-200"}`}>
                      <ul className="space-y-3">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm">
                            <svg
                              className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isSelected ? "text-white" : "text-[hsl(var(--brand-green))]"}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className={isSelected ? "text-white" : "text-primary"}>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </label>
                );
              })}
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
              : isTrialSelected
                ? "Start Free Trial"
                : "Continue to Payment"
            }
          </Button>
        </div>
      </form>
      </div>
    </div>
  );
}

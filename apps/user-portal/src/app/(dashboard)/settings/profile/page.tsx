"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSetupRedirect } from "@/hooks/use-setup-redirect";
import { OnboardingLoading } from "@/components/onboarding-loading";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Label } from "@imaginecalendar/ui/label";
import { Input } from "@imaginecalendar/ui/input";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useZodForm } from "@/hooks/use-zod-form";
import { z } from "zod";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@imaginecalendar/ui/select";
import { Calendar } from "@imaginecalendar/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@imaginecalendar/ui/popover";
import { CalendarIcon } from "lucide-react";
import {
  AGE_GROUP_OPTIONS,
  GENDER_OPTIONS,
  COUNTRY_OPTIONS
} from "@imaginecalendar/database/constants/onboarding";
import { format } from "date-fns";

// Define the form schema
const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  company: z.string().optional(),
  phone: z.string().min(10, "Valid phone number required"),
  country: z.string().min(1, "Country is required"),
  ageGroup: z.enum(["18-25", "26-35", "36-45", "46 and over"]),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  birthday: z.date().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  utcOffset: z.string().min(1, "UTC offset is required"),
});

export default function ProfilePage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { user: clerkUser, isLoaded, isSignedIn } = useAuth();
  
  // Redirect if setup is incomplete
  useSetupRedirect();
  
  // Show full-page loading state while checking authentication
  if (!isLoaded) {
    return <OnboardingLoading />;
  }
  
  // If auth check is complete but user is not signed in, show loading
  // (useSetupRedirect will handle the redirect)
  if (!isSignedIn || !clerkUser) {
    return <OnboardingLoading />;
  }
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [birthdayPopoverOpen, setBirthdayPopoverOpen] = useState(false);
  const [originalPhone, setOriginalPhone] = useState<string>("");
  const [timezones, setTimezones] = useState<string[]>([]);

  // Fetch current user data
  const { data: user, isLoading, error } = useQuery(
    trpc.user.me.queryOptions()
  );

  // Initialize form with Zod
  const form = useZodForm(profileSchema, {
    mode: "onBlur",
    defaultValues: {
      firstName: "",
      lastName: "",
      company: "",
      phone: "",
      country: "",
      ageGroup: "26-35" as const,
      gender: undefined,
      birthday: undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utcOffset: "",
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
    getValues,
  } = form;

  const birthday = watch("birthday");
  const country = watch("country");
  const ageGroup = watch("ageGroup");
  const gender = watch("gender");
  const firstName = watch("firstName");
  const lastName = watch("lastName");
  const phone = watch("phone");
  const company = watch("company");
  const timezone = watch("timezone");

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

  // Fetch UTC offset when timezone changes
  useEffect(() => {
    if (timezone && timezone !== user?.timezone) {
      // Only fetch if timezone actually changed from the user's current timezone
      const fetchUtcOffset = async () => {
        try {
          const queryOpts = trpc.user.getTimezoneDetails.queryOptions({ timezone });
          const result = await queryClient.fetchQuery(queryOpts);
          if (result.utcOffset) {
            console.log("Setting utcOffset to:", result.utcOffset, "for timezone:", timezone);
            setValue("utcOffset", result.utcOffset, { shouldValidate: true, shouldDirty: true });
          } else {
            console.warn("No utcOffset returned for timezone:", timezone);
          }
        } catch (error) {
          console.error("Failed to fetch UTC offset:", error);
          toast({
            title: "Failed to fetch timezone offset",
            description: "Please try selecting the timezone again.",
            variant: "destructive",
          });
        }
      };
      fetchUtcOffset();
    }
  }, [timezone, trpc, queryClient, setValue, user?.timezone, toast]);

  // Update form when user data is loaded
  useEffect(() => {
    if (user) {
      const phoneValue = user.phone || "";
      setOriginalPhone(phoneValue);

      const countryValue = user.country || "";
      const ageGroupValue = (user.ageGroup as "18-25" | "26-35" | "36-45" | "46 and over") || "26-35";
      const genderValue = user.gender as "male" | "female" | "other" | "prefer_not_to_say" | undefined;

      const formData = {
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        company: user.company || "",
        phone: phoneValue,
        country: countryValue,
        ageGroup: ageGroupValue,
        gender: genderValue,
        birthday: user.birthday ? new Date(user.birthday) : undefined,
        timezone: user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        utcOffset: user.utcOffset || "",
      };

      reset(formData, { keepDefaultValues: false });

      // If timezone is set but utcOffset is missing, fetch it
      if (formData.timezone && !formData.utcOffset) {
        const fetchUtcOffset = async () => {
          try {
            const queryOpts = trpc.user.getTimezoneDetails.queryOptions({ timezone: formData.timezone });
            const result = await queryClient.fetchQuery(queryOpts);
            if (result.utcOffset) {
              setValue("utcOffset", result.utcOffset, { shouldValidate: true, shouldDirty: true });
            }
          } catch (error) {
            console.error("Failed to fetch UTC offset for initial load:", error);
          }
        };
        fetchUtcOffset();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Update mutation
  const updateProfileMutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: async (_, variables) => {
        const phoneChanged = variables.phone !== originalPhone;
        await queryClient.invalidateQueries({
          queryKey: trpc.user.me.queryKey(),
        });
        if (variables.phone) {
          setOriginalPhone(variables.phone);
        }
        if (phoneChanged) {
          // Phone was changed, redirect to verification page
          toast({
            title: "Profile updated",
            description: "Your new phone number needs to be verified.",
            variant: "success",
            duration: 2000,
          });
          setIsSubmitting(false);
          // Small delay to ensure toast is visible
          await new Promise(resolve => setTimeout(resolve, 500));
          router.push('/settings/whatsapp?from=profile');
        } else {
          // Phone wasn't changed, just show success
          toast({
            title: "Profile updated",
            description: "Your profile has been updated successfully.",
            variant: "success",
          });
          setIsSubmitting(false);
          router.refresh();
        }
      },
      onError: (error) => {
        toast({
          title: "Update failed",
          description: "Failed to update profile. Please try again.",
          variant: "error",
          duration: 3500,
        });
        setIsSubmitting(false);
      },
    })
  );

  function onSubmit(values: z.infer<typeof profileSchema>) {
    console.log("Submitting profile with values:", values);

    // Ensure utcOffset is set if timezone is set
    if (values.timezone && !values.utcOffset) {
      toast({
        title: "Missing UTC Offset",
        description: "Please wait for the timezone offset to load, or try selecting the timezone again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    updateProfileMutation.mutate(values);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-red-500">
          <p className="font-semibold">Error loading profile</p>
          <p className="text-sm mt-2">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">
          <p>No user data found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 p-4 sm:p-6 shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)] rounded-xl">
          <h1 className="text-xl font-bold text-gray-900">Profile Settings</h1>
        </div>

        {/* Profile Section */}
        <div className="px-4 sm:px-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>
                  Update your profile details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
            {/* Email (read-only from Clerk) */}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={clerkUser?.email || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Email cannot be changed here
              </p>
            </div>

            {/* First Name and Last Name */}
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
                  <p className="text-sm text-red-500 mt-1">{errors.firstName.message || "Invalid value"}</p>
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
                  <p className="text-sm text-red-500 mt-1">{errors.lastName.message || "Invalid value"}</p>
                )}
              </div>
            </div>

            {/* Company */}
            <div>
              <Label htmlFor="company">Company (Optional)</Label>
              <Input
                id="company"
                {...register("company")}
                placeholder="Acme Inc."
              />
            </div>

            {/* Phone */}
            <div>
              <Label htmlFor="phone">WhatsApp Phone Number *</Label>
              <Input
                id="phone"
                {...register("phone")}
                placeholder="+27 82 123 4567"
                className={errors.phone ? "border-red-500" : ""}
              />
              {errors.phone && (
                <p className="text-sm text-red-500 mt-1">{errors.phone.message || "Invalid value"}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {user?.phoneVerified
                  ? "✓ This number is verified for WhatsApp calendar commands"
                  : "This number will be used for WhatsApp calendar voice commands"
                }
              </p>
            </div>

            {/* Country and Age Group */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="country">Country *</Label>
                <Select
                  key={`country-${country || 'empty'}`}
                  value={country || ""}
                  onValueChange={(value) => {
                    console.log("Country onValueChange called with:", value);
                    setValue("country", value, { shouldValidate: true, shouldDirty: true });
                  }}
                >
                  <SelectTrigger className={errors.country ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((countryOption) => (
                      <SelectItem key={countryOption} value={countryOption}>
                        {countryOption}
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
                  key={`ageGroup-${ageGroup || 'empty'}`}
                  value={ageGroup || "26-35"}
                  onValueChange={(value) => {
                    console.log("AgeGroup onValueChange called with:", value);
                    setValue("ageGroup", value as "18-25" | "26-35" | "36-45" | "46 and over", { shouldValidate: true, shouldDirty: true });
                  }}
                >
                  <SelectTrigger className={errors.ageGroup ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select age group" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGE_GROUP_OPTIONS.map((ageOption) => (
                      <SelectItem key={ageOption} value={ageOption}>
                        {ageOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.ageGroup && (
                  <p className="text-sm text-red-500 mt-1">{errors.ageGroup.message}</p>
                )}
              </div>
            </div>

            {/* Gender and Birthday */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gender">Gender (Optional)</Label>
                <Select
                  key={`gender-${gender || 'empty'}`}
                  value={gender || ""}
                  onValueChange={(value) => {
                    console.log("Gender onValueChange called with:", value);
                    setValue("gender", value as any || undefined, { shouldValidate: true, shouldDirty: true });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((genderOption) => (
                      <SelectItem key={genderOption} value={genderOption}>
                        {genderOption.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
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
                      {birthday ? format(birthday, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={birthday}
                      defaultMonth={birthday ?? new Date()}
                      onSelect={(date: Date | undefined) => {
                        setValue("birthday", date ?? undefined)
                        setBirthdayPopoverOpen(false)
                      }}
                      captionLayout="dropdown"
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Timezone */}
            <div>
              <Label htmlFor="timezone">Timezone *</Label>
              <Select
                key={`timezone-${timezone || 'empty'}`}
                value={timezone || ""}
                onValueChange={async (value) => {
                  setValue("timezone", value, { shouldValidate: true, shouldDirty: true });
                  // Immediately fetch UTC offset when timezone changes
                  try {
                    const queryOpts = trpc.user.getTimezoneDetails.queryOptions({ timezone: value });
                    const result = await queryClient.fetchQuery(queryOpts);
                    if (result.utcOffset) {
                      console.log("Timezone changed to:", value, "Setting utcOffset to:", result.utcOffset);
                      setValue("utcOffset", result.utcOffset, { shouldValidate: true, shouldDirty: true });
                    } else {
                      console.warn("No utcOffset returned for timezone:", value);
                    }
                  } catch (error) {
                    console.error("Failed to fetch UTC offset:", error);
                    toast({
                      title: "Failed to fetch timezone offset",
                      description: "Please try selecting the timezone again.",
                      variant: "destructive",
                    });
                  }
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
                    <SelectItem value={timezone || ""} disabled>
                      {timezone || "Loading timezones..."}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.timezone && (
                <p className="text-sm text-red-500 mt-1">{errors.timezone.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Your timezone helps us schedule events at the right time
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Account Info 
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Your account details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">User ID</p>
                <p className="font-mono">{user?.id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Account Created</p>
                <p>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone Verified</p>
                <p className={user?.phoneVerified ? "text-green-600" : "text-yellow-600"}>
                  {user?.phoneVerified ? "Verified" : "Not Verified"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Updated</p>
                <p>{user?.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        */}

            {/* Save Button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="blue-primary"
                disabled={isSubmitting}
                size="lg"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
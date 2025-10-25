"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
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
import Link from "next/link";
import { Home, ChevronLeft, CalendarIcon } from "lucide-react";
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
});

export default function ProfilePage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { user: clerkUser } = useUser();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [birthdayPopoverOpen, setBirthdayPopoverOpen] = useState(false);
  const [originalPhone, setOriginalPhone] = useState<string>("");

  // Fetch current user data
  const { data: user, isLoading } = useQuery(
    trpc.user.me.queryOptions()
  );

  // Initialize form with Zod
  const form = useZodForm(profileSchema, {
    defaultValues: {
      firstName: "",
      lastName: "",
      company: "",
      phone: "",
      country: "",
      ageGroup: "26-35" as const,
      gender: undefined,
      birthday: undefined,
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = form;

  const birthday = watch("birthday");
  const country = watch("country");
  const ageGroup = watch("ageGroup");
  const gender = watch("gender");

  // Update form when user data is loaded
  useEffect(() => {
    if (user) {
      const phoneValue = user.phone || "";
      setOriginalPhone(phoneValue);
      reset({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        company: user.company || "",
        phone: phoneValue,
        country: user.country || "",
        ageGroup: (user.ageGroup as "18-25" | "26-35" | "36-45" | "46 and over") || ("26-35" as const),
        gender: user.gender as "male" | "female" | "other" | "prefer_not_to_say" | undefined,
        birthday: user.birthday ? new Date(user.birthday) : undefined,
      });
    }
  }, [user, reset]);

  // Update mutation
  const updateProfileMutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: async (_, variables) => {
        const phoneChanged = variables.phone !== originalPhone;
        
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

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
        <span className="font-medium">Profile Settings</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Profile Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your personal information
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
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
                value={clerkUser?.emailAddresses[0]?.emailAddress || ""}
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
                <Select value={country} onValueChange={(value) => setValue("country", value)}>
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
                <Select value={ageGroup} onValueChange={(value) => setValue("ageGroup", value as any)}>
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

            {/* Gender and Birthday */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gender">Gender (Optional)</Label>
                <Select value={gender || ""} onValueChange={(value) => setValue("gender", value as any)}>
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
                      {birthday ? format(birthday, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={birthday}
                      defaultMonth={birthday ?? new Date()}
                      onSelect={(date) => {
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
  );
}
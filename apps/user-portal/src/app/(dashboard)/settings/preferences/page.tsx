"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Label } from "@imaginecalendar/ui/label";
import { Switch } from "@imaginecalendar/ui/switch";
import { Input } from "@imaginecalendar/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@imaginecalendar/ui/select";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useZodForm } from "@/hooks/use-zod-form";
import { Loader2, Home, ChevronLeft } from "lucide-react";
import { z } from "zod";
import Link from "next/link";

// Define the form schema
const preferencesSchema = z.object({
  marketingEmails: z.boolean(),
  reminderNotifications: z.boolean(),
  reminderMinutes: z.number().min(1).max(1440),
  timezone: z.string(),
});

export default function PreferencesPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [isLoadingTimezones, setIsLoadingTimezones] = useState(true);

  // Fetch current preferences
  const { data: preferences, isLoading } = useQuery(
    trpc.preferences.get.queryOptions()
  );

  // Initialize form with Zod
  const form = useZodForm(preferencesSchema, {
    defaultValues: {
      marketingEmails: false,
      reminderNotifications: true,
      reminderMinutes: 10,
      timezone: "Africa/Johannesburg",
    },
  });

  // Fetch timezone list on mount
  useEffect(() => {
    async function fetchTimezones() {
      try {
        const res = await fetch('/api/timezones');
        if (res.ok) {
          const { timezones: tzList } = await res.json();
          setTimezones(tzList || []);
        }
      } catch (error) {
        console.error('Error fetching timezones:', error);
      } finally {
        setIsLoadingTimezones(false);
      }
    }

    fetchTimezones();
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = form;

  // Watch form values
  const reminderNotifications = watch("reminderNotifications");

  // Update form when preferences are loaded
  useEffect(() => {
    if (preferences) {
      reset({
        marketingEmails: preferences.marketingEmails,
        reminderNotifications: preferences.reminderNotifications,
        reminderMinutes: preferences.reminderMinutes,
        timezone: preferences.timezone || "Africa/Johannesburg",
      });
    }
  }, [preferences, reset]);

  // Update mutation
  const updatePreferencesMutation = useMutation(
    trpc.preferences.update.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Preferences saved",
          description: "Your preferences have been updated successfully.",
          variant: "success",
        });
        setIsSubmitting(false);
        router.refresh();
      },
      onError: (error) => {
        toast({
          title: "Update failed",
          description: "Failed to update preferences. Please try again.",
          variant: "error",
          duration: 3500,
        });
        setIsSubmitting(false);
      },
    })
  );

  async function onSubmit(values: z.infer<typeof preferencesSchema>) {
    setIsSubmitting(true);
    
    // Fetch utc_offset if timezone is provided
    let utcOffset: string | undefined;
    if (values.timezone) {
      try {
        const res = await fetch(`/api/timezone/${values.timezone}`);
        if (res.ok) {
          const data = await res.json();
          utcOffset = data.utcOffset;
        }
      } catch (error) {
        console.error('Error fetching timezone offset:', error);
      }
    }

    updatePreferencesMutation.mutate({
      notifications: {
        marketingEmails: values.marketingEmails,
        reminderNotifications: values.reminderNotifications,
      },
      reminders: {
        reminderMinutes: values.reminderMinutes,
      },
      locale: {
        timezone: values.timezone,
        utcOffset: utcOffset,
      },
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Loading preferences...</div>
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
        <span className="font-medium">Preferences</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Preferences</h1>
        <p className="text-muted-foreground mt-2">
          Manage your notification and reminder settings
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Marketing Emails */}
        <Card>
          <CardHeader>
            <CardTitle>Email Notifications</CardTitle>
            <CardDescription>
              Control which email notifications you receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="marketing-emails" className="text-base">
                  Marketing emails
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive emails about new features, tips, and special offers
                </p>
              </div>
              <Switch
                id="marketing-emails"
                checked={watch("marketingEmails")}
                onCheckedChange={(checked) => setValue("marketingEmails", checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp Reminders */}
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Reminders</CardTitle>
            <CardDescription>
              Configure when you receive meeting reminders via WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {/* Toggle for WhatsApp reminders */}
              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label htmlFor="whatsapp-reminders" className="text-base">
                    Enable WhatsApp reminders
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Get reminder notifications for your meetings via WhatsApp
                  </p>
                </div>
                <Switch
                  id="whatsapp-reminders"
                  checked={watch("reminderNotifications")}
                  onCheckedChange={(checked) => setValue("reminderNotifications", checked)}
                />
              </div>

              {/* Reminder interval (only show when enabled) */}
              {reminderNotifications && (
                <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
                  <Label htmlFor="reminder-minutes">
                    Reminder time before meetings
                  </Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="reminder-minutes"
                      type="number"
                      min="1"
                      max="1440"
                      {...register("reminderMinutes", { valueAsNumber: true })}
                      className={errors.reminderMinutes ? "border-red-500 w-24" : "w-24"}
                    />
                    <span className="text-sm text-muted-foreground">
                      minutes before meeting
                    </span>
                  </div>
                  {errors.reminderMinutes && (
                    <p className="text-sm text-red-500">{errors.reminderMinutes.message || "Invalid value"}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    You'll receive a WhatsApp message {watch("reminderMinutes")} {watch("reminderMinutes") === 1 ? 'minute' : 'minutes'} before your scheduled meetings
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Locale Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Locale Settings</CardTitle>
            <CardDescription>
              Configure your timezone and regional preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={watch("timezone")}
                onValueChange={(value) => setValue("timezone", value)}
                disabled={isLoadingTimezones}
              >
                <SelectTrigger className={errors.timezone ? "border-red-500" : ""}>
                  <SelectValue placeholder={isLoadingTimezones ? "Loading timezones..." : "Select your timezone"} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {timezones.length > 0 ? (
                    timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="Africa/Johannesburg" disabled>
                      No timezones available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.timezone && (
                <p className="text-sm text-red-500">{errors.timezone.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                We'll use this to schedule reminders and events at the right time for you
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="blue-primary"
            disabled={isSubmitting}
            size="lg"
          >
            {isSubmitting ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </form>
    </div>
  );
}
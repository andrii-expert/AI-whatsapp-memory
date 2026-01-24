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
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useZodForm } from "@/hooks/use-zod-form";
import { Loader2 } from "lucide-react";
import { z } from "zod";

// Define the form schema
const preferencesSchema = z.object({
  marketingEmails: z.boolean(),
  calendarNotifications: z.boolean(),
  calendarNotificationMinutes: z.number().min(1).max(1440),
});

export default function PreferencesPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch current preferences
  const { data: preferences, isLoading } = useQuery(
    trpc.preferences.get.queryOptions()
  );

  // Initialize form with Zod
  const form = useZodForm(preferencesSchema, {
    defaultValues: {
      marketingEmails: false,
      calendarNotifications: true,
      calendarNotificationMinutes: 10,
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = form;

  // Watch form values
  const calendarNotifications = watch("calendarNotifications");

  // Update form when preferences are loaded
  useEffect(() => {
    if (preferences) {
      reset({
        marketingEmails: preferences.marketingEmails,
        calendarNotifications: preferences.calendarNotifications,
        calendarNotificationMinutes: preferences.calendarNotificationMinutes,
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

  function onSubmit(values: z.infer<typeof preferencesSchema>) {
    setIsSubmitting(true);
    updatePreferencesMutation.mutate({
      notifications: {
        marketingEmails: values.marketingEmails,
        calendarNotifications: values.calendarNotifications,
      },
      calendar: {
        calendarNotificationMinutes: values.calendarNotificationMinutes,
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
    <div className="bg-white">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 p-4 sm:p-6 shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)] rounded-xl">
          <h1 className="text-xl font-bold text-gray-900">Preferences</h1>
        </div>

        {/* Form Content */}
        <div className="px-4 sm:px-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Marketing Emails */}
        <Card className="rounded-xl">
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

        {/* WhatsApp Calendar Notifications */}
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>WhatsApp Calendar Notifications</CardTitle>
            <CardDescription>
              Configure when you receive calendar event notifications via WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {/* Toggle for WhatsApp calendar notifications */}
              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label htmlFor="whatsapp-calendar-notifications" className="text-base">
                    Enable WhatsApp calendar notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Get notifications for your upcoming calendar events via WhatsApp
                  </p>
                </div>
                <Switch
                  id="whatsapp-calendar-notifications"
                  checked={watch("calendarNotifications")}
                  onCheckedChange={(checked) => setValue("calendarNotifications", checked)}
                />
              </div>

              {/* Calendar notification interval (only show when enabled) */}
              {calendarNotifications && (
                <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
                  <Label htmlFor="calendar-notification-minutes">
                    Notification time before events
                  </Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="calendar-notification-minutes"
                      type="number"
                      min="1"
                      max="1440"
                      {...register("calendarNotificationMinutes", { valueAsNumber: true })}
                      className={errors.calendarNotificationMinutes ? "border-red-500 w-24" : "w-24"}
                    />
                    <span className="text-sm text-muted-foreground">
                      minutes before event
                    </span>
                  </div>
                  {errors.calendarNotificationMinutes && (
                    <p className="text-sm text-red-500">{errors.calendarNotificationMinutes.message || "Invalid value"}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    You'll receive a WhatsApp message {watch("calendarNotificationMinutes")} {watch("calendarNotificationMinutes") === 1 ? 'minute' : 'minutes'} before your scheduled calendar events
                  </p>
                </div>
              )}
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
      </div>
    </div>
  );
}
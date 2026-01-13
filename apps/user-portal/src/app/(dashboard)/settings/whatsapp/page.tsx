"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
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

function WhatsAppVerificationPageContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectFrom = searchParams.get("from");
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedPhone, setEditedPhone] = useState("");
  const [phoneForVerification, setPhoneForVerification] = useState<string | null>(null);

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
  const displayPhone = isEditing ? editedPhone : (verifiedNumber?.phoneNumber || user?.phone || "");

  // Track previous verification status to show success message
  const [wasUnverified, setWasUnverified] = useState(false);
  
  useEffect(() => {
    const isCurrentlyUnverified = !verifiedNumber?.isVerified && (verifiedNumber?.phoneNumber || user?.phone);
    if (isCurrentlyUnverified) {
      setWasUnverified(true);
    } else if (wasUnverified && verifiedNumber?.isVerified) {
      // Just verified!
      toast({
        title: "WhatsApp verified!",
        description: "Your WhatsApp number has been successfully verified.",
        variant: "success",
      });
      setWasUnverified(false);
      // Refetch to get latest data
      refetchNumbers();
    }
  }, [verifiedNumber?.isVerified, user?.phone, wasUnverified, toast, refetchNumbers]);

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

  // Update user profile mutation
  const updateUserMutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.user.me.queryKey(),
        });
        await refetchNumbers();
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
          <span className="font-medium">WhatsApp Verification</span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-primary">WhatsApp Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your WhatsApp connection and verify your number
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
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
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show phone number input if user doesn't have a phone number
  if (!user?.phone && !verifiedNumber?.phoneNumber) {
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
          <span className="font-medium">WhatsApp Verification</span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-primary">WhatsApp Verification</h1>
          <p className="text-muted-foreground mt-2">
            Verify your WhatsApp number to start managing your calendar
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add WhatsApp Number</CardTitle>
            <CardDescription>
              Enter your WhatsApp phone number to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="phone-input">WhatsApp Phone Number *</Label>
                <PhoneInput
                  id="phone-input"
                  value={editedPhone || ""}
                  onChange={(value) => setEditedPhone(value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Include country code (e.g., +1 for US, +27 for South Africa)
                </p>
              </div>
              {editedPhone && (
                <div className="mt-4">
                  <WhatsAppVerificationSection
                    phoneNumber={normalizePhoneNumber(editedPhone)}
                    alwaysGenerateNewCode={true}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleEdit = () => {
    setEditedPhone(displayPhone);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedPhone("");
  };

  const handleSave = async () => {
    if (!editedPhone) {
      setIsEditing(false);
      return;
    }

    // Normalize the phone number for comparison
    const normalizedPhone = normalizePhoneNumber(editedPhone);
    
    // Check if the phone number actually changed (compare normalized values)
    if (normalizedPhone === (verifiedNumber?.phoneNumber || user?.phone || "")) {
      setIsEditing(false);
      return;
    }

    try {
      
      // Update user profile phone number
      await updateUserMutation.mutateAsync({
        phone: normalizedPhone,
      });

      // Set the phone for verification section to generate a new code
      setPhoneForVerification(normalizedPhone);
      setIsEditing(false);

      toast({
        title: "Phone number updated",
        description: "A new verification code has been generated. Please verify the new number.",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "Failed to update phone number. Please try again.",
        variant: "error",
      });
    }
  };

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
        <span className="font-medium">WhatsApp Verification</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">WhatsApp Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your WhatsApp connection and verify your number
        </p>
      </div>

      {/* Connected WhatsApp Number Section */}
      {(verifiedNumber || whatsappNumbers?.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  WhatsApp Number
                  {verifiedNumber?.isVerified && (
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {verifiedNumber?.isVerified 
                    ? "Your connected WhatsApp number for calendar management"
                    : "Your WhatsApp number needs verification to enable calendar management"}
                </CardDescription>
              </div>
              {!isEditing && (verifiedNumber || whatsappNumbers?.[0]) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEdit}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <PhoneInput
                    id="phone"
                    value={editedPhone}
                    onChange={(value) => setEditedPhone(value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={!editedPhone || editedPhone === (verifiedNumber?.phoneNumber || whatsappNumbers?.[0]?.phoneNumber)}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Changing your phone number will require verification again.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Phone Number
                  </div>
                  <div className="text-lg font-semibold">
                    {(verifiedNumber || whatsappNumbers?.[0])?.phoneNumber}
                  </div>
                  {(verifiedNumber || whatsappNumbers?.[0])?.displayName && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {(verifiedNumber || whatsappNumbers?.[0])?.displayName}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground mb-1">
                    Status
                  </div>
                  <Badge variant={(verifiedNumber || whatsappNumbers?.[0])?.isVerified ? "default" : "secondary"}>
                    {(verifiedNumber || whatsappNumbers?.[0])?.isVerified ? "Verified" : "Pending Verification"}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* WhatsApp Calendar Selection - Only show if verified */}
      {verifiedNumber?.isVerified && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              WhatsApp Calendar Selection
            </CardTitle>
            <CardDescription>
              Choose which calendars you want to use for creating events via WhatsApp.
              {calendars.filter((cal: any) => cal.isActive).length > 0 && ` Found ${calendars.filter((cal: any) => cal.isActive).length} active calendar(s).`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {calendarsLoading || preferencesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-pulse">Loading calendars...</div>
              </div>
            ) : calendars.filter((cal: any) => cal.isActive).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No active calendars found.</p>
                <p className="text-sm mt-1">Please connect a calendar first.</p>
                <Link
                  href="/calendars"
                  className="text-blue-600 hover:text-blue-700 font-medium mt-2 inline-block"
                >
                  Go to Calendar Settings
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  {calendars
                    .filter((cal: any) => cal.isActive)
                    .filter((cal: any) => selectedWhatsAppCalendars.includes(cal.id) || true)
                    .map((calendar: any) => (
                      <div
                        key={calendar.id}
                        className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
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
                            className="flex items-center gap-2 font-medium cursor-pointer"
                          >
                            {calendar.calendarName || calendar.email}
                            {selectedWhatsAppCalendars.includes(calendar.id) && (
                              <Check className="h-4 w-4 text-blue-600" />
                            )}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
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

                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={handleUpdateWhatsAppCalendars}
                    disabled={
                      selectedWhatsAppCalendars.length === 0 ||
                      isUpdatingCalendars ||
                      updateWhatsAppCalendarsMutation.isPending
                    }
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
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* WhatsApp Verification Section - Only show if not verified */}
      {!verifiedNumber?.isVerified && (verifiedNumber?.phoneNumber || user?.phone) && (
        <Card>
          <CardHeader>
            <CardTitle>Verify Your WhatsApp Number</CardTitle>
            <CardDescription>
              {phoneForVerification 
                ? "A new verification code has been generated. Use it to verify your updated phone number."
                : "Complete verification to enable WhatsApp calendar management. Click the button below to generate a verification code."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WhatsAppVerificationSection 
              phoneNumber={phoneForVerification || (verifiedNumber?.phoneNumber || user?.phone || "")} 
              redirectFrom={redirectFrom || "settings"}
              shouldGenerateCode={!!phoneForVerification} // Only generate new code when phone was explicitly edited
              alwaysGenerateNewCode={!!phoneForVerification} // Auto-generate only if phone was just updated
            />
          </CardContent>
        </Card>
      )}
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

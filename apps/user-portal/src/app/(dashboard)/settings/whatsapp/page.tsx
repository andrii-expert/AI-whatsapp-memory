"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Home, ChevronLeft, CheckCircle2, Edit2, X, Check } from "lucide-react";
import { WhatsAppVerificationSection } from "@/components/whatsapp-verification-section";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import { Badge } from "@imaginecalendar/ui/badge";
import { PhoneInput } from "@imaginecalendar/ui/phone-input";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { normalizePhoneNumber } from "@imaginecalendar/ui/phone-utils";

export default function WhatsAppVerificationPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const redirectFrom = searchParams.get("from");
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedPhone, setEditedPhone] = useState("");
  const [phoneForVerification, setPhoneForVerification] = useState<string | null>(null);

  // Fetch current user data to get phone number
  const { data: user, isLoading: userLoading } = useQuery(
    trpc.user.me.queryOptions()
  );

  // Fetch connected WhatsApp numbers
  const { data: whatsappNumbers = [], isLoading: numbersLoading, refetch: refetchNumbers } = useQuery(
    trpc.whatsapp.getMyNumbers.queryOptions()
  );

  const isLoading = userLoading || numbersLoading;

  // Find verified WhatsApp number
  const verifiedNumber = whatsappNumbers?.find((num: any) => num.isVerified) || whatsappNumbers?.[0];
  const displayPhone = isEditing ? editedPhone : (verifiedNumber?.phoneNumber || user?.phone || "");

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

  if (!user?.phone) {
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

        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            Please add your WhatsApp phone number in your profile first.
          </p>
          <Link
            href="/settings/profile"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Go to Profile Settings
          </Link>
        </div>
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
    if (!editedPhone || editedPhone === verifiedNumber?.phoneNumber) {
      setIsEditing(false);
      return;
    }

    try {
      // Normalize the phone number
      const normalizedPhone = normalizePhoneNumber(editedPhone);
      
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

      {/* WhatsApp Verification Section */}
      <WhatsAppVerificationSection 
        phoneNumber={phoneForVerification || (verifiedNumber?.phoneNumber || user?.phone || "")} 
        redirectFrom={redirectFrom || "dashboard"} 
        key={phoneForVerification || verifiedNumber?.phoneNumber || user?.phone} // Force re-render when phone changes
      />
    </div>
  );
}

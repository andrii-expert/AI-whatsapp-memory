"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@imaginecalendar/ui/dialog";
import { Button } from "@imaginecalendar/ui/button";
import { Textarea } from "@imaginecalendar/ui/textarea";
import { Label } from "@imaginecalendar/ui/label";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { Shield, ShieldOff, AlertTriangle } from "lucide-react";

interface ToggleAdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    email: string;
    name?: string;
    isAdmin?: boolean;
  };
  onSuccess: () => void;
}

export function ToggleAdminModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: ToggleAdminModalProps) {
  const { toast } = useToast();
  const trpc = useTRPC();
  const [reason, setReason] = useState("");

  const isCurrentlyAdmin = user.isAdmin || false;
  const actionText = isCurrentlyAdmin ? "Remove Admin Access" : "Grant Admin Access";
  const actionIcon = isCurrentlyAdmin ? ShieldOff : Shield;
  const actionColor = isCurrentlyAdmin ? "destructive" : "default";

  const toggleAdminMutation = useMutation(
    trpc.admin.toggleUserAdmin.mutationOptions({
      onSuccess: (data) => {
        toast({
          title: "Admin status updated",
          description: data.message,
        });
        setReason("");
        onOpenChange(false);
        onSuccess();
      },
      onError: (error) => {
        toast({
          title: "Operation failed",
          description: error.message || "Failed to update admin status",
          variant: "destructive",
        });
      },
    })
  );

  const handleToggle = () => {
    toggleAdminMutation.mutate({
      userId: user.id,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCurrentlyAdmin ? (
              <ShieldOff className="h-5 w-5 text-destructive" />
            ) : (
              <Shield className="h-5 w-5 text-green-600" />
            )}
            {actionText}
          </DialogTitle>
          <DialogDescription>
            {isCurrentlyAdmin
              ? "This will remove admin privileges from this user."
              : "This will grant admin privileges to this user."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isCurrentlyAdmin ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-medium text-destructive">Warning</h4>
                  <p className="text-sm text-muted-foreground">
                    Removing admin access will:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside ml-4 space-y-1">
                    <li>Revoke access to the admin portal</li>
                    <li>Remove ability to manage users</li>
                    <li>Remove access to dashboard metrics</li>
                    <li>Remove ability to process refunds</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-medium text-green-800">Admin Access</h4>
                  <p className="text-sm text-green-700">
                    Granting admin access will:
                  </p>
                  <ul className="text-sm text-green-700 list-disc list-inside ml-4 space-y-1">
                    <li>Provide access to the admin portal</li>
                    <li>Allow user management</li>
                    <li>Grant access to dashboard metrics</li>
                    <li>Allow processing refunds</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-medium">User Details</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Name:</strong> {user.name || "Not provided"}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Current Status:</strong> {isCurrentlyAdmin ? "Admin" : "Regular User"}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for change (optional)</Label>
            <Textarea
              id="reason"
              placeholder={
                isCurrentlyAdmin
                  ? "e.g., Role change, security concern, user request..."
                  : "e.g., Promotion to admin, additional responsibilities..."
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={toggleAdminMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={actionColor}
            onClick={handleToggle}
            disabled={toggleAdminMutation.isPending}
          >
            {toggleAdminMutation.isPending ? (
              "Updating..."
            ) : (
              <>
                {isCurrentlyAdmin ? (
                  <ShieldOff className="mr-2 h-4 w-4" />
                ) : (
                  <Shield className="mr-2 h-4 w-4" />
                )}
                {actionText}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
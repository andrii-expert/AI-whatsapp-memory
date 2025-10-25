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
import { Trash, AlertTriangle } from "lucide-react";

interface DeleteUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    email: string;
    name?: string;
    plan?: string;
    subscriptionStatus?: string;
  };
  onSuccess: () => void;
}

export function DeleteUserModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: DeleteUserModalProps) {
  const { toast } = useToast();
  const trpc = useTRPC();
  const [reason, setReason] = useState("");

  const deleteUserMutation = useMutation(
    trpc.admin.deleteUser.mutationOptions({
      onSuccess: () => {
        toast({
          title: "User deleted",
          description: `User ${user.email} has been deleted successfully.`,
        });
        setReason("");
        onOpenChange(false);
        onSuccess();
      },
      onError: (error) => {
        toast({
          title: "Delete failed",
          description: error.message || "Failed to delete user",
          variant: "destructive",
        });
      },
    })
  );

  const handleDelete = () => {
    deleteUserMutation.mutate({
      userId: user.id,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash className="h-5 w-5 text-destructive" />
            Delete User
          </DialogTitle>
          <DialogDescription>
            This action will permanently delete the user and all associated data. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-medium text-destructive">Warning</h4>
                <p className="text-sm text-muted-foreground">
                  Deleting this user will:
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside ml-4 space-y-1">
                  <li>Permanently remove their account and profile</li>
                  <li>Cancel any active subscriptions</li>
                  <li>Preserve payment history for legal compliance</li>
                  <li>Remove access to WhatsApp integration</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">User Details</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Name:</strong> {user.name || "Not provided"}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Plan:</strong> {user.plan || "trial"}</p>
              <p><strong>Status:</strong> {user.subscriptionStatus || "active"}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for deletion (optional)</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Policy violation, user request, data cleanup..."
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
            disabled={deleteUserMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteUserMutation.isPending}
          >
            {deleteUserMutation.isPending ? (
              "Deleting..."
            ) : (
              <>
                <Trash className="mr-2 h-4 w-4" />
                Delete User
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
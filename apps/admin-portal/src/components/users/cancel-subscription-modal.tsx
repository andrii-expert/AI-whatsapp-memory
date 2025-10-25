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
import { Checkbox } from "@imaginecalendar/ui/checkbox";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { Ban, AlertTriangle } from "lucide-react";

interface CancelSubscriptionModalProps {
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

export function CancelSubscriptionModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: CancelSubscriptionModalProps) {
  const { toast } = useToast();
  const trpc = useTRPC();
  const [reason, setReason] = useState("");
  const [immediate, setImmediate] = useState(false);

  const cancelSubscriptionMutation = useMutation(
    trpc.admin.cancelUserSubscription.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Subscription cancelled",
          description: `${user.email}'s subscription has been cancelled ${immediate ? "immediately" : "at period end"}.`,
        });
        setReason("");
        setImmediate(false);
        onOpenChange(false);
        onSuccess();
      },
      onError: (error) => {
        toast({
          title: "Cancellation failed",
          description: error.message || "Failed to cancel subscription",
          variant: "destructive",
        });
      },
    })
  );

  const handleCancel = () => {
    cancelSubscriptionMutation.mutate({
      userId: user.id,
      reason: reason.trim() || undefined,
      immediate,
    });
  };

  const canCancel = ["active", "paused"].includes(user.subscriptionStatus || "");

  if (!canCancel) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-muted-foreground" />
              Cannot Cancel Subscription
            </DialogTitle>
            <DialogDescription>
              This user's subscription is already cancelled or cannot be cancelled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="space-y-2">
                <h4 className="font-medium">Current Status</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>Plan:</strong> {user.plan || "trial"}</p>
                  <p><strong>Status:</strong> {user.subscriptionStatus || "active"}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Cancel Subscription
          </DialogTitle>
          <DialogDescription>
            This will cancel the user's subscription and stop future billing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-medium text-destructive">Cancellation Impact</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>Immediate cancellation:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>User loses access immediately</li>
                    <li>WhatsApp integration stops working</li>
                    <li>No refund for remaining period</li>
                  </ul>
                  <p className="mt-2"><strong>Cancel at period end:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>User keeps access until current period ends</li>
                    <li>No charges for next billing cycle</li>
                    <li>Graceful transition period</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">User Details</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Name:</strong> {user.name || "Not provided"}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Plan:</strong> {user.plan}</p>
              <p><strong>Status:</strong> {user.subscriptionStatus}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for cancellation (optional)</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Policy violation, user request, payment issues..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="immediate"
              checked={immediate}
              onCheckedChange={(checked) => setImmediate(checked as boolean)}
            />
            <Label htmlFor="immediate" className="text-sm font-medium">
              Cancel immediately (user loses access right away)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={cancelSubscriptionMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelSubscriptionMutation.isPending}
          >
            {cancelSubscriptionMutation.isPending ? (
              "Cancelling..."
            ) : (
              <>
                <Ban className="mr-2 h-4 w-4" />
                {immediate ? "Cancel Immediately" : "Cancel at Period End"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
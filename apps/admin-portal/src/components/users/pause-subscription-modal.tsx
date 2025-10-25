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
import { Pause, Info } from "lucide-react";

interface PauseSubscriptionModalProps {
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

export function PauseSubscriptionModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: PauseSubscriptionModalProps) {
  const { toast } = useToast();
  const trpc = useTRPC();
  const [reason, setReason] = useState("");

  const pauseSubscriptionMutation = useMutation(
    trpc.admin.pauseSubscription.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Subscription paused",
          description: `${user.email}'s subscription has been paused successfully.`,
        });
        setReason("");
        onOpenChange(false);
        onSuccess();
      },
      onError: (error) => {
        toast({
          title: "Pause failed",
          description: error.message || "Failed to pause subscription",
          variant: "destructive",
        });
      },
    })
  );

  const handlePause = () => {
    pauseSubscriptionMutation.mutate({
      userId: user.id,
      reason: reason.trim() || undefined,
    });
  };

  const canPause = user.subscriptionStatus === "active" && user.plan !== "trial";

  if (!canPause) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-muted-foreground" />
              Cannot Pause Subscription
            </DialogTitle>
            <DialogDescription>
              This user's subscription cannot be paused at this time.
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

            <div className="text-sm text-muted-foreground">
              <p><strong>Reasons subscription cannot be paused:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-1 mt-2">
                {user.plan === "trial" && <li>Trial subscriptions cannot be paused</li>}
                {user.subscriptionStatus !== "active" && <li>Only active subscriptions can be paused</li>}
              </ul>
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
            <Pause className="h-5 w-5 text-orange-600" />
            Pause Subscription
          </DialogTitle>
          <DialogDescription>
            This will temporarily pause the user's subscription and billing cycle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <div className="space-y-2">
              <h4 className="font-medium text-orange-800">What happens when you pause?</h4>
              <ul className="text-sm text-orange-700 list-disc list-inside space-y-1">
                <li>User will retain access for their current billing period</li>
                <li>Automatic billing will stop after current period ends</li>
                <li>User can manually reactivate their subscription</li>
                <li>WhatsApp integration will remain active until period ends</li>
              </ul>
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
            <Label htmlFor="reason">Reason for pausing (optional)</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Payment issues, user request, temporary suspension..."
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
            disabled={pauseSubscriptionMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handlePause}
            disabled={pauseSubscriptionMutation.isPending}
          >
            {pauseSubscriptionMutation.isPending ? (
              "Pausing..."
            ) : (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause Subscription
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
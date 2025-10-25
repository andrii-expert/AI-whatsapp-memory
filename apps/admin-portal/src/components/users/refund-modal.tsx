"use client";

import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Input } from "@imaginecalendar/ui/input";
import { RadioGroup, RadioGroupItem } from "@imaginecalendar/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { RefreshCw, DollarSign, Info } from "lucide-react";

interface RefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    email: string;
    name?: string;
  };
  onSuccess: () => void;
}

export function RefundModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: RefundModalProps) {
  const { toast } = useToast();
  const trpc = useTRPC();
  const [selectedPayment, setSelectedPayment] = useState<string>("");
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [customAmount, setCustomAmount] = useState("");
  const [reason, setReason] = useState("");

  // Get user's completed payments
  const { data: userPayments, isLoading: paymentsLoading } = useQuery({
    ...trpc.payments.getCompletedPayments.queryOptions(),
    enabled: open,
  });

  const refundMutation = useMutation(
    trpc.admin.refundPayment.mutationOptions({
      onSuccess: (data) => {
        toast({
          title: "Refund processed",
          description: `Refund of R${(data.refundAmount / 100).toFixed(2)} has been processed successfully.`,
        });
        setSelectedPayment("");
        setRefundType("full");
        setCustomAmount("");
        setReason("");
        onOpenChange(false);
        onSuccess();
      },
      onError: (error) => {
        toast({
          title: "Refund failed",
          description: error.message || "Failed to process refund",
          variant: "destructive",
        });
      },
    })
  );

  const selectedPaymentData = userPayments?.find(p => p.id === selectedPayment);
  const maxRefundAmount = selectedPaymentData?.totalAmount || 0;
  const customAmountInCents = Math.round(parseFloat(customAmount || "0") * 100);

  const handleRefund = () => {
    if (!selectedPayment) {
      toast({
        title: "No payment selected",
        description: "Please select a payment to refund",
        variant: "destructive",
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        title: "Reason required",
        description: "Please provide a reason for the refund",
        variant: "destructive",
      });
      return;
    }

    const refundAmount = refundType === "full" ? undefined : customAmountInCents;

    if (refundType === "partial" && (customAmountInCents <= 0 || customAmountInCents > maxRefundAmount)) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid refund amount",
        variant: "destructive",
      });
      return;
    }

    refundMutation.mutate({
      paymentId: selectedPayment,
      amount: refundAmount,
      reason: reason.trim(),
    });
  };

  useEffect(() => {
    if (!open) {
      setSelectedPayment("");
      setRefundType("full");
      setCustomAmount("");
      setReason("");
    }
  }, [open]);

  if (paymentsLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Loading Payments...
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!userPayments || userPayments.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-muted-foreground" />
              No Refundable Payments
            </DialogTitle>
            <DialogDescription>
              This user has no completed payments that can be refunded.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="space-y-2">
              <h4 className="font-medium">User Details</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Name:</strong> {user.name || "Not provided"}</p>
                <p><strong>Email:</strong> {user.email}</p>
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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Process Refund
          </DialogTitle>
          <DialogDescription>
            Select a payment and specify the refund amount for {user.email}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="payment">Select Payment to Refund</Label>
            <Select value={selectedPayment} onValueChange={setSelectedPayment}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a payment..." />
              </SelectTrigger>
              <SelectContent>
                {userPayments.map((payment) => (
                  <SelectItem key={payment.id} value={payment.id}>
                    <div className="flex justify-between items-center w-full">
                      <span>{payment.invoiceNumber}</span>
                      <span className="ml-4 text-muted-foreground">
                        R{(payment.totalAmount / 100).toFixed(2)} - {new Date(payment.paidAt!).toLocaleDateString()}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPaymentData && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="space-y-2">
                <h4 className="font-medium">Payment Details</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>Invoice:</strong> {selectedPaymentData.invoiceNumber}</p>
                  <p><strong>Amount:</strong> R{(selectedPaymentData.totalAmount / 100).toFixed(2)} ({selectedPaymentData.currency})</p>
                  <p><strong>Paid On:</strong> {new Date(selectedPaymentData.paidAt!).toLocaleDateString()}</p>
                  <p><strong>Description:</strong> {selectedPaymentData.description}</p>
                </div>
              </div>
            </div>
          )}

          {selectedPayment && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Refund Type</Label>
                <RadioGroup value={refundType} onValueChange={(value) => setRefundType(value as "full" | "partial")}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="full" id="full" />
                    <Label htmlFor="full">
                      Full refund (R{(maxRefundAmount / 100).toFixed(2)})
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="partial" id="partial" />
                    <Label htmlFor="partial">Partial refund</Label>
                  </div>
                </RadioGroup>
              </div>

              {refundType === "partial" && (
                <div className="space-y-2">
                  <Label htmlFor="amount">Refund Amount (ZAR)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(maxRefundAmount / 100).toFixed(2)}
                    placeholder="0.00"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum refund amount: R{(maxRefundAmount / 100).toFixed(2)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Refund *</Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., Service issue, user complaint, billing error, goodwill gesture..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-[80px]"
                  required
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={refundMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleRefund}
            disabled={refundMutation.isPending || !selectedPayment || !reason.trim()}
          >
            {refundMutation.isPending ? (
              "Processing..."
            ) : (
              <>
                <DollarSign className="mr-2 h-4 w-4" />
                Process Refund
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
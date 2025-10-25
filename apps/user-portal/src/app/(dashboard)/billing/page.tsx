"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import { Button } from "@imaginecalendar/ui/button";
import { useToast } from "@imaginecalendar/ui/use-toast";
import {
  CreditCard,
  Calendar,
  CheckCircle,
  Clock,
  ArrowRight,
  Settings,
  Loader2,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { FALLBACK_PLANS, getFallbackPlanById, toDisplayPlan } from "@/utils/plans";
import type { DisplayPlan, PlanRecordLike } from "@/utils/plans";

function getStatusBadgeProps(status: string) {
  switch (status) {
    case 'active':
      return { variant: 'secondary' as const, className: 'bg-green-100 text-green-800 border-green-200', text: 'Active' };
    case 'trial':
      return { variant: 'secondary' as const, className: 'bg-blue-100 text-blue-800 border-blue-200', text: 'Trial' };
    case 'cancelled':
      return { variant: 'secondary' as const, className: 'bg-yellow-100 text-yellow-800 border-yellow-200', text: 'Cancelled' };
    case 'expired':
      return { variant: 'destructive' as const, className: '', text: 'Expired' };
    case 'past_due':
      return { variant: 'destructive' as const, className: '', text: 'Past Due' };
    case 'paused':
      return { variant: 'secondary' as const, className: 'bg-gray-100 text-gray-800 border-gray-200', text: 'Paused' };
    default:
      return { variant: 'secondary' as const, className: 'bg-gray-100 text-gray-800 border-gray-200', text: status };
  }
}

function calculateRemainingDays(endDate: Date | string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

function formatCurrency(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`;
}

const USE_DB_PLANS = process.env.NEXT_PUBLIC_USE_DB_PLANS !== "false";

export default function BillingPage() {
  const { toast } = useToast();
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const router = useRouter();

  const plansQueryOptions = trpc.plans.listActive.queryOptions();
  const plansQuery = useQuery(plansQueryOptions);

  const plans = useMemo<DisplayPlan[]>(() => {
    const candidateData = plansQuery.data;
    const source: PlanRecordLike[] = USE_DB_PLANS && Array.isArray(candidateData) && candidateData.length > 0
      ? (candidateData as PlanRecordLike[])
      : FALLBACK_PLANS;

    return source
      .map((plan) => toDisplayPlan(plan))
      .filter((plan) => Boolean(plan.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [plansQuery.data]);

  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  const {
    data: subscription,
    isLoading: isLoadingSubscription,
    error: subscriptionError
  } = useQuery(trpc.billing.getSubscription.queryOptions());

  const updateSubscriptionMutation = useMutation(
    trpc.billing.updateSubscription.mutationOptions({
      onSuccess: (result) => {
        // Handle trial users who need to be redirected to PayFast
        if (result.type === "requiresPayment") {
          toast({
            title: "Redirecting to Payment",
            description: result.message,
          });

          // Create form and submit to payment redirect endpoint
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = '/api/payment/redirect';
          form.style.display = 'none';

          const planInput = document.createElement('input');
          planInput.type = 'hidden';
          planInput.name = 'plan';
          planInput.value = result.plan;
          form.appendChild(planInput);

          // Add billing flow flag to use billing-specific return URLs
          const billingFlowInput = document.createElement('input');
          billingFlowInput.type = 'hidden';
          billingFlowInput.name = 'isBillingFlow';
          billingFlowInput.value = 'true';
          form.appendChild(billingFlowInput);

          document.body.appendChild(form);
          form.submit();
          return;
        }

        // Handle successful plan updates for existing subscribers
        if (result.type === "success") {
          toast({
            title: "Plan Updated",
            description: "Your plan has been updated successfully.",
          });
        }
        // Note: invalidate is handled by React Query
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to update plan.",
          variant: "destructive",
        });
      },
    })
  );

  const cancelSubscriptionMutation = useMutation(
    trpc.billing.cancelSubscription.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Subscription Cancelled",
          description: "Your subscription will be cancelled at the end of the current period.",
        });
        // Note: invalidate is handled by React Query
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to cancel subscription.",
          variant: "destructive",
        });
      },
    })
  );

  const reactivateSubscriptionMutation = useMutation(
    trpc.billing.reactivateSubscription.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Subscription Reactivated",
          description: "Your subscription has been reactivated successfully.",
        });
        // Note: invalidate is handled by React Query
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to reactivate subscription.",
          variant: "destructive",
        });
      },
    })
  );

  const getCardUpdateUrlMutation = useMutation(
    trpc.billing.getCardUpdateUrl.mutationOptions({
      onSuccess: (result) => {
        toast({
          title: "Redirecting to PayFast",
          description: result.message,
        });

        // Redirect to PayFast card update page
        window.location.href = result.url;
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Unable to update card details.",
          variant: "destructive",
        });
      },
    })
  );

  const handlePlanChange = (newPlanId: string) => {
    if (!subscription || updateSubscriptionMutation.isPending) return;

    // Use tRPC for all plan changes - it will handle the different scenarios
    updateSubscriptionMutation.mutate({
      plan: newPlanId as any,
    });
  };

  const handleCancelSubscription = () => {
    if (!subscription || cancelSubscriptionMutation.isPending) return;
    cancelSubscriptionMutation.mutate();
  };

  const handleReactivateSubscription = () => {
    if (!subscription || reactivateSubscriptionMutation.isPending) return;
    reactivateSubscriptionMutation.mutate();
  };

  const handleUpdateCardDetails = () => {
    if (!subscription || getCardUpdateUrlMutation.isPending) return;
    getCardUpdateUrlMutation.mutate();
  };

  // Handle return from PayFast (both payment and card update)
  useEffect(() => {
    const status = searchParams.get('status');
    const message = searchParams.get('message');
    const cardUpdateStatus = searchParams.get('card_update');
    const cancelled = searchParams.get('cancelled');

    // Handle payment return (from billing-success or billing-cancel routes)
    if (status && message) {
      if (status === 'success') {
        toast({
          title: "Payment Successful",
          description: message,
          variant: "success",
        });
      } else if (status === 'cancelled') {
        toast({
          title: "Payment Cancelled",
          description: message,
        });
      }

      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('status');
      newUrl.searchParams.delete('message');
      router.replace(newUrl.pathname + newUrl.search);
    }

    // Handle card update return
    else if (cardUpdateStatus || cancelled) {
      if (cardUpdateStatus === 'success') {
        toast({
          title: "Card Updated",
          description: "Your payment method has been updated successfully.",
        });
      } else if (cardUpdateStatus === 'cancelled' || cancelled === 'true') {
        toast({
          title: "Update Cancelled",
          description: "Card update was cancelled.",
          variant: "destructive",
        });
      } else if (cardUpdateStatus === 'failed') {
        toast({
          title: "Update Failed",
          description: "Failed to update your payment method. Please try again.",
          variant: "destructive",
        });
      } else {
        // Generic return from PayFast (we don't know the exact status)
        toast({
          title: "Returned from PayFast",
          description: "You have returned from the payment method update process.",
        });
      }

      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('card_update');
      newUrl.searchParams.delete('cancelled');
      router.replace(newUrl.pathname + newUrl.search);
    }
  }, [searchParams, router, toast]);

  const currentPlanId = subscription?.plan ?? plans[0]?.id ?? "trial";
  const fallbackPlan = getFallbackPlanById(currentPlanId);
  const currentPlan = planMap.get(currentPlanId) ?? (fallbackPlan ? toDisplayPlan(fallbackPlan) : undefined);
  const isOnTrial = currentPlan?.isTrial ?? false;
  const statusBadge = getStatusBadgeProps(
    isOnTrial ? 'trial' :
    (subscription?.cancelAtPeriodEnd ? 'cancelled' : (subscription?.status || 'active'))
  );
  const isCancelled = subscription?.status === 'cancelled' || subscription?.cancelAtPeriodEnd;
  const remainingDays = subscription?.currentPeriodEnd
    ? calculateRemainingDays(subscription.currentPeriodEnd)
    : (subscription?.trialEndsAt ? calculateRemainingDays(subscription.trialEndsAt) : 0);

  const upgradePlans = useMemo(
    () => plans.filter(plan => plan.id !== currentPlanId && !plan.isTrial),
    [plans, currentPlanId]
  );

  // Loading state
  if (isLoadingSubscription) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
          <p className="text-muted-foreground mt-2">
            Manage your ImagineCalendar subscription and payment details
          </p>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading subscription details...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (subscriptionError) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
          <p className="text-muted-foreground mt-2">
            Manage your ImagineCalendar subscription and payment details
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <div>
                <h3 className="font-medium">Error Loading Subscription</h3>
                <p className="text-sm text-muted-foreground">
                  {subscriptionError.message || "Unable to load subscription details."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoadingPlans = USE_DB_PLANS && plansQuery.isLoading && plans.length === 0;
  const planLoadError = USE_DB_PLANS && plansQuery.isError;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Billing & Subscription</h1>
        <p className="text-muted-foreground mt-2">
          Manage your CrackOn subscription and payment details
        </p>
      </div>

      {/* Current Plan */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Plan
          </CardTitle>
          <CardDescription>
            Your active subscription details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-semibold">{currentPlan?.name || 'Unknown Plan'}</h3>
                <Badge
                  variant={statusBadge.variant}
                  className={statusBadge.className}
                >
                  {statusBadge.text}
                </Badge>
              </div>

              {isOnTrial && subscription?.trialEndsAt && (
                <>
                  <p className="text-muted-foreground mb-1">
                    {remainingDays} {remainingDays === 1 ? 'day' : 'days'} remaining
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Trial ends on {format(new Date(subscription.trialEndsAt), 'PPP')}
                  </p>
                </>
              )}

              {!isOnTrial && subscription?.currentPeriodEnd && (
                <>
                  <p className="text-muted-foreground mb-1">
                    {isCancelled ? 'Expires' : 'Renews'} in {remainingDays} {remainingDays === 1 ? 'day' : 'days'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isCancelled ? 'Expires' : 'Next billing'} on {format(new Date(subscription.currentPeriodEnd), 'PPP')}
                  </p>
                </>
              )}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{currentPlan?.displayPrice || 'R0'}</div>
              <div className="text-sm text-muted-foreground">{currentPlan?.billingPeriod || 'per month'}</div>
            </div>
          </div>

          {/* Update Card Details - Only for paid subscribers */}
          {!isOnTrial && subscription?.payfastToken && (
            <>
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Payment Method</h4>
                    <p className="text-sm text-muted-foreground">Update your card details with PayFast</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateCardDetails}
                    disabled={getCardUpdateUrlMutation.isPending}
                  >
                    {getCardUpdateUrlMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Update Card
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Plan Features */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Plan Features</CardTitle>
          <CardDescription>
            What's included in your current plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentPlan?.features?.map((feature: string, index: number) => (
              <div key={index} className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            {isOnTrial ? 'Choose Your Plan' : 'Change Plan'}
          </CardTitle>
          <CardDescription>
            {isOnTrial
              ? 'Select a plan to continue after your trial ends'
              : 'Upgrade or downgrade your subscription'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {planLoadError && (
            <div className="mb-4 text-sm text-red-500">
              We couldn't load the latest plans. Showing default options instead.
            </div>
          )}

          {isLoadingPlans ? (
            <div className="text-muted-foreground mb-6">Loading available plans...</div>
          ) : upgradePlans.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-6">No alternative plans available at this time.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {upgradePlans.map((plan) => {
                const isCurrent = subscription?.plan === plan.id;
                const isHighlighted = plan.id === "monthly" || plan.sortOrder === 2;
                const isUpgrade = currentPlan ? plan.amountCents > (currentPlan.amountCents ?? 0) : false;
                const buttonLabel = isUpgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`;

                return (
                  <div key={plan.id} className="border rounded-lg p-4 relative">
                    {isHighlighted && !isCurrent && (
                      <Badge className="absolute -top-2 left-4 bg-primary text-primary-foreground">
                        Most Popular
                      </Badge>
                    )}
                    <h4 className="font-semibold text-lg mb-2">{plan.name}</h4>
                    <div className="mb-3">
                      <span className="text-3xl font-bold">{plan.displayPrice}</span>
                      <span className="text-muted-foreground">/{plan.billingPeriod}</span>
                    </div>
                    <ul className="space-y-2 text-sm mb-4">
                      {plan.features.slice(0, 6).map((feature, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {isCurrent ? (
                      <Button className="w-full" variant="orange-success" disabled>
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        variant="blue-primary"
                        className="w-full"
                        onClick={() => handlePlanChange(plan.id)}
                        disabled={updateSubscriptionMutation.isPending}
                      >
                        {updateSubscriptionMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          buttonLabel
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Subscription Management */}
          <div className="text-center">
            {isCancelled ? (
              <Button
                size="lg"
                onClick={handleReactivateSubscription}
                disabled={reactivateSubscriptionMutation.isPending}
              >
                {reactivateSubscriptionMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reactivating...
                  </>
                ) : (
                  <>
                    <Settings className="mr-2 h-4 w-4" />
                    Reactivate Subscription
                  </>
                )}
              </Button>
            ) : (
              <Button
                size="lg"
                variant="outline"
                onClick={handleCancelSubscription}
                disabled={cancelSubscriptionMutation.isPending || isOnTrial}
              >
                {cancelSubscriptionMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <Settings className="mr-2 h-4 w-4" />
                    Cancel Subscription
                  </>
                )}
              </Button>
            )}

            {isOnTrial && (
              <p className="text-xs text-muted-foreground mt-2">
                Cancel option available after trial ends
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment History Quick Link */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium">Payment History</h3>
                <p className="text-sm text-muted-foreground">View all your invoices and receipts</p>
              </div>
            </div>
            <Link href="/billing/invoices">
              <Button variant="outline">
                View Invoices
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
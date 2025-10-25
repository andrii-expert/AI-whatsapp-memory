"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useFieldArray,
  useForm,
  type SubmitHandler,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@imaginecalendar/ui/card";
import { Button } from "@imaginecalendar/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@imaginecalendar/ui/table";
import { Badge } from "@imaginecalendar/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@imaginecalendar/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@imaginecalendar/ui/form";
import { Input } from "@imaginecalendar/ui/input";
import { Textarea } from "@imaginecalendar/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { Switch } from "@imaginecalendar/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { cn } from "@imaginecalendar/ui/cn";
import {
  Layers,
  Plus,
  MoreHorizontal,
  Pencil,
  Archive,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Check,
  ListPlus,
  Trash,
} from "lucide-react";
import type { RouterOutputs } from "@api/trpc/routers/_app";

type PlanDto = RouterOutputs["admin"]["plans"]["list"][number];

const payfastFrequencyOptions = [
  { value: "1", label: "Daily" },
  { value: "2", label: "Weekly" },
  { value: "3", label: "Monthly" },
  { value: "4", label: "Quarterly" },
  { value: "5", label: "Bi-Annually" },
  { value: "6", label: "Annually" },
];

const featureSchema = z.object({ label: z.string().min(1).max(160).trim() });

const planFormBaseSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(160).trim(),
  description: z.string().min(1).max(600).trim(),
  billingPeriod: z.string().min(1).max(120).trim(),
  displayPrice: z.string().min(1).max(48).trim(),
  amountCents: z.number().int().min(0).max(5_000_000_00),
  monthlyPriceCents: z.number().int().min(0).max(5_000_000_00),
  trialDays: z.number().int().min(0).max(365),
  status: z.enum(["draft", "active", "archived"]),
  features: z.array(featureSchema).min(1).max(20),
  payfastRecurring: z.boolean(),
  payfastFrequency: z.string().nullable(),
});

const planFormSchema = planFormBaseSchema.superRefine((data, ctx) => {
  if (data.payfastRecurring && !data.payfastFrequency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Frequency is required when recurring is enabled",
      path: ["payfastFrequency"],
    });
  }

  if (!data.payfastRecurring && data.payfastFrequency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Frequency must be empty when recurring is disabled",
      path: ["payfastFrequency"],
    });
  }
});

type PlanFormValues = z.infer<typeof planFormSchema>;

type PayfastConfigDto = {
  recurring?: boolean | null;
  frequency?: number | null;
} | null;

const parsePayfastConfig = (input: PayfastConfigDto) => {
  const config = (input ?? {}) as {
    recurring?: boolean | null;
    frequency?: number | null;
  };

  const recurring = Boolean(config.recurring);
  const frequency = typeof config.frequency === "number" ? config.frequency : null;

  return { recurring, frequency };
};

function PlanStatusBadge({ status }: { status: PlanDto["status"] }) {
  const variantMap: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    active: "bg-emerald-100 text-emerald-800",
    archived: "bg-amber-100 text-amber-800",
  };

  return (
    <Badge className={cn("px-2", variantMap[status] ?? "bg-gray-100 text-gray-700")}>{status}</Badge>
  );
}

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPlan?: PlanDto;
}

function PlanFormDialog({ open, onOpenChange, initialPlan }: PlanFormDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const defaultValues = useMemo<PlanFormValues>(() => {
    if (!initialPlan) {
      return {
        id: "",
        name: "",
        description: "",
        billingPeriod: "",
        displayPrice: "",
        amountCents: 0,
        monthlyPriceCents: 0,
        trialDays: 0,
        status: "draft",
        features: [{ label: "" }],
        payfastRecurring: false,
        payfastFrequency: null,
      };
    }

    const payfast = parsePayfastConfig(initialPlan.payfastConfig as PayfastConfigDto);

    return {
      id: initialPlan.id,
      name: initialPlan.name,
      description: initialPlan.description,
      billingPeriod: initialPlan.billingPeriod,
      displayPrice: initialPlan.displayPrice,
      amountCents: initialPlan.amountCents,
      monthlyPriceCents: initialPlan.monthlyPriceCents,
      trialDays: initialPlan.trialDays,
      status: initialPlan.status,
      features:
        initialPlan.features.length > 0
          ? initialPlan.features.map((feature) => ({ label: feature.label }))
          : [{ label: "" }],
      payfastRecurring: payfast.recurring,
      payfastFrequency: payfast.frequency != null ? String(payfast.frequency) : null,
    };
  }, [initialPlan]);

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues,
  });

  const { control, handleSubmit, watch, reset, setValue } = form;
  const featureArray = useFieldArray({ control, name: "features" });
  const isRecurring = watch("payfastRecurring");

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  useEffect(() => {
    if (!isRecurring) {
      setValue("payfastFrequency", null, { shouldValidate: true });
    }
  }, [isRecurring, setValue]);

  const invalidatePlans = async () => {
    await queryClient.invalidateQueries({ 
      queryKey: trpc.admin.plans.list.queryOptions().queryKey 
    });
  };

  const createPlanMutation = useMutation(
    trpc.admin.plans.create.mutationOptions({
      onSuccess: async () => {
        await invalidatePlans();
        toast({ title: "Plan created", description: "The subscription plan is now available." });
        onOpenChange(false);
        reset(defaultValues);
      },
      onError: (error) => {
        toast({
          title: "Failed to create plan",
          description: error.message,
          variant: "destructive",
        });
      },
    })
  );

  const updatePlanMutation = useMutation(
    trpc.admin.plans.update.mutationOptions({
      onSuccess: async () => {
        await invalidatePlans();
        toast({ title: "Plan updated", description: "The subscription plan has been updated." });
        onOpenChange(false);
      },
      onError: (error) => {
        toast({
          title: "Failed to update plan",
          description: error.message,
          variant: "destructive",
        });
      },
    })
  );

  const onSubmit: SubmitHandler<PlanFormValues> = (values) => {
    const payload = {
      id: values.id.trim().toLowerCase(),
      name: values.name.trim(),
      description: values.description.trim(),
      billingPeriod: values.billingPeriod.trim(),
      displayPrice: values.displayPrice.trim(),
      amountCents: values.amountCents,
      monthlyPriceCents: values.monthlyPriceCents,
      trialDays: values.trialDays,
      status: values.status,
      payfastConfig: {
        recurring: values.payfastRecurring,
        frequency:
          values.payfastRecurring && values.payfastFrequency
            ? Number(values.payfastFrequency)
            : null,
      },
      features: values.features.map((feature, index) => ({
        label: feature.label.trim(),
        position: index,
      })),
    } as const;

    if (initialPlan) {
      updatePlanMutation.mutate(payload);
    } else {
      createPlanMutation.mutate(payload);
    }
  };

  const isSubmitting = createPlanMutation.isPending || updatePlanMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onOpenChange(false);
          reset(defaultValues);
        } else {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto max-w-4xl p-6">
        <DialogHeader>
          <DialogTitle>{initialPlan ? "Edit Plan" : "Create Plan"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={control}
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Identifier</FormLabel>
                    <FormControl>
                      <Input placeholder="trial" {...field} disabled={Boolean(initialPlan)} />
                    </FormControl>
                    <FormDescription>Unique slug (lowercase, numbers, hyphens)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Free Trial" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} placeholder="Describe what's included in this plan..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 pb-1">
                <div className="h-px bg-border flex-1" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pricing Details</h3>
                <div className="h-px bg-border flex-1" />
              </div>
              
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={control}
                name="billingPeriod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Period</FormLabel>
                    <FormControl>
                      <Input placeholder="per month" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="displayPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Price</FormLabel>
                    <FormControl>
                      <Input placeholder="R99" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={control}
                name="amountCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (cents)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Billed amount in cents (e.g., 9900 = R99)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="monthlyPriceCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly Price (cents)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Monthly equivalent for comparison</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={control}
                name="trialDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trial Days</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            </div>
            
            <div className="rounded-lg border border-border bg-muted/30 p-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-base font-semibold">PayFast Configuration</h3>
                  <p className="text-sm text-muted-foreground mt-1">Configure recurring billing settings</p>
                </div>
                <FormField
                  control={control}
                  name="payfastRecurring"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-3 space-y-0">
                      <FormLabel className="text-sm font-medium">Recurring</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              {isRecurring && (
                <FormField
                  control={control}
                  name="payfastFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Frequency</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {payfastFrequencyOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Plan Features</h3>
                  <p className="text-sm text-muted-foreground mt-1">Add features included in this plan</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => featureArray.append({ label: "" })}
                >
                  <ListPlus className="mr-2 h-4 w-4" />
                  Add Feature
                </Button>
              </div>
              <div className="space-y-2">
                {featureArray.fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-2">
                    <div className="flex items-center justify-center w-6 h-10 text-sm text-muted-foreground">
                      {index + 1}.
                    </div>
                    <FormField
                      control={control}
                      name={`features.${index}.label` as const}
                      render={({ field: featureField }) => (
                        <FormItem className="flex-1">
                          <FormLabel className="sr-only">Feature {index + 1}</FormLabel>
                          <FormControl>
                            <Input placeholder="Feature description" {...featureField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => featureArray.remove(index)}
                      disabled={featureArray.fields.length === 1}
                      className="mt-1"
                    >
                      <Trash className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="mt-6 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {initialPlan ? "Update Plan" : "Create Plan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function PlansPage() {
  const trpc = useTRPC();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<PlanDto | null>(null);

  const plansQuery = useQuery(trpc.admin.plans.list.queryOptions());

  const invalidatePlans = async () => {
    await queryClient.invalidateQueries({ 
      queryKey: trpc.admin.plans.list.queryOptions().queryKey 
    });
  };

  const setStatusMutation = useMutation(
    trpc.admin.plans.setStatus.mutationOptions({
      onSuccess: async () => {
        await invalidatePlans();
      },
      onError: (error) => {
        toast({
          title: "Failed to update plan",
          description: error.message,
          variant: "destructive",
        });
      },
    })
  );

  const reorderMutation = useMutation(
    trpc.admin.plans.reorder.mutationOptions({
      onSuccess: async () => {
        await invalidatePlans();
        toast({ title: "Plans reordered", description: "Display order updated." });
      },
      onError: (error) => {
        toast({
          title: "Failed to reorder plans",
          description: error.message,
          variant: "destructive",
        });
      },
    })
  );

  const isLoading = plansQuery.isLoading || plansQuery.isFetching;
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const orderedPlans = useMemo(
    () =>
      [...plans].sort((a, b) => {
        const sortDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (sortDiff !== 0) return sortDiff;
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return aTime - bTime;
      }),
    [plans]
  );

  const handleStatusToggle = (plan: PlanDto) => {
    const nextStatus = plan.status === "archived" ? "active" : "archived";
    setStatusMutation.mutate({ id: plan.id, status: nextStatus });
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const nextPlans = [...orderedPlans];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nextPlans.length) return;
    const [removed] = nextPlans.splice(index, 1);
    if (!removed) return;
    nextPlans.splice(targetIndex, 0, removed);

    reorderMutation.mutate({
      plans: nextPlans.map((plan, idx) => ({ id: plan.id, sortOrder: idx })),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Plans</h1>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Plans</h1>
          <p className="text-muted-foreground">Manage subscription plans and features</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Plan
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Subscription Plans
          </CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => plansQuery.refetch()}
            disabled={plansQuery.isRefetching}
          >
            {plansQuery.isRefetching ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Refreshing
              </>
            ) : (
              <>
                <RotateCw className="mr-2 h-4 w-4" />
                Refresh
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Features</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedPlans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No plans configured yet.
                  </TableCell>
                </TableRow>
              ) : (
                orderedPlans.map((plan, index) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-mono text-xs">{plan.id}</TableCell>
                    <TableCell>{plan.name}</TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div className="font-medium">{plan.displayPrice}</div>
                        <div className="text-muted-foreground">
                          {(plan.amountCents / 100).toLocaleString("en-ZA", {
                            style: "currency",
                            currency: "ZAR",
                          })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PlanStatusBadge status={plan.status} />
                    </TableCell>
                    <TableCell>{plan.trialDays} days</TableCell>
                    <TableCell className="max-w-xs">
                      <ul className="list-disc space-y-1 pl-4 text-sm">
                        {plan.features.map((feature) => (
                          <li key={feature.id}>{feature.label}</li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell>
                      {new Date(plan.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMove(index, "up")}
                            disabled={index === 0 || reorderMutation.isPending}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMove(index, "down")}
                            disabled={index === orderedPlans.length - 1 || reorderMutation.isPending}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditPlan(plan);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleStatusToggle(plan)}>
                              <Archive className="mr-2 h-4 w-4" />
                              {plan.status === "archived" ? "Activate" : "Archive"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PlanFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editPlan && (
        <PlanFormDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEditPlan(null);
            }
          }}
          initialPlan={editPlan}
        />
      )}
    </div>
  );
}

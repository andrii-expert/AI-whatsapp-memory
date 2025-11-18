"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  Plus,
  Trash2,
  Pencil,
  Search,
  MoreVertical,
  BellRing,
  Clock,
  Calendar,
} from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@imaginecalendar/ui/select";
import { Switch } from "@imaginecalendar/ui/switch";
import { Badge } from "@imaginecalendar/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@imaginecalendar/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@imaginecalendar/ui/alert-dialog";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { usePlanLimits } from "@/hooks/use-plan-limits";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import Link from "next/link";
import { Home, ChevronLeft } from "lucide-react";

// ==================== TYPES ====================

type ReminderFrequency = "daily" | "hourly" | "minutely" | "once" | "monthly" | "yearly";

interface Reminder {
  id: string;
  title: string;
  frequency: ReminderFrequency;
  time: string | null; // HH:MM format for daily
  minuteOfHour: number | null; // 0-59 for hourly
  intervalMinutes: number | null; // for minutely
  daysFromNow: number | null; // for once reminders
  targetDate: Date | null; // for once reminders
  dayOfMonth: number | null; // for monthly/yearly reminders
  month: number | null; // for yearly reminders
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ReminderFormData {
  id: string | null;
  title: string;
  frequency: ReminderFrequency;
  time: string;
  minuteOfHour: number;
  intervalMinutes: number;
  daysFromNow: number;
  targetDate: string; // ISO date string for datetime-local input
  dayOfMonth: number;
  month: number;
  active: boolean;
}

// ==================== UTILITY FUNCTIONS ====================

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function parseTimeStringToToday(timeStr: string): Date {
  const parts = timeStr.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(h, m, 0, 0);
  return d;
}

function nextForDaily(timeStr: string, from: Date = new Date()): Date {
  const target = parseTimeStringToToday(timeStr);
  if (target <= from) {
    const t = new Date(target);
    t.setDate(t.getDate() + 1);
    return t;
  }
  return target;
}

function nextForHourly(minuteOfHour: number = 0, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setSeconds(0, 0);
  const minute = minuteOfHour ?? 0;
  if (d.getMinutes() < minute) {
    d.setMinutes(minute, 0, 0);
  } else {
    d.setHours(d.getHours() + 1, minute, 0, 0);
  }
  return d;
}

function nextForMinutely(interval: number = 1, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const remainder = mins % interval;
  if (remainder === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0 && from < d) 
    return d;
  const add = remainder === 0 ? interval : interval - remainder;
  d.setMinutes(mins + add, 0, 0);
  return d;
}

function nextForOnce(daysFromNow: number | null, targetDate: Date | null, from: Date = new Date()): Date | null {
  if (targetDate) {
    const target = new Date(targetDate);
    return target > from ? target : null;
  }
  if (daysFromNow !== null) {
    const d = new Date(from);
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(9, 0, 0, 0); // Default to 9 AM
    return d;
  }
  return null;
}

function nextForMonthly(dayOfMonth: number, time: string | null, from: Date = new Date()): Date {
  const d = new Date(from);
  const targetDay = Math.min(dayOfMonth, 31);
  const [hours, minutes] = time ? time.split(":").map(Number) : [9, 0];
  
  // Set to this month first
  d.setDate(targetDay);
  d.setHours(hours ?? 9, minutes ?? 0, 0, 0);
  
  // If the date has passed this month, move to next month
  if (d <= from) {
    d.setMonth(d.getMonth() + 1);
    // Handle edge case where day doesn't exist in next month (e.g., Feb 31)
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (targetDay > lastDayOfMonth) {
      d.setDate(lastDayOfMonth);
    } else {
      d.setDate(targetDay);
    }
  }
  
  return d;
}

function nextForYearly(month: number, dayOfMonth: number, time: string | null, from: Date = new Date()): Date {
  const d = new Date(from);
  const targetDay = Math.min(dayOfMonth, 31);
  const [hours, minutes] = time ? time.split(":").map(Number) : [9, 0];
  
  // Set to this year first
  d.setMonth(month - 1); // month is 1-12, setMonth expects 0-11
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDayOfMonth));
  d.setHours(hours ?? 9, minutes ?? 0, 0, 0);
  
  // If the date has passed this year, move to next year
  if (d <= from) {
    d.setFullYear(d.getFullYear() + 1);
    // Recalculate last day of month for next year
    const nextYearLastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, nextYearLastDay));
  }
  
  return d;
}

function computeNext(reminder: Reminder, from: Date = new Date()): Date | null {
  if (!reminder.active) return null;
  switch (reminder.frequency) {
    case "daily":
      return nextForDaily(reminder.time || "09:00", from);
    case "hourly":
      return nextForHourly(Number(reminder.minuteOfHour ?? 0), from);
    case "minutely":
      return nextForMinutely(Math.max(1, Number(reminder.intervalMinutes ?? 1)), from);
    case "once":
      return nextForOnce(reminder.daysFromNow, reminder.targetDate, from);
    case "monthly":
      return nextForMonthly(Number(reminder.dayOfMonth ?? 1), reminder.time, from);
    case "yearly":
      return nextForYearly(
        Number(reminder.month ?? 1),
        Number(reminder.dayOfMonth ?? 1),
        reminder.time,
        from
      );
    default:
      return null;
  }
}

function formatDateTime(d: Date | null): string {
  if (!d) return "";
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${d.toLocaleDateString()} ${hh}:${mm}`;
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (hours > 1) return `in ${hours} hours`;
  if (hours === 1) return "in 1 hour";
  if (minutes > 1) return `in ${minutes} minutes`;
  if (minutes === 1) return "in 1 minute";
  if (seconds > 0) return "in a few seconds";
  return "now";
}

function getFrequencyDescription(reminder: Reminder): string {
  switch (reminder.frequency) {
    case "daily":
      return `Every day at ${reminder.time || "00:00"}`;
    case "hourly":
      return `Every hour at :${pad(reminder.minuteOfHour || 0)}`;
    case "minutely":
      return `Every ${reminder.intervalMinutes || 5} minute${(reminder.intervalMinutes || 5) > 1 ? 's' : ''}`;
    case "once":
      if (reminder.targetDate) {
        const target = new Date(reminder.targetDate);
        return `On ${target.toLocaleDateString()} at ${target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (reminder.daysFromNow !== null) {
        const days = reminder.daysFromNow;
        if (days === 0) return "Today";
        if (days === 1) return "Tomorrow";
        return `In ${days} day${days > 1 ? 's' : ''}`;
      }
      return "One-time reminder";
    case "monthly":
      const day = reminder.dayOfMonth || 1;
      const suffix = day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th";
      return `On the ${day}${suffix} of every month${reminder.time ? ` at ${reminder.time}` : ''}`;
    case "yearly":
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const m = reminder.month || 1;
      const d = reminder.dayOfMonth || 1;
      const daySuffix = d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th";
      return `Every year on ${monthNames[m - 1]} ${d}${daySuffix}${reminder.time ? ` at ${reminder.time}` : ''}`;
    default:
      return "";
  }
}

// ==================== MAIN COMPONENT ====================

export default function RemindersPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { limits, isLoading: isLoadingLimits } = usePlanLimits();
  const hasRemindersAccess = limits.hasReminders;
  const { toast } = useToast();

  // Fetch reminders from database
  const { data: reminders = [], isLoading, error } = useQuery(
    trpc.reminders.list.queryOptions()
  );

  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<string | null>(null);
  
  const initialFormState: ReminderFormData = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    
    return {
      id: null,
      title: "",
      frequency: "daily",
      time: "17:00",
      minuteOfHour: 0,
      intervalMinutes: 5,
      daysFromNow: 1,
      targetDate: tomorrow.toISOString().slice(0, 16), // Format for datetime-local input
      dayOfMonth: 1,
      month: 1,
      active: true,
    };
  }, []);
  
  const [form, setForm] = useState<ReminderFormData>(initialFormState);

  // Mutations
  const createMutation = useMutation(
    trpc.reminders.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Reminder created successfully" });
      },
      onError: (error: any) => {
        toast({
          title: "Failed to create reminder",
          description: error?.message || "Please try again",
          variant: "destructive",
        });
      },
    })
  );

  const updateMutation = useMutation(
    trpc.reminders.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Reminder updated successfully" });
      },
      onError: (error: any) => {
        toast({
          title: "Failed to update reminder",
          description: error?.message || "Please try again",
          variant: "destructive",
        });
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.reminders.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Reminder deleted successfully" });
      },
      onError: (error: any) => {
        toast({
          title: "Failed to delete reminder",
          description: error?.message || "Please try again",
          variant: "destructive",
        });
      },
    })
  );

  const toggleActiveMutation = useMutation(
    trpc.reminders.toggleActive.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
      onError: (error: any) => {
        toast({
          title: "Failed to toggle reminder",
          description: error?.message || "Please try again",
          variant: "destructive",
        });
      },
    })
  );

  // Filter and sort reminders
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reminders
      .map((r) => {
        // Prepare reminder object for compute function
        const reminderForCompute: Reminder = {
          ...r,
          time: r.time ?? null,
          minuteOfHour: r.minuteOfHour ?? null,
          intervalMinutes: r.intervalMinutes ?? null,
          daysFromNow: r.daysFromNow ?? null,
          targetDate: r.targetDate ? (r.targetDate instanceof Date ? r.targetDate : new Date(r.targetDate)) : null,
          dayOfMonth: r.dayOfMonth ?? null,
          month: r.month ?? null,
          createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
        };
        return { 
          ...r, 
          nextAt: computeNext(reminderForCompute)
        };
      })
      .filter((r) => (q ? r.title.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        // Active reminders first, sorted by next occurrence
        if (a.active && b.active) {
          const aTime = a.nextAt?.getTime() || Infinity;
          const bTime = b.nextAt?.getTime() || Infinity;
          return aTime - bTime;
        }
        if (a.active) return -1;
        if (b.active) return 1;
        // Inactive sorted by creation date (newest first)
        const aCreatedAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const bCreatedAt = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return bCreatedAt.getTime() - aCreatedAt.getTime();
      });
  }, [reminders, query]);

  const resetForm = useCallback(() => {
    setForm(initialFormState);
  }, [initialFormState]);

  const openNewForm = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to close modal
      if (e.key === "Escape" && showForm) {
        setShowForm(false);
        resetForm();
      }
      // Ctrl/Cmd + K to open new reminder form
      if ((e.ctrlKey || e.metaKey) && e.key === "k" && !showForm) {
        e.preventDefault();
        openNewForm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showForm, resetForm, openNewForm]);

  const openEditForm = useCallback((reminder: Reminder) => {
    const targetDateValue = reminder.targetDate 
      ? (reminder.targetDate instanceof Date 
          ? reminder.targetDate 
          : new Date(reminder.targetDate)
        ).toISOString().slice(0, 16)
      : initialFormState.targetDate;
    
    setForm({
      id: reminder.id,
      title: reminder.title,
      frequency: reminder.frequency,
      time: reminder.time || "17:00",
      minuteOfHour: reminder.minuteOfHour || 0,
      intervalMinutes: reminder.intervalMinutes || 5,
      daysFromNow: reminder.daysFromNow ?? 1,
      targetDate: targetDateValue,
      dayOfMonth: reminder.dayOfMonth ?? 1,
      month: reminder.month ?? 1,
      active: reminder.active,
    });
    setShowForm(true);
  }, [initialFormState]);

  const validateForm = (): string | null => {
    if (!form.title.trim()) {
      return "Please enter a title for your reminder";
    }
    if (form.title.trim().length > 100) {
      return "Title must be 100 characters or less";
    }
    if (form.frequency === "hourly" && (form.minuteOfHour < 0 || form.minuteOfHour > 59)) {
      return "Minute of hour must be between 0 and 59";
    }
    if (form.frequency === "minutely" && (form.intervalMinutes < 1 || form.intervalMinutes > 720)) {
      return "Interval must be between 1 and 720 minutes";
    }
    if (form.frequency === "once") {
      const hasTargetDate = form.targetDate && form.targetDate.trim() !== "";
      const hasDaysFromNow = form.daysFromNow !== undefined && form.daysFromNow >= 0;
      if (!hasTargetDate && !hasDaysFromNow) {
        return "Please specify either days from now or a target date";
      }
    }
    if (form.frequency === "monthly" && (form.dayOfMonth < 1 || form.dayOfMonth > 31)) {
      return "Day of month must be between 1 and 31";
    }
    if (form.frequency === "yearly") {
      if (form.month < 1 || form.month > 12) {
        return "Month must be between 1 and 12";
      }
      if (form.dayOfMonth < 1 || form.dayOfMonth > 31) {
        return "Day of month must be between 1 and 31";
      }
    }
    return null;
  };

  const saveForm = useCallback(async () => {
    const validationError = validateForm();
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    const payload: any = {
      title: form.title,
      frequency: form.frequency,
      active: form.active,
    };
    
    // Add frequency-specific fields
    if (form.frequency === "daily") {
      payload.time = form.time;
    } else if (form.frequency === "hourly") {
      payload.minuteOfHour = form.minuteOfHour;
    } else if (form.frequency === "minutely") {
      payload.intervalMinutes = form.intervalMinutes;
    } else if (form.frequency === "once") {
      if (form.targetDate && form.targetDate.trim() !== "") {
        payload.targetDate = new Date(form.targetDate);
      } else {
        payload.daysFromNow = form.daysFromNow;
      }
    } else if (form.frequency === "monthly") {
      payload.dayOfMonth = form.dayOfMonth;
      if (form.time) payload.time = form.time;
    } else if (form.frequency === "yearly") {
      payload.month = form.month;
      payload.dayOfMonth = form.dayOfMonth;
      if (form.time) payload.time = form.time;
    }
    
    try {
      if (form.id) {
        // Update existing reminder
        await updateMutation.mutateAsync({ id: form.id, ...payload });
      } else {
        // Create new reminder
        await createMutation.mutateAsync(payload);
      }
      
      setShowForm(false);
      resetForm();
    } catch (error) {
      // Error handling is done in the mutation
    }
  }, [form, toast, resetForm, createMutation, updateMutation]);

  const confirmDelete = useCallback((id: string) => {
    setReminderToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const removeReminder = useCallback(async () => {
    if (!reminderToDelete) return;
    
    try {
      await deleteMutation.mutateAsync({ id: reminderToDelete });
      setDeleteDialogOpen(false);
      setReminderToDelete(null);
    } catch (error) {
      // Error handling is done in the mutation
    }
  }, [reminderToDelete, deleteMutation]);

  const toggleActive = useCallback(async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) return;
    
    const newActive = !reminder.active;
    try {
      await toggleActiveMutation.mutateAsync({ id, active: newActive });
      toast({
        title: newActive ? "Reminder Activated" : "Reminder Paused",
        description: `"${reminder.title}" is now ${newActive ? "active" : "paused"}.`,
      });
    } catch (error) {
      // Error handling is done in the mutation
    }
  }, [reminders, toast, toggleActiveMutation]);

  if (isLoadingLimits) {
    return (
      <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasRemindersAccess) {
  return (
    <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl space-y-6">
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
        <span className="font-medium">Reminders</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Reminders</h1>
        <p className="text-muted-foreground mt-2">
          Set and manage your reminders
        </p>
      </div>

        <UpgradePrompt 
          feature="WhatsApp Reminders" 
          requiredTier="silver" 
          variant="card"
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl space-y-6">
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
        <span className="font-medium">Reminders</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Reminders</h1>
        <p className="text-muted-foreground mt-2">
          Create and manage recurring reminders
        </p>
      </div>

      {/* Search and Add Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm md:max-w-md lg:max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            placeholder="Search reminders..."
            className="pl-10"
          />
        </div>
        <Button
          onClick={openNewForm}
          type="button"
          variant="orange-primary"
          className="w-full sm:w-auto"
        >
          <Plus size={18} className="mr-2" /> New Reminder
        </Button>
      </div>

        {/* Stats */}
        {reminders.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="rounded-xl border-slate-200">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-[hsl(var(--brand-orange))]">{reminders.length}</div>
                <div className="text-xs text-slate-600">Total Reminders</div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border-slate-200">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-600">
                  {reminders.filter((r) => r.active).length}
                </div>
                <div className="text-xs text-slate-600">Active</div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border-slate-200">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-slate-400">
                  {reminders.filter((r) => !r.active).length}
                </div>
                <div className="text-xs text-slate-600">Paused</div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border-slate-200">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-purple-600">
                  {reminders.filter((r) => r.frequency === "daily").length}
                </div>
                <div className="text-xs text-slate-600">Daily</div>
              </CardContent>
            </Card>
          </div>
        )}

      {/* Reminders Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => (
          <div
            key={r.id}
            className="animate-in fade-in-50 slide-in-from-bottom-2 duration-200"
          >
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BellRing size={16} className="text-primary flex-shrink-0" />
                      <span className="truncate">{r.title}</span>
                    </CardTitle>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {getFrequencyDescription(r)}
                    </div>
                    {r.active && r.nextAt && (
                      <div className="mt-2 text-xs font-medium text-green-600">
                        Next: {getRelativeTime(r.nextAt)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch
                      checked={r.active}
                      onCheckedChange={() => toggleActive(r.id)}
                      aria-label={`Toggle ${r.title}`}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditForm(r)}>
                          <Pencil size={14} className="mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => confirmDelete(r.id)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 size={14} className="mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={r.active ? "default" : "secondary"}>
                    {r.active ? "Active" : "Paused"}
                  </Badge>
                  <span>•</span>
                  <span className="capitalize">{r.frequency}</span>
                  <span>•</span>
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Empty States */}
      {filtered.length === 0 && query && (
        <div className="col-span-full text-center py-12 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-sm">No reminders found matching "{query}"</p>
        </div>
      )}

      {filtered.length === 0 && !query && (
        <div className="col-span-full text-center py-12 text-muted-foreground">
          <BellRing className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-sm">No reminders found. Create your first reminder here or through WhatsApp!</p>
        </div>
      )}

      {/* Form Modal */}
      <AlertDialog 
        open={showForm} 
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader className="space-y-3 pb-4 border-b">
            <AlertDialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  form.id ? "bg-indigo-100" : "bg-blue-100"
                }`}
              >
                {form.id ? (
                  <Pencil className="h-5 w-5 text-indigo-600" />
                ) : (
                  <Plus className="h-5 w-5 text-blue-600" />
                )}
              </div>
              {form.id ? "Edit Reminder" : "Add New Reminder"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {form.id
                ? "Update your reminder settings"
                : "Create a new recurring reminder"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); saveForm(); }} className="space-y-6 pt-2">
            {/* Title */}
            <div className="space-y-2">
              <Label
                htmlFor="title"
                className="text-sm font-semibold text-gray-700 flex items-center gap-1"
              >
                Title
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g., Daily standup meeting"
                value={form.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                  setForm({ ...form, title: e.target.value })
                }
                className="w-full h-11 text-base"
                autoFocus
                required
                maxLength={100}
              />
              <p className="text-xs text-gray-500">
                {form.title.length}/100 characters
              </p>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="frequency" className="text-sm font-semibold text-gray-700">
                Frequency
              </Label>
              <Select
                value={form.frequency}
                onValueChange={(v: string) =>
                  setForm({ ...form, frequency: v as ReminderFrequency })
                }
              >
                <SelectTrigger className="h-11" id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="hourly">Every hour</SelectItem>
                  <SelectItem value="minutely">Every N minutes</SelectItem>
                  <SelectItem value="once">One-time reminder</SelectItem>
                  <SelectItem value="monthly">Monthly (specific date)</SelectItem>
                  <SelectItem value="yearly">Yearly (specific date)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Daily - Time */}
            {form.frequency === "daily" && (
              <div className="space-y-2">
                <Label htmlFor="time" className="text-sm font-semibold text-gray-700">
                  Time
                </Label>
                <Input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                    setForm({ ...form, time: e.target.value })
                  }
                  className="h-11"
                />
              </div>
            )}

            {/* Hourly - Minute */}
            {form.frequency === "hourly" && (
              <div className="space-y-2">
                <Label htmlFor="minuteOfHour" className="text-sm font-semibold text-gray-700">
                  Minute of each hour
                </Label>
                <Input
                  id="minuteOfHour"
                  type="number"
                  min={0}
                  max={59}
                  value={form.minuteOfHour}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, minuteOfHour: Number(e.target.value) })
                  }
                  className="h-11"
                />
                <p className="text-xs text-gray-500">
                  Reminder will trigger at :{pad(form.minuteOfHour)} of every hour
                </p>
              </div>
            )}

            {/* Minutely - Interval */}
            {form.frequency === "minutely" && (
              <div className="space-y-2">
                <Label htmlFor="intervalMinutes" className="text-sm font-semibold text-gray-700">
                  Interval (minutes)
                </Label>
                <Input
                  id="intervalMinutes"
                  type="number"
                  min={1}
                  max={720}
                  value={form.intervalMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, intervalMinutes: Number(e.target.value) })
                  }
                  className="h-11"
                />
                <p className="text-xs text-gray-500">
                  Reminder will trigger every {form.intervalMinutes} minute
                  {form.intervalMinutes > 1 ? "s" : ""}
                </p>
              </div>
            )}

            {/* Once - Days from now or Target Date */}
            {form.frequency === "once" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">
                    Reminder Type
                  </Label>
                  <Select
                    value={form.targetDate ? "date" : "days"}
                    onValueChange={(v: string) => {
                      if (v === "date") {
                        const now = new Date();
                        now.setHours(9, 0, 0, 0);
                        setForm({ ...form, targetDate: now.toISOString().slice(0, 16), daysFromNow: 0 });
                      } else {
                        setForm({ ...form, targetDate: "", daysFromNow: 1 });
                      }
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">In X days from now</SelectItem>
                      <SelectItem value="date">On a specific date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.targetDate ? (
                  <div className="space-y-2">
                    <Label htmlFor="targetDate" className="text-sm font-semibold text-gray-700">
                      Date & Time
                    </Label>
                    <Input
                      id="targetDate"
                      type="datetime-local"
                      value={form.targetDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm({ ...form, targetDate: e.target.value })
                      }
                      className="h-11"
                      min={new Date().toISOString().slice(0, 16)}
                    />
                    <p className="text-xs text-gray-500">
                      Reminder will trigger on this specific date and time
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="daysFromNow" className="text-sm font-semibold text-gray-700">
                      Days from now
                    </Label>
                    <Input
                      id="daysFromNow"
                      type="number"
                      min={0}
                      max={3650}
                      value={form.daysFromNow}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm({ ...form, daysFromNow: Number(e.target.value) })
                      }
                      className="h-11"
                    />
                    <p className="text-xs text-gray-500">
                      Reminder will trigger in {form.daysFromNow} day{form.daysFromNow !== 1 ? "s" : ""} from now
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Monthly - Day of month */}
            {form.frequency === "monthly" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dayOfMonth" className="text-sm font-semibold text-gray-700">
                    Day of month
                  </Label>
                  <Input
                    id="dayOfMonth"
                    type="number"
                    min={1}
                    max={31}
                    value={form.dayOfMonth}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, dayOfMonth: Number(e.target.value) })
                    }
                    className="h-11"
                  />
                  <p className="text-xs text-gray-500">
                    Reminder will trigger on the {form.dayOfMonth}
                    {form.dayOfMonth === 1 ? "st" : form.dayOfMonth === 2 ? "nd" : form.dayOfMonth === 3 ? "rd" : "th"} of every month
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time" className="text-sm font-semibold text-gray-700">
                    Time (optional)
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                      setForm({ ...form, time: e.target.value })
                    }
                    className="h-11"
                  />
                </div>
              </div>
            )}

            {/* Yearly - Month and Day */}
            {form.frequency === "yearly" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="month" className="text-sm font-semibold text-gray-700">
                      Month
                    </Label>
                    <Select
                      value={form.month.toString()}
                      onValueChange={(v: string) =>
                        setForm({ ...form, month: Number(v) })
                      }
                    >
                      <SelectTrigger className="h-11" id="month">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">January</SelectItem>
                        <SelectItem value="2">February</SelectItem>
                        <SelectItem value="3">March</SelectItem>
                        <SelectItem value="4">April</SelectItem>
                        <SelectItem value="5">May</SelectItem>
                        <SelectItem value="6">June</SelectItem>
                        <SelectItem value="7">July</SelectItem>
                        <SelectItem value="8">August</SelectItem>
                        <SelectItem value="9">September</SelectItem>
                        <SelectItem value="10">October</SelectItem>
                        <SelectItem value="11">November</SelectItem>
                        <SelectItem value="12">December</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dayOfMonth" className="text-sm font-semibold text-gray-700">
                      Day
                    </Label>
                    <Input
                      id="dayOfMonth"
                      type="number"
                      min={1}
                      max={31}
                      value={form.dayOfMonth}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm({ ...form, dayOfMonth: Number(e.target.value) })
                      }
                      className="h-11"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time" className="text-sm font-semibold text-gray-700">
                    Time (optional)
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                      setForm({ ...form, time: e.target.value })
                    }
                    className="h-11"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Reminder will trigger every year on{" "}
                  {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][form.month - 1]} {form.dayOfMonth}
                  {form.dayOfMonth === 1 ? "st" : form.dayOfMonth === 2 ? "nd" : form.dayOfMonth === 3 ? "rd" : "th"}
                </p>
              </div>
            )}

            {/* Active Toggle */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
              <span className="text-sm font-medium text-gray-700">
                Start reminder immediately
              </span>
              <Switch
                checked={form.active}
                onCheckedChange={(v: boolean) => setForm({ ...form, active: v })}
                aria-label="Active status"
              />
            </div>

            {/* Footer Buttons */}
            <AlertDialogFooter className="gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="flex-1 sm:flex-none h-11"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="blue-primary"
                className="flex-1 sm:flex-none h-11 min-w-[140px]"
              >
                {form.id ? "Update Reminder" : "Add Reminder"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              Delete Reminder
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-base pt-2">
              <p className="text-gray-700">
                Are you sure you want to delete the reminder
                {reminderToDelete && (() => {
                  const reminder = reminders.find((r) => r.id === reminderToDelete);
                  return reminder ? ` "${reminder.title}"` : "";
                })()}
                ?
              </p>
              <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-900 font-medium">
                  ⚠️ This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 pt-4">
            <AlertDialogCancel
              onClick={() => setReminderToDelete(null)}
              className="flex-1 sm:flex-none h-11"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={removeReminder}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 flex-1 sm:flex-none h-11 min-w-[140px]"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Reminder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

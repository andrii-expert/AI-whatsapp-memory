"use client";

import { useTRPC } from "@/trpc/client";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import { useToast } from "@imaginecalendar/ui/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@imaginecalendar/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
} from "@imaginecalendar/ui/alert-dialog";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Calendar,
  MessageSquare,
  CheckCircle2,
  Circle,
  BellRing,
  CheckSquare,
  StickyNote,
  Clock,
  LayoutDashboard,
  ArrowRight,
  AlertCircle,
  Menu,
  X,
  Search,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { cn } from "@imaginecalendar/ui/cn";
import { startOfDay, endOfDay, isSameDay, format } from "date-fns";
import { WelcomeModal } from "@/components/welcome-modal";

export default function DashboardPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<any | null>(null);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);

  // Check if welcome modal should be shown
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const showModal = localStorage.getItem("show-welcome-modal");
      const hasBeenShown = localStorage.getItem("welcome-modal-shown");
      
      if (showModal === "true" && !hasBeenShown) {
        setIsWelcomeModalOpen(true);
        // Clear the flag so it doesn't show again
        localStorage.removeItem("show-welcome-modal");
      }
    }
  }, []);

  // Fetch all data
  const { data: whatsappNumbers } = useQuery(trpc.whatsapp.getMyNumbers.queryOptions());
  const { data: calendars } = useQuery(trpc.calendar.list.queryOptions());
  const { data: allTasks = [] } = useQuery(trpc.tasks.list.queryOptions({}));
  const { data: allNotes = [] } = useQuery(trpc.notes.list.queryOptions({}));
  const { data: reminders = [] } = useQuery(trpc.reminders.list.queryOptions());

  // Get all active calendars (like the calendar page does)
  const activeCalendars = useMemo(() => 
    calendars?.filter((cal: any) => cal.isActive) || [], 
    [calendars]
  );

  // Fetch events from all active calendars (fetch for current month like calendar page does)
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  // Fetch events for each active calendar using useQueries (like calendar page)
  const eventQueries = useQueries({
    queries: activeCalendars.map((cal: any) => ({
      ...trpc.calendar.getEvents.queryOptions({
        calendarId: cal.id,
        timeMin: monthStart.toISOString(),
        timeMax: monthEnd.toISOString(),
        maxResults: 100,
      }),
      enabled: cal.isActive && !!cal.id,
    })),
  });

  // Combine events from all calendars (like calendar page does)
  const allCalendarEvents = useMemo(() => {
    return eventQueries
      .flatMap((query, idx) => {
        const calendarId = activeCalendars[idx]?.id;
        return (query.data || []).map((event: any) => ({ ...event, calendarId }));
      });
  }, [eventQueries, activeCalendars]);

  const toggleTaskMutation = useMutation(
    trpc.tasks.toggleStatus.mutationOptions({
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({
          queryKey: trpc.tasks.list.queryKey({}),
        });

        const previousTasks = queryClient.getQueryData(
          trpc.tasks.list.queryKey({})
        );

        queryClient.setQueryData(
          trpc.tasks.list.queryKey({}),
          (old: any[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (task.id === id) {
                const isCompleted = task.status === "completed";
                return {
                  ...task,
                  status: isCompleted ? "open" : "completed",
                  completedAt: isCompleted ? null : new Date().toISOString(),
                };
              }
              return task;
            });
          }
        );

        return { previousTasks };
      },
      onError: (error, _variables, context) => {
        if (context?.previousTasks) {
          queryClient.setQueryData(
            trpc.tasks.list.queryKey({}),
            context.previousTasks
          );
        }
        toast({
          title: "Task update failed",
          description: error?.message || "Could not update task status.",
          variant: "destructive",
        });
      },
      onSettled: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.tasks.list.queryKey({}),
        });
      },
    })
  );

  const handleToggleTask = (taskId: string) => {
    toggleTaskMutation.mutate({ id: taskId });
  };

  // Check verification status
  const hasVerifiedWhatsApp = whatsappNumbers?.some(number => number.isVerified) || false;
  const hasCalendar = calendars && calendars.length > 0;

  // Search functionality
  const filterItems = (items: any[]) => {
    let filtered = items;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item: any) => {
        const title = (item.title || "").toLowerCase();
        const content = (item.content || "").toLowerCase();
        const description = (item.description || "").toLowerCase();
        return title.includes(query) || content.includes(query) || description.includes(query);
      });
    }

    return filtered;
  };

  // Filter active reminders - show all active reminders ordered by created date
  const activeReminders = useMemo(() => {
    // Filter only active reminders
    const filtered = reminders.filter((r: any) => {
      if (!r.active) return false;
      return true;
    });
    
    // Sort by created date (newest first)
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // Newest first
    });
    
    // Apply search filter
    const searched = filterItems(sorted);
    
    // Return up to 10 reminders
    return searched.slice(0, 10);
  }, [reminders, searchQuery]);

  // Filter tasks - show 10 most recent (sorted by createdAt)
  const pendingTasks = useMemo(() => {
    const filtered = allTasks.filter((t) => t.status === "open");
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // Most recent first
    });
    const searched = filterItems(sorted);
    return searched.slice(0, 10); // Show up to 10 tasks
  }, [allTasks, searchQuery]);

  // Get quick notes - show latest 10
  const quickNotes = useMemo(() => {
    const sorted = [...allNotes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const searched = filterItems(sorted);
    return searched.slice(0, 10); // Show up to 10 notes
  }, [allNotes, searchQuery]);

  // Process events for display (EXACT same as calendar page)
  const processedEvents = useMemo(() => {
    return allCalendarEvents.map((event: any) => {
      const calendar = calendars?.find((cal: any) => cal.id === event.calendarId);
      const provider = calendar?.provider || "google";
      const color = provider === "google" ? "bg-blue-500" : "bg-purple-500";
      
      return {
        id: event.id,
        title: event.title,
        start: new Date(event.start),
        end: new Date(event.end),
        color,
        location: event.location,
        htmlLink: event.htmlLink,
        webLink: event.webLink,
      };
    });
  }, [allCalendarEvents, calendars]);

  // Get scheduled events - only today's events (using EXACT same logic as calendar page)
  const scheduledEvents = useMemo(() => {
    if (!processedEvents || processedEvents.length === 0) return [];
    
    // Get current date for filtering
    const now = new Date();
    
    // Filter events for today using EXACT same logic as calendar page's getEventsForDate
    // This is the exact same function from calendar page
    const todayEvents = processedEvents.filter(event => {
      const eventStart = startOfDay(event.start);
      const eventEnd = endOfDay(event.end);
      const checkDate = startOfDay(now);
      // Exact same logic as calendar page: (checkDate >= eventStart && checkDate <= eventEnd) || isSameDay(event.start, now)
      return (checkDate >= eventStart && checkDate <= eventEnd) || isSameDay(event.start, now);
    });
    
    // Format events for display (same as calendar page)
    const formattedEvents = todayEvents.map((event: any) => {
      const startDate = event.start;
      const endDate = event.end;
      
      // Check if it's an all-day event
      const isAllDay = startDate.getHours() === 0 && 
                       startDate.getMinutes() === 0 &&
                       startDate.getSeconds() === 0 &&
                       (endDate.getTime() - startDate.getTime() >= 24 * 60 * 60 * 1000);
      
      // Format time like calendar page does
      const timeLabel = isAllDay 
        ? "All day" 
        : format(startDate, "h:mm a");
      
      return {
        id: event.id,
        title: event.title || "Untitled Event",
        start: startDate,
        end: endDate,
        startDate: startDate,
        endDate: endDate,
        timeLabel,
        location: event.location,
        description: event.description,
        htmlLink: event.htmlLink,
        webLink: event.webLink,
        color: event.color,
      };
    });
    
    // Sort by start time
    formattedEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    
    const searched = filterItems(formattedEvents);
    return searched.slice(0, 10); // Show up to 10 events
  }, [processedEvents, searchQuery]);

  const shouldShowReminders = true;
  const shouldShowTasks = true;
  const shouldShowEvents = true;
  const shouldShowNotes = true;

  // Setup steps
  const setupSteps = [
    {
      title: "Create your account",
      completed: true,
    },
    {
      title: "Link your WhatsApp number",
      completed: hasVerifiedWhatsApp,
    },
    {
      title: "Connect your calendar (Google or Microsoft)",
      completed: hasCalendar,
    },
    {
      title: "Send your first voice note or message",
      completed: hasVerifiedWhatsApp && hasCalendar,
    },
  ];

  // Get reminder color scheme based on frequency type
  const getReminderColorScheme = (frequency: string | null | undefined) => {
    const freq = (frequency || "").toLowerCase();
    
    switch (freq) {
      case "daily":
        return {
          background: "bg-gradient-to-r from-blue-50 to-indigo-50",
          accent: "bg-gradient-to-b from-blue-500 to-indigo-600",
          labelClass: "text-blue-900",
          metaClass: "text-blue-700",
          border: "border-blue-200",
          shadow: "shadow-[0_2px_8px_rgba(59,130,246,0.15)]",
        };
      case "weekly":
        return {
          background: "bg-gradient-to-r from-purple-50 to-pink-50",
          accent: "bg-gradient-to-b from-purple-500 to-pink-600",
          labelClass: "text-purple-900",
          metaClass: "text-purple-700",
          border: "border-purple-200",
          shadow: "shadow-[0_2px_8px_rgba(168,85,247,0.15)]",
        };
      case "monthly":
        return {
          background: "bg-gradient-to-r from-emerald-50 to-teal-50",
          accent: "bg-gradient-to-b from-emerald-500 to-teal-600",
          labelClass: "text-emerald-900",
          metaClass: "text-emerald-700",
          border: "border-emerald-200",
          shadow: "shadow-[0_2px_8px_rgba(16,185,129,0.15)]",
        };
      case "yearly":
        return {
          background: "bg-gradient-to-r from-amber-50 to-orange-50",
          accent: "bg-gradient-to-b from-amber-500 to-orange-600",
          labelClass: "text-amber-900",
          metaClass: "text-amber-700",
          border: "border-amber-200",
          shadow: "shadow-[0_2px_8px_rgba(245,158,11,0.15)]",
        };
      case "hourly":
        return {
          background: "bg-gradient-to-r from-cyan-50 to-sky-50",
          accent: "bg-gradient-to-b from-cyan-500 to-sky-600",
          labelClass: "text-cyan-900",
          metaClass: "text-cyan-700",
          border: "border-cyan-200",
          shadow: "shadow-[0_2px_8px_rgba(6,182,212,0.15)]",
        };
      case "minutely":
        return {
          background: "bg-gradient-to-r from-violet-50 to-indigo-50",
          accent: "bg-gradient-to-b from-violet-500 to-indigo-600",
          labelClass: "text-violet-900",
          metaClass: "text-violet-700",
          border: "border-violet-200",
          shadow: "shadow-[0_2px_8px_rgba(139,92,246,0.15)]",
        };
      case "once":
        return {
          background: "bg-gradient-to-r from-rose-50 to-pink-50",
          accent: "bg-gradient-to-b from-rose-500 to-pink-600",
          labelClass: "text-rose-900",
          metaClass: "text-rose-700",
          border: "border-rose-200",
          shadow: "shadow-[0_2px_8px_rgba(244,63,94,0.15)]",
        };
      default:
        return {
          background: "bg-gradient-to-r from-slate-50 to-gray-50",
          accent: "bg-gradient-to-b from-slate-500 to-gray-600",
          labelClass: "text-slate-900",
          metaClass: "text-slate-700",
          border: "border-slate-200",
          shadow: "shadow-[0_2px_8px_rgba(100,116,139,0.15)]",
        };
    }
  };

  // Visual styles for tasks
  const taskVisualStyles = [
    {
      background: "bg-[#fdeedc]",
      accent: "bg-[#f7b267]",
      labelClass: "text-[#6b3f1d]",
      metaClass: "text-[#a2643c]",
    },
    {
      background: "bg-[#e6edff]",
      accent: "bg-[#7aa2ff]",
      labelClass: "text-[#1f3b73]",
      metaClass: "text-[#3b5c9a]",
    },
  ];

  // Visual styles for events
  const eventVisualStyles = [
    {
      background: "bg-[#fdeedc]",
      accent: "bg-[#f7b267]",
      labelClass: "text-[#6b3f1d]",
      metaClass: "text-[#a2643c]",
    },
    {
      background: "bg-[#e6edff]",
      accent: "bg-[#7aa2ff]",
      labelClass: "text-[#1f3b73]",
      metaClass: "text-[#3b5c9a]",
    },
  ];

  // Visual styles for notes
  const noteVisualStyles = [
    {
      background: "bg-[#fdeedc]",
      accent: "bg-[#f7b267]",
      labelClass: "text-[#6b3f1d]",
      metaClass: "text-[#a2643c]",
    },
    {
      background: "bg-[#e6edff]",
      accent: "bg-[#7aa2ff]",
      labelClass: "text-[#1f3b73]",
      metaClass: "text-[#3b5c9a]",
    },
  ];

  const formatReminderSubtitle = (reminder: any) => {
    const details: string[] = [];

    if (reminder.time) {
      details.push(`at ${reminder.time}`);
    }

    const frequency =
      reminder.frequencyLabel ||
      reminder.scheduleSummary ||
      reminder.frequency ||
      reminder.recurrence ||
      reminder.interval ||
      reminder.scheduleType ||
      reminder.schedule;

    if (frequency) {
      details.push(`(${frequency})`);
    }

    return details.join(" ");
  };

  const totalItems = reminders.length + allTasks.length + allNotes.length + (calendars?.length || 0);
  const openTasks = allTasks.filter((t) => t.status === "open").length;
  
  // Total filtered counts for each type (before slicing)
  const totalActiveReminders = useMemo(() => {
    // Count all active reminders
    const filtered = reminders.filter((r: any) => {
      if (!r.active) return false;
      return true;
    });
    return filterItems(filtered).length;
  }, [reminders, searchQuery]);
  
  const totalPendingTasks = useMemo(() => {
    const filtered = allTasks.filter((t) => t.status === "open");
    return filterItems(filtered).length;
  }, [allTasks, searchQuery]);
  
  const totalScheduledEvents = useMemo(() => {
    if (!processedEvents || processedEvents.length === 0) return 0;
    
    // Get current date for filtering
    const now = new Date();
    const today = startOfDay(now);
    
    // Filter events for today using same logic
    const todayEvents = processedEvents.filter(event => {
      const eventStart = startOfDay(event.start);
      const eventEnd = endOfDay(event.end);
      return (today >= eventStart && today <= eventEnd) || isSameDay(event.start, now);
    });
    
    return filterItems(todayEvents).length;
  }, [processedEvents, searchQuery]);
  
  const totalQuickNotes = useMemo(() => {
    const sorted = [...allNotes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return filterItems(sorted).length;
  }, [allNotes, searchQuery]);

  const userName = user?.firstName || "there";

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileSidebarOpen) {
        setIsMobileSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMobileSidebarOpen]);

  // Workspace Navigation Component (reused for mobile/desktop)
  const WorkspaceNav = ({ onClick }: { onClick?: () => void }) => (
    <div className="space-y-2">
      <Link
        href="/dashboard"
        onClick={onClick}
        className="flex items-center justify-between p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4" />
          <span className="font-medium">Overview</span>
        </div>
        <Badge variant="orange">
          {totalItems}
        </Badge>
      </Link>
      
      <Link
        href="/notes"
        onClick={onClick}
        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          <span>Notes</span>
        </div>
        <Badge variant="orange">{allNotes.length}</Badge>
      </Link>
      
      <Link
        href="/reminders"
        onClick={onClick}
        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4" />
          <span>Reminders</span>
        </div>
        <Badge variant="orange">{reminders.length}</Badge>
      </Link>
      
      <Link
        href="/calendars"
        onClick={onClick}
        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>Calendar</span>
        </div>
        <Badge variant="orange">{calendars?.length || 0}</Badge>
      </Link>
      
      <Link
        href="/tasks"
        onClick={onClick}
        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4" />
          <span>Tasks</span>
        </div>
        <Badge variant="orange">{allTasks.length}</Badge>
      </Link>
    </div>
  );

  return (
    <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl">
      {/* Page Header */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">
              Welcome back, {userName}!
            </h1>
            <p className="text-muted-foreground mt-2">
              Here's what's happening with your workspace today
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
            <button
              onClick={() =>
                router.push(
                  hasVerifiedWhatsApp
                    ? "/settings/whatsapp"
                    : "/settings/whatsapp?from=dashboard"
                )
              }
              className="group relative flex flex-1 items-center justify-center gap-2 rounded-full border border-muted bg-background px-3 py-2 shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {hasVerifiedWhatsApp && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-100 text-green-700 border-green-200 tracking-tight">
                  Connected
                </Badge>
              )}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 flex-shrink-0"
                fill="currentColor"
                style={{ color: "#128c7e" }}
                viewBox="0 0 24 24"
              >
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              <span className="text-sm font-normal tracking-wide text-foreground whitespace-nowrap">
                {hasVerifiedWhatsApp ? "Manage WhatsApp" : "Link WhatsApp"}
              </span>
            </button>

            <button
              onClick={() => router.push("/calendars")}
              className="group relative flex flex-1 items-center justify-center gap-2 rounded-full border border-muted bg-background px-3 py-2 shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {hasCalendar && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-100 text-green-700 border-green-200 tracking-tight">
                  Connected
                </Badge>
              )}
              <Calendar
                className="h-5 w-5 flex-shrink-0"
                style={{ color: "#0f52ba" }}
              />
              <span className="text-sm font-normal tracking-wide text-foreground whitespace-nowrap">
                {hasCalendar ? "Manage Your Calendar" : "Connect Your Calendar"}
              </span>
            </button>
          </div>
        </div>

        <div className="flex justify-between xl:justify-end gap-3">
          {/* Mobile Workspace Menu Button */}
          <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="lg:hidden flex items-center gap-2"
              >
                <Menu className="h-4 w-4" />
                <span className="font-medium">Workspace</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[350px] h-full overflow-y-auto">
              <SheetHeader className="mb-6">
                <SheetTitle>My Workspace</SheetTitle>
              </SheetHeader>

              {/* Workspace Navigation */}
              <WorkspaceNav onClick={() => setIsMobileSidebarOpen(false)} />

              {/* Getting Started */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-base">Getting Started</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {setupSteps.map((step, index) => (
                      <div key={index} className="flex items-center gap-3">
                        {step.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                        <span
                          className={`text-sm ${
                            step.completed
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {step.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-center w-full">
          <div className="relative w-full lg:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search across reminders, tasks, events, and notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-sm ring-2 ring-gray-300 focus:ring-primary focus:border-transparent transition-all placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Desktop Left Sidebar - My Workspace */}
        <div className="hidden lg:block lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">My Workspace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <WorkspaceNav />
            </CardContent>
          </Card>

          {/* Getting Started */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Getting Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {setupSteps.map((step, index) => (
                  <div key={index} className="flex items-center gap-3">
                    {step.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        step.completed
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3">
          {/* Status Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 text-center">
            <div className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4">
              <div className="text-3xl font-bold" style={{ color: "#f7b267" }}>
                {totalActiveReminders}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Reminders Today
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4">
              <div className="text-3xl font-bold" style={{ color: "#f7b267" }}>
                {totalPendingTasks}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Total Tasks Pending
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4">
              <div className="text-3xl font-bold" style={{ color: "#f7b267" }}>
                {totalScheduledEvents}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Todays Events
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4">
              <div className="text-3xl font-bold" style={{ color: "#f7b267" }}>
                {allNotes.length}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Notes Created
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Active Reminders */}
            {shouldShowReminders && (
            <Card className="flex flex-col h-[420px] rounded-[18px] border border-[#dfe8f5] shadow-[0_6px_24px_rgba(20,80,180,0.08)] overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-center bg-primary px-4 py-4">
                <div className="flex items-center gap-2 text-white text-sm font-semibold tracking-wide uppercase">
                  <BellRing className="h-4 w-4 text-white" />
                  Active Reminders
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0 px-0 pb-0">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  {activeReminders.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No active reminders
                    </p>
                  ) : (
                    activeReminders.map((reminder: any) => {
                      const visual = getReminderColorScheme(
                        reminder.frequency || 
                        reminder.scheduleType || 
                        reminder.recurrence ||
                        reminder.interval
                      );
                      const subtitle = formatReminderSubtitle(reminder);
                      return (
                        <div
                          key={reminder.id}
                          onClick={() => {
                            setSelectedReminder(reminder);
                            setIsReminderModalOpen(true);
                          }}
                          className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border ${visual.background} ${visual.border} ${visual.shadow} transition-all hover:shadow-md cursor-pointer`}
                        >
                          <div className={`h-12 w-1.5 rounded-full ${visual.accent} flex-shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold leading-tight ${visual.labelClass}`}>
                              {reminder.title || "Untitled Reminder"}
                            </p>
                            {subtitle ? (
                              <p className={`text-xs font-medium mt-1.5 ${visual.metaClass}`}>
                                {subtitle}
                              </p>
                            ) : (
                              reminder.time && (
                                <p className={`text-xs font-medium mt-1.5 ${visual.metaClass}`}>
                                  {reminder.time}
                                </p>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {totalActiveReminders > activeReminders.length && (
                  <div className="text-center py-2 text-xs text-muted-foreground border-t border-[#e2e8f0] px-4">
                    Showing {activeReminders.length} of {totalActiveReminders} reminders
                  </div>
                )}
                <div className="border-t border-[#e2e8f0] px-4 py-3">
                  <Button
                    variant="ghost"
                    className="w-full justify-center text-xs font-semibold text-[#1976c5] hover:bg-[#e9f2ff]"
                    onClick={() => router.push("/reminders")}
                  >
                    View All Reminders
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            )}

            {/* Pending Tasks */}
            {shouldShowTasks && (
            <Card className="flex flex-col h-[420px] rounded-[18px] border border-[#dfe8f5] shadow-[0_6px_24px_rgba(20,80,180,0.08)] overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-center bg-primary px-4 py-4">
                <div className="flex items-center gap-2 text-white text-sm font-semibold tracking-wide uppercase">
                  <CheckSquare className="h-4 w-4 text-white" />
                  Pending Tasks
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0 px-0 pb-0">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  {pendingTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No pending tasks
                    </p>
                  ) : (
                    pendingTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => {
                          setSelectedTask(task);
                          setIsTaskModalOpen(true);
                        }}
                        className="flex items-center gap-3 rounded-2xl border border-[#e6ebf5] bg-[#f5f7fb] px-3 py-2.5 cursor-pointer hover:bg-[#e9ecf3] transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={task.status === "completed"}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleTask(task.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={
                            toggleTaskMutation.isPending &&
                            toggleTaskMutation.variables?.id === task.id
                          }
                          aria-label={`Mark task ${task.title || "Untitled Task"} as ${
                            task.status === "completed" ? "open" : "completed"
                          }`}
                          className="h-4 w-4 rounded border border-[#94a3b8] text-[#1976c5] focus:ring-offset-0 focus:ring-0 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1f2933] truncate">
                            {task.title || "Untitled Task"}
                          </p>
                          {task.dueDate && (
                            <p className="text-xs text-[#6b7a90] mt-0.5">
                              Due {task.dueDate}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-[#e2e8f0] px-4 py-3">
                  <Button
                    variant="ghost"
                    className="w-full justify-center text-xs font-semibold text-[#1976c5] hover:bg-[#e9f2ff]"
                    onClick={() => router.push("/tasks")}
                  >
                    View All Tasks
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            )}

            {/* Today Events */}
            {shouldShowEvents && (
            <Card className="flex flex-col h-[420px] rounded-[18px] border border-[#dfe8f5] shadow-[0_6px_24px_rgba(20,80,180,0.08)] overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-center bg-primary px-4 py-4">
                <div className="flex items-center gap-2 text-white text-sm font-semibold tracking-wide uppercase">
                  <Calendar className="h-4 w-4 text-white" />
                  Today Events
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0 px-0 pb-0">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  {scheduledEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No events today
                    </p>
                  ) : (
                    scheduledEvents.map((event: any) => {
                      return (
                        <div
                          key={event.id}
                          className={cn(
                            "rounded-lg px-3 py-2 cursor-pointer hover:opacity-90 transition-opacity border-2 shadow-sm",
                            event.color === "bg-blue-500" ? "border-blue-500 bg-blue-50 text-blue-900" : "border-purple-500 bg-purple-50 text-purple-900"
                          )}
                          title={`${event.title} - ${event.timeLabel}${event.location ? ` - ${event.location}` : ""}`}
                          onClick={() => {
                            if (event.htmlLink) {
                              window.open(event.htmlLink, "_blank");
                            } else if (event.webLink) {
                              window.open(event.webLink, "_blank");
                            }
                          }}
                        >
                          <p className="text-sm font-medium truncate">
                            {event.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs opacity-90">
                              {event.timeLabel}
                            </p>
                            {event.location && (
                              <p className="text-xs opacity-75 truncate">
                                • {event.location}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="border-t border-[#e2e8f0] px-4 py-3">
                  <Button
                    variant="ghost"
                    className="w-full justify-center text-xs font-semibold text-[#1976c5] hover:bg-[#e9f2ff]"
                    onClick={() => router.push("/calendars")}
                  >
                    View All Events
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            )}

            {/* Quick Notes */}
            {shouldShowNotes && (
            <Card className="flex flex-col h-[420px] rounded-[18px] border border-[#dfe8f5] shadow-[0_6px_24px_rgba(20,80,180,0.08)] overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-center bg-primary px-4 py-4">
                <div className="flex items-center gap-2 text-white text-sm font-semibold tracking-wide uppercase">
                  <StickyNote className="h-4 w-4 text-white" />
                  Quick Notes
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0 px-0 pb-0">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {quickNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No notes available
                    </p>
                  ) : (
                    quickNotes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => {
                          setSelectedNote(note);
                          setIsNoteModalOpen(true);
                        }}
                        className="border-b border-[#e2e8f0] pb-4 last:border-b-0 cursor-pointer hover:bg-[#f5f7fb] rounded-lg px-2 py-2 -mx-2 transition-colors"
                      >
                        <p className="text-sm font-semibold text-[#1f2933]">
                          {note.title || "Untitled Note"}
                        </p>
                        {note.content && (
                          <p className="text-xs text-[#6b7a90] mt-1 line-clamp-2">
                            {note.content}
                          </p>
                        )}
                        <p className="text-xs text-[#94a3b8] mt-1">
                          Updated {new Date(note.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-[#e2e8f0] px-4 py-3">
                  <Button
                    variant="ghost"
                    className="w-full justify-center text-xs font-semibold text-[#1976c5] hover:bg-[#e9f2ff]"
                    onClick={() => router.push("/notes")}
                  >
                    View All Notes
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            )}
          </div>
        </div>
      </div>

      {/* Note Detail Modal */}
      <AlertDialog open={isNoteModalOpen} onOpenChange={setIsNoteModalOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold flex items-center gap-2">
              <StickyNote className="h-5 w-5" />
              {selectedNote?.title || "Untitled Note"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Created {selectedNote?.createdAt ? new Date(selectedNote.createdAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : 'Unknown date'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            {selectedNote?.content ? (
              <div className="prose prose-sm max-w-none">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {selectedNote.content}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No content available for this note.
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setIsNoteModalOpen(false);
                router.push("/notes");
              }}
              className="flex items-center gap-2 bg-primary hover:bg-primary hover:scale-105 transition-all duration-200 order-1 sm:order-2"
            >
              <ExternalLink className="h-4 w-4" />
              View in Notes
            </AlertDialogAction>
            <AlertDialogAction onClick={() => setIsNoteModalOpen(false)} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 hover:scale-105 transition-all duration-200 order-1 sm:order-2">
              <X className="h-4 w-4" />
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reminder Detail Modal */}
      <AlertDialog open={isReminderModalOpen} onOpenChange={setIsReminderModalOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold flex items-center gap-2">
              <BellRing className="h-5 w-5" />
              {selectedReminder?.title || "Untitled Reminder"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Created {selectedReminder?.createdAt ? new Date(selectedReminder.createdAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : 'Unknown date'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            {/* Reminder Status */}
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                selectedReminder?.active 
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-gray-100 text-gray-800 border border-gray-200'
              }`}>
                {selectedReminder?.active ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Frequency Type */}
            {selectedReminder?.frequency && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Frequency</h4>
                <p className="text-sm text-muted-foreground capitalize">
                  {selectedReminder.frequency}
                </p>
              </div>
            )}

            {/* Time */}
            {selectedReminder?.time && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Time
                </h4>
                <p className="text-sm text-muted-foreground">
                  {selectedReminder.time}
                </p>
              </div>
            )}

            {/* Days of Week (for weekly reminders) */}
            {selectedReminder?.frequency === 'weekly' && selectedReminder?.daysOfWeek && selectedReminder.daysOfWeek.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Days of Week</h4>
                <div className="flex flex-wrap gap-2">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => 
                    selectedReminder.daysOfWeek.includes(index) && (
                      <span
                        key={index}
                        className="px-3 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                      >
                        {day}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Day of Month (for monthly reminders) */}
            {selectedReminder?.frequency === 'monthly' && selectedReminder?.dayOfMonth && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Day of Month</h4>
                <p className="text-sm text-muted-foreground">
                  Day {selectedReminder.dayOfMonth}
                </p>
              </div>
            )}

            {/* Month and Day (for yearly reminders) */}
            {selectedReminder?.frequency === 'yearly' && selectedReminder?.month && selectedReminder?.dayOfMonth && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Date</h4>
                <p className="text-sm text-muted-foreground">
                  {new Date(2000, selectedReminder.month - 1, selectedReminder.dayOfMonth).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            )}

            {/* Hourly - Minute of Hour */}
            {selectedReminder?.frequency === 'hourly' && selectedReminder?.minuteOfHour !== undefined && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Minute of Hour</h4>
                <p className="text-sm text-muted-foreground">
                  At {selectedReminder.minuteOfHour} minutes past the hour
                </p>
              </div>
            )}

            {/* Minutely - Interval */}
            {selectedReminder?.frequency === 'minutely' && selectedReminder?.intervalMinutes && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Interval</h4>
                <p className="text-sm text-muted-foreground">
                  Every {selectedReminder.intervalMinutes} minute{selectedReminder.intervalMinutes !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {/* Once - Target Date or Days From Now */}
            {selectedReminder?.frequency === 'once' && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Reminder Date</h4>
                {selectedReminder?.targetDate ? (
                  <p className="text-sm text-muted-foreground">
                    {new Date(selectedReminder.targetDate).toLocaleDateString('en-US', { 
                      year: 'numeric',
                      month: 'long', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                ) : selectedReminder?.daysFromNow !== undefined ? (
                  <p className="text-sm text-muted-foreground">
                    In {selectedReminder.daysFromNow} day{selectedReminder.daysFromNow !== 1 ? 's' : ''}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No date specified</p>
                )}
              </div>
            )}

            {/* Additional Info */}
            <div className="pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-foreground">Created:</span>
                  <p className="text-muted-foreground mt-1">
                    {selectedReminder?.createdAt ? new Date(selectedReminder.createdAt).toLocaleDateString('en-US', { 
                      year: 'numeric',
                      month: 'short', 
                      day: 'numeric'
                    }) : 'Unknown'}
                  </p>
                </div>
                {selectedReminder?.updatedAt && (
                  <div>
                    <span className="font-semibold text-foreground">Last Updated:</span>
                    <p className="text-muted-foreground mt-1">
                      {new Date(selectedReminder.updatedAt).toLocaleDateString('en-US', { 
                        year: 'numeric',
                        month: 'short', 
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setIsReminderModalOpen(false);
                router.push("/reminders");
              }}
              className="flex items-center gap-2 bg-primary hover:bg-primary hover:scale-105 transition-all duration-200 order-1 sm:order-2"
            >
              <ExternalLink className="h-4 w-4" />
              View in Reminders
            </AlertDialogAction>
            <AlertDialogAction onClick={() => setIsReminderModalOpen(false)} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 hover:scale-105 transition-all duration-200 order-1 sm:order-2">
              <X className="h-4 w-4" />
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Detail Modal */}
      <AlertDialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              {selectedTask?.title || "Untitled Task"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Created {selectedTask?.createdAt ? new Date(selectedTask.createdAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : 'Unknown date'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            {/* Task Status */}
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                selectedTask?.status === 'completed'
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}>
                {selectedTask?.status === 'completed' ? 'Completed' : 'Open'}
              </span>
            </div>

            {/* Task Description */}
            {selectedTask?.description && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Description</h4>
                <div className="prose prose-sm max-w-none">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {selectedTask.description}
                  </p>
                </div>
              </div>
            )}

            {/* Due Date */}
            {selectedTask?.dueDate && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Due Date
                </h4>
                <p className="text-sm text-muted-foreground">
                  {typeof selectedTask.dueDate === 'string' 
                    ? selectedTask.dueDate 
                    : new Date(selectedTask.dueDate).toLocaleDateString('en-US', { 
                        year: 'numeric',
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                </p>
              </div>
            )}

            {/* Completed Date */}
            {selectedTask?.status === 'completed' && selectedTask?.completedAt && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Completed Date
                </h4>
                <p className="text-sm text-muted-foreground">
                  {new Date(selectedTask.completedAt).toLocaleDateString('en-US', { 
                    year: 'numeric',
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            )}

            {/* Additional Info */}
            <div className="pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-foreground">Created:</span>
                  <p className="text-muted-foreground mt-1">
                    {selectedTask?.createdAt ? new Date(selectedTask.createdAt).toLocaleDateString('en-US', { 
                      year: 'numeric',
                      month: 'short', 
                      day: 'numeric'
                    }) : 'Unknown'}
                  </p>
                </div>
                {selectedTask?.updatedAt && (
                  <div>
                    <span className="font-semibold text-foreground">Last Updated:</span>
                    <p className="text-muted-foreground mt-1">
                      {new Date(selectedTask.updatedAt).toLocaleDateString('en-US', { 
                        year: 'numeric',
                        month: 'short', 
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setIsTaskModalOpen(false);
                router.push("/tasks");
              }}
              className="flex items-center gap-2 bg-primary hover:bg-primary hover:scale-105 transition-all duration-200 order-1 sm:order-2"
            >
              <ExternalLink className="h-4 w-4" />
              View in Tasks
            </AlertDialogAction>
            <AlertDialogAction onClick={() => setIsTaskModalOpen(false)} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 hover:scale-105 transition-all duration-200 order-1 sm:order-2">
              <X className="h-4 w-4" />
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Welcome Modal */}
      <WelcomeModal 
        open={isWelcomeModalOpen} 
        onOpenChange={setIsWelcomeModalOpen} 
      />
    </div>
  );
}

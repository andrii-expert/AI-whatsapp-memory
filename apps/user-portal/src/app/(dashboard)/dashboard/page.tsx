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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@imaginecalendar/ui/popover";
import { Input } from "@imaginecalendar/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  CalendarDays,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { cn } from "@imaginecalendar/ui/cn";

export default function DashboardPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);

  // Fetch all data
  const { data: whatsappNumbers } = useQuery(trpc.whatsapp.getMyNumbers.queryOptions());
  const { data: calendars } = useQuery(trpc.calendar.list.queryOptions());
  const { data: allTasks = [] } = useQuery(trpc.tasks.list.queryOptions({}));
  const { data: allNotes = [] } = useQuery(trpc.notes.list.queryOptions({}));
  const { data: reminders = [] } = useQuery(trpc.reminders.list.queryOptions());

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

  // Date filter helper functions
  const getDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (dateFilter) {
      case "today": {
        const end = new Date(today);
        end.setHours(23, 59, 59, 999);
        return { start: today, end };
      }
      case "week": {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay()); // Start of week
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      case "month": {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      case "custom": {
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          return { start, end };
        }
        return null;
      }
      case "all":
      default:
        return null;
    }
  };

  const isDateInRange = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return dateFilter === "all"; // If no date, only show in "all" filter
    
    const range = getDateRange();
    if (!range) return true; // "all" filter
    
    try {
      const itemDate = new Date(dateStr);
      if (isNaN(itemDate.getTime())) return false; // Invalid date
      itemDate.setHours(0, 0, 0, 0);
      
      return itemDate >= range.start && itemDate <= range.end;
    } catch (error) {
      return false;
    }
  };

  // Search and filter functionality
  const filterItems = (items: any[], type: string) => {
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

    // Apply date filter (skip if "all")
    if (dateFilter !== "all") {
      filtered = filtered.filter((item: any) => {
        // Check different date fields based on item type
        let dateToCheck = null;
        
        // For tasks - check dueDate
        if (type === "tasks" && item.dueDate) {
          dateToCheck = item.dueDate;
        }
        // For events - check date or startDate
        else if (type === "events" && (item.date || item.startDate)) {
          dateToCheck = item.date || item.startDate;
        }
        // For reminders - check date or scheduleDate
        else if (type === "reminders" && (item.date || item.scheduleDate)) {
          dateToCheck = item.date || item.scheduleDate;
        }
        // For notes - check updatedAt or createdAt
        else if (type === "notes" && (item.updatedAt || item.createdAt)) {
          dateToCheck = item.updatedAt || item.createdAt;
        }
        // Fallback to any available date field
        else {
          dateToCheck = item.dueDate || item.date || item.startDate || item.scheduleDate || item.updatedAt || item.createdAt;
        }
        
        return isDateInRange(dateToCheck);
      });
    }

    return filtered;
  };

  const getDateFilterLabel = () => {
    switch (dateFilter) {
      case "today": return "Today";
      case "week": return "This Week";
      case "month": return "This Month";
      case "custom": {
        if (customStartDate && customEndDate) {
          return `${new Date(customStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(customEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
        return "Custom Range";
      }
      case "all": return "All Time";
      default: return "Select Date";
    }
  };

  // Filter active reminders
  const activeReminders = useMemo(() => {
    const filtered = reminders.filter((r: any) => r.active);
    const searched = filterItems(filtered, "reminders");
    return searched.slice(0, 10); // Show up to 10 reminders
  }, [reminders, searchQuery, dateFilter, customStartDate, customEndDate]);

  // Filter pending tasks
  const pendingTasks = useMemo(() => {
    const filtered = allTasks.filter((t) => t.status === "open");
    const searched = filterItems(filtered, "tasks");
    return searched.slice(0, 10); // Show up to 10 tasks
  }, [allTasks, searchQuery, dateFilter, customStartDate, customEndDate]);

  // Get quick notes
  const quickNotes = useMemo(() => {
    const sorted = [...allNotes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const searched = filterItems(sorted, "notes");
    return searched.slice(0, 15); // Show up to 15 notes (users often have many notes)
  }, [allNotes, searchQuery, dateFilter, customStartDate, customEndDate]);

  // Get scheduled events (placeholder - would need calendar events API)
  const upcomingEvents: any[] = [];
  const scheduledEvents = useMemo(() => {
    const filtered = filterItems(upcomingEvents, "events");
    return filtered.slice(0, 10); // Show up to 10 events
  }, [upcomingEvents, searchQuery, dateFilter, customStartDate, customEndDate]);

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

  // Calculate totals and counts
  const reminderVisualFallback = {
    background: "bg-[#fdeedc]",
    accent: "bg-[#f7b267]",
    labelClass: "text-[#6b3f1d]",
    metaClass: "text-[#a2643c]",
  };

  const reminderVisualStyles = [
    reminderVisualFallback,
    {
      background: "bg-[#e6edff]",
      accent: "bg-[#7aa2ff]",
      labelClass: "text-[#1f3b73]",
      metaClass: "text-[#3b5c9a]",
    },
  ];

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
    const filtered = reminders.filter((r: any) => r.active);
    return filterItems(filtered, "reminders").length;
  }, [reminders, searchQuery, dateFilter, customStartDate, customEndDate]);
  
  const totalPendingTasks = useMemo(() => {
    const filtered = allTasks.filter((t) => t.status === "open");
    return filterItems(filtered, "tasks").length;
  }, [allTasks, searchQuery, dateFilter, customStartDate, customEndDate]);
  
  const totalScheduledEvents = useMemo(() => {
    return filterItems(upcomingEvents, "events").length;
  }, [upcomingEvents, searchQuery, dateFilter, customStartDate, customEndDate]);
  
  const totalQuickNotes = useMemo(() => {
    const sorted = [...allNotes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return filterItems(sorted, "notes").length;
  }, [allNotes, searchQuery, dateFilter, customStartDate, customEndDate]);

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
        <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground">
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
        href="/settings/calendars"
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
              className="group relative flex flex-1 items-center justify-center gap-3 rounded-full border border-muted bg-background px-4 py-3 shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {hasVerifiedWhatsApp && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-100 text-green-700 border-green-200 tracking-tight">
                  Connected
                </Badge>
              )}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-7 w-7 flex-shrink-0"
                fill="currentColor"
                style={{ color: "#128c7e" }}
                viewBox="0 0 24 24"
              >
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              <span className="text-sm font-black uppercase tracking-wide text-foreground">
                {hasVerifiedWhatsApp ? "Manage WhatsApp" : "Link WhatsApp"}
              </span>
            </button>

            <button
              onClick={() => router.push("/settings/calendars")}
              className="group relative flex flex-1 items-center justify-center gap-3 rounded-full border border-muted bg-background px-4 py-3 shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {hasCalendar && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-100 text-green-700 border-green-200 tracking-tight">
                  Connected
                </Badge>
              )}
              <Calendar
                className="h-7 w-7 flex-shrink-0"
                style={{ color: "#0f52ba" }}
              />
              <span className="text-sm font-black uppercase tracking-wide text-foreground">
                {hasCalendar ? "Manage Your Calendar" : "Connect Your Calendar"}
              </span>
            </button>
          </div>
        </div>

        <div className="flex justify-start xl:justify-end">
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

      {/* Search and Filter Bar */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-center w-full">
          <div className="relative w-full">
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
          
          <div className="flex w-full justify-end">
            <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-between w-full min-w-[140px] md:min-w-[200px] font-normal"
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    <span>{getDateFilterLabel()}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-3">Date Range</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={dateFilter === "today" ? "blue-primary" : "outline"}
                        size="sm"
                        onClick={() => {
                          setDateFilter("today");
                          setIsDatePopoverOpen(false);
                        }}
                        className="w-full"
                      >
                        Today
                      </Button>
                      <Button
                        variant={dateFilter === "week" ? "blue-primary" : "outline"}
                        size="sm"
                        onClick={() => {
                          setDateFilter("week");
                          setIsDatePopoverOpen(false);
                        }}
                        className="w-full"
                      >
                        This Week
                      </Button>
                      <Button
                        variant={dateFilter === "month" ? "blue-primary" : "outline"}
                        size="sm"
                        onClick={() => {
                          setDateFilter("month");
                          setIsDatePopoverOpen(false);
                        }}
                        className="w-full"
                      >
                        This Month
                      </Button>
                      <Button
                        variant={dateFilter === "all" ? "blue-primary" : "outline"}
                        size="sm"
                        onClick={() => {
                          setDateFilter("all");
                          setIsDatePopoverOpen(false);
                        }}
                        className="w-full"
                      >
                        All Time
                      </Button>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <h4 className="font-semibold text-sm mb-3">Custom Range</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">
                          Start Date
                        </label>
                        <Input
                          type="date"
                          value={customStartDate}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomStartDate(e.target.value)}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">
                          End Date
                        </label>
                        <Input
                          type="date"
                          value={customEndDate}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomEndDate(e.target.value)}
                          className="w-full"
                        />
                      </div>
                      <Button
                        variant="blue-primary"
                        size="sm"
                        onClick={() => {
                          if (customStartDate && customEndDate) {
                            setDateFilter("custom");
                            setIsDatePopoverOpen(false);
                          }
                        }}
                        disabled={!customStartDate || !customEndDate}
                        className="w-full"
                      >
                        Apply Custom Range
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Active Reminders */}
            {shouldShowReminders && (
            <Card className="flex flex-col h-[420px] rounded-3xl border border-[#dbe6ff] shadow-[0_10px_40px_rgba(15,82,186,0.12)] overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between bg-[#1c7ed6] px-5 py-4">
                <div className="flex items-center gap-2 text-white text-base font-semibold">
                  <BellRing className="h-4 w-4 text-white" />
                  Active Reminders
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#1c7ed6] text-sm font-bold">
                  {totalActiveReminders}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0 bg-white px-5 py-4">
                <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-3">
                  {activeReminders.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No active reminders
                    </p>
                  ) : (
                    activeReminders.map((reminder: any, index: number) => {
                      const visual =
                        reminderVisualStyles[index % reminderVisualStyles.length] ||
                        reminderVisualFallback;
                      const subtitle = formatReminderSubtitle(reminder);
                      return (
                        <div
                          key={reminder.id}
                          className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm ${visual.background}`}
                        >
                          <div className={`h-12 w-1.5 rounded-full ${visual.accent}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold leading-tight ${visual.labelClass}`}>
                              {reminder.title || "Untitled Reminder"}
                            </p>
                            {subtitle ? (
                              <p className={`text-xs font-medium mt-1 ${visual.metaClass}`}>
                                {subtitle}
                              </p>
                            ) : (
                              reminder.time && (
                                <p className={`text-xs font-medium mt-1 ${visual.metaClass}`}>
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
                  <div className="text-center py-2 text-xs text-muted-foreground border-t border-border mt-4">
                    Showing {activeReminders.length} of {totalActiveReminders} reminders
                  </div>
                )}
                <Button
                  variant="ghost"
                  className="mt-2 w-full justify-center text-xs font-semibold hover:bg-muted/50 flex-shrink-0 text-[#1c7ed6]"
                  onClick={() => router.push("/reminders")}
                >
                  View All Reminders
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
            )}

            {/* Pending Tasks */}
            {shouldShowTasks && (
            <Card className="flex flex-col h-[420px] rounded-[18px] border border-[#dfe8f5] shadow-[0_6px_24px_rgba(20,80,180,0.08)] overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-between bg-[#1976c5] px-4 py-3">
                <div className="flex items-center gap-2 text-white text-sm font-semibold tracking-wide uppercase">
                  <CheckSquare className="h-4 w-4 text-white" />
                  Pending Tasks
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#1976c5] text-xs font-bold">
                  {totalPendingTasks}
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
                        className="flex items-center gap-3 rounded-2xl border border-[#e6ebf5] bg-[#f5f7fb] px-3 py-2.5"
                      >
                        <input
                          type="checkbox"
                          checked={task.status === "completed"}
                          onChange={() => handleToggleTask(task.id)}
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

            {/* Scheduled Events */}
            {shouldShowEvents && (
            <Card className="flex flex-col h-[420px] rounded-[18px] border border-[#dfe8f5] shadow-[0_6px_24px_rgba(20,80,180,0.08)] overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-between bg-[#1976c5] px-4 py-3">
                <div className="flex items-center gap-2 text-white text-sm font-semibold tracking-wide uppercase">
                  <Calendar className="h-4 w-4 text-white" />
                  Scheduled Events
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#1976c5] text-xs font-bold">
                  {totalScheduledEvents}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0 px-0 pb-0">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  {scheduledEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No scheduled events
                    </p>
                  ) : (
                    scheduledEvents.map((event: any, index: number) => {
                      const dateLabel =
                        event.date ||
                        event.dateLabel ||
                        event.startDate ||
                        null;
                      const timeLabel = event.time || event.startTime || null;
                      const subtitle = dateLabel
                        ? `${dateLabel}${timeLabel ? ` at ${timeLabel}` : ""}`
                        : timeLabel || "No time info";

                      return (
                        <div
                          key={index}
                          className="rounded-2xl border border-[#d5e3ff] bg-[#edf3ff] px-4 py-3"
                        >
                          <p className="text-sm font-semibold text-[#1f3b73] truncate">
                            {event.title || "Untitled Event"}
                          </p>
                          <p className="text-xs text-[#5370a3] mt-1">
                            {subtitle}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="border-t border-[#e2e8f0] px-4 py-3">
                  <Button
                    variant="ghost"
                    className="w-full justify-center text-xs font-semibold text-[#1976c5] hover:bg-[#e9f2ff]"
                    onClick={() => router.push("/settings/calendars")}
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
              <CardHeader className="flex flex-row items-center justify-between bg-[#1976c5] px-4 py-3">
                <div className="flex items-center gap-2 text-white text-sm font-semibold tracking-wide uppercase">
                  <StickyNote className="h-4 w-4 text-white" />
                  Quick Notes
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#1976c5] text-xs font-bold">
                  {totalQuickNotes}
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
                      <div key={note.id} className="border-b border-[#e2e8f0] pb-4 last:border-b-0">
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
    </div>
  );
}

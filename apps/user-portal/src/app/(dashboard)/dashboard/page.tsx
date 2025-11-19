"use client";

import { useTRPC } from "@/trpc/client";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
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
import { useQuery } from "@tanstack/react-query";
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
  Filter,
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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "reminders" | "tasks" | "events" | "notes">("all");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

  // Fetch all data
  const { data: whatsappNumbers } = useQuery(trpc.whatsapp.getMyNumbers.queryOptions());
  const { data: calendars } = useQuery(trpc.calendar.list.queryOptions());
  const { data: allTasks = [] } = useQuery(trpc.tasks.list.queryOptions({}));
  const { data: allNotes = [] } = useQuery(trpc.notes.list.queryOptions({}));
  const { data: reminders = [] } = useQuery(trpc.reminders.list.queryOptions());

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
      let itemDate: Date;
      
      // Handle different date formats
      if (dateStr instanceof Date) {
        itemDate = new Date(dateStr);
      } else if (typeof dateStr === 'string') {
        // Handle date-only strings (YYYY-MM-DD) and ISO timestamps
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Date-only string (YYYY-MM-DD)
          itemDate = new Date(dateStr + 'T00:00:00');
        } else {
          // ISO timestamp or other format
          itemDate = new Date(dateStr);
        }
      } else {
        return false;
      }
      
      if (isNaN(itemDate.getTime())) return false; // Invalid date
      
      // Normalize to start of day for comparison
      const normalizedItemDate = new Date(itemDate);
      normalizedItemDate.setHours(0, 0, 0, 0);
      
      return normalizedItemDate >= range.start && normalizedItemDate <= range.end;
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
        
        if (type === "tasks") {
          // Tasks have dueDate (date type, format: YYYY-MM-DD)
          if (item.dueDate) {
            dateToCheck = item.dueDate;
          }
        } else if (type === "events") {
          // Events - check date or startDate
          if (item.date || item.startDate) {
            dateToCheck = item.date || item.startDate;
          }
        } else if (type === "reminders") {
          // Reminders: 
          // - For "once" reminders, use targetDate to check if it falls in the date range
          // - For recurring reminders (daily, weekly, etc.), they don't have a specific date
          //   so we should show them if they're active (they repeat every day/week/etc.)
          if (item.frequency === "once" && item.targetDate) {
            dateToCheck = item.targetDate;
          } else {
            // For recurring reminders, always include them (they're active and repeat)
            // Return true to include them in the filtered results
            return true;
          }
        } else if (type === "notes") {
          // Notes - prefer updatedAt, fallback to createdAt
          if (item.updatedAt) {
            dateToCheck = item.updatedAt;
          } else if (item.createdAt) {
            dateToCheck = item.createdAt;
          }
        }
        
        // If no date found, exclude from filtered results (unless "all" filter)
        if (!dateToCheck) {
          return false;
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

  const getFilterTypeLabel = () => {
    switch (filterType) {
      case "all": return "All Items";
      case "reminders": return "Reminders";
      case "tasks": return "Tasks";
      case "events": return "Events";
      case "notes": return "Notes";
      default: return "Select Type";
    }
  };

  const getFilterTypeIcon = () => {
    switch (filterType) {
      case "reminders": return <BellRing className="h-4 w-4" />;
      case "tasks": return <CheckSquare className="h-4 w-4" />;
      case "events": return <Calendar className="h-4 w-4" />;
      case "notes": return <StickyNote className="h-4 w-4" />;
      default: return <Filter className="h-4 w-4" />;
    }
  };

  // Helper function to get reminder frequency label
  const getReminderFrequencyLabel = (reminder: any) => {
    if (reminder.frequency === "daily") {
      return "(Daily)";
    } else if (reminder.frequency === "weekly") {
      return "(Weekly)";
    } else if (reminder.frequency === "hourly") {
      if (reminder.intervalMinutes) {
        const hours = Math.floor(reminder.intervalMinutes / 60);
        if (hours === 1) return "(Hourly)";
        return `(Every ${hours} hours)`;
      }
      return "(Hourly)";
    } else if (reminder.frequency === "minutely") {
      if (reminder.intervalMinutes) {
        const days = Math.floor(reminder.intervalMinutes / (60 * 24));
        if (days === 1) return "(Daily)";
        if (days > 1) return `(Every ${days} days)`;
        const hours = Math.floor(reminder.intervalMinutes / 60);
        if (hours === 1) return "(Hourly)";
        if (hours > 1) return `(Every ${hours} hours)`;
      }
      return "(Custom)";
    }
    return "";
  };

  // Helper function to get reminder border color
  const getReminderBorderColor = (reminder: any) => {
    if (reminder.frequency === "daily") {
      return "border-l-4 border-l-orange-500";
    } else if (reminder.frequency === "minutely" && reminder.intervalMinutes) {
      const days = Math.floor(reminder.intervalMinutes / (60 * 24));
      if (days > 1) {
        return "border-l-4 border-l-blue-500";
      }
    }
    // Default colors based on frequency
    if (reminder.frequency === "weekly") {
      return "border-l-4 border-l-purple-500";
    } else if (reminder.frequency === "monthly") {
      return "border-l-4 border-l-green-500";
    }
    return "border-l-4 border-l-orange-500"; // Default to orange
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

  // Check if cards should be visible based on filter
  const shouldShowReminders = filterType === "all" || filterType === "reminders";
  const shouldShowTasks = filterType === "all" || filterType === "tasks";
  const shouldShowEvents = filterType === "all" || filterType === "events";
  const shouldShowNotes = filterType === "all" || filterType === "notes";

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

  const formatShortDate = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Format date for display
  const formatDateRange = () => {
    const range = getDateRange();
    const today = new Date();

    switch (dateFilter) {
      case "today":
        return formatShortDate(today);
      case "week":
      case "month":
        if (range) {
          return `${formatShortDate(range.start)} - ${formatShortDate(range.end)}`;
        }
        return dateFilter === "week" ? "This Week" : "This Month";
      case "custom":
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          return `${formatShortDate(start)} - ${formatShortDate(end)}`;
        }
        return "Custom Range";
      case "all":
      default:
        return "All Time";
    }
  };

  return (
    <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl">
      {/* Page Header */}
      <div className="mb-6 flex flex-col md:flex-row items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Welcome back, {userName}!
          </h1>
        </div>

        {/* Connection Status Indicators */}
        <div className="flex flex-col md:flex-row gap-2 md:gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 border border-green-200">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-green-600"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
            <span className="text-xs font-medium text-green-800">
              {hasVerifiedWhatsApp ? "CONNECTED" : "LINKS WHATSAPP"}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 border border-green-200">
            <Calendar className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium text-green-800">
              {hasCalendar ? "CONNECTED" : "CONNECT YOUR CALENDAR"}
            </span>
          </div>
        </div>

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
          
          {/* Date Range Picker */}
          <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="justify-between min-w-[180px] font-normal"
              >
                <span>{formatDateRange()}</span>
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
          
          <div className="flex gap-3 justify-between">
            {/* Filter Type - Mobile Popover */}
            <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="md:hidden justify-between w-full min-w-[140px] font-normal"
                >
                  <div className="flex items-center gap-2">
                    {getFilterTypeIcon()}
                    <span>{getFilterTypeLabel()}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <div className="p-4 space-y-2">
                  <h4 className="font-semibold text-sm mb-3">Filter by Type</h4>
                  <Button
                    variant={filterType === "all" ? "blue-primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setFilterType("all");
                      setIsFilterPopoverOpen(false);
                    }}
                    className="w-full justify-start"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    All Items
                  </Button>
                  <Button
                    variant={filterType === "reminders" ? "blue-primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setFilterType("reminders");
                      setIsFilterPopoverOpen(false);
                    }}
                    className="w-full justify-start"
                  >
                    <BellRing className="h-4 w-4 mr-2" />
                    Reminders
                  </Button>
                  <Button
                    variant={filterType === "tasks" ? "blue-primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setFilterType("tasks");
                      setIsFilterPopoverOpen(false);
                    }}
                    className="w-full justify-start"
                  >
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Tasks
                  </Button>
                  <Button
                    variant={filterType === "events" ? "blue-primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setFilterType("events");
                      setIsFilterPopoverOpen(false);
                    }}
                    className="w-full justify-start"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Events
                  </Button>
                  <Button
                    variant={filterType === "notes" ? "blue-primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setFilterType("notes");
                      setIsFilterPopoverOpen(false);
                    }}
                    className="w-full justify-start"
                  >
                    <StickyNote className="h-4 w-4 mr-2" />
                    Notes
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Filter Type Buttons - Desktop Only */}
        <div className="hidden md:flex gap-2">
          <Button
            variant={filterType === "all" ? "blue-primary" : "outline"}
            size="sm"
            onClick={() => setFilterType("all")}
            className="flex-shrink-0"
          >
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            All
          </Button>
          <Button
            variant={filterType === "reminders" ? "blue-primary" : "outline"}
            size="sm"
            onClick={() => setFilterType("reminders")}
            className="flex-shrink-0"
          >
            <BellRing className="h-3.5 w-3.5 mr-1.5" />
            Reminders
          </Button>
          <Button
            variant={filterType === "tasks" ? "blue-primary" : "outline"}
            size="sm"
            onClick={() => setFilterType("tasks")}
            className="flex-shrink-0"
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
            Tasks
          </Button>
          <Button
            variant={filterType === "events" ? "blue-primary" : "outline"}
            size="sm"
            onClick={() => setFilterType("events")}
            className="flex-shrink-0"
          >
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Events
          </Button>
          <Button
            variant={filterType === "notes" ? "blue-primary" : "outline"}
            size="sm"
            onClick={() => setFilterType("notes")}
            className="flex-shrink-0"
          >
            <StickyNote className="h-3.5 w-3.5 mr-1.5" />
            Notes
          </Button>
        </div>
      </div>

      {/* Search/Filter Results Info */}
      {/* {(searchQuery || dateFilter !== "today" || filterType !== "all") && (
        <div className="mb-4 p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Active Filters:</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {searchQuery && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                    Search: "{searchQuery}"
                  </Badge>
                )}
                {dateFilter !== "today" && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                    Date: {getDateFilterLabel()}
                  </Badge>
                )}
                {filterType !== "all" && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                    Type: {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setFilterType("all");
                setDateFilter("today");
                setCustomStartDate("");
                setCustomEndDate("");
              }}
              className="text-sm flex-shrink-0 h-8"
            >
              Clear All
              <X className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )} */}

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
            <Card className="flex flex-col h-[420px]">
              <CardHeader className="flex flex-row bg-primary items-center justify-between space-y-0 pb-3 flex-shrink-0">
                <CardTitle className="text-base font-semibold flex items-center justify-center gap-2 m-0 text-white">
                  <BellRing className="h-4 w-4" />
                  Active Reminders
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="orange" className="bg-white/20 text-white border-white/30">
                    {totalActiveReminders}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto mb-4 pr-2 -mr-2">
                  {activeReminders.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No active reminders
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeReminders.map((reminder: any) => (
                        <div
                          key={reminder.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors",
                            getReminderBorderColor(reminder)
                          )}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm">
                              {reminder.title} {getReminderFrequencyLabel(reminder)}
                            </span>
                          </div>
                          {reminder.time && (
                            <span className="text-xs text-muted-foreground font-mono ml-2 flex-shrink-0">
                              {reminder.time}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-center text-xs font-medium hover:bg-muted/50 flex-shrink-0"
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
            <Card className="flex flex-col h-[420px]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 flex-shrink-0 bg-primary">
                <CardTitle className="text-base text-white font-semibold flex items-center justify-center gap-2 m-0">
                  <CheckSquare className="h-4 w-4" />
                  Pending Tasks
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="orange" className="bg-white/20 text-white border-white/30">
                    {totalPendingTasks}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto mb-4 pr-2 -mr-2">
                  {pendingTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No pending tasks
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {pendingTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate flex-1">{task.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {totalPendingTasks > pendingTasks.length && (
                  <div className="text-center py-2 text-xs text-muted-foreground border-t border-border">
                    Showing {pendingTasks.length} of {totalPendingTasks} tasks
                  </div>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-center text-xs font-medium hover:bg-muted/50 flex-shrink-0"
                  onClick={() => router.push("/tasks")}
                >
                  View All Tasks
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
            )}

            {/* Scheduled Events */}
            {shouldShowEvents && (
            <Card className="flex flex-col h-[420px]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 flex-shrink-0 bg-primary">
                <CardTitle className="text-base font-semibold flex items-center justify-center gap-2 m-0 text-white">
                  <Calendar className="h-4 w-4" />
                  Scheduled Events
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="orange" className="bg-white/20 text-white border-white/30">
                    {totalScheduledEvents}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto mb-4 pr-2 -mr-2">
                  {scheduledEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No scheduled events
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {scheduledEvents.map((event: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <span className="text-sm truncate flex-1">{event.title}</span>
                          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                            {event.date}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {totalScheduledEvents > scheduledEvents.length && (
                  <div className="text-center py-2 text-xs text-muted-foreground border-t border-border">
                    Showing {scheduledEvents.length} of {totalScheduledEvents} events
                  </div>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-center text-xs font-medium hover:bg-muted/50 flex-shrink-0"
                  onClick={() => router.push("/settings/calendars")}
                >
                  View All Events
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
            )}

            {/* Quick Notes */}
            {shouldShowNotes && (
            <Card className="flex flex-col h-[420px]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 flex-shrink-0 bg-primary">
                <CardTitle className="text-base font-semibold flex items-center justify-center gap-2 m-0 text-white">
                  <StickyNote className="h-4 w-4" />
                  Quick Notes
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="orange" className="bg-white/20 text-white border-white/30">
                    {totalQuickNotes}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto mb-4 pr-2 -mr-2">
                  {quickNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No notes available
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {quickNotes.map((note) => (
                        <div key={note.id} className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                          <p className="text-sm font-medium mb-1">
                            {note.title}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {note.content || "No content"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Updated {new Date(note.updatedAt || note.createdAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-center text-xs font-medium hover:bg-muted/50 flex-shrink-0"
                  onClick={() => router.push("/notes")}
                >
                  View All Notes
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

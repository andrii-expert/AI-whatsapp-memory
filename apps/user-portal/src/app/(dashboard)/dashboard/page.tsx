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
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all" | "custom">("today");
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

  return (
    <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl">
      {/* Page Header */}
      <div className="mb-6 flex flex-col md:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Welcome back, {userName}!
          </h1>
          <p className="text-muted-foreground mt-2">
            Here's what's happening with your workspace today
          </p>
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
            
            {/* Date Filter */}
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
                  {dateFilter === "today" && "Today "}
                  {dateFilter === "week" && "This Week "}
                  {dateFilter === "month" && "This Month "}
                  Active Reminders
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="orange">{activeReminders.length}</Badge>
                  {totalActiveReminders > activeReminders.length && (
                    <span className="text-xs text-muted-foreground">of {totalActiveReminders}</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto mb-4 pr-2 -mr-2">
                  {activeReminders.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No active reminders
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {activeReminders.map((reminder: any) => (
                        <div
                          key={reminder.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate">
                              {reminder.title}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono ml-2">
                            {reminder.time}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {totalActiveReminders > activeReminders.length && (
                  <div className="text-center py-2 text-xs text-muted-foreground border-t border-border">
                    Showing {activeReminders.length} of {totalActiveReminders} reminders
                  </div>
                )}
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
                  {dateFilter === "today" && "Today "}
                  {dateFilter === "week" && "This Week "}
                  {dateFilter === "month" && "This Month "}
                  Pending Tasks
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="orange">{pendingTasks.length}</Badge>
                  {totalPendingTasks > pendingTasks.length && (
                    <span className="text-xs text-muted-foreground">of {totalPendingTasks}</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto mb-4 pr-2 -mr-2">
                  {pendingTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No pending tasks
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {pendingTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <span className="text-sm truncate flex-1">{task.title}</span>
                          <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
                            {task.dueDate}
                          </Badge>
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
                  {dateFilter === "today" && "Today "}
                  {dateFilter === "week" && "This Week "}
                  {dateFilter === "month" && "This Month "}
                  Scheduled Events
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="orange">{scheduledEvents.length}</Badge>
                  {totalScheduledEvents > scheduledEvents.length && (
                    <span className="text-xs text-muted-foreground">of {totalScheduledEvents}</span>
                  )}
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
                  {dateFilter === "today" && "Today "}
                  {dateFilter === "week" && "This Week "}
                  {dateFilter === "month" && "This Month "}
                  Quick Notes
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="orange">{quickNotes.length}</Badge>
                  {totalQuickNotes > quickNotes.length && (
                    <span className="text-xs text-muted-foreground">of {totalQuickNotes}</span>
                  )}
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
                          <p className="text-sm font-medium truncate">
                            {note.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {note.content || "No content"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Updated{" "}
                            {new Date(note.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {totalQuickNotes > quickNotes.length && (
                  <div className="text-center py-2 text-xs text-muted-foreground border-t border-border">
                    Showing {quickNotes.length} of {totalQuickNotes} notes
                  </div>
                )}
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

            {/* WhatsApp Integration */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center justify-center gap-3">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base m-0">WhatsApp Integration</CardTitle>
                  </div>
                  {hasVerifiedWhatsApp && (
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      Connected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {hasVerifiedWhatsApp
                    ? "Your WhatsApp account is securely connected and verified."
                    : "Link your WhatsApp account to manage your workspace through messages and voice notes seamlessly."}
                </p>
                {hasVerifiedWhatsApp ? (
                  <Button
                    variant="outline"
                    onClick={() => router.push("/settings/whatsapp")}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Manage Integration
                  </Button>
                ) : (
                  <Button
                    variant="blue-primary"
                    onClick={() =>
                      router.push("/settings/whatsapp?from=dashboard")
                    }
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Connect WhatsApp
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Calendar Integration */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center justify-center gap-3">
                    <Calendar className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base m-0">
                      Calendar Integration
                    </CardTitle>
                  </div>
                  {hasCalendar && (
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      Connected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {hasCalendar
                    ? calendars!.length === 1
                      ? "You have 1 calendar successfully integrated."
                      : `You have ${calendars!.length} calendars successfully integrated.`
                    : "Integrate your Google Calendar or Microsoft Outlook to streamline event management through WhatsApp."}
                </p>
                <Button
                  variant={hasCalendar ? "outline" : "blue-primary"}
                  onClick={() => router.push("/settings/calendars")}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {hasCalendar ? "Manage Integration" : "Connect Calendar"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

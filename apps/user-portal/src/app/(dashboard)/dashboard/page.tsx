"use client";

import { useTRPC } from "@/trpc/client";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import { useToast } from "@imaginecalendar/ui/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";
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
  BellRing,
  CheckSquare,
  StickyNote,
  Clock,
  ArrowRight,
  AlertCircle,
  X,
  ExternalLink,
  ShoppingCart,
  MoreVertical,
  MapPin,
  Video,
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
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<any | null>(null);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);

  // Fetch all data
  const { data: userData } = useQuery(trpc.user.me.queryOptions());
  const { data: whatsappNumbers } = useQuery(trpc.whatsapp.getMyNumbers.queryOptions());
  const { data: calendars } = useQuery(trpc.calendar.list.queryOptions());
  const { data: allTasks = [] } = useQuery(trpc.tasks.list.queryOptions({}));
  const { data: allNotes = [] } = useQuery(trpc.notes.list.queryOptions({}));
  const { data: reminders = [] } = useQuery(trpc.reminders.list.queryOptions());
  const { data: folders = [] } = useQuery(trpc.tasks.folders.list.queryOptions());
  const { data: shoppingListItems = [] } = useQuery(trpc.shoppingList.list.queryOptions({}));
  const { data: sharedResources } = useQuery(trpc.taskSharing.getSharedWithMe.queryOptions());
  const { data: friends = [] } = useQuery(trpc.friends.list.queryOptions());

  // Check if welcome modal should be shown from database
  useEffect(() => {
    if (userData?.showWelcomeModal) {
      setIsWelcomeModalOpen(true);
    }
  }, [userData?.showWelcomeModal]);

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

  const toggleShoppingListItemMutation = useMutation(
    trpc.shoppingList.toggle.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });
      },
    })
  );

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
    
    // Return up to 10 reminders
    return sorted.slice(0, 10);
  }, [reminders]);

  // Extract shared shopping list items from shared folders
  const sharedShoppingListItems = useMemo(() => {
    const sharedFolders = (sharedResources?.folders || []).filter((folder: any) => {
      // Check if this is a shopping list folder (has items property)
      return folder.items && Array.isArray(folder.items);
    });
    
    return sharedFolders.flatMap((folder: any) => {
      const folderPermission = folder.shareInfo?.permission || "view";
      return (folder.items || []).map((item: any) => ({
        ...item,
        isSharedWithMe: true,
        sharePermission: folderPermission,
        sharedViaFolder: true,
      }));
    });
  }, [sharedResources]);

  // Combine owned and shared shopping list items
  const allShoppingListItems = useMemo(() => {
    // Deduplicate by ID, keeping owned items over shared if duplicate
    const itemMap = new Map<string, any>();
    
    // Add owned items first
    shoppingListItems.forEach((item: any) => {
      itemMap.set(item.id, item);
    });
    
    // Add shared items (won't overwrite owned items)
    sharedShoppingListItems.forEach((item: any) => {
      if (!itemMap.has(item.id)) {
        itemMap.set(item.id, item);
      }
    });
    
    return Array.from(itemMap.values());
  }, [shoppingListItems, sharedShoppingListItems]);

  // Filter shopping list items (from new shopping list table)
  const filteredShoppingListItems = useMemo(() => {
    const filtered = allShoppingListItems.filter((item) => item.status === "open");
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // Most recent first
    });
    return sorted.slice(0, 10); // Show up to 10 items
  }, [allShoppingListItems]);

  // Extract shared tasks from shared resources
  const sharedTasks = useMemo(() => {
    return (sharedResources?.tasks || []).map((task: any) => ({
      ...task,
      isSharedWithMe: true,
      sharePermission: task.shareInfo?.permission || "view",
      ownerId: task.shareInfo?.ownerId,
    }));
  }, [sharedResources]);

  // Extract tasks from shared folders
  const tasksFromSharedFolders = useMemo(() => {
    const sharedFolders = (sharedResources?.folders || []).filter((folder: any) => {
      // Check if this is a task folder (has tasks property)
      return folder.tasks && Array.isArray(folder.tasks);
    });
    
    return sharedFolders.flatMap((folder: any) => {
      const folderPermission = folder.shareInfo?.permission || "view";
      return (folder.tasks || []).map((task: any) => ({
        ...task,
        isSharedWithMe: true,
        sharePermission: folderPermission,
        sharedViaFolder: true,
      }));
    });
  }, [sharedResources]);

  // Combine owned and shared tasks
  const allCombinedTasks = useMemo(() => {
    // Deduplicate by ID, keeping owned items over shared if duplicate
    const taskMap = new Map<string, any>();
    
    // Add owned tasks first
    allTasks.forEach((task: any) => {
      taskMap.set(task.id, task);
    });
    
    // Add directly shared tasks
    sharedTasks.forEach((task: any) => {
      if (!taskMap.has(task.id)) {
        taskMap.set(task.id, task);
      }
    });
    
    // Add tasks from shared folders
    tasksFromSharedFolders.forEach((task: any) => {
      if (!taskMap.has(task.id)) {
        taskMap.set(task.id, task);
      }
    });
    
    return Array.from(taskMap.values());
  }, [allTasks, sharedTasks, tasksFromSharedFolders]);

  // Filter tasks - show 10 most recent (sorted by createdAt)
  const pendingTasks = useMemo(() => {
    const filtered = allCombinedTasks.filter((t) => t.status === "open");
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // Most recent first
    });
    return sorted.slice(0, 10); // Show up to 10 tasks
  }, [allCombinedTasks]);

  // Fetch shared notes (notes have separate sharing endpoint)
  const { data: sharedNoteResources } = useQuery(trpc.noteSharing.getSharedWithMe.queryOptions());

  // Extract shared notes from shared note resources
  const sharedNotes = useMemo(() => {
    return (sharedNoteResources?.notes || []).map((note: any) => ({
      ...note,
      isSharedWithMe: true,
      sharePermission: note.shareInfo?.permission || "view",
      ownerId: note.shareInfo?.ownerId,
    }));
  }, [sharedNoteResources]);

  // Extract notes from shared note folders
  const notesFromSharedFolders = useMemo(() => {
    const sharedFolders = (sharedNoteResources?.folders || []);
    
    return sharedFolders.flatMap((folder: any) => {
      const folderPermission = folder.shareInfo?.permission || "view";
      return (folder.notes || []).map((note: any) => ({
        ...note,
        isSharedWithMe: true,
        sharePermission: folderPermission,
        sharedViaFolder: true,
      }));
    });
  }, [sharedNoteResources]);

  // Combine owned and shared notes
  const allCombinedNotes = useMemo(() => {
    // Deduplicate by ID, keeping owned items over shared if duplicate
    const noteMap = new Map<string, any>();
    
    // Add owned notes first
    allNotes.forEach((note: any) => {
      noteMap.set(note.id, note);
    });
    
    // Add directly shared notes
    sharedNotes.forEach((note: any) => {
      if (!noteMap.has(note.id)) {
        noteMap.set(note.id, note);
      }
    });
    
    // Add notes from shared folders
    notesFromSharedFolders.forEach((note: any) => {
      if (!noteMap.has(note.id)) {
        noteMap.set(note.id, note);
      }
    });
    
    return Array.from(noteMap.values());
  }, [allNotes, sharedNotes, notesFromSharedFolders]);

  // Get quick notes - show latest 10
  const quickNotes = useMemo(() => {
    const sorted = [...allCombinedNotes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted.slice(0, 10); // Show up to 10 notes
  }, [allCombinedNotes]);

  // Process events for display (EXACT same as calendar page)
  const processedEvents = useMemo(() => {
    return allCalendarEvents.map((event: any) => {
      const calendar = calendars?.find((cal: any) => cal.id === event.calendarId);
      const provider = calendar?.provider || "google";
      // Use color from event or default based on provider
      const eventColor = event.color || (provider === "google" ? "blue" : "purple");
      const color = eventColor === "orange" ? "bg-orange-500" : 
                    eventColor === "purple" ? "bg-purple-500" :
                    eventColor === "blue" ? "bg-blue-500" :
                    "bg-blue-500";
      
      return {
        id: event.id,
        title: event.title,
        start: new Date(event.start),
        end: new Date(event.end),
        color,
        eventColor,
        location: event.location,
        htmlLink: event.htmlLink,
        webLink: event.webLink,
        conferenceUrl: event.conferenceUrl,
        attendees: event.attendees || [],
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
      
      // Format time range (e.g., "9AM -10PM (EST)")
      const startTime = format(startDate, "ha");
      const endTime = format(endDate, "ha");
      const timeRange = isAllDay ? "All day" : `${startTime} -${endTime} (EST)`;
      
      return {
        id: event.id,
        title: event.title || "Untitled Event",
        start: startDate,
        end: endDate,
        startDate: startDate,
        endDate: endDate,
        timeLabel,
        timeRange,
        location: event.location,
        description: event.description,
        htmlLink: event.htmlLink,
        webLink: event.webLink,
        color: event.color,
        eventColor: event.eventColor,
        conferenceUrl: event.conferenceUrl,
        attendees: event.attendees || [],
      };
    });
    
    // Sort by start time
    formattedEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    
    return formattedEvents.slice(0, 10); // Show up to 10 events
  }, [processedEvents]);

  const shouldShowReminders = true;
  const shouldShowTasks = true;
  const shouldShowEvents = true;
  const shouldShowNotes = true;

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

  const totalItems = reminders.length + allCombinedTasks.length + allCombinedNotes.length + (calendars?.length || 0);
  const openTasks = allCombinedTasks.filter((t) => t.status === "open").length;
  
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
    const filtered = allCombinedTasks.filter((t) => t.status === "open");
    return filterItems(filtered).length;
  }, [allCombinedTasks, searchQuery]);

  const totalShoppingListItems = useMemo(() => {
    const filtered = allShoppingListItems.filter((item) => item.status === "open");
    return filtered.length;
  }, [allShoppingListItems]);
  
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
    
    return todayEvents.length;
  }, [processedEvents]);
  
  const totalQuickNotes = useMemo(() => {
    const sorted = [...allCombinedNotes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted.length;
  }, [allCombinedNotes]);

  // Calculate friends count
  const totalFriends = useMemo(() => {
    return friends.length;
  }, [friends]);

  // Calculate birthdays today (placeholder - set to 0 for now)
  const birthdaysToday = 0;

  const userName = user?.firstName || "there";

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

          <div className="flex flex-row gap-3 w-full xl:w-auto">
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
                Link WhatsApp
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
                Link Calendar
              </span>
            </button>
          </div>
        </div>

      </div>


      <div className="grid grid-cols-1 gap-6">
        {/* Main Content Area */}
        <div>
          {/* Status Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6 text-center">
            <div 
              onClick={() => router.push("/calendars")}
              className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4 cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:border-primary transition-all"
            >
              <div className="text-3xl font-bold" style={{ color: "#1e40af" }}>
                {totalScheduledEvents}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Meetings today
              </div>
            </div>

            <div 
              onClick={() => router.push("/reminders")}
              className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4 cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:border-primary transition-all"
            >
              <div className="text-3xl font-bold" style={{ color: "#1e40af" }}>
                {totalActiveReminders}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Todays Reminders
              </div>
            </div>

            <div 
              onClick={() => router.push("/shopping-lists")}
              className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4 cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:border-primary transition-all"
            >
              <div className="text-3xl font-bold" style={{ color: "#1e40af" }}>
                {totalShoppingListItems}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Remaining Purchase
              </div>
            </div>

            <div 
              onClick={() => router.push("/friends")}
              className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4 cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:border-primary transition-all"
            >
              <div className="text-3xl font-bold" style={{ color: "#1e40af" }}>
                {birthdaysToday}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Birthdays Today
              </div>
            </div>

            <div 
              onClick={() => router.push("/friends")}
              className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4 cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:border-primary transition-all"
            >
              <div className="text-3xl font-bold" style={{ color: "#1e40af" }}>
                {totalFriends}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Friends Added
              </div>
            </div>

            <div 
              onClick={() => router.push("/notes")}
              className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100 p-2 px-4 cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:border-primary transition-all"
            >
              <div className="text-3xl font-bold" style={{ color: "#1e40af" }}>
                {allCombinedNotes.length}
              </div>
              <div className="text-sm text-gray-500 font-normal">
                Notes Created
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Shopping List Card */}
            <Card className="flex flex-col h-[420px] rounded-lg border border-gray-200 shadow-sm overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
                <CardTitle className="text-lg font-bold text-gray-900">Shopping List</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-sm border-gray-300"
                  onClick={() => router.push("/shopping-lists")}
                >
                  View All
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0 px-0 pb-0">
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {filteredShoppingListItems.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">
                      No items in shopping list
                    </p>
                  ) : (
                    <div className="space-y-0">
                      {filteredShoppingListItems.map((item: any, index: number) => {
                        const creatorName = item.user?.firstName || item.user?.name || "You";
                        const isCurrentUser = item.userId === userData?.id;
                        const formattedDate = item.createdAt 
                          ? format(new Date(item.createdAt), 'd MMMM')
                          : '';
                        
                        return (
                          <div key={item.id}>
                            <div className="flex items-start gap-3 py-3">
                              <input
                                type="checkbox"
                                checked={item.status === "completed"}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  toggleShoppingListItemMutation.mutate({ id: item.id });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                disabled={toggleShoppingListItemMutation.isPending}
                                className="h-4 w-4 mt-1 rounded border-gray-300 text-blue-600 focus:ring-0 focus:ring-offset-0 disabled:opacity-60 disabled:cursor-not-allowed"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-bold text-gray-900">
                                    {item.name}
                                  </p>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    isCurrentUser 
                                      ? 'bg-gray-100 text-gray-600' 
                                      : 'bg-pink-100 text-pink-600'
                                  }`}>
                                    {creatorName} • {formattedDate}
                                  </span>
                                </div>
                                {item.description ? (
                                  <p className="text-xs text-gray-500 italic">
                                    {item.description}
                                  </p>
                                ) : null}
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-500 hover:text-gray-700"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                                  <DropdownMenuItem
                                    onClick={() => router.push("/shopping-lists")}
                                    className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                                  >
                                    <span>View</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {index < filteredShoppingListItems.length - 1 && (
                              <div className="h-px bg-gray-200" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Events Card */}
            {shouldShowEvents && (
              <Card className="flex flex-col h-[420px] rounded-lg border border-gray-200 shadow-sm overflow-hidden bg-white">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
                  <CardTitle className="text-lg font-bold text-gray-900">Events</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm border-gray-300"
                    onClick={() => router.push("/calendars")}
                  >
                    View All
                  </Button>
                </CardHeader>
                <CardContent className="flex flex-col flex-1 min-h-0 px-0 pb-0">
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    {scheduledEvents.length === 0 ? (
                      <p className="text-sm text-gray-500 py-8 text-center">
                        No events today
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {scheduledEvents.map((event: any, index: number) => {
                          const borderColor = event.eventColor === "orange" ? "border-orange-500" :
                                             event.eventColor === "purple" ? "border-purple-500" :
                                             event.eventColor === "blue" ? "border-blue-500" :
                                             "border-blue-500";
                          
                          // Get first 2 attendees for display
                          const displayAttendees = event.attendees?.slice(0, 2) || [];
                          const additionalCount = event.attendees?.length > 2 ? event.attendees.length - 2 : 0;
                          
                          // Get initials for attendees
                          const getInitials = (email: string) => {
                            const name = email.split('@')[0];
                            const parts = name.split('.');
                            if (parts.length >= 2) {
                              return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
                            }
                            return name.substring(0, 2).toUpperCase();
                          };
                          
                          return (
                            <div
                              key={event.id}
                              className={`rounded-lg border-2 ${borderColor} bg-white p-4 space-y-3`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h3 className="text-sm font-bold text-gray-900">
                                      {event.title}
                                    </h3>
                                    {event.conferenceUrl && (
                                      <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
                                        <Video className="h-3 w-3" />
                                        Google meet
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mb-3">
                                    {event.timeRange} (EST)
                                  </p>
                                  {displayAttendees.length > 0 && (
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="flex -space-x-2">
                                        {displayAttendees.map((attendee: string, idx: number) => (
                                          <div
                                            key={idx}
                                            className="w-8 h-8 rounded-full bg-gray-300 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-700"
                                          >
                                            {getInitials(attendee)}
                                          </div>
                                        ))}
                                      </div>
                                      {additionalCount > 0 && (
                                        <span className="text-xs text-gray-500">
                                          +{additionalCount}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {event.location && (
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                      <MapPin className="h-3.5 w-3.5" />
                                      <span>{event.location}</span>
                                    </div>
                                  )}
                                </div>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-gray-500 hover:text-gray-700"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (event.htmlLink) {
                                          window.open(event.htmlLink, "_blank");
                                        } else if (event.webLink) {
                                          window.open(event.webLink, "_blank");
                                        }
                                      }}
                                      className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                                    >
                                      <span>View</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reminders Card */}
            {shouldShowReminders && (
              <Card className="flex flex-col h-[420px] rounded-lg border border-gray-200 shadow-sm overflow-hidden bg-white">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
                  <CardTitle className="text-lg font-bold text-gray-900">Reminders</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm border-gray-300"
                    onClick={() => router.push("/reminders")}
                  >
                    View All
                  </Button>
                </CardHeader>
                <CardContent className="flex flex-col flex-1 min-h-0 px-0 pb-0">
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    {activeReminders.length === 0 ? (
                      <p className="text-sm text-gray-500 py-8 text-center">
                        No active reminders
                      </p>
                    ) : (
                      <div className="space-y-0">
                        {activeReminders.map((reminder: any, index: number) => {
                          const subtitle = formatReminderSubtitle(reminder);
                          
                          return (
                            <div key={reminder.id}>
                              <div
                                onClick={() => {
                                  setSelectedReminder(reminder);
                                  setIsReminderModalOpen(true);
                                }}
                                className="flex items-start justify-between py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-sm font-bold text-gray-900">
                                      {reminder.title || "Untitled Reminder"}
                                    </h3>
                                  </div>
                                  {subtitle && (
                                    <p className="text-xs text-gray-500">
                                      {subtitle}
                                    </p>
                                  )}
                                  {reminder.time && !subtitle && (
                                    <p className="text-xs text-gray-500">
                                      {reminder.time}
                                    </p>
                                  )}
                                </div>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-gray-500 hover:text-gray-700"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedReminder(reminder);
                                        setIsReminderModalOpen(true);
                                      }}
                                      className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                                    >
                                      <span>View</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              {index < activeReminders.length - 1 && (
                                <div className="h-px bg-gray-200" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
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

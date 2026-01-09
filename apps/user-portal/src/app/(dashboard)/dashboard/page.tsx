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
    return filtered.length;
  }, [reminders]);
  
  const totalPendingTasks = useMemo(() => {
    const filtered = allCombinedTasks.filter((t) => t.status === "open");
    return filtered.length;
  }, [allCombinedTasks]);

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
  
  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Main Container */}
      <div className="mx-auto max-w-md md:max-w-4xl lg:max-w-6xl">
        {/* Header Section */}
        <div className="bg-white shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)]">
          <div className="p-4 bg-white">
            <div className="flex flex-col gap-[3px]">
              <h1 className="text-[24px] font-semibold leading-[32px] tracking-[-0.48px] text-[#141718]">
                {getGreeting()}, {userName}! 👋
              </h1>
              <p className="text-[14px] font-normal leading-[130%] text-[#9999A5]">
                Here's what's happening with your workspace today
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-[10px] mt-4">
              <button
                onClick={() =>
                  router.push(
                    hasVerifiedWhatsApp
                      ? "/settings/whatsapp"
                      : "/settings/whatsapp?from=dashboard"
                  )
                }
                className="flex-1 flex items-center justify-center gap-2 px-3 py-[10px] rounded-xl border border-[#D0D5DD] bg-white"
              >
                <WhatsappIcon />
                <span className="text-[14px] font-medium text-[#344054]">Link Whatsapp</span>
              </button>
              <button
                onClick={() => router.push("/calendars")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-[10px] rounded-xl border border-[#D0D5DD] bg-white"
              >
                <CalendarIcon />
                <span className="text-[14px] font-medium text-[#344054]">Link Calendar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="px-4 py-4">
          <div className="flex flex-col gap-6">
            {/* First Row */}
            <div className="flex gap-2">
              <StatCard
                number={totalScheduledEvents.toString()}
                label="Meetings today"
                iconBg="#FFF7F1"
                borderColor="#FCF3EC"
                blurColor="#FFDEC5"
                icon={<EventIcon />}
                onClick={() => router.push("/calendars")}
              />
              <StatCard
                number={totalActiveReminders.toString()}
                label="Todays Reminders"
                iconBg="#F2FBFF"
                borderColor="#ECF7FC"
                blurColor="#C5EEFF"
                icon={<NotificationsIcon />}
                onClick={() => router.push("/reminders")}
              />
            </div>

            {/* Second Row */}
            <div className="flex gap-2">
              <StatCard
                number={totalShoppingListItems.toString()}
                label="Remaining Purchase"
                iconBg="#F2FFF4"
                borderColor="#ECFCEE"
                blurColor="#C4FFCC"
                icon={<ShoppingCartIcon />}
                onClick={() => router.push("/shopping-lists")}
              />
              <StatCard
                number={birthdaysToday.toString()}
                label="Birthdays Today"
                iconBg="#FFFCF2"
                borderColor="#FCF8EC"
                blurColor="#FFF0C5"
                icon={<CakeIcon />}
                onClick={() => router.push("/friends")}
              />
            </div>

            {/* Third Row */}
            <div className="flex gap-2">
              <StatCard
                number={totalFriends.toString()}
                label="Friends Added"
                iconBg="#FFF2F7"
                borderColor="#FFF3F8"
                blurColor="#FFC5DA"
                icon={<GroupsIcon />}
                onClick={() => router.push("/friends")}
              />
              <StatCard
                number={allCombinedNotes.length.toString()}
                label="Notes Created"
                iconBg="#F2F5FF"
                borderColor="#F0F4FF"
                blurColor="#C5D2FF"
                icon={<ArticleIcon />}
                onClick={() => router.push("/notes")}
              />
            </div>
          </div>

          {/* Recent Shopping List */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[16px] font-semibold leading-[130%] text-black">
                Recent Shopping List
              </h2>
              <button
                onClick={() => router.push("/shopping-lists")}
                className="px-2 py-2 rounded-lg border border-[#F1F1F1] bg-white"
              >
                <span className="text-[14px] font-medium text-[#1D2228]">View All</span>
              </button>
            </div>

            <div className="rounded-2xl border border-[#EFEFEF] bg-white shadow-[0_2px_24px_0_rgba(0,0,0,0.05)]">
              {filteredShoppingListItems.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500">No items in shopping list</p>
                </div>
              ) : (
                <>
                  {filteredShoppingListItems.slice(0, 3).map((item: any, index: number) => {
                    const creatorName = item.user?.firstName || item.user?.name || "You";
                    const isCurrentUser = item.userId === userData?.id;
                    const formattedDate = item.createdAt 
                      ? format(new Date(item.createdAt), 'd MMMM')
                      : '';
                    const badgeColor = isCurrentUser ? "gray" : "pink";
                    
                    return (
                      <ShoppingItem
                        key={item.id}
                        title={item.name}
                        description={item.description}
                        badge={creatorName}
                        date={formattedDate}
                        badgeColor={badgeColor}
                        hasBorder={index < Math.min(filteredShoppingListItems.length, 3) - 1}
                        checked={item.status === "completed"}
                        onToggle={() => {
                          toggleShoppingListItemMutation.mutate({ id: item.id });
                        }}
                        disabled={toggleShoppingListItemMutation.isPending}
                      />
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Today's Events */}
          {shouldShowEvents && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-[16px] font-semibold leading-[130%] text-black">
                  Today's Events
                </h2>
                <button
                  onClick={() => router.push("/calendars")}
                  className="px-2 py-2 rounded-lg border border-[#F1F1F1] bg-white"
                >
                  <span className="text-[14px] font-medium text-[#1D2228]">View All</span>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {scheduledEvents.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-gray-500">No events today</p>
                  </div>
                ) : (
                  scheduledEvents.slice(0, 2).map((event: any) => {
                    const borderColor = event.eventColor === "orange" ? "#D8A4FF" :
                                       event.eventColor === "purple" ? "#D8A4FF" :
                                       event.eventColor === "blue" ? "#D8A4FF" :
                                       "#E6CB8A";
                    const bgColor = event.eventColor === "orange" ? "#FDFAFF" :
                                    event.eventColor === "purple" ? "#FDFAFF" :
                                    event.eventColor === "blue" ? "#FDFAFF" :
                                    "#FFFEFA";
                    
                    return (
                      <EventCard
                        key={event.id}
                        borderColor={borderColor}
                        bgColor={bgColor}
                        event={event}
                      />
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Today's Reminders */}
          {shouldShowReminders && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-[16px] font-semibold leading-[130%] text-black">
                  Today's Reminders
                </h2>
                <button
                  onClick={() => router.push("/reminders")}
                  className="px-2 py-2 rounded-lg border border-[#F1F1F1] bg-white"
                >
                  <span className="text-[14px] font-medium text-[#1D2228]">View All</span>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {activeReminders.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-gray-500">No active reminders</p>
                  </div>
                ) : (
                  activeReminders.slice(0, 3).map((reminder: any) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      subtitle={formatReminderSubtitle(reminder)}
                      onClick={() => {
                        setSelectedReminder(reminder);
                        setIsReminderModalOpen(true);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          )}
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

// Components

function StatCard({ number, label, iconBg, borderColor, blurColor, icon, onClick }: {
  number: string;
  label: string;
  iconBg: string;
  borderColor: string;
  blurColor: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex-1 relative p-4 rounded-xl border bg-white shadow-[0_2px_16px_0_rgba(0,0,0,0.02)] overflow-hidden cursor-pointer"
      style={{ borderColor }}
    >
      <div className="absolute top-0 left-0 w-[55px] h-[55px] rounded-full" style={{ background: blurColor, filter: 'blur(50px)' }} />
      <div className="relative flex items-start gap-2">
        <div className="flex-1 flex flex-col gap-2">
          <div className="text-[32px] font-medium leading-none tracking-[-1.28px] text-black">
            {number}
          </div>
          <div className="text-[12px] font-normal tracking-[-0.48px] text-[#4C4C4C]">
            {label}
          </div>
        </div>
        <div className="w-8 h-8 flex items-center justify-center rounded-[19px]" style={{ background: iconBg }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ShoppingItem({ title, description, badge, date, badgeColor = "gray", hasBorder, checked, onToggle, disabled }: {
  title: string;
  description?: string;
  badge: string;
  date: string;
  badgeColor?: "gray" | "pink";
  hasBorder?: boolean;
  checked?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  const badgeStyles = badgeColor === "pink"
    ? "bg-[#FEF2FD] text-[#E751DD] rounded-lg"
    : "bg-white border border-[#F7F7F7] text-[#9999A5] shadow-[0_0_12px_0_rgba(0,0,0,0.04)] rounded-[4px]";

  return (
    <div className={`flex justify-between items-center px-4 py-5 ${hasBorder ? 'border-b border-[#F1F1F1]' : ''}`}>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-0 focus:ring-offset-0 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-[14px] font-semibold leading-[130%] text-[#1D2228]">
              {title}
            </span>
            <div className={`flex items-center gap-1 px-2 py-1 ${badgeColor === "pink" ? 'rounded-lg' : 'rounded-[4px]'} ${badgeStyles}`}>
              <span className="text-[10px] font-medium">{badge}</span>
              <div className="w-1 h-1 rounded-full" style={{ background: badgeColor === "pink" ? "#E751DD" : "#D9D9D9" }} />
              <span className="text-[10px] font-medium">{date}</span>
            </div>
          </div>
          {description && (
            <div className="text-[12px] font-medium leading-[130%] text-[#9999A5]">
              {description}
            </div>
          )}
        </div>
      </div>
      <button className="text-[#9B9BA7]">
        <MoreVertIcon />
      </button>
    </div>
  );
}

function EventCard({ borderColor, bgColor, event }: { borderColor: string; bgColor: string; event: any }) {
  // Get first 2 attendees for display
  const displayAttendees = event?.attendees?.slice(0, 2) || [];
  const additionalCount = (event?.attendees?.length || 0) > 2 ? (event?.attendees?.length || 0) - 2 : 0;
  
  // Get initials for attendees
  const getInitials = (email: string) => {
    if (!email) return "??";
    const name = email.split('@')[0];
    if (!name) return "??";
    const parts = name.split('.');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase() || "??";
  };

  return (
    <div className="flex justify-between items-start p-4 rounded-xl border shadow-[0_2px_24px_0_rgba(0,0,0,0.05)]" style={{ borderColor, background: bgColor }}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-[15px] font-medium leading-[130%] text-[#1D2228]">
              {event.title}
            </span>
            {event.conferenceUrl && (
              <div className="flex items-center gap-1 px-[7px] py-1 rounded border border-black/10">
                <img src="https://api.builder.io/api/v1/image/assets/TEMP/202723389e34de298dca05ebfb3eb4cf4d22ffee?width=24" alt="" className="w-3 h-[10px]" />
                <span className="text-[10px] font-medium text-[#9999A5]">Google meet</span>
              </div>
            )}
          </div>
          <div className="text-[12px] font-normal text-black/40">
            {event.timeRange || "9AM -10PM (EST)"}
          </div>
        </div>

        {displayAttendees.length > 0 && (
          <div className="flex items-center gap-1 px-1 pr-2 py-1 rounded-[114px] border border-[#EBEBEB] bg-white w-fit">
            <div className="flex items-center -space-x-1">
              {displayAttendees.map((attendee: string, idx: number) => (
                <div
                  key={idx}
                  className="w-[21px] h-[21px] rounded-full border-2 border-white bg-gray-300 flex items-center justify-center text-[10px] font-medium text-gray-700"
                >
                  {getInitials(attendee)}
                </div>
              ))}
            </div>
            {additionalCount > 0 && (
              <span className="text-[12px] font-medium text-[#9999A5] ml-1">+{additionalCount}</span>
            )}
          </div>
        )}

        {event.location && (
          <div className="flex items-center gap-[2px]">
            <LocationIcon />
            <span className="text-[12px] font-normal text-black/40">
              {event.location}
            </span>
          </div>
        )}
      </div>
      <button className="text-[#9B9BA7]">
        <MoreVertIcon />
      </button>
    </div>
  );
}

function ReminderCard({ reminder, subtitle, onClick }: { reminder: any; subtitle?: string; onClick?: () => void }) {
  const time = reminder.time || "08:00 PM";
  const duration = "1 hour 30 minutes";

  return (
    <div className="flex justify-between items-center px-4 py-3 rounded-2xl border border-[#F1F1F1] bg-white cursor-pointer" onClick={onClick}>
      <div className="flex flex-col gap-2">
        <div className="text-[14px] font-semibold leading-[130%] text-[#1D1D1B]">
          {reminder.title || "Weekly Shop"}
        </div>
        <div className="flex items-center gap-[6px]">
          <div className="flex items-center gap-1 px-3 py-2 rounded-[63px] bg-[#F6F6FF]">
            <ClockIcon />
            <span className="text-[12px] font-medium text-[#6D6DE2]">{time}</span>
          </div>
          <div className="w-[6px] h-[6px] rounded-full bg-[#A9A9A9]" />
          <span className="text-[12px] font-medium text-[#9999A5]">{subtitle || duration}</span>
        </div>
      </div>
      <button className="text-[#9B9BA7]">
        <MoreVertIcon />
      </button>
    </div>
  );
}

// Icons

function WhatsappIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 21 21" fill="none">
      <rect width="21" height="21" rx="10.5" fill="url(#paint0_linear)" />
      <path d="M4.13086 16.6088L5.03118 13.3395C4.47456 12.3799 4.18257 11.2931 4.18561 10.1822C4.18561 6.70094 7.03256 3.87054 10.5274 3.87054C12.2246 3.87054 13.8184 4.52744 15.0137 5.72014C16.2121 6.91284 16.8722 8.49907 16.8691 10.1852C16.8691 13.6664 14.0222 16.4968 10.5243 16.4968H10.5213C9.45976 16.4968 8.41649 16.2304 7.4888 15.7279L4.13086 16.6088ZM7.65 14.5867L7.84162 14.7017C8.65069 15.18 9.57838 15.4313 10.5243 15.4343H10.5274C13.4321 15.4343 15.7985 13.0822 15.7985 10.1882C15.7985 8.78665 15.251 7.46983 14.2564 6.47693C13.2618 5.48402 11.9356 4.93913 10.5274 4.93913C7.62263 4.9361 5.25626 7.28821 5.25626 10.1822C5.25626 11.172 5.53304 12.1377 6.06228 12.9732L6.18699 13.173L5.65471 15.1074L7.65 14.5867Z" fill="white" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8.94278 7.5425C8.82416 7.27914 8.69945 7.27308 8.58691 7.27006C8.49567 7.26703 8.38921 7.26703 8.28275 7.26703C8.1763 7.26703 8.00597 7.30638 7.85997 7.46379C7.71397 7.62121 7.3064 8.00263 7.3064 8.78061C7.3064 9.55556 7.87518 10.3063 7.95426 10.4122C8.03334 10.5182 9.05228 12.1619 10.6613 12.7946C11.9996 13.3213 12.2733 13.2154 12.5623 13.1881C12.8513 13.1609 13.4991 12.8067 13.6329 12.4374C13.7637 12.0681 13.7637 11.7533 13.7242 11.6867C13.6847 11.6201 13.5782 11.5807 13.42 11.502C13.2619 11.4233 12.4832 11.0419 12.3372 10.9874C12.1912 10.9359 12.0848 10.9087 11.9814 11.0661C11.8749 11.2235 11.5707 11.5777 11.4795 11.6837C11.3882 11.7896 11.2939 11.8017 11.1358 11.723C10.9776 11.6443 10.4666 11.4778 9.86135 10.939C9.3899 10.5212 9.07053 10.0036 8.97928 9.84617C8.88803 9.68875 8.97016 9.60399 9.04924 9.52529C9.1192 9.45566 9.2074 9.34063 9.28649 9.24982C9.36557 9.159 9.39294 9.0924 9.44465 8.98645C9.49636 8.8805 9.47202 8.78969 9.43248 8.71098C9.39294 8.6353 9.0827 7.8543 8.94278 7.5425Z" fill="white" />
      <defs>
        <linearGradient id="paint0_linear" x1="10.4995" y1="20.999" x2="10.4995" y2="-0.000734736" gradientUnits="userSpaceOnUse">
          <stop stopColor="#20B038" />
          <stop offset="1" stopColor="#60D66A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M1.66667 16.6667C1.20833 16.6667 0.815972 16.5035 0.489583 16.1771C0.163194 15.8507 0 15.4583 0 15V3.33333C0 2.875 0.163194 2.48264 0.489583 2.15625C0.815972 1.82986 1.20833 1.66667 1.66667 1.66667H2.5V0.833333C2.5 0.597222 2.57986 0.399306 2.73958 0.239583C2.89931 0.0798611 3.09722 0 3.33333 0C3.56944 0 3.76736 0.0798611 3.92708 0.239583C4.08681 0.399306 4.16667 0.597222 4.16667 0.833333V1.66667H10.8333V0.833333C10.8333 0.597222 10.9132 0.399306 11.0729 0.239583C11.2326 0.0798611 11.4306 0 11.6667 0C11.9028 0 12.1007 0.0798611 12.2604 0.239583C12.4201 0.399306 12.5 0.597222 12.5 0.833333V1.66667H13.3333C13.7917 1.66667 14.184 1.82986 14.5104 2.15625C14.8368 2.48264 15 2.875 15 3.33333V15C15 15.4583 14.8368 15.8507 14.5104 16.1771C14.184 16.5035 13.7917 16.6667 13.3333 16.6667H1.66667ZM1.66667 15H13.3333V6.66667H1.66667V15Z" fill="#446DE1" />
    </svg>
  );
}

function EventIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="mask0_206_1448" style={{ maskType: "alpha" as const }} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
<rect width="16" height="16" fill="#D9D9D9"/>
</mask>
<g mask="url(#mask0_206_1448)">
<path d="M9.66667 12C9.2 12 8.80556 11.8389 8.48333 11.5166C8.16111 11.1944 8 10.8 8 10.3333C8 9.86665 8.16111 9.4722 8.48333 9.14998C8.80556 8.82776 9.2 8.66665 9.66667 8.66665C10.1333 8.66665 10.5278 8.82776 10.85 9.14998C11.1722 9.4722 11.3333 9.86665 11.3333 10.3333C11.3333 10.8 11.1722 11.1944 10.85 11.5166C10.5278 11.8389 10.1333 12 9.66667 12ZM3.33333 14.6666C2.96667 14.6666 2.65278 14.5361 2.39167 14.275C2.13056 14.0139 2 13.7 2 13.3333V3.99998C2 3.63331 2.13056 3.31942 2.39167 3.05831C2.65278 2.7972 2.96667 2.66665 3.33333 2.66665H4V1.99998C4 1.81109 4.06389 1.65276 4.19167 1.52498C4.31944 1.3972 4.47778 1.33331 4.66667 1.33331C4.85556 1.33331 5.01389 1.3972 5.14167 1.52498C5.26944 1.65276 5.33333 1.81109 5.33333 1.99998V2.66665H10.6667V1.99998C10.6667 1.81109 10.7306 1.65276 10.8583 1.52498C10.9861 1.3972 11.1444 1.33331 11.3333 1.33331C11.5222 1.33331 11.6806 1.3972 11.8083 1.52498C11.9361 1.65276 12 1.81109 12 1.99998V2.66665H12.6667C13.0333 2.66665 13.3472 2.7972 13.6083 3.05831C13.8694 3.31942 14 3.63331 14 3.99998V13.3333C14 13.7 13.8694 14.0139 13.6083 14.275C13.3472 14.5361 13.0333 14.6666 12.6667 14.6666H3.33333ZM3.33333 13.3333H12.6667V6.66665H3.33333V13.3333Z" fill="#EEB183"/>
</g>
</svg>

  );
}

function NotificationsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="mask0_206_1457" style={{ maskType: "alpha" as const }} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
<rect width="16" height="16" fill="#D9D9D9"/>
</mask>
<g mask="url(#mask0_206_1457)">
<path d="M3.33341 12.6666C3.14453 12.6666 2.98619 12.6028 2.85841 12.475C2.73064 12.3472 2.66675 12.1889 2.66675 12C2.66675 11.8111 2.73064 11.6528 2.85841 11.525C2.98619 11.3972 3.14453 11.3333 3.33341 11.3333H4.00008V6.66665C4.00008 5.74442 4.27786 4.92498 4.83341 4.20831C5.38897 3.49165 6.11119 3.0222 7.00008 2.79998V2.33331C7.00008 2.05554 7.0973 1.81942 7.29175 1.62498C7.48619 1.43054 7.7223 1.33331 8.00008 1.33331C8.27786 1.33331 8.51397 1.43054 8.70841 1.62498C8.90286 1.81942 9.00008 2.05554 9.00008 2.33331V2.79998C9.88897 3.0222 10.6112 3.49165 11.1667 4.20831C11.7223 4.92498 12.0001 5.74442 12.0001 6.66665V11.3333H12.6667C12.8556 11.3333 13.014 11.3972 13.1417 11.525C13.2695 11.6528 13.3334 11.8111 13.3334 12C13.3334 12.1889 13.2695 12.3472 13.1417 12.475C13.014 12.6028 12.8556 12.6666 12.6667 12.6666H3.33341ZM8.00008 14.6666C7.63341 14.6666 7.31953 14.5361 7.05841 14.275C6.7973 14.0139 6.66675 13.7 6.66675 13.3333H9.33341C9.33341 13.7 9.20286 14.0139 8.94175 14.275C8.68064 14.5361 8.36675 14.6666 8.00008 14.6666ZM5.33341 11.3333H10.6667V6.66665C10.6667 5.93331 10.4056 5.30554 9.88341 4.78331C9.36119 4.26109 8.73341 3.99998 8.00008 3.99998C7.26675 3.99998 6.63897 4.26109 6.11675 4.78331C5.59453 5.30554 5.33341 5.93331 5.33341 6.66665V11.3333Z" fill="#48BBED"/>
</g>
</svg>

  );
}

function ShoppingCartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="mask0_206_1467" style={{ maskType: "alpha" as const }} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
<rect width="16" height="16" fill="#D9D9D9"/>
</mask>
<g mask="url(#mask0_206_1467)">
<path d="M4.66675 14.6666C4.30008 14.6666 3.98619 14.5361 3.72508 14.275C3.46397 14.0139 3.33341 13.7 3.33341 13.3333C3.33341 12.9666 3.46397 12.6528 3.72508 12.3916C3.98619 12.1305 4.30008 12 4.66675 12C5.03341 12 5.3473 12.1305 5.60841 12.3916C5.86953 12.6528 6.00008 12.9666 6.00008 13.3333C6.00008 13.7 5.86953 14.0139 5.60841 14.275C5.3473 14.5361 5.03341 14.6666 4.66675 14.6666ZM11.3334 14.6666C10.9667 14.6666 10.6529 14.5361 10.3917 14.275C10.1306 14.0139 10.0001 13.7 10.0001 13.3333C10.0001 12.9666 10.1306 12.6528 10.3917 12.3916C10.6529 12.1305 10.9667 12 11.3334 12C11.7001 12 12.014 12.1305 12.2751 12.3916C12.5362 12.6528 12.6667 12.9666 12.6667 13.3333C12.6667 13.7 12.5362 14.0139 12.2751 14.275C12.014 14.5361 11.7001 14.6666 11.3334 14.6666ZM4.10008 3.99998L5.70008 7.33331H10.3667L12.2001 3.99998H4.10008ZM3.46675 2.66665H13.3001C13.5556 2.66665 13.7501 2.78054 13.8834 3.00831C14.0167 3.23609 14.0223 3.46665 13.9001 3.69998L11.5334 7.96665C11.4112 8.18887 11.2473 8.36109 11.0417 8.48331C10.8362 8.60554 10.6112 8.66665 10.3667 8.66665H5.40008L4.66675 9.99998H12.0001C12.189 9.99998 12.3473 10.0639 12.4751 10.1916C12.6029 10.3194 12.6667 10.4778 12.6667 10.6666C12.6667 10.8555 12.6029 11.0139 12.4751 11.1416C12.3473 11.2694 12.189 11.3333 12.0001 11.3333H4.66675C4.16675 11.3333 3.78897 11.1139 3.53341 10.675C3.27786 10.2361 3.26675 9.79998 3.50008 9.36665L4.40008 7.73331L2.00008 2.66665H1.33341C1.14453 2.66665 0.986192 2.60276 0.858415 2.47498C0.730637 2.3472 0.666748 2.18887 0.666748 1.99998C0.666748 1.81109 0.730637 1.65276 0.858415 1.52498C0.986192 1.3972 1.14453 1.33331 1.33341 1.33331H2.41675C2.53897 1.33331 2.65564 1.36665 2.76675 1.43331C2.87786 1.49998 2.96119 1.59442 3.01675 1.71665L3.46675 2.66665Z" fill="#54D465"/>
</g>
</svg>

  );
}

function CakeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="mask0_206_1476" style={{ maskType: "alpha" as const }} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
<rect width="16" height="16" fill="#D9D9D9"/>
</mask>
<g mask="url(#mask0_206_1476)">
<path d="M2.66667 14.6667C2.47778 14.6667 2.31944 14.6028 2.19167 14.475C2.06389 14.3472 2 14.1889 2 14V10.6667C2 10.3 2.13056 9.98612 2.39167 9.72501C2.65278 9.4639 2.96667 9.33334 3.33333 9.33334V6.66668C3.33333 6.30001 3.46389 5.98612 3.725 5.72501C3.98611 5.4639 4.3 5.33334 4.66667 5.33334H7.33333V4.36668C7.13333 4.23334 6.97222 4.07223 6.85 3.88334C6.72778 3.69445 6.66667 3.46668 6.66667 3.20001C6.66667 3.03334 6.7 2.86945 6.76667 2.70834C6.83333 2.54723 6.93333 2.40001 7.06667 2.26667L7.76667 1.56667C7.78889 1.54445 7.86667 1.51112 8 1.46667C8.02222 1.46667 8.1 1.50001 8.23333 1.56667L8.93333 2.26667C9.06667 2.40001 9.16667 2.54723 9.23333 2.70834C9.3 2.86945 9.33333 3.03334 9.33333 3.20001C9.33333 3.46668 9.27222 3.69445 9.15 3.88334C9.02778 4.07223 8.86667 4.23334 8.66667 4.36668V5.33334H11.3333C11.7 5.33334 12.0139 5.4639 12.275 5.72501C12.5361 5.98612 12.6667 6.30001 12.6667 6.66668V9.33334C13.0333 9.33334 13.3472 9.4639 13.6083 9.72501C13.8694 9.98612 14 10.3 14 10.6667V14C14 14.1889 13.9361 14.3472 13.8083 14.475C13.6806 14.6028 13.5222 14.6667 13.3333 14.6667H2.66667ZM4.66667 9.33334H11.3333V6.66668H4.66667V9.33334ZM3.33333 13.3333H12.6667V10.6667H3.33333V13.3333Z" fill="#E1B739"/>
</g>
</svg>

  );
}

function GroupsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg">
    <mask id="mask0_206_1486" style={{ maskType: "alpha" as const }} maskUnits="userSpaceOnUse" x="0" y="0" width="19" height="19">
<rect width="19" height="19" fill="#D9D9D9"/>
</mask>
<g mask="url(#mask0_206_1486)">
<path d="M0.791667 14.25C0.567361 14.25 0.37934 14.1741 0.227604 14.0224C0.0758681 13.8707 0 13.6826 0 13.4583V13.0031C0 12.4358 0.290278 11.974 0.870833 11.6177C1.45139 11.2615 2.21667 11.0833 3.16667 11.0833C3.33819 11.0833 3.50313 11.0866 3.66146 11.0932C3.81979 11.0998 3.97153 11.1163 4.11667 11.1427C3.93194 11.4198 3.7934 11.7101 3.70104 12.0135C3.60868 12.317 3.5625 12.6337 3.5625 12.9635V14.25H0.791667ZM5.54167 14.25C5.31736 14.25 5.12934 14.1741 4.9776 14.0224C4.82587 13.8707 4.75 13.6826 4.75 13.4583V12.9635C4.75 12.5413 4.86545 12.1554 5.09635 11.8057C5.32726 11.4561 5.65382 11.1493 6.07604 10.8854C6.49826 10.6215 7.00295 10.4236 7.5901 10.2917C8.17726 10.1597 8.81389 10.0938 9.5 10.0938C10.1993 10.0938 10.8425 10.1597 11.4297 10.2917C12.0168 10.4236 12.5215 10.6215 12.9438 10.8854C13.366 11.1493 13.6892 11.4561 13.9135 11.8057C14.1378 12.1554 14.25 12.5413 14.25 12.9635V13.4583C14.25 13.6826 14.1741 13.8707 14.0224 14.0224C13.8707 14.1741 13.6826 14.25 13.4583 14.25H5.54167ZM15.4375 14.25V12.9635C15.4375 12.6205 15.3946 12.2972 15.3089 11.9938C15.2231 11.6903 15.0944 11.4066 14.9229 11.1427C15.0681 11.1163 15.2165 11.0998 15.3682 11.0932C15.52 11.0866 15.675 11.0833 15.8333 11.0833C16.7833 11.0833 17.5486 11.2582 18.1292 11.6078C18.7097 11.9575 19 12.4226 19 13.0031V13.4583C19 13.6826 18.9241 13.8707 18.7724 14.0224C18.6207 14.1741 18.4326 14.25 18.2083 14.25H15.4375ZM6.43229 12.6667H12.5875C12.4556 12.4028 12.0894 12.1719 11.4891 11.974C10.8887 11.776 10.2257 11.6771 9.5 11.6771C8.77431 11.6771 8.11129 11.776 7.51094 11.974C6.91059 12.1719 6.55104 12.4028 6.43229 12.6667ZM3.16667 10.2917C2.73125 10.2917 2.35851 10.1366 2.04844 9.82656C1.73837 9.51649 1.58333 9.14375 1.58333 8.70833C1.58333 8.25972 1.73837 7.88368 2.04844 7.58021C2.35851 7.27674 2.73125 7.125 3.16667 7.125C3.61528 7.125 3.99132 7.27674 4.29479 7.58021C4.59826 7.88368 4.75 8.25972 4.75 8.70833C4.75 9.14375 4.59826 9.51649 4.29479 9.82656C3.99132 10.1366 3.61528 10.2917 3.16667 10.2917ZM15.8333 10.2917C15.3979 10.2917 15.0252 10.1366 14.7151 9.82656C14.405 9.51649 14.25 9.14375 14.25 8.70833C14.25 8.25972 14.405 7.88368 14.7151 7.58021C15.0252 7.27674 15.3979 7.125 15.8333 7.125C16.2819 7.125 16.658 7.27674 16.9615 7.58021C17.2649 7.88368 17.4167 8.25972 17.4167 8.70833C17.4167 9.14375 17.2649 9.51649 16.9615 9.82656C16.658 10.1366 16.2819 10.2917 15.8333 10.2917ZM9.5 9.5C8.84028 9.5 8.27951 9.2691 7.81771 8.80729C7.3559 8.34549 7.125 7.78472 7.125 7.125C7.125 6.45208 7.3559 5.88802 7.81771 5.43281C8.27951 4.9776 8.84028 4.75 9.5 4.75C10.1729 4.75 10.737 4.9776 11.1922 5.43281C11.6474 5.88802 11.875 6.45208 11.875 7.125C11.875 7.78472 11.6474 8.34549 11.1922 8.80729C10.737 9.2691 10.1729 9.5 9.5 9.5ZM9.5 7.91667C9.72431 7.91667 9.91233 7.8408 10.0641 7.68906C10.2158 7.53733 10.2917 7.34931 10.2917 7.125C10.2917 6.90069 10.2158 6.71267 10.0641 6.56094C9.91233 6.4092 9.72431 6.33333 9.5 6.33333C9.27569 6.33333 9.08767 6.4092 8.93594 6.56094C8.7842 6.71267 8.70833 6.90069 8.70833 7.125C8.70833 7.34931 8.7842 7.53733 8.93594 7.68906C9.08767 7.8408 9.27569 7.91667 9.5 7.91667Z" fill="#EE83AA"/>
</g>
</svg>

  );
}

function ArticleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="mask0_206_1495" style={{ maskType: "alpha" as const }} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
<rect width="16" height="16" fill="#D9D9D9"/>
</mask>
<g mask="url(#mask0_206_1495)">
<path d="M3.33333 14C2.96667 14 2.65278 13.8694 2.39167 13.6083C2.13056 13.3472 2 13.0333 2 12.6667V3.33333C2 2.96667 2.13056 2.65278 2.39167 2.39167C2.65278 2.13056 2.96667 2 3.33333 2H12.6667C13.0333 2 13.3472 2.13056 13.6083 2.39167C13.8694 2.65278 14 2.96667 14 3.33333V12.6667C14 13.0333 13.8694 13.3472 13.6083 13.6083C13.3472 13.8694 13.0333 14 12.6667 14H3.33333ZM3.33333 12.6667H12.6667V3.33333H3.33333V12.6667ZM5.33333 11.3333H8.66667C8.85556 11.3333 9.01389 11.2694 9.14167 11.1417C9.26944 11.0139 9.33333 10.8556 9.33333 10.6667C9.33333 10.4778 9.26944 10.3194 9.14167 10.1917C9.01389 10.0639 8.85556 10 8.66667 10H5.33333C5.14444 10 4.98611 10.0639 4.85833 10.1917C4.73056 10.3194 4.66667 10.4778 4.66667 10.6667C4.66667 10.8556 4.73056 11.0139 4.85833 11.1417C4.98611 11.2694 5.14444 11.3333 5.33333 11.3333ZM5.33333 8.66667H10.6667C10.8556 8.66667 11.0139 8.60278 11.1417 8.475C11.2694 8.34722 11.3333 8.18889 11.3333 8C11.3333 7.81111 11.2694 7.65278 11.1417 7.525C11.0139 7.39722 10.8556 7.33333 10.6667 7.33333H5.33333C5.14444 7.33333 4.98611 7.39722 4.85833 7.525C4.73056 7.65278 4.66667 7.81111 4.66667 8C4.66667 8.18889 4.73056 8.34722 4.85833 8.475C4.98611 8.60278 5.14444 8.66667 5.33333 8.66667ZM5.33333 6H10.6667C10.8556 6 11.0139 5.93611 11.1417 5.80833C11.2694 5.68056 11.3333 5.52222 11.3333 5.33333C11.3333 5.14444 11.2694 4.98611 11.1417 4.85833C11.0139 4.73056 10.8556 4.66667 10.6667 4.66667H5.33333C5.14444 4.66667 4.98611 4.73056 4.85833 4.85833C4.73056 4.98611 4.66667 5.14444 4.66667 5.33333C4.66667 5.52222 4.73056 5.68056 4.85833 5.80833C4.98611 5.93611 5.14444 6 5.33333 6Z" fill="#4867CC"/>
</g>
</svg>

  );
}

function MoreVertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 13.3333C9.54167 13.3333 9.14931 13.1701 8.82292 12.8437C8.49653 12.5174 8.33333 12.125 8.33333 11.6667C8.33333 11.2083 8.49653 10.816 8.82292 10.4896C9.14931 10.1632 9.54167 10 10 10C10.4583 10 10.8507 10.1632 11.1771 10.4896C11.5035 10.816 11.6667 11.2083 11.6667 11.6667C11.6667 12.125 11.5035 12.5174 11.1771 12.8437C10.8507 13.1701 10.4583 13.3333 10 13.3333ZM10 8.33333C9.54167 8.33333 9.14931 8.17014 8.82292 7.84375C8.49653 7.51736 8.33333 7.125 8.33333 6.66667C8.33333 6.20833 8.49653 5.81597 8.82292 5.48958C9.14931 5.16319 9.54167 5 10 5C10.4583 5 10.8507 5.16319 11.1771 5.48958C11.5035 5.81597 11.6667 6.20833 11.6667 6.66667C11.6667 7.125 11.5035 7.51736 11.1771 7.84375C10.8507 8.17014 10.4583 8.33333 10 8.33333ZM10 3.33333C9.54167 3.33333 9.14931 3.17014 8.82292 2.84375C8.49653 2.51736 8.33333 2.125 8.33333 1.66667C8.33333 1.20833 8.49653 0.815972 8.82292 0.489583C9.14931 0.163194 9.54167 0 10 0C10.4583 0 10.8507 0.163194 11.1771 0.489583C11.5035 0.815972 11.6667 1.20833 11.6667 1.66667C11.6667 2.125 11.5035 2.51736 11.1771 2.84375C10.8507 3.17014 10.4583 3.33333 10 3.33333Z" fill="#9B9BA7" transform="translate(0, 3)" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 11.2729C6.86389 11.2729 6.72778 11.2486 6.59167 11.2C6.45556 11.1514 6.33403 11.0785 6.22708 10.9812C5.59514 10.3979 5.03611 9.82917 4.55 9.275C4.06389 8.72083 3.65799 8.18368 3.33229 7.66354C3.0066 7.1434 2.75868 6.64271 2.58854 6.16146C2.41840 5.68021 2.33333 5.22083 2.33333 4.78333C2.33333 3.325 2.80243 2.16319 3.74062 1.29792C4.67882 0.432639 5.76528 0 7 0C8.23472 0 9.32118 0.432639 10.2594 1.29792C11.1976 2.16319 11.6667 3.325 11.6667 4.78333C11.6667 5.22083 11.5816 5.68021 11.4115 6.16146C11.2413 6.64271 10.9934 7.1434 10.6677 7.66354C10.342 8.18368 9.93611 8.72083 9.45 9.275C8.96389 9.82917 8.40486 10.3979 7.77292 10.9812C7.66597 11.0785 7.54444 11.1514 7.40833 11.2C7.27222 11.2486 7.13611 11.2729 7 11.2729ZM7 5.83333C7.32083 5.83333 7.59549 5.7191 7.82396 5.49062C8.05243 5.26215 8.16667 4.9875 8.16667 4.66667C8.16667 4.34583 8.05243 4.07118 7.82396 3.84271C7.59549 3.61424 7.32083 3.5 7 3.5C6.67917 3.5 6.40451 3.61424 6.17604 3.84271C5.94757 4.07118 5.83333 4.34583 5.83333 4.66667C5.83333 4.9875 5.94757 5.26215 6.17604 5.49062C6.40451 5.7191 6.67917 5.83333 7 5.83333Z" fill="#3C84F6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
      <path d="M7.79167 7.20729L9.38542 8.80104C9.51528 8.9309 9.58021 9.09323 9.58021 9.28802C9.58021 9.48281 9.51528 9.65104 9.38542 9.79271C9.24375 9.93438 9.07552 10.0052 8.88073 10.0052C8.68594 10.0052 8.51771 9.93438 8.37604 9.79271L6.5875 8.00417C6.51667 7.93333 6.46354 7.85365 6.42813 7.7651C6.39271 7.67656 6.375 7.58507 6.375 7.49063V4.95833C6.375 4.75764 6.44288 4.58941 6.57865 4.45365C6.71441 4.31788 6.88264 4.25 7.08333 4.25C7.28403 4.25 7.45226 4.31788 7.58802 4.45365C7.72379 4.58941 7.79167 4.75764 7.79167 4.95833V7.20729Z" fill="#6D6DE2" />
    </svg>
  );
}

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

  const userName = user?.firstName || user?.fullName?.split(' ')[0] || "there";
  
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
      <div className="mx-auto max-w-md">
        {/* Header Section */}
        <div className="border-t-[0.33px] border-[#E6E8EC] bg-white shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)]">
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
                <span className="text-[14px] font-medium text-[#344054]">Link Whatsapp</span>
              </button>
              <button
                onClick={() => router.push("/calendars")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-[10px] rounded-xl border border-[#D0D5DD] bg-white"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M1.66667 16.6667C1.20833 16.6667 0.815972 16.5035 0.489583 16.1771C0.163194 15.8507 0 15.4583 0 15V3.33333C0 2.875 0.163194 2.48264 0.489583 2.15625C0.815972 1.82986 1.20833 1.66667 1.66667 1.66667H2.5V0.833333C2.5 0.597222 2.57986 0.399306 2.73958 0.239583C2.89931 0.0798611 3.09722 0 3.33333 0C3.56944 0 3.76736 0.0798611 3.92708 0.239583C4.08681 0.399306 4.16667 0.597222 4.16667 0.833333V1.66667H10.8333V0.833333C10.8333 0.597222 10.9132 0.399306 11.0729 0.239583C11.2326 0.0798611 11.4306 0 11.6667 0C11.9028 0 12.1007 0.0798611 12.2604 0.239583C12.4201 0.399306 12.5 0.597222 12.5 0.833333V1.66667H13.3333C13.7917 1.66667 14.184 1.82986 14.5104 2.15625C14.8368 2.48264 15 2.875 15 3.33333V15C15 15.4583 14.8368 15.8507 14.5104 16.1771C14.184 16.5035 13.7917 16.6667 13.3333 16.6667H1.66667ZM1.66667 15H13.3333V6.66667H1.66667V15Z" fill="#446DE1" />
                </svg>
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
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M7.66667 10.6667C7.2 10.6667 6.80556 10.5056 6.48333 10.1833C6.16111 9.86111 6 9.46667 6 9C6 8.53333 6.16111 8.13889 6.48333 7.81667C6.80556 7.49444 7.2 7.33333 7.66667 7.33333C8.13333 7.33333 8.52778 7.49444 8.85 7.81667C9.17222 8.13889 9.33333 8.53333 9.33333 9C9.33333 9.46667 9.17222 9.86111 8.85 10.1833C8.52778 10.5056 8.13333 10.6667 7.66667 10.6667ZM1.33333 13.3333C0.966667 13.3333 0.652778 13.2028 0.391667 12.9417C0.130556 12.6806 0 12.3667 0 12V2.66667C0 2.3 0.130556 1.98611 0.391667 1.725C0.652778 1.46389 0.966667 1.33333 1.33333 1.33333H2V0.666667C2 0.477778 2.06389 0.319444 2.19167 0.191667C2.31944 0.0638889 2.47778 0 2.66667 0C2.85556 0 3.01389 0.0638889 3.14167 0.191667C3.26944 0.319444 3.33333 0.477778 3.33333 0.666667V1.33333H8.66667V0.666667C8.66667 0.477778 8.73056 0.319444 8.85833 0.191667C8.98611 0.0638889 9.14444 0 9.33333 0C9.52222 0 9.68056 0.0638889 9.80833 0.191667C9.93611 0.319444 10 0.477778 10 0.666667V1.33333H10.6667C11.0333 1.33333 11.3472 1.46389 11.6083 1.725C11.8694 1.98611 12 2.3 12 2.66667V12C12 12.3667 11.8694 12.6806 11.6083 12.9417C11.3472 13.2028 11.0333 13.3333 10.6667 13.3333H1.33333ZM1.33333 12H10.6667V5.33333H1.33333V12Z" fill="#EEB183" />
                  </svg>
                }
                onClick={() => router.push("/calendars")}
              />
              <StatCard
                number={totalActiveReminders.toString()}
                label="Todays Reminders"
                iconBg="#F2FBFF"
                borderColor="#ECF7FC"
                blurColor="#C5EEFF"
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M0.666667 11.3333C0.477778 11.3333 0.319444 11.2694 0.191667 11.1417C0.0638889 11.0139 0 10.8556 0 10.6667C0 10.4778 0.0638889 10.3194 0.191667 10.1917C0.319444 10.0639 0.477778 10 0.666667 10H1.33333V5.33333C1.33333 4.41111 1.61111 3.59167 2.16667 2.875C2.72222 2.15833 3.44444 1.68889 4.33333 1.46667V1C4.33333 0.722222 4.43056 0.486111 4.625 0.291667C4.81944 0.0972222 5.05556 0 5.33333 0C5.61111 0 5.84722 0.0972222 6.04167 0.291667C6.23611 0.486111 6.33333 0.722222 6.33333 1V1.46667C7.22222 1.68889 7.94444 2.15833 8.5 2.875C9.05556 3.59167 9.33333 4.41111 9.33333 5.33333V10H10C10.1889 10 10.3472 10.0639 10.475 10.1917C10.6028 10.3194 10.6667 10.4778 10.6667 10.6667C10.6667 10.8556 10.6028 11.0139 10.475 11.1417C10.3472 11.2694 10.1889 11.3333 10 11.3333H0.666667ZM5.33333 13.3333C4.96667 13.3333 4.65278 13.2028 4.39167 12.9417C4.13056 12.6806 4 12.3667 4 12H6.66667C6.66667 12.3667 6.53611 12.6806 6.275 12.9417C6.01389 13.2028 5.7 13.3333 5.33333 13.3333Z" fill="#48BBED" />
                  </svg>
                }
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
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 13.3333C3.63333 13.3333 3.31944 13.2028 3.05833 12.9417C2.79722 12.6806 2.66667 12.3667 2.66667 12C2.66667 11.6333 2.79722 11.3194 3.05833 11.0583C3.31944 10.7972 3.63333 10.6667 4 10.6667C4.36667 10.6667 4.68056 10.7972 4.94167 11.0583C5.20278 11.3194 5.33333 11.6333 5.33333 12C5.33333 12.3667 5.20278 12.6806 4.94167 12.9417C4.68056 13.2028 4.36667 13.3333 4 13.3333ZM10.6667 13.3333C10.3 13.3333 9.98611 13.2028 9.725 12.9417C9.46389 12.6806 9.33333 12.3667 9.33333 12C9.33333 11.6333 9.46389 11.3194 9.725 11.0583C9.98611 10.7972 10.3 10.6667 10.6667 10.6667C11.0333 10.6667 11.3472 10.7972 11.6083 11.0583C11.8694 11.3194 12 11.6333 12 12C12 12.3667 11.8694 12.6806 11.6083 12.9417C11.3472 13.2028 11.0333 13.3333 10.6667 13.3333Z" fill="#54D465" />
                  </svg>
                }
                onClick={() => router.push("/shopping-lists")}
              />
              <StatCard
                number={birthdaysToday.toString()}
                label="Birthdays Today"
                iconBg="#FFFCF2"
                borderColor="#FCF8EC"
                blurColor="#FFF0C5"
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M0.666667 13.2C0.477778 13.2 0.319444 13.1361 0.191667 13.0083C0.0638889 12.8806 0 12.7222 0 12.5333V9.2C0 8.83333 0.130556 8.51945 0.391667 8.25833C0.652778 7.99722 0.966667 7.86667 1.33333 7.86667V5.2C1.33333 4.83333 1.46389 4.51944 1.725 4.25833C1.98611 3.99722 2.3 3.86667 2.66667 3.86667H5.33333V2.9C5.13333 2.76667 4.97222 2.60556 4.85 2.41667C4.72778 2.22778 4.66667 2 4.66667 1.73333C4.66667 1.56667 4.7 1.40278 4.76667 1.24167C4.83333 1.08056 4.93333 0.933333 5.06667 0.8L5.76667 0.1C5.78889 0.0777778 5.86667 0.0444445 6 0C6.02222 0 6.1 0.0333333 6.23333 0.1L6.93333 0.8C7.06667 0.933333 7.16667 1.08056 7.23333 1.24167C7.3 1.40278 7.33333 1.56667 7.33333 1.73333C7.33333 2 7.27222 2.22778 7.15 2.41667C7.02778 2.60556 6.86667 2.76667 6.66667 2.9V3.86667H9.33333C9.7 3.86667 10.0139 3.99722 10.275 4.25833C10.5361 4.51944 10.6667 4.83333 10.6667 5.2V7.86667C11.0333 7.86667 11.3472 7.99722 11.6083 8.25833C11.8694 8.51945 12 8.83333 12 9.2V12.5333C12 12.7222 11.9361 12.8806 11.8083 13.0083C11.6806 13.1361 11.5222 13.2 11.3333 13.2H0.666667Z" fill="#E1B739" />
                  </svg>
                }
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
                icon={
                  <svg width="19" height="19" viewBox="0 0 19 19" fill="none">
                    <path d="M0.791667 9.5C0.567361 9.5 0.37934 9.42413 0.227604 9.2724C0.0758681 9.12066 0 8.93264 0 8.70833V8.25313C0 7.68576 0.290278 7.22396 0.870833 6.86771C1.45139 6.51146 2.21667 6.33333 3.16667 6.33333C3.33819 6.33333 3.50313 6.33663 3.66146 6.34323C3.81979 6.34983 3.97153 6.36632 4.11667 6.39271C3.93194 6.66979 3.7934 6.96007 3.70104 7.26354C3.60868 7.56701 3.5625 7.88368 3.5625 8.21354V9.5H0.791667ZM5.54167 9.5C5.31736 9.5 5.12934 9.42413 4.9776 9.2724C4.82587 9.12066 4.75 8.93264 4.75 8.70833V8.21354C4.75 7.79132 4.86545 7.40538 5.09635 7.05573C5.32726 6.70608 5.65382 6.39931 6.07604 6.13542C6.49826 5.87153 7.00295 5.67361 7.5901 5.54167C8.17726 5.40972 8.81389 5.34375 9.5 5.34375C10.1993 5.34375 10.8425 5.40972 11.4297 5.54167C12.0168 5.67361 12.5215 5.87153 12.9438 6.13542C13.366 6.39931 13.6892 6.70608 13.9135 7.05573C14.1378 7.40538 14.25 7.79132 14.25 8.21354V8.70833C14.25 8.93264 14.1741 9.12066 14.0224 9.2724C13.8707 9.42413 13.6826 9.5 13.4583 9.5H5.54167Z" fill="#EE83AA" />
                  </svg>
                }
                onClick={() => router.push("/friends")}
              />
              <StatCard
                number={allCombinedNotes.length.toString()}
                label="Notes Created"
                iconBg="#F2F5FF"
                borderColor="#F0F4FF"
                blurColor="#C5D2FF"
                icon={
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1.33333 12C0.966667 12 0.652778 11.8694 0.391667 11.6083C0.130556 11.3472 0 11.0333 0 10.6667V1.33333C0 0.966667 0.130556 0.652778 0.391667 0.391667C0.652778 0.130556 0.966667 0 1.33333 0H10.6667C11.0333 0 11.3472 0.130556 11.6083 0.391667C11.8694 0.652778 12 0.966667 12 1.33333V10.6667C12 11.0333 11.8694 11.3472 11.6083 11.6083C11.3472 11.8694 11.0333 12 10.6667 12H1.33333ZM1.33333 10.6667H10.6667V1.33333H1.33333V10.6667Z" fill="#4867CC" />
                  </svg>
                }
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
                  {filteredShoppingListItems.map((item: any, index: number) => {
                    const creatorName = item.user?.firstName || item.user?.name || "You";
                    const isCurrentUser = item.userId === userData?.id;
                    const formattedDate = item.createdAt 
                      ? format(new Date(item.createdAt), 'd MMMM')
                      : '';
                    const badgeColor = isCurrentUser ? "gray" : "pink";
                    const badgeStyles = badgeColor === "pink"
                      ? "bg-[#FEF2FD] text-[#E751DD] rounded-lg"
                      : "bg-white border border-[#F7F7F7] text-[#9999A5] shadow-[0_0_12px_0_rgba(0,0,0,0.04)] rounded-[4px]";
                    
                    return (
                      <div
                        key={item.id}
                        className={`flex justify-between items-center px-4 py-5 ${
                          index < filteredShoppingListItems.length - 1 ? 'border-b border-[#F1F1F1]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M6 2.75H18C19.7949 2.75 21.25 4.20507 21.25 6V18C21.25 19.7949 19.7949 21.25 18 21.25H6C4.20507 21.25 2.75 19.7949 2.75 18V6C2.75 4.20507 4.20507 2.75 6 2.75Z" stroke="#C6C6CD" strokeWidth="1.5" />
                          </svg>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <span className="text-[14px] font-semibold leading-[130%] text-[#1D2228]">
                                {item.name}
                              </span>
                              <div className={`flex items-center gap-1 px-2 py-1 ${badgeStyles}`}>
                                <span className="text-[10px] font-medium">{creatorName}</span>
                                <div className="w-1 h-1 rounded-full" style={{ background: badgeColor === "pink" ? "#E751DD" : "#D9D9D9" }} />
                                <span className="text-[10px] font-medium">{formattedDate}</span>
                              </div>
                            </div>
                            {item.description && (
                              <div className="text-[12px] font-medium leading-[130%] text-[#9999A5]">
                                {item.description}
                              </div>
                            )}
                          </div>
                        </div>
                        <button className="text-[#9B9BA7]">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 13.3333C9.54167 13.3333 9.14931 13.1701 8.82292 12.8437C8.49653 12.5174 8.33333 12.125 8.33333 11.6667C8.33333 11.2083 8.49653 10.816 8.82292 10.4896C9.14931 10.1632 9.54167 10 10 10C10.4583 10 10.8507 10.1632 11.1771 10.4896C11.5035 10.816 11.6667 11.2083 11.6667 11.6667C11.6667 12.125 11.5035 12.5174 11.1771 12.8437C10.8507 13.1701 10.4583 13.3333 10 13.3333ZM10 8.33333C9.54167 8.33333 9.14931 8.17014 8.82292 7.84375C8.49653 7.51736 8.33333 7.125 8.33333 6.66667C8.33333 6.20833 8.49653 5.81597 8.82292 5.48958C9.14931 5.16319 9.54167 5 10 5C10.4583 5 10.8507 5.16319 11.1771 5.48958C11.5035 5.81597 11.6667 6.20833 11.6667 6.66667C11.6667 7.125 11.5035 7.51736 11.1771 7.84375C10.8507 8.17014 10.4583 8.33333 10 8.33333ZM10 3.33333C9.54167 3.33333 9.14931 3.17014 8.82292 2.84375C8.49653 2.51736 8.33333 2.125 8.33333 1.66667C8.33333 1.20833 8.49653 0.815972 8.82292 0.489583C9.14931 0.163194 9.54167 0 10 0C10.4583 0 10.8507 0.163194 11.1771 0.489583C11.5035 0.815972 11.6667 1.20833 11.6667 1.66667C11.6667 2.125 11.5035 2.51736 11.1771 2.84375C10.8507 3.17014 10.4583 3.33333 10 3.33333Z" fill="currentColor" transform="translate(0, 3)" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

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

// StatCard Component
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

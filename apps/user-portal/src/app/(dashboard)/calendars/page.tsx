"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueries } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { useSearchParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { Calendar as CalendarComponent } from "@imaginecalendar/ui/calendar";
import { Input } from "@imaginecalendar/ui/input";
import { Textarea } from "@imaginecalendar/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import {
  Calendar,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Home,
  Check,
  Circle,
  CalendarDays,
  CalendarRange,
  CalendarCheck,
  Settings,
  Link2,
  Save,
} from "lucide-react";

// Google Icon Component
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

// Microsoft Icon Component
const MicrosoftIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 23 23"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M0 0h11.5v11.5H0V0z" fill="#F25022" />
    <path d="M11.5 0H23v11.5H11.5V0z" fill="#7FBA00" />
    <path d="M0 11.5h11.5V23H0V11.5z" fill="#00A4EF" />
    <path d="M11.5 11.5H23V23H11.5V11.5z" fill="#FFB900" />
  </svg>
);

// Time Picker Component
const TimePicker = ({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) => {
  // Convert 24-hour format (HH:mm) to 12-hour format
  const parseTime = (time24: string) => {
    if (!time24) return { hour: "12", minute: "00", period: "AM" };
    
    const [hours, minutes] = time24.split(":").map(Number);
    if (isNaN(hours!) || isNaN(minutes!)) {
      return { hour: "12", minute: "00", period: "AM" };
    }
    
    const period = hours! >= 12 ? "PM" : "AM";
    const hour12 = hours! === 0 ? 12 : hours! > 12 ? hours! - 12 : hours!;
    
    return {
      hour: hour12.toString(),
      minute: minutes!.toString().padStart(2, "0"),
      period,
    };
  };

  // Convert 12-hour format to 24-hour format (HH:mm)
  const formatTime = (hour: string, minute: string, period: string) => {
    let hour24 = parseInt(hour, 10);
    
    if (period === "PM" && hour24 !== 12) {
      hour24 += 12;
    } else if (period === "AM" && hour24 === 12) {
      hour24 = 0;
    }
    
    return `${hour24.toString().padStart(2, "0")}:${minute}`;
  };

  const { hour, minute, period } = parseTime(value);
  const [selectedHour, setSelectedHour] = useState(hour);
  const [selectedMinute, setSelectedMinute] = useState(minute);
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  useEffect(() => {
    const { hour: h, minute: m, period: p } = parseTime(value);
    setSelectedHour(h);
    setSelectedMinute(m);
    setSelectedPeriod(p);
  }, [value]);

  const handleHourChange = (newHour: string) => {
    setSelectedHour(newHour);
    onChange(formatTime(newHour, selectedMinute, selectedPeriod));
  };

  const handleMinuteChange = (newMinute: string) => {
    setSelectedMinute(newMinute);
    onChange(formatTime(selectedHour, newMinute, selectedPeriod));
  };

  const handlePeriodChange = (newPeriod: string) => {
    setSelectedPeriod(newPeriod);
    onChange(formatTime(selectedHour, selectedMinute, newPeriod));
  };

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
      <Select value={selectedHour} onValueChange={handleHourChange}>
        <SelectTrigger id={id} className="w-[70px] sm:w-[85px] text-sm">
          <SelectValue placeholder="Hour" />
        </SelectTrigger>
        <SelectContent>
          {hours.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <span className="text-gray-500 font-semibold text-base sm:text-lg">:</span>
      
      <Select value={selectedMinute} onValueChange={handleMinuteChange}>
        <SelectTrigger className="w-[70px] sm:w-[85px] text-sm">
          <SelectValue placeholder="Minute" />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
        <SelectTrigger className="w-[70px] sm:w-[85px] text-sm">
          <SelectValue placeholder="AM/PM" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks, startOfYear, endOfYear, addYears, subYears, eachWeekOfInterval, isSameWeek, getWeek, startOfDay, endOfDay } from "date-fns";
import Link from "next/link";
import { CalendarSelectionDialog } from "@/components/calendar-selection-dialog";
import { usePlanLimits } from "@/hooks/use-plan-limits";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { cn } from "@imaginecalendar/ui/cn";
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

export default function CalendarsPage() {
  const trpc = useTRPC();
  const { toast } = useToast();
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"week" | "month" | "year">("month");
  const [calendarSelectionDialog, setCalendarSelectionDialog] = useState<{
    open: boolean;
    connectionId: string | null;
    currentCalendarId: string | null;
  }>({
    open: false,
    connectionId: null,
    currentCalendarId: null,
  });
  const [disconnectDialog, setDisconnectDialog] = useState<{
    open: boolean;
    calendarId: string | null;
    calendarName: string | null;
  }>({
    open: false,
    calendarId: null,
    calendarName: null,
  });
  const [createEventDialogOpen, setCreateEventDialogOpen] = useState(false);
  const [eventDetailsModal, setEventDetailsModal] = useState<{
    open: boolean;
    event: any | null;
    isEditing: boolean;
  }>({
    open: false,
    event: null,
    isEditing: false,
  });

  const [dayDetailsModal, setDayDetailsModal] = useState<{
    open: boolean;
    date: Date | null;
    events: any[];
  }>({
    open: false,
    date: null,
    events: [],
  });

  const [selectedDayDetails, setSelectedDayDetails] = useState<{
    date: Date | null;
    events: any[];
  }>({
    date: new Date(), // Default to today
    events: [],
  });

  // Edit event form state
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [editEventTime, setEditEventTime] = useState("");
  const [editEventDescription, setEditEventDescription] = useState("");
  const [editEventLocation, setEditEventLocation] = useState("");

  // Fetch user's calendars
  const { data: calendars = [], isLoading, refetch } = useQuery(
    trpc.calendar.list.queryOptions()
  );

  // Fetch user preferences for timezone
  const { data: userPreferences } = useQuery(
    trpc.preferences.get.queryOptions()
  );
  
  // Get plan limits
  const { limits, canAddCalendar, getCalendarsRemaining, tier } = usePlanLimits();

  // Fetch events from all active calendars
  const activeCalendars = useMemo(() => calendars.filter((cal: any) => cal.isActive), [calendars]);
  
  const timeRange = useMemo(() => {
    if (viewMode === "year") {
      return {
        timeMin: startOfYear(currentMonth).toISOString(),
        timeMax: endOfYear(currentMonth).toISOString(),
      };
    } else if (viewMode === "week") {
      return {
        timeMin: startOfWeek(currentMonth, { weekStartsOn: 0 }).toISOString(),
        timeMax: endOfWeek(currentMonth, { weekStartsOn: 0 }).toISOString(),
      };
    } else {
      return {
        timeMin: startOfMonth(currentMonth).toISOString(),
        timeMax: endOfMonth(currentMonth).toISOString(),
      };
    }
  }, [viewMode, currentMonth]);

  // Fetch events for each active calendar using useQueries
  const eventQueries = useQueries({
    queries: activeCalendars.map((cal: any) => ({
      ...trpc.calendar.getEvents.queryOptions({
        calendarId: cal.id,
        timeMin: timeRange.timeMin,
        timeMax: timeRange.timeMax,
        maxResults: 100,
      }),
      enabled: cal.isActive && !!cal.id,
    })),
  });

  // Initialize selected day details with today's events
  useEffect(() => {
    if (allEvents.length > 0) {
      const today = new Date();
      const todayEvents = getEventsForDate(today);
      setSelectedDayDetails({
        date: today,
        events: todayEvents,
      });
    }
  }, [allEvents]);

  const allEvents = useMemo(() => {
    return eventQueries
      .flatMap((query, idx) => {
        const calendarId = activeCalendars[idx]?.id;
        return (query.data || []).map((event: any) => ({ ...event, calendarId }));
      });
  }, [eventQueries, activeCalendars]);
  const canAddMore = canAddCalendar(calendars.length);
  const remainingCalendars = getCalendarsRemaining(calendars.length);

  // Handle OAuth callback from cookies
  useEffect(() => {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) {
        const cookieValue = parts.pop()?.split(';').shift();
        return cookieValue ? decodeURIComponent(cookieValue) : null;
      }
      return null;
    };

    const deleteCookie = (name: string) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    };

    const oauthCallbackCookie = getCookie('oauth_callback');
    const oauthErrorCookie = getCookie('oauth_error');

    if (oauthErrorCookie) {
      try {
        const errorData = JSON.parse(oauthErrorCookie);
        toast({
          title: "Authorization failed",
          description: errorData.error_description || errorData.error || "Failed to authorize calendar",
          variant: "error",
          duration: 5000,
        });
        deleteCookie('oauth_error');
      } catch (e) {
        deleteCookie('oauth_error');
      }
      return;
    }

    if (oauthCallbackCookie && user) {
      try {
        const callbackData = JSON.parse(oauthCallbackCookie);
        const redirectUri = `${window.location.origin}/api/calendars/callback`;
        connectCalendarMutation.mutate({
          provider: callbackData.provider,
          code: callbackData.code,
          redirectUri,
        });
        deleteCookie('oauth_callback');
      } catch (e) {
        deleteCookie('oauth_callback');
      }
    }

    const code = searchParams.get("code");
    const provider = searchParams.get("provider") as "google" | "microsoft";
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      toast({
        title: "Authorization failed",
        description: errorDescription || `Failed to authorize ${provider} calendar`,
        variant: "error",
        duration: 5000,
      });
      router.replace("/calendars");
      return;
    }

    if (code && provider && user) {
      const redirectUri = `${window.location.origin}/api/calendars/callback`;
      connectCalendarMutation.mutate({
        provider,
        code,
        redirectUri,
      });
      router.replace("/calendars");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.id]);

  // Connect calendar mutation
  const connectCalendarMutation = useMutation(
    trpc.calendar.connect.mutationOptions({
      onSuccess: async () => {
        toast({
          title: "Calendar connected",
          description: "Your calendar has been connected successfully.",
          variant: "success",
        });
        setConnectingProvider(null);
        const result = await refetch();
        if (result.data && result.data.length > 0) {
          const newCalendar = result.data[result.data.length - 1];
          if (newCalendar) {
            syncCalendarMutation.mutate({ id: newCalendar.id });
          }
        }
      },
      onError: (error) => {
        toast({
          title: "Connection failed",
          description: error.message || "Failed to connect calendar. Please try again.",
          variant: "error",
          duration: 3500,
        });
        setConnectingProvider(null);
      },
    })
  );

  // Disconnect calendar mutation
  const disconnectCalendarMutation = useMutation(
    trpc.calendar.disconnect.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Calendar disconnected",
          description: "Your calendar has been disconnected.",
          variant: "success",
        });
        refetch();
      },
      onError: (error) => {
        toast({
          title: "Disconnect failed",
          description: error.message || "Failed to disconnect calendar. Please try again.",
          variant: "error",
          duration: 3500,
        });
      },
    })
  );

  // Sync calendar mutation
  const syncCalendarMutation = useMutation(
    trpc.calendar.sync.mutationOptions({
      onSuccess: (data) => {
        toast({
          title: "Sync successful",
          description: data.message,
          variant: "success",
        });
        refetch();
      },
      onError: (error) => {
        toast({
          title: "Sync failed",
          description: error.message || "Calendar sync failed.",
          variant: "error",
          duration: 3500,
        });
        refetch();
      },
    })
  );

  // Update calendar mutation (for toggling active status)
  const updateCalendarMutation = useMutation(
    trpc.calendar.update.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Calendar updated",
          description: "Calendar settings have been updated.",
          variant: "success",
        });
        refetch();
      },
      onError: (error) => {
        toast({
          title: "Update failed",
          description: error.message || "Failed to update calendar.",
          variant: "error",
          duration: 3500,
        });
      },
    })
  );

  // Create event mutation
  const createEventMutation = useMutation(
    trpc.calendar.createEvent.mutationOptions({
      onSuccess: (data) => {
        toast({
          title: "Event created",
          description: data.message || "Event has been created successfully.",
          variant: "success",
        });
        // Reset form
        setEventTitle("");
        setEventDate("");
        setEventTime("");
        setSelectedCalendarId("");
        // Close modal
        setCreateEventDialogOpen(false);
        // Refresh calendars and events
        refetch();
        eventQueries.forEach((query) => query.refetch());
      },
      onError: (error) => {
        toast({
          title: "Event creation failed",
          description: error.message || "Failed to create event. Please try again.",
          variant: "error",
          duration: 3500,
        });
      },
    })
  );

  // Update event mutation
  const updateEventMutation = useMutation(
    trpc.calendar.updateEvent.mutationOptions({
      onSuccess: (data) => {
        toast({
          title: "Event updated",
          description: data.message || "Event has been updated successfully.",
          variant: "success",
        });
        // Exit edit mode
        setEventDetailsModal(prev => ({ ...prev, isEditing: false }));
        // Refresh events
        eventQueries.forEach((query) => query.refetch());
      },
      onError: (error) => {
        toast({
          title: "Event update failed",
          description: error.message || "Failed to update event. Please try again.",
          variant: "error",
          duration: 3500,
        });
      },
    })
  );

  const handleConnectCalendar = async (provider: "google" | "microsoft") => {
    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please sign in to connect your calendar",
        variant: "error",
      });
      return;
    }

    setConnectingProvider(provider);

    try {
      const state = `${provider}:${user.id}`;
      const response = await fetch(`/api/calendars/auth?provider=${provider}&state=${encodeURIComponent(state)}`);
      
      if (!response.ok) {
        throw new Error("Failed to get authorization URL");
      }

      const { authUrl } = await response.json();
      window.location.href = authUrl;
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to start calendar connection",
        variant: "error",
        duration: 3500,
      });
      setConnectingProvider(null);
    }
  };

  const handleDisconnectCalendar = (calendarId: string, calendarName?: string) => {
    setDisconnectDialog({
      open: true,
      calendarId,
      calendarName: calendarName || null,
    });
  };

  const confirmDisconnect = () => {
    if (disconnectDialog.calendarId) {
      disconnectCalendarMutation.mutate({ id: disconnectDialog.calendarId });
      setDisconnectDialog({ open: false, calendarId: null, calendarName: null });
    }
  };

  const handleChangeCalendar = (connectionId: string, currentCalendarId: string | null) => {
    setCalendarSelectionDialog({
      open: true,
      connectionId,
      currentCalendarId,
    });
  };

  const handleCalendarSelectionClose = () => {
    setCalendarSelectionDialog({
      open: false,
      connectionId: null,
      currentCalendarId: null,
    });
    refetch();
  };

  const handleToggleCalendarActive = (calendarId: string, currentStatus: boolean) => {
    updateCalendarMutation.mutate({
      id: calendarId,
      syncEnabled: !currentStatus,
    });
  };

  const handleCreateEvent = () => {
    if (!eventTitle.trim()) {
      toast({
        title: "Event title required",
        description: "Please enter an event title.",
        variant: "error",
      });
      return;
    }

    if (!eventDate) {
      toast({
        title: "Event date required",
        description: "Please select a date for the event.",
        variant: "error",
      });
      return;
    }

    if (!selectedCalendarId) {
      toast({
        title: "Calendar required",
        description: "Please select a calendar for the event.",
        variant: "error",
      });
      return;
    }

    // Parse date and time
    const dateParts = eventDate.split('-').map(Number);
    if (dateParts.length !== 3 || dateParts.some(isNaN)) {
      toast({
        title: "Invalid date",
        description: "Please select a valid date.",
        variant: "error",
      });
      return;
    }
    const year = dateParts[0]!;
    const month = dateParts[1]!;
    const day = dateParts[2]!;
    const startDate = new Date(year, month - 1, day);

    // If time is provided, set it
    if (eventTime) {
      const timeParts = eventTime.split(':').map(Number);
      if (timeParts.length >= 2 && !timeParts.some(isNaN) && timeParts[0] !== undefined && timeParts[1] !== undefined) {
        startDate.setHours(timeParts[0], timeParts[1], 0, 0);
      }
    } else {
      // Default to 9 AM if no time provided
      startDate.setHours(9, 0, 0, 0);
    }

    // End date is 1 hour after start (or end of day if all day)
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1);

    createEventMutation.mutate({
      calendarId: selectedCalendarId,
      title: eventTitle.trim(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      allDay: !eventTime, // If no time, treat as all-day
    });
  };

  const handleEventClick = (event: any) => {
    // Populate edit form fields with current event data
    setEditEventTitle(event.title || "");
    setEditEventDescription(event.description || "");
    setEditEventLocation(event.location || "");

    // Format date and time for form inputs
    const eventDate = new Date(event.start);
    const dateStr = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = eventDate.toTimeString().slice(0, 5); // HH:MM

    setEditEventDate(dateStr);
    setEditEventTime(timeStr);

    setEventDetailsModal({
      open: true,
      event: event,
      isEditing: false,
    });
  };

  const handleDateClick = (date: Date) => {
    const dayEvents = getEventsForDate(date);
    setSelectedDayDetails({
      date: date,
      events: dayEvents,
    });
  };

  const handleGoToCalendar = (event: any) => {
    if (event.htmlLink) {
      window.open(event.htmlLink, "_blank");
    }
  };

  const handleEditEvent = () => {
    setEventDetailsModal(prev => ({ ...prev, isEditing: true }));
  };

  const handleCancelEdit = () => {
    setEventDetailsModal(prev => ({ ...prev, isEditing: false }));
  };

  const handleSaveEdit = () => {
    if (!eventDetailsModal.event) return;

    // Parse date and time
    let startDate: Date | undefined;
    if (editEventDate) {
      const dateParts = editEventDate.split('-').map(Number);
      if (dateParts.length === 3 && !dateParts.some(isNaN)) {
        const year = dateParts[0]!;
        const month = dateParts[1]!;
        const day = dateParts[2]!;
        startDate = new Date(year, month - 1, day);

        // Add time if provided
        if (editEventTime) {
          const timeParts = editEventTime.split(':').map(Number);
          if (timeParts.length >= 2 && !timeParts.some(isNaN) && timeParts[0] !== undefined && timeParts[1] !== undefined) {
            startDate.setHours(timeParts[0], timeParts[1], 0, 0);
          }
        }
      }
    }

    // Calculate end date (1 hour after start, or end of day if no time)
    let endDate: Date | undefined;
    if (startDate) {
      endDate = new Date(startDate);
      if (editEventTime) {
        endDate.setHours(startDate.getHours() + 1);
      } else {
        endDate.setHours(23, 59, 59, 999); // End of day for all-day events
      }
    }

    updateEventMutation.mutate({
      calendarId: eventDetailsModal.event.calendarId,
      eventId: eventDetailsModal.event.id,
      title: editEventTitle.trim() || undefined,
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
      description: editEventDescription.trim() || undefined,
      location: editEventLocation.trim() || undefined,
      allDay: !editEventTime,
    });
  };

  // Group calendars by provider
  const groupedCalendars = calendars.reduce((acc: any, calendar: any) => {
    const key = calendar.provider;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(calendar);
    return acc;
  }, {});

  // Helper function to format date/time in a specific timezone
  const formatInTimezone = (date: Date, timezone: string, formatStr: 'time' | 'date' | 'datetime' = 'datetime') => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
    };
    
    if (formatStr === 'time') {
      options.hour = 'numeric';
      options.minute = '2-digit';
      options.hour12 = true;
    } else if (formatStr === 'date') {
      options.weekday = 'short';
      options.month = 'short';
      options.day = 'numeric';
    } else {
      options.hour = 'numeric';
      options.minute = '2-digit';
      options.hour12 = true;
      options.weekday = 'short';
      options.month = 'short';
      options.day = 'numeric';
    }
    
    return new Intl.DateTimeFormat('en-US', options).format(date);
  };

  // Process events for display
  const processedEvents = allEvents.map((event: any) => {
    const calendar = calendars.find((cal: any) => cal.id === event.calendarId) as any;
    const provider = calendar?.provider || "google";
    const color = provider === "google" ? "bg-blue-500" : "bg-purple-500";

    // Use user's timezone instead of calendar timezone
    const userTimezone = userPreferences?.timezone || 'Africa/Johannesburg';

    const startDate = new Date(event.start);
    const endDate = new Date(event.end);

    return {
      id: event.id,
      title: event.title,
      start: startDate,
      end: endDate,
      color,
      location: event.location,
      htmlLink: event.htmlLink,
      webLink: event.webLink,
      userTimezone, // Use user's timezone for all formatting
    };
  });

  const getEventsForDate = (date: Date) => {
    return processedEvents.filter(event => {
      const eventStart = startOfDay(event.start);
      const eventEnd = endOfDay(event.end);
      const checkDate = startOfDay(date);
      return (checkDate >= eventStart && checkDate <= eventEnd) || isSameDay(event.start, date);
    });
  };

  const getEventsForWeek = (weekStart: Date) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    return processedEvents.filter(event => {
      const eventStart = event.start;
      const eventEnd = event.end;
      return (eventStart >= weekStart && eventStart <= weekEnd) || 
             (eventEnd >= weekStart && eventEnd <= weekEnd) ||
             (eventStart <= weekStart && eventEnd >= weekEnd);
    });
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get first day of week for the month
  const firstDayOfWeek = monthStart.getDay();
  const daysBeforeMonth = Array.from({ length: firstDayOfWeek }, (_, i) => {
    const date = new Date(monthStart);
    date.setDate(date.getDate() - firstDayOfWeek + i);
    return date;
  });

  // Get days after month to fill the grid
  const lastDayOfWeek = monthEnd.getDay();
  const daysAfterMonth = Array.from({ length: 6 - lastDayOfWeek }, (_, i) => {
    const date = new Date(monthEnd);
    date.setDate(date.getDate() + i + 1);
    return date;
  });

  const allDays = [...daysBeforeMonth, ...daysInMonth, ...daysAfterMonth];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Loading calendars...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 sm:px-6 md:px-4 md:py-8 max-w-7xl space-y-4 sm:space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs sm:text-sm overflow-x-auto">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
        >
          <Home className="h-3 w-3 sm:h-4 sm:w-4" />
          <span>Dashboard</span>
        </Link>
        <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 rotate-180 text-muted-foreground flex-shrink-0" />
        <span className="font-medium whitespace-nowrap">Calendar Connections</span>
      </div>

      {/* Page Header */}
      <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
              Calendar Connections
            </h1>
            <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">
              Connect your Google and Microsoft calendars to manage events
              through WhatsApp
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
            <Button
              onClick={() => handleConnectCalendar("google")}
              disabled={connectingProvider === "google" || !canAddMore}
              variant="outline"
              size="default"
              className={cn(
                "flex items-center justify-center gap-3 w-full sm:w-auto",
                "bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300",
                "px-6 py-3 h-auto font-medium text-sm",
                "transition-all duration-200 shadow-sm hover:shadow-md",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {connectingProvider === "google" ? (
                <Clock className="h-5 w-5 animate-spin text-gray-600" />
              ) : (
                <GoogleIcon className="h-5 w-5 flex-shrink-0" />
              )}
              <span className="whitespace-nowrap text-gray-900">
                Connect Google Calendar
              </span>
            </Button>
            <Button
              onClick={() => handleConnectCalendar("microsoft")}
              disabled={connectingProvider === "microsoft" || !canAddMore}
              variant="outline"
              size="default"
              className={cn(
                "flex items-center justify-center gap-3 w-full sm:w-auto",
                "bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300",
                "px-6 py-3 h-auto font-medium text-sm",
                "transition-all duration-200 shadow-sm hover:shadow-md",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {connectingProvider === "microsoft" ? (
                <Clock className="h-5 w-5 animate-spin text-gray-600" />
              ) : (
                <MicrosoftIcon className="h-5 w-5 flex-shrink-0" />
              )}
              <span className="whitespace-nowrap text-gray-900">
                Connect Microsoft Calendar
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left Column: Connected Calendars */}
        <div className="lg:col-span-1 space-y-4 md:space-y-6">
          {/* Connected Calendars */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 md:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                Connected Calendars
              </h2>
              <Badge variant="secondary" className="text-xs">
                {activeCalendars.length} active
              </Badge>
            </div>

            {calendars.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No calendars connected</p>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {Object.entries(groupedCalendars).map(
                  ([provider, providerCalendars]: [string, any]) => (
                    <Card key={provider} className="border-gray-200 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div
                                className={cn(
                                  "h-3 w-3 rounded-full flex-shrink-0",
                                  providerCalendars[0]?.isActive
                                    ? provider === "google"
                                      ? "bg-blue-500"
                                      : "bg-purple-500"
                                    : "bg-gray-300"
                                )}
                              ></div>
                              <span className="text-sm font-semibold text-gray-900 capitalize">
                                {provider === "google" ? "Google" : "Microsoft"}
                              </span>
                              {providerCalendars[0]?.isActive && (
                                <Badge
                                  variant="outline"
                                  className="text-xs py-0 px-1.5 h-5 border-green-500 text-green-700 bg-green-50"
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Active
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 truncate ml-5">
                              {providerCalendars[0]?.email || "N/A"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          {providerCalendars[0]?.isActive ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleDisconnectCalendar(
                                  providerCalendars[0].id,
                                  providerCalendars[0].calendarName ||
                                    providerCalendars[0].email
                                )
                              }
                              disabled={disconnectCalendarMutation.isPending}
                              className="text-xs h-7 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                            >
                              {disconnectCalendarMutation.isPending ? (
                                <>
                                  <Clock className="h-3 w-3 mr-1 animate-spin" />
                                  Disconnecting...
                                </>
                              ) : (
                                <>
                                  <Link2 className="h-3 w-3 mr-1" />
                                  Disconnect
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleConnectCalendar(
                                  provider as "google" | "microsoft"
                                )
                              }
                              disabled={
                                connectingProvider === provider || !canAddMore
                              }
                              className="text-xs h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Connect
                            </Button>
                          )}
                        </div>

                        {/* Sub-calendars */}
                        {providerCalendars.length > 1 && (
                          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                            <p className="text-xs font-medium text-gray-500 mb-2">
                              Sub-calendars
                            </p>
                            {providerCalendars.map((cal: any) => (
                              <div
                                key={cal.id}
                                className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 transition-colors"
                              >
                                <div
                                  className={cn(
                                    "h-2.5 w-2.5 rounded-full flex-shrink-0",
                                    cal.provider === "google"
                                      ? "bg-blue-500"
                                      : "bg-purple-500"
                                  )}
                                ></div>
                                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={cal.isActive}
                                    onChange={() =>
                                      handleToggleCalendarActive(
                                        cal.id,
                                        cal.isActive
                                      )
                                    }
                                    disabled={updateCalendarMutation.isPending}
                                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 flex-shrink-0"
                                  />
                                  <span className="text-xs text-gray-700 truncate">
                                    {cal.calendarName || "Main"}
                                  </span>
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                        {providerCalendars.length === 1 &&
                          providerCalendars[0]?.isActive && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={cn(
                                    "h-2.5 w-2.5 rounded-full flex-shrink-0",
                                    providerCalendars[0].provider === "google"
                                      ? "bg-blue-500"
                                      : "bg-purple-500"
                                  )}
                                ></div>
                                <span className="text-xs text-gray-700 truncate">
                                  {providerCalendars[0].calendarName || "Main"}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleChangeCalendar(
                                    providerCalendars[0].id,
                                    providerCalendars[0].calendarId
                                  )
                                }
                                className="text-xs h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                <Settings className="h-3 w-3 mr-1" />
                                Change
                              </Button>
                            </div>
                          )}
                      </CardContent>
                    </Card>
                  )
                )}
              </div>
            )}
          </div>

          {/* View Mode Selector */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">
              View Mode
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={viewMode === "week" ? "blue-primary" : "outline"}
                size="sm"
                onClick={() => setViewMode("week")}
                className={cn(
                  "flex items-center justify-center gap-2"
                )}
              >
                <CalendarDays className="h-4 w-4" />
                <span className="hidden sm:inline">Week</span>
              </Button>
              <Button
                variant={viewMode === "month" ? "blue-primary" : "outline"}
                size="sm"
                onClick={() => setViewMode("month")}
                className={cn(
                  "flex items-center justify-center gap-2"
                )}
              >
                <CalendarRange className="h-4 w-4" />
                <span className="hidden sm:inline">Month</span>
              </Button>
              <Button
                variant={viewMode === "year" ? "blue-primary" : "outline"}
                size="sm"
                onClick={() => setViewMode("year")}
                className={cn(
                  "flex items-center justify-center gap-2"
                )}
              >
                <CalendarCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Year</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column: Monthly Calendar View */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 md:p-6 shadow-sm">
            {/* Event Creation Button */}
            <div className="mb-3 sm:mb-4 md:mb-6 flex w-full justify-end">
              <Button
                variant="blue-primary"
                className="w-full sm:w-auto text-sm sm:text-base"
                onClick={() => setCreateEventDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Event
              </Button>
            </div>

            {/* Calendar Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4 md:mb-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-1">
                  {viewMode === "week"
                    ? "Weekly View"
                    : viewMode === "year"
                    ? "Yearly View"
                    : "Monthly View"}
                </h2>
                <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 truncate">
                  {viewMode === "week"
                    ? `${format(
                        startOfWeek(currentMonth, { weekStartsOn: 0 }),
                        "MMM d"
                      )} - ${format(
                        endOfWeek(currentMonth, { weekStartsOn: 0 }),
                        "MMM d, yyyy"
                      )}`
                    : viewMode === "year"
                    ? format(currentMonth, "yyyy")
                    : format(currentMonth, "MMMM yyyy")}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (viewMode === "week") {
                      setCurrentMonth(subWeeks(currentMonth, 1));
                    } else if (viewMode === "year") {
                      setCurrentMonth(subYears(currentMonth, 1));
                    } else {
                      setCurrentMonth(subMonths(currentMonth, 1));
                    }
                  }}
                  className="h-8 w-8"
                  aria-label={`Previous ${viewMode}`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCurrentMonth(new Date());
                    setSelectedDate(new Date());
                  }}
                  className="text-xs sm:text-sm"
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (viewMode === "week") {
                      setCurrentMonth(addWeeks(currentMonth, 1));
                    } else if (viewMode === "year") {
                      setCurrentMonth(addYears(currentMonth, 1));
                    } else {
                      setCurrentMonth(addMonths(currentMonth, 1));
                    }
                  }}
                  className="h-8 w-8"
                  aria-label={`Next ${viewMode}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Calendar Grid */}
            {viewMode === "week" ? (
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                  {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                    (day) => (
                      <div
                        key={day}
                        className="px-1 sm:px-2 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-gray-700 text-center"
                      >
                        <span className="hidden sm:inline">{day}</span>
                        <span className="sm:hidden">{day.substring(0, 1)}</span>
                      </div>
                    )
                  )}
                </div>
                <div className="grid grid-cols-7 divide-x divide-gray-200">
                  {eachDayOfInterval({
                    start: startOfWeek(currentMonth, { weekStartsOn: 0 }),
                    end: endOfWeek(currentMonth, { weekStartsOn: 0 }),
                  }).map((day, dayIdx) => {
                    const isToday = isSameDay(day, new Date());
                    const isSelected =
                      selectedDate && isSameDay(day, selectedDate);
                    const dayEvents = getEventsForDate(day);

                    return (
                      <div
                        key={dayIdx}
                        className={cn(
                          "min-h-[100px] sm:min-h-[120px] md:min-h-[200px] p-1.5 sm:p-2 md:p-3 flex flex-col",
                          isToday && !isSelected && "bg-blue-50"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <button
                            onClick={() => handleDateClick(day)}
                            className={cn(
                              "text-sm md:text-base font-medium transition-all duration-200",
                              isToday &&
                                "h-7 w-7 md:h-8 md:w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm",
                              isSelected &&
                                !isToday &&
                                "h-7 w-7 md:h-8 md:w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center",
                              !isToday &&
                                !isSelected &&
                                "text-gray-900 hover:bg-gray-100 rounded-full h-7 w-7 md:h-8 md:w-8 flex items-center justify-center"
                            )}
                          >
                            {format(day, "d")}
                          </button>
                        </div>
                        <div className="space-y-1 flex-1 overflow-y-auto">
                          {dayEvents.length > 0 && (
                            <div className="flex justify-center space-x-1 mt-1">
                              {dayEvents.slice(0, 3).map((event, eventIdx) => (
                                <div
                                  key={eventIdx}
                                  className="w-1.5 h-1.5 rounded-full cursor-pointer hover:opacity-90"
                                  style={{ backgroundColor: event.color?.replace('bg-', '').replace('-500', '') || '#3b82f6' }}
                                  title={event.title}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEventClick(event);
                                  }}
                                />
                              ))}
                              {dayEvents.length > 3 && (
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 cursor-pointer" title={`+${dayEvents.length - 3} more events`} />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : viewMode === "year" ? (
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <div className="grid grid-cols-3 md:grid-cols-4 gap-4 p-4">
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthDate = new Date(
                      currentMonth.getFullYear(),
                      i,
                      1
                    );
                    const monthStart = startOfMonth(monthDate);
                    const monthEnd = endOfMonth(monthDate);
                    const monthDays = eachDayOfInterval({
                      start: monthStart,
                      end: monthEnd,
                    });
                    const firstDayOfWeek = monthStart.getDay();
                    const monthEvents = processedEvents.filter((event) =>
                      isSameMonth(event.start, monthDate)
                    );

                    return (
                      <div
                        key={i}
                        className="border border-gray-200 rounded-lg p-2"
                      >
                        <div className="text-xs font-semibold text-gray-700 mb-2 text-center">
                          {format(monthDate, "MMM")}
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                          {["S", "M", "T", "W", "T", "F", "S"].map(
                            (day, idx) => (
                              <div
                                key={idx}
                                className="text-[8px] text-gray-500 text-center py-0.5"
                              >
                                {day}
                              </div>
                            )
                          )}
                          {Array.from({ length: firstDayOfWeek }, (_, idx) => (
                            <div key={`empty-${idx}`} className="h-4"></div>
                          ))}
                          {monthDays.map((day) => {
                            const isToday = isSameDay(day, new Date());
                            const dayEvents = getEventsForDate(day);
                            return (
                              <button
                                key={day.getTime()}
                                onClick={() => handleDateClick(day)}
                                className={cn(
                                  "h-4 text-[9px] flex items-center justify-center cursor-pointer hover:bg-gray-100 rounded",
                                  isToday &&
                                    "bg-blue-500 text-white font-semibold",
                                  dayEvents.length > 0 &&
                                    !isToday &&
                                    "bg-blue-100"
                                )}
                                title={
                                  dayEvents.length > 0
                                    ? `${dayEvents.length} event(s)`
                                    : format(day, "d")
                                }
                              >
                                {format(day, "d")}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                  {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                    (day) => (
                      <div
                        key={day}
                        className="px-1 sm:px-2 py-1.5 sm:py-2 md:py-3 text-[10px] sm:text-xs font-semibold text-gray-700 text-center"
                      >
                        <span className="hidden sm:inline">{day}</span>
                        <span className="sm:hidden">{day.substring(0, 1)}</span>
                      </div>
                    )
                  )}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 divide-x divide-y divide-gray-200">
                  {allDays.map((day, dayIdx) => {
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isToday = isSameDay(day, new Date());
                    const isSelected =
                      selectedDate && isSameDay(day, selectedDate);
                    const dayEvents = getEventsForDate(day);

                    return (
                      <div
                        key={dayIdx}
                        className={cn(
                          "min-h-[60px] md:min-h-[100px] p-1 md:p-2 flex flex-col",
                          !isCurrentMonth && "bg-gray-50/50",
                          isToday && !isSelected && "bg-blue-50"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <button
                            onClick={() => handleDateClick(day)}
                            className={cn(
                              "text-xs md:text-sm font-medium transition-all duration-200",
                              isToday &&
                                "h-6 w-6 md:h-7 md:w-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm",
                              isSelected &&
                                !isToday &&
                                "h-6 w-6 md:h-7 md:w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center",
                              !isToday &&
                                !isSelected &&
                                isCurrentMonth &&
                                "text-gray-900 hover:bg-gray-100 rounded-full h-6 w-6 md:h-7 md:w-7 flex items-center justify-center",
                              !isCurrentMonth && "text-gray-400"
                            )}
                          >
                            {format(day, "d")}
                          </button>
                        </div>
                        <div className="space-y-0.5 md:space-y-1 flex-1 overflow-hidden">
                          {/* Desktop: Show event text */}
                          <div className="hidden md:block">
                            {dayEvents.slice(0, 2).map((event, eventIdx) => (
                              <div
                                key={eventIdx}
                                className={cn(
                                  "text-[10px] md:text-xs px-1 md:px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-90",
                                  event.color,
                                  "text-white font-medium shadow-sm"
                                )}
                                title={`${event.title} - ${formatInTimezone(event.start, event.userTimezone || 'Africa/Johannesburg', 'time')}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEventClick(event);
                                }}
                              >
                                <span>• </span>
                                <span className="truncate">{event.title}</span>
                                <span className="hidden lg:inline ml-1">
                                  {formatInTimezone(event.start, event.userTimezone || 'Africa/Johannesburg', 'time')}
                                </span>
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-[10px] md:text-xs text-gray-500 px-1">
                                +{dayEvents.length - 2} more
                              </div>
                            )}
                          </div>

                          {/* Mobile: Show event dots */}
                          <div className="md:hidden flex justify-center space-x-1 mt-1">
                            {dayEvents.length > 0 && (
                              <>
                                {dayEvents.slice(0, 3).map((event, eventIdx) => (
                                  <div
                                    key={eventIdx}
                                    className="w-1.5 h-1.5 rounded-full cursor-pointer hover:opacity-90"
                                    style={{ backgroundColor: event.color?.replace('bg-', '').replace('-500', '') || '#3b82f6' }}
                                    title={event.title}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEventClick(event);
                                    }}
                                  />
                                ))}
                                {dayEvents.length > 3 && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 cursor-pointer" title={`+${dayEvents.length - 3} more events`} />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Day Details Section - Below Calendar */}
      <div className="mt-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                {selectedDayDetails.date
                  ? format(selectedDayDetails.date, "EEEE, MMMM d, yyyy")
                  : "Loading..."
                }
              </h2>
              {selectedDayDetails.events.length > 0 && (
                <Badge variant="secondary" className="text-sm">
                  {selectedDayDetails.events.length} event{selectedDayDetails.events.length === 1 ? '' : 's'}
                </Badge>
              )}
            </div>

            {selectedDayDetails.events.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-4">No events scheduled for this day</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedDayDetails.date) {
                      setEventDate(format(selectedDayDetails.date, "yyyy-MM-dd"));
                      setCreateEventDialogOpen(true);
                    }
                  }}
                  className="text-sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Event
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedDayDetails.events
                  .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                  .map((event, index) => (
                    <div
                      key={index}
                      className="group relative bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all duration-200 cursor-pointer"
                      onClick={() => handleEventClick(event)}
                    >
                      {/* Event color indicator */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                        style={{ backgroundColor: event.color?.replace('bg-', '').replace('-500', '') || '#3b82f6' }}
                      />

                      <div className="flex items-start gap-4">
                        {/* Time */}
                        <div className="flex-shrink-0 w-20 text-center">
                          <div className="text-sm font-semibold text-gray-900">
                            {formatInTimezone(event.start, event.userTimezone || 'Africa/Johannesburg', 'time')}
                          </div>
                          <div className="text-xs text-gray-500">
                            {(() => {
                              const start = new Date(event.start);
                              const end = new Date(event.end);
                              const duration = end.getTime() - start.getTime();
                              const hours = Math.floor(duration / (1000 * 60 * 60));
                              const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
                              if (hours > 0) {
                                return `${hours}h ${minutes}m`;
                              }
                              return `${minutes}m`;
                            })()}
                          </div>
                        </div>

                        {/* Event details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-900 text-sm mb-1 truncate">
                                {event.title}
                              </h3>

                              {/* Location */}
                              {event.location && (
                                <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
                                  <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                                  <span className="truncate">📍 {event.location}</span>
                                </div>
                              )}

                              {/* Description preview */}
                              {event.description && (
                                <div className="text-xs text-gray-500 line-clamp-2">
                                  {event.description.length > 100
                                    ? `${event.description.substring(0, 100)}...`
                                    : event.description
                                  }
                                </div>
                              )}
                            </div>

                            {/* Action indicator */}
                            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-5 rounded-lg transition-all duration-200 pointer-events-none" />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calendar Selection Dialog */}
      {calendarSelectionDialog.connectionId && (
        <CalendarSelectionDialog
          open={calendarSelectionDialog.open}
          onOpenChange={(open) => {
            if (!open) handleCalendarSelectionClose();
          }}
          connectionId={calendarSelectionDialog.connectionId}
          currentCalendarId={calendarSelectionDialog.currentCalendarId}
          onSuccess={handleCalendarSelectionClose}
        />
      )}

      {/* Create Event Dialog */}
      <AlertDialog
        open={createEventDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateEventDialogOpen(false);
          }
        }}
      >
        <AlertDialogContent className="w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Plus className="h-5 w-5 text-primary flex-shrink-0" />
              <span>Create New Event</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Add a new event to your calendar. Fill in the details below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2 sm:py-4">
            <div className="space-y-2">
              <label htmlFor="event-title" className="text-sm font-medium">
                Event Title
              </label>
              <Input
                id="event-title"
                placeholder="Enter event title"
                value={eventTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEventTitle(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (
                    e.key === "Enter" &&
                    eventTitle.trim() &&
                    eventDate &&
                    selectedCalendarId
                  ) {
                    handleCreateEvent();
                  }
                }}
                className="text-sm sm:text-base"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="event-date" className="text-sm font-medium">
                  Date
                </label>
                <Input
                  id="event-date"
                  type="date"
                  value={eventDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEventDate(e.target.value)
                  }
                  className="text-sm sm:text-base"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="event-time" className="text-sm font-medium">
                  Time
                </label>
                <TimePicker
                  id="event-time"
                  value={eventTime}
                  onChange={setEventTime}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="event-calendar" className="text-sm font-medium">
                Calendar
              </label>
              <Select
                value={selectedCalendarId}
                onValueChange={setSelectedCalendarId}
              >
                <SelectTrigger id="event-calendar" className="w-full text-sm sm:text-base">
                  <SelectValue placeholder="Select calendar" />
                </SelectTrigger>
                <SelectContent>
                  {calendars.filter((cal: any) => cal.isActive).length > 0 ? (
                    calendars
                      .filter((cal: any) => cal.isActive)
                      .map((cal: any) => (
                        <SelectItem key={cal.id} value={cal.id}>
                          {cal.calendarName || cal.email}
                        </SelectItem>
                      ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No active calendars
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel
              disabled={createEventMutation.isPending}
              className="bg-orange-500 text-white hover:bg-orange-600 hover:font-bold border-0 w-full sm:w-auto order-2 sm:order-1"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateEvent}
              disabled={
                !eventTitle.trim() ||
                !eventDate ||
                !selectedCalendarId ||
                createEventMutation.isPending
              }
              className="bg-primary text-primary-foreground hover:font-bold hover:bg-primary w-full sm:w-auto order-1 sm:order-2"
            >
              {createEventMutation.isPending ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Event"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Day Details Modal */}
      <AlertDialog
        open={dayDetailsModal.open}
        onOpenChange={(open) => {
          if (!open) {
            setDayDetailsModal({
              open: false,
              date: null,
              events: [],
            });
          }
        }}
      >
        <AlertDialogContent className="w-[95vw] max-w-[600px] max-h-[80vh] overflow-hidden">
          <AlertDialogHeader className="pb-3">
            <AlertDialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <CalendarDays className="h-5 w-5 text-primary flex-shrink-0" />
              <span>
                {dayDetailsModal.date
                  ? format(dayDetailsModal.date, "EEEE, MMMM d, yyyy")
                  : "Day Details"
                }
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {dayDetailsModal.events.length > 0
                ? `${dayDetailsModal.events.length} event${dayDetailsModal.events.length === 1 ? '' : 's'} on this day`
                : "No events scheduled for this day"
              }
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex-1 overflow-y-auto max-h-[50vh] py-2">
            {dayDetailsModal.events.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-4">No events scheduled for this day</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (dayDetailsModal.date) {
                      setSelectedDate(dayDetailsModal.date);
                      setEventDate(format(dayDetailsModal.date, "yyyy-MM-dd"));
                      setCreateEventDialogOpen(true);
                      setDayDetailsModal({ open: false, date: null, events: [] });
                    }
                  }}
                  className="text-sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Event
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Sort events by start time */}
                {dayDetailsModal.events
                  .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                  .map((event, index) => (
                    <div
                      key={index}
                      className="group relative bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all duration-200 cursor-pointer"
                      onClick={() => {
                        handleEventClick(event);
                        setDayDetailsModal({ open: false, date: null, events: [] });
                      }}
                    >
                      {/* Event color indicator */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                        style={{ backgroundColor: event.color?.replace('bg-', '').replace('-500', '') || '#3b82f6' }}
                      />

                      <div className="flex items-start gap-3">
                        {/* Time */}
                        <div className="flex-shrink-0 w-20 text-center">
                          <div className="text-sm font-semibold text-gray-900">
                            {formatInTimezone(event.start, event.userTimezone || 'Africa/Johannesburg', 'time')}
                          </div>
                          <div className="text-xs text-gray-500">
                            {(() => {
                              const start = new Date(event.start);
                              const end = new Date(event.end);
                              const duration = end.getTime() - start.getTime();
                              const hours = Math.floor(duration / (1000 * 60 * 60));
                              const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
                              if (hours > 0) {
                                return `${hours}h ${minutes}m`;
                              }
                              return `${minutes}m`;
                            })()}
                          </div>
                        </div>

                        {/* Event details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-900 text-sm truncate mb-1">
                                {event.title}
                              </h3>

                              {/* Location */}
                              {event.location && (
                                <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                                  <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                                  <span className="truncate">📍 {event.location}</span>
                                </div>
                              )}

                              {/* Description preview */}
                              {event.description && (
                                <div className="text-xs text-gray-500 line-clamp-2">
                                  {event.description.length > 100
                                    ? `${event.description.substring(0, 100)}...`
                                    : event.description
                                  }
                                </div>
                              )}
                            </div>

                            {/* Action indicator */}
                            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-5 rounded-lg transition-all duration-200 pointer-events-none" />
                    </div>
                  ))}
              </div>
            )}
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
            <AlertDialogCancel className="bg-orange-500 text-white hover:bg-orange-600 hover:font-bold border-0 w-full sm:w-auto order-2 sm:order-1">
              Close
            </AlertDialogCancel>
            {dayDetailsModal.events.length > 0 && (
              <Button
                onClick={() => {
                  if (dayDetailsModal.date) {
                    setSelectedDate(dayDetailsModal.date);
                    setEventDate(format(dayDetailsModal.date, "yyyy-MM-dd"));
                    setCreateEventDialogOpen(true);
                    setDayDetailsModal({ open: false, date: null, events: [] });
                  }
                }}
                variant="blue-primary"
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Event
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog
        open={disconnectDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setDisconnectDialog({
              open: false,
              calendarId: null,
              calendarName: null,
            });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Disconnect Calendar
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect{" "}
              <strong>
                {disconnectDialog.calendarName || "this calendar"}
              </strong>
              ? This will stop syncing events from this calendar, but you can
              reconnect it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectCalendarMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisconnect}
              disabled={disconnectCalendarMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectCalendarMutation.isPending ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Event Details Modal */}
      <AlertDialog
        open={eventDetailsModal.open}
        onOpenChange={(open) => {
          if (!open) {
            setEventDetailsModal({
              open: false,
              event: null,
            });
          }
        }}
      >
        <AlertDialogContent className="w-[95vw] max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <CalendarDays className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="truncate">{eventDetailsModal.event?.title || "Event Details"}</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Event details and actions
            </AlertDialogDescription>
          </AlertDialogHeader>

          {eventDetailsModal.event && (
            <div className="space-y-4 py-2">
              {eventDetailsModal.isEditing ? (
                /* Edit Mode */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="edit-event-title" className="text-sm font-medium">
                      Event Title
                    </label>
                    <Input
                      id="edit-event-title"
                      value={editEventTitle}
                      onChange={(e) => setEditEventTitle(e.target.value)}
                      placeholder="Enter event title"
                      className="text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="edit-event-date" className="text-sm font-medium">
                        Date
                      </label>
                      <Input
                        id="edit-event-date"
                        type="date"
                        value={editEventDate}
                        onChange={(e) => setEditEventDate(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="edit-event-time" className="text-sm font-medium">
                        Time
                      </label>
                      <Input
                        id="edit-event-time"
                        type="time"
                        value={editEventTime}
                        onChange={(e) => setEditEventTime(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="edit-event-location" className="text-sm font-medium">
                      Location
                    </label>
                    <Input
                      id="edit-event-location"
                      value={editEventLocation}
                      onChange={(e) => setEditEventLocation(e.target.value)}
                      placeholder="Enter location (optional)"
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="edit-event-description" className="text-sm font-medium">
                      Description
                    </label>
                    <Textarea
                      id="edit-event-description"
                      value={editEventDescription}
                      onChange={(e) => setEditEventDescription(e.target.value)}
                      placeholder="Enter description (optional)"
                      className="text-sm min-h-[80px]"
                    />
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">
                        {formatInTimezone(
                          eventDetailsModal.event.start,
                          eventDetailsModal.event.userTimezone || 'Africa/Johannesburg',
                          'datetime'
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatInTimezone(
                          eventDetailsModal.event.start,
                          eventDetailsModal.event.userTimezone || 'Africa/Johannesburg',
                          'date'
                        )}
                      </div>
                    </div>
                  </div>

                  {eventDetailsModal.event.location && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700">
                          📍 {eventDetailsModal.event.location}
                        </div>
                      </div>
                    </div>
                  )}

                  {eventDetailsModal.event.description && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-purple-500 mt-2 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700">
                          <div className="font-medium mb-1">Description:</div>
                          <div className="whitespace-pre-wrap break-words">
                            {eventDetailsModal.event.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel
              onClick={eventDetailsModal.isEditing ? handleCancelEdit : undefined}
              className="bg-orange-500 text-white hover:bg-orange-600 hover:font-bold border-0 w-full sm:w-auto order-2 sm:order-1"
            >
              {eventDetailsModal.isEditing ? "Cancel" : "Close"}
            </AlertDialogCancel>
            <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
              {eventDetailsModal.isEditing ? (
                <Button
                  onClick={handleSaveEdit}
                  disabled={updateEventMutation.isPending || !editEventTitle.trim()}
                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
                >
                  {updateEventMutation.isPending ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleEditEvent}
                    className="flex-1 sm:flex-none"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    onClick={() => {
                      if (eventDetailsModal.event) {
                        handleGoToCalendar(eventDetailsModal.event);
                        setEventDetailsModal({ open: false, event: null, isEditing: false });
                      }
                    }}
                    variant="blue-primary"
                    className="w-full sm:w-auto"
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Go to Calendar
                  </Button>
                </>
              )}
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

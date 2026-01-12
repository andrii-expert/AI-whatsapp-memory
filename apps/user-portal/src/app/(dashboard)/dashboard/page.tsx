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
  DropdownMenuSeparator,
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
  AlertDialogCancel,
} from "@imaginecalendar/ui/alert-dialog";
import { Input } from "@imaginecalendar/ui/input";
import { Textarea } from "@imaginecalendar/ui/textarea";
import { Label } from "@imaginecalendar/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@imaginecalendar/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@imaginecalendar/ui/command";
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
  Check,
  Edit3,
  Trash2,
  Loader2,
  CalendarDays,
  Settings,
  Save,
  Link2,
  Plus,
  Mail,
  Phone,
  User,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useEffect, useRef } from "react";
import { cn } from "@imaginecalendar/ui/cn";
import { startOfDay, endOfDay, isSameDay, format } from "date-fns";
import { WelcomeModal } from "@/components/welcome-modal";

// Google Maps component
declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

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

// TimePicker component
const TimePicker = ({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) => {
  const parseTime = (time24: string) => {
    if (!time24) return { hour: 0, minute: 0 };
    const [hours, minutes] = time24.split(":").map(Number);
    if (isNaN(hours!) || isNaN(minutes!)) {
      return { hour: 0, minute: 0 };
    }
    return {
      hour: hours!,
      minute: minutes!,
    };
  };

  const formatTimeDisplay = (time24: string) => {
    if (!time24) return "09:00 AM";
    const { hour, minute } = parseTime(time24);
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const ampm = hour >= 12 ? "PM" : "AM";
    return `${hour12.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} ${ampm}`;
  };

  const { hour, minute } = parseTime(value);
  const [selectedHour, setSelectedHour] = useState(hour.toString().padStart(2, "0"));
  const [selectedMinute, setSelectedMinute] = useState(minute.toString().padStart(2, "0"));
  const [selectedAmPm, setSelectedAmPm] = useState(hour >= 12 ? "PM" : "AM");

  useEffect(() => {
    const { hour: h, minute: m } = parseTime(value);
    setSelectedHour(h.toString().padStart(2, "0"));
    setSelectedMinute(m.toString().padStart(2, "0"));
    setSelectedAmPm(h >= 12 ? "PM" : "AM");
  }, [value]);

  const handleTimeChange = (newHour: string, newMinute: string, newAmPm: string) => {
    setSelectedHour(newHour);
    setSelectedMinute(newMinute);
    setSelectedAmPm(newAmPm);
    
    let hour24 = parseInt(newHour);
    if (newAmPm === "PM" && hour24 !== 12) {
      hour24 += 12;
    } else if (newAmPm === "AM" && hour24 === 12) {
      hour24 = 0;
    }
    const newTime = `${hour24.toString().padStart(2, "0")}:${newMinute}`;
    onChange(newTime);
  };

  const hours12 = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));
  const ampmOptions = ["AM", "PM"];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-normal text-left hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <span className={value ? "text-gray-900" : "text-gray-500"}>
              {value ? formatTimeDisplay(value) : "09:00 AM"}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex items-center gap-2">
          <Select 
            value={selectedHour} 
            onValueChange={(newHour) => handleTimeChange(newHour, selectedMinute, selectedAmPm)}
          >
            <SelectTrigger className="w-[70px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hours12.map((h) => (
                <SelectItem key={h} value={h}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <span className="text-gray-500 font-semibold">:</span>
          
          <Select 
            value={selectedMinute} 
            onValueChange={(newMinute) => handleTimeChange(selectedHour, newMinute, selectedAmPm)}
          >
            <SelectTrigger className="w-[70px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {minutes.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={selectedAmPm} 
            onValueChange={(newAmPm) => handleTimeChange(selectedHour, selectedMinute, newAmPm)}
          >
            <SelectTrigger className="w-[70px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ampmOptions.map((ampm) => (
                <SelectItem key={ampm} value={ampm}>
                  {ampm}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// GoogleMap component
function GoogleMap({
  lat,
  lng,
  address,
  onPinDrop,
  enableClickToDrop = false
}: {
  lat?: number | null;
  lng?: number | null;
  address?: string;
  onPinDrop?: (lat: number, lng: number) => void;
  enableClickToDrop?: boolean;
}) {
  const [mapInitialized, setMapInitialized] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const clickListenerRef = useRef<any>(null);
  const initAttemptsRef = useRef(0);
  const maxInitAttempts = 20;

  useEffect(() => {
    if (!window.google?.maps) {
      setMapInitialized(false);
      return;
    }

    const hasValidCoords = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);

    if (!hasValidCoords && !enableClickToDrop) {
      setMapInitialized(false);
      if (mapInstanceRef.current) {
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
      return;
    }

    initAttemptsRef.current = 0;
    setMapInitialized(false);

    const initMap = () => {
      if (!mapContainerRef.current) {
        initAttemptsRef.current++;
        if (initAttemptsRef.current < maxInitAttempts) {
          setTimeout(initMap, 100);
        } else {
          setMapError("Map container not found. Please refresh the page.");
        }
        return;
      }

      try {
        const centerLat = hasValidCoords ? lat : 20;
        const centerLng = hasValidCoords ? lng : 0;
        const zoom = hasValidCoords ? 15 : 3;

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
            center: { lat: centerLat, lng: centerLng },
            zoom: zoom,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
            zoomControl: true,
            mapTypeId: window.google.maps.MapTypeId.ROADMAP,
          });

          let mapReady = false;
          const onMapReady = () => {
            if (!mapReady) {
              mapReady = true;
              setMapInitialized(true);
              setMapError(null);

              if (enableClickToDrop && onPinDrop) {
                if (clickListenerRef.current) {
                  window.google.maps.event.removeListener(clickListenerRef.current);
                }
                try {
                  clickListenerRef.current = mapInstanceRef.current.addListener('click', (e: any) => {
                    if (e && e.latLng && onPinDrop) {
                      try {
                        const clickedLat = e.latLng.lat();
                        const clickedLng = e.latLng.lng();
                        if (typeof clickedLat === 'number' && typeof clickedLng === 'number' && !isNaN(clickedLat) && !isNaN(clickedLng)) {
                          onPinDrop(clickedLat, clickedLng);
                        }
                      } catch (error) {
                        console.error('Error handling map click:', error);
                      }
                    }
                  });
                } catch (error) {
                  console.error('Error adding click listener:', error);
                }
              }
            }
          };

          mapInstanceRef.current.addListener('idle', onMapReady);
          mapInstanceRef.current.addListener('tilesloaded', onMapReady);

          setTimeout(() => {
            if (!mapReady && mapInstanceRef.current) {
              onMapReady();
            }
          }, 1000);
        } else {
          if (hasValidCoords) {
            mapInstanceRef.current.setCenter({ lat, lng });
            mapInstanceRef.current.setZoom(15);
          }
          setMapInitialized(true);
        }

        if (hasValidCoords) {
          if (markerRef.current) {
            markerRef.current.setPosition({ lat, lng });
            markerRef.current.setTitle(address || "Location");
            markerRef.current.setMap(mapInstanceRef.current);
          } else {
            markerRef.current = new window.google.maps.Marker({
              position: { lat, lng },
              map: mapInstanceRef.current,
              title: address || "Location",
              animation: window.google.maps.Animation.DROP,
            });
          }
        } else if (markerRef.current) {
          markerRef.current.setMap(null);
        }

        setMapError(null);
      } catch (error) {
        console.error("GoogleMap: Error initializing map:", error);
        setMapError(`Failed to initialize map: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setMapInitialized(false);
      }
    };

    const timeoutId = setTimeout(initMap, 100);
    return () => {
      clearTimeout(timeoutId);
      if (clickListenerRef.current) {
        window.google?.maps?.event?.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [lat, lng, address, enableClickToDrop, onPinDrop]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps || !mapInitialized) return;

    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current);
      clickListenerRef.current = null;
    }

    if (enableClickToDrop && onPinDrop) {
      try {
        clickListenerRef.current = mapInstanceRef.current.addListener('click', (e: any) => {
          if (e && e.latLng && onPinDrop) {
            try {
              const clickedLat = e.latLng.lat();
              const clickedLng = e.latLng.lng();
              if (typeof clickedLat === 'number' && typeof clickedLng === 'number' && !isNaN(clickedLat) && !isNaN(clickedLng)) {
                onPinDrop(clickedLat, clickedLng);
              }
            } catch (error) {
              console.error('Error handling map click:', error);
            }
          }
        });
      } catch (error) {
        console.error('Error adding click listener:', error);
      }
    }

    return () => {
      if (clickListenerRef.current) {
        window.google?.maps?.event?.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [enableClickToDrop, onPinDrop, mapInitialized]);

  if ((lat == null || lng == null || isNaN(lat) || isNaN(lng)) && !enableClickToDrop) {
    return (
      <div className="w-full h-[300px] sm:h-[400px] bg-green-50 border-2 border-dashed border-green-200 rounded-lg flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <p className="text-xs sm:text-sm text-green-700 font-medium text-center">Map placeholder - Enter coordinates or address to view map</p>
        </div>
        {address && (
          <p className="text-xs text-green-600 text-center mt-2">
            Showing preview for {address}.
          </p>
        )}
        <p className="text-xs text-green-600 text-center mt-1">
          Please enter an address or coordinates to display the map.
        </p>
      </div>
    );
  }

  if (!window.google?.maps) {
    return (
      <div className="w-full h-[300px] sm:h-[400px] bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center p-4 sm:p-8">
        <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-blue-600 mb-4" />
        <p className="text-xs sm:text-sm text-gray-700 font-medium">Loading Google Maps...</p>
        <p className="text-xs text-gray-500 text-center mt-2">
          Please wait while we load the map.
        </p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="w-full h-[300px] sm:h-[400px] bg-red-50 border-2 border-dashed border-red-200 rounded-lg flex flex-col items-center justify-center p-4 sm:p-8">
        <p className="text-xs sm:text-sm text-red-700 font-medium mb-2">Error loading map</p>
        <p className="text-xs text-red-600 text-center mb-4">{mapError}</p>
        <Button
          onClick={() => {
            setMapError(null);
            setMapInitialized(false);
            mapInstanceRef.current = null;
            markerRef.current = null;
          }}
          variant="outline"
          size="sm"
          className="touch-manipulation"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full h-[300px] sm:h-[400px] rounded-lg overflow-hidden border border-gray-200 bg-gray-100 relative">
      <div
        ref={mapContainerRef}
        className={cn(
          "w-full h-full",
          enableClickToDrop && mapInitialized && "cursor-crosshair"
        )}
      />
      {!mapInitialized && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      )}
      {enableClickToDrop && mapInitialized && (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg shadow-lg z-10 pointer-events-none max-w-[90%]">
          <p className="text-xs sm:text-sm font-medium text-center">Click anywhere on the map to drop a pin</p>
        </div>
      )}
    </div>
  );
}

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
  
  // Event details modal state
  const [eventDetailsModal, setEventDetailsModal] = useState<{
    open: boolean;
    event: any | null;
    isEditing: boolean;
  }>({
    open: false,
    event: null,
    isEditing: false,
  });
  
  // Edit event form state
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [editEventTime, setEditEventTime] = useState("");
  const [editEventLocation, setEditEventLocation] = useState("");
  const [editEventAddressId, setEditEventAddressId] = useState<string>("");
  const [editEventAddress, setEditEventAddress] = useState("");
  const [editEventCoordinates, setEditEventCoordinates] = useState("");
  const [editEnableDropPin, setEditEnableDropPin] = useState(false);
  const [editAddressComponents, setEditAddressComponents] = useState<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  }>({});
  const [editIsGeocoding, setEditIsGeocoding] = useState(false);
  const [editAutocomplete, setEditAutocomplete] = useState<any>(null);
  const editAutocompleteRef = useRef<any>(null);
  const [editCreateGoogleMeet, setEditCreateGoogleMeet] = useState(false);
  const [editEventColor, setEditEventColor] = useState("blue");
  const [editEventAttendees, setEditEventAttendees] = useState<string[]>([]);
  const [editManualAttendeeInput, setEditManualAttendeeInput] = useState("");
  const [editAttendeeSearchOpen, setEditAttendeeSearchOpen] = useState(false);
  const [editAttendeeSearchTerm, setEditAttendeeSearchTerm] = useState("");

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
  
  // Fetch addresses
  const { data: addresses = [] } = useQuery(trpc.addresses.list.queryOptions());
  
  // Search users for attendee autocomplete (edit form)
  const { data: editSearchedUsers = [], isLoading: isEditSearchingUsers } = useQuery({
    ...trpc.friends.searchUsers.queryOptions({ searchTerm: editAttendeeSearchTerm }),
    enabled: editAttendeeSearchTerm.length >= 2 && editAttendeeSearchOpen,
  });

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

  // Query for fetching individual event data with conference information
  const individualEventQuery = useQuery(
    trpc.calendar.getEvent.queryOptions(
      eventDetailsModal.event?.calendarId && eventDetailsModal.event?.id ? {
        calendarId: eventDetailsModal.event.calendarId,
        eventId: eventDetailsModal.event.id,
      } : {
        calendarId: '',
        eventId: '',
      },
      {
        enabled: eventDetailsModal.open && !!eventDetailsModal.event?.calendarId && !!eventDetailsModal.event?.id,
        staleTime: 0, // Always fetch fresh data
        refetchOnWindowFocus: false,
      }
    )
  );

  // Process individual event for display
  const processedIndividualEvent = useMemo(() => {
    if (!individualEventQuery.data) return null;
    const event = individualEventQuery.data;
    const calendar = calendars?.find((cal: any) => cal.id === eventDetailsModal.event?.calendarId);
    const provider = calendar?.provider || "google";
    const eventColor = event.color || (provider === "google" ? "blue" : "purple");
    const colorHex = eventColor === "orange" ? "#FFA500" :
                     eventColor === "purple" ? "#9333EA" :
                     eventColor === "blue" ? "#3b82f6" :
                     "#3b82f6";
    
    return {
      ...event,
      start: event.start ? new Date(event.start) : undefined,
      end: event.end ? new Date(event.end) : undefined,
      colorHex,
      userTimezone: calendar?.timeZone || 'Africa/Johannesburg',
    };
  }, [individualEventQuery.data, calendars, eventDetailsModal.event?.calendarId]);

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
      onError: (error: any) => {
        toast({
          title: "Event update failed",
          description: error.message || "Failed to update event. Please try again.",
          variant: "error",
          duration: 3500,
        });
      },
    })
  );

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (input: { calendarId: string; eventId: string }) => {
      const result = await (trpc as any).calendar.deleteEvent.mutate(input);
      return result;
    },
    onSuccess: () => {
      eventQueries.forEach((query) => query.refetch());
      toast({
        title: "Event deleted",
        description: "Event has been deleted successfully.",
        variant: "success",
      });
      setEventDetailsModal({ open: false, event: null, isEditing: false });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete event",
        description: error?.message || "An error occurred while deleting the event.",
        variant: "error",
      });
    },
  });

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

  // Helper functions
  const formatInTimezone = (date: Date, timezone: string, formatStr: 'time' | 'date' | 'datetime' = 'datetime') => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
    };
    
    if (formatStr === 'time') {
      options.hour = 'numeric';
      options.minute = '2-digit';
      options.hour12 = true; // Use 12-hour format with AM/PM
    } else if (formatStr === 'date') {
      options.weekday = 'short';
      options.month = 'short';
      options.day = 'numeric';
    } else {
      options.hour = 'numeric';
      options.minute = '2-digit';
      options.hour12 = true; // Use 12-hour format with AM/PM
      options.weekday = 'short';
      options.month = 'short';
      options.day = 'numeric';
    }
    
    return new Intl.DateTimeFormat('en-US', options).format(date);
  };

  const formatFullAddress = (address: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
  }): string => {
    const addressParts = [
      address.street,
      address.city,
      address.state,
      address.zip,
      address.country,
    ].filter((part): part is string => Boolean(part) && typeof part === 'string' && part.trim().length > 0);
    return addressParts.join(", ");
  };

  const parseCoordinates = (coordString: string | undefined): { lat: number | null; lng: number | null } => {
    if (!coordString || !coordString.trim()) return { lat: null, lng: null };
    const parts = coordString.split(",").map(p => p.trim());
    if (parts.length === 2) {
      const lat = parseFloat(parts[0] || "");
      const lng = parseFloat(parts[1] || "");
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    return { lat: null, lng: null };
  };

  const handleEditAddressPaste = (value: string) => {
    setEditEventAddress(value);

    const googleMapsRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = value.match(googleMapsRegex);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        setEditEventCoordinates(`${lat}, ${lng}`);
      }
    } else if (value.trim() && window.google?.maps) {
      setEditIsGeocoding(true);
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: value }, (results: any, status: string) => {
        setEditIsGeocoding(false);
        if (status === "OK" && results?.[0]) {
          const result = results[0];
          if (result.geometry?.location) {
            const lat = result.geometry.location.lat();
            const lng = result.geometry.location.lng();
            setEditEventCoordinates(`${lat}, ${lng}`);
          }
          const components: {
            street?: string;
            city?: string;
            state?: string;
            zip?: string;
            country?: string;
          } = {};
          if (result.address_components) {
            result.address_components.forEach((component: any) => {
              const types = component.types;
              if (types.includes("street_number") || types.includes("route")) {
                const streetNumber = result.address_components.find((c: any) => c.types.includes("street_number"))?.long_name || "";
                const route = result.address_components.find((c: any) => c.types.includes("route"))?.long_name || "";
                components.street = [streetNumber, route].filter(Boolean).join(" ").trim();
              }
              if (types.includes("locality")) {
                components.city = component.long_name;
              } else if (types.includes("administrative_area_level_1")) {
                components.state = component.long_name;
              } else if (types.includes("postal_code")) {
                components.zip = component.long_name;
              } else if (types.includes("country")) {
                components.country = component.long_name;
              }
            });
          }
          setEditAddressComponents(components);
        }
      });
    }
  };

  const handleEditPinDrop = (lat: number, lng: number) => {
    setEditEventCoordinates(`${lat}, ${lng}`);
    setEditEnableDropPin(false);

    if (window.google?.maps) {
      setEditIsGeocoding(true);
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
        setEditIsGeocoding(false);
        if (status === "OK" && results?.[0]) {
          const result = results[0];
          setEditEventAddress(result.formatted_address);
          const components: {
            street?: string;
            city?: string;
            state?: string;
            zip?: string;
            country?: string;
          } = {};
          if (result.address_components) {
            result.address_components.forEach((component: any) => {
              const types = component.types;
              if (types.includes("street_number") || types.includes("route")) {
                const streetNumber = result.address_components.find((c: any) => c.types.includes("street_number"))?.long_name || "";
                const route = result.address_components.find((c: any) => c.types.includes("route"))?.long_name || "";
                components.street = [streetNumber, route].filter(Boolean).join(" ").trim();
              }
              if (types.includes("locality")) {
                components.city = component.long_name;
              } else if (types.includes("administrative_area_level_1")) {
                components.state = component.long_name;
              } else if (types.includes("postal_code")) {
                components.zip = component.long_name;
              } else if (types.includes("country")) {
                components.country = component.long_name;
              }
            });
          }
          setEditAddressComponents(components);
        }
      });
    }
  };

  const handleAddEditAttendee = (input: string) => {
    const trimmed = input.trim().toLowerCase();
    
    if (editEventAttendees.includes(trimmed)) {
      toast({
        title: "Already added",
        description: "This email is already in the attendees list.",
        variant: "info",
      });
      return;
    }
    
    if (trimmed.includes("@") && trimmed.includes(".")) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(trimmed)) {
        setEditEventAttendees([...editEventAttendees, trimmed]);
        setEditManualAttendeeInput("");
        setEditAttendeeSearchOpen(false);
      } else {
        toast({
          title: "Invalid email",
          description: "Please enter a valid email address.",
          variant: "error",
        });
      }
    } else {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address. Google Calendar requires email addresses for attendees.",
        variant: "error",
      });
    }
  };

  const resetEditFields = () => {
    setEditEventTitle("");
    setEditEventDate("");
    setEditEventTime("");
    setEditEventLocation("");
    setEditEventAddressId("");
    setEditEventAddress("");
    setEditEventCoordinates("");
    setEditEnableDropPin(false);
    setEditAddressComponents({});
    setEditIsGeocoding(false);
    setEditCreateGoogleMeet(false);
    setEditEventColor("blue");
    setEditEventAttendees([]);
    setEditManualAttendeeInput("");
  };

  // Event handlers
  const handleEventClick = (event: any) => {
    setEditEventTitle(event.title || "");
    setEditEventLocation(event.location || "");
    setEditEventAddressId("");
    setEditEventAddress(event.location || "");
    setEditEventCoordinates("");
    setEditEnableDropPin(false);
    setEditAddressComponents({});
    setEditIsGeocoding(false);
    setEditCreateGoogleMeet(!!event.conferenceUrl);
    setEditEventColor(event.color || event.eventColor || "blue");
    
    // Normalize attendees
    const normalizedAttendees = event.attendees ? (
      Array.isArray(event.attendees) ? event.attendees.map((a: any) => {
        if (typeof a === 'string') return a.toLowerCase();
        if (a && typeof a === 'object' && a.email) return a.email.toLowerCase();
        if (a && typeof a === 'object') {
          return (a.email || a.mail || a.emailAddress || '').toLowerCase();
        }
        return '';
      }).filter((e: string) => e) : []
    ) : [];
    setEditEventAttendees(normalizedAttendees);
    setEditManualAttendeeInput("");

    // Format date and time for form inputs
    if (event.start || event.startDate) {
      const eventDate = new Date(event.start || event.startDate);
      const dateStr = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = eventDate.toTimeString().slice(0, 5); // HH:MM
      setEditEventDate(dateStr || "");
      setEditEventTime(timeStr || "");
    } else {
      setEditEventDate("");
      setEditEventTime("");
    }

    setEventDetailsModal({
      open: true,
      event: event,
      isEditing: false,
    });
  };

  const handleEditEvent = () => {
    if (eventDetailsModal.event) {
      const event = processedIndividualEvent || eventDetailsModal.event;
      setEditEventTitle(event.title || "");
      setEditEventLocation(event.location || "");
      setEditEventAddress(event.location || "");
      setEditCreateGoogleMeet(!!event.conferenceUrl);
      setEditEventColor(event.color || event.eventColor || "blue");
      
      // Normalize attendees
      const normalizedAttendees = event.attendees ? (
        Array.isArray(event.attendees) ? event.attendees.map((a: any) => {
          if (typeof a === 'string') return a.toLowerCase();
          if (a && typeof a === 'object' && a.email) return a.email.toLowerCase();
          if (a && typeof a === 'object') {
            return (a.email || a.mail || a.emailAddress || '').toLowerCase();
          }
          return '';
        }).filter((e: string) => e) : []
      ) : [];
      setEditEventAttendees(normalizedAttendees);
      setEditManualAttendeeInput("");

      // Format date and time for form inputs
      if (event.start || event.startDate) {
        const eventDate = new Date(event.start || event.startDate);
        const dateStr = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = eventDate.toTimeString().slice(0, 5); // HH:MM
        setEditEventDate(dateStr || "");
        setEditEventTime(timeStr || "");
      } else {
        setEditEventDate("");
        setEditEventTime("");
      }
    }

    setEventDetailsModal(prev => ({ ...prev, isEditing: true }));
  };

  const handleDeleteEvent = (calendarId: string, eventId: string) => {
    if (confirm("Are you sure you want to delete this event?")) {
      deleteEventMutation.mutate({ calendarId, eventId });
    }
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

    const updateData: any = {
      calendarId: eventDetailsModal.event.calendarId,
      eventId: eventDetailsModal.event.id,
      allDay: !editEventTime,
      createGoogleMeet: editCreateGoogleMeet,
    };

    // Only include fields that have values
    const trimmedTitle = editEventTitle.trim();
    if (trimmedTitle) {
      updateData.title = trimmedTitle;
    }

    if (startDate) {
      updateData.start = startDate.toISOString();
    }

    if (endDate) {
      updateData.end = endDate.toISOString();
    }

    const location = editEventAddress.trim() || editEventLocation.trim();
    if (location) {
      updateData.location = location;
    }

    // Add color to update data
    if (editEventColor && editEventColor !== "blue") {
      updateData.color = editEventColor;
    }

    // Add attendees to update data
    if (editEventAttendees.length > 0) {
      updateData.attendees = editEventAttendees;
    }

    updateEventMutation.mutate(updateData);
  };

  const handleCancelEdit = () => {
    setEventDetailsModal(prev => ({ ...prev, isEditing: false }));
  };

  const handleGoToCalendar = (event: any) => {
    if (event.htmlLink) {
      window.open(event.htmlLink, "_blank");
    }
  };

  // Helper function to check if reminder occurs today
  const doesReminderOccurToday = (reminder: any, userTimezone?: string): boolean => {
    if (!reminder.active) return false;
    
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    
    // Get date components for today in user's timezone
    let todayInTz: Date;
    if (userTimezone) {
      const todayStr = today.toLocaleString("en-US", { timeZone: userTimezone });
      todayInTz = new Date(todayStr);
    } else {
      todayInTz = new Date(today);
    }
    
    const year = todayInTz.getFullYear();
    const month = todayInTz.getMonth() + 1; // 1-12
    const day = todayInTz.getDate();
    const dayOfWeek = todayInTz.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    switch (reminder.frequency) {
      case "daily":
        // Daily reminders occur every day
        return true;
        
      case "hourly":
      case "minutely":
        // Hourly and minutely reminders occur every day
        return true;
        
      case "once":
        // Check if target date is today
        if (reminder.targetDate) {
          const target = new Date(reminder.targetDate);
          let targetInTz: Date;
          if (userTimezone) {
            const targetStr = target.toLocaleString("en-US", { timeZone: userTimezone });
            targetInTz = new Date(targetStr);
          } else {
            targetInTz = new Date(target);
          }
          return (
            targetInTz.getFullYear() === year &&
            targetInTz.getMonth() + 1 === month &&
            targetInTz.getDate() === day
          );
        }
        if (reminder.daysFromNow !== null) {
          const now = new Date();
          let nowInTz: Date;
          if (userTimezone) {
            const nowStr = now.toLocaleString("en-US", { timeZone: userTimezone });
            nowInTz = new Date(nowStr);
          } else {
            nowInTz = new Date(now);
          }
          const targetDate = new Date(nowInTz);
          targetDate.setDate(targetDate.getDate() + reminder.daysFromNow);
          return (
            targetDate.getFullYear() === year &&
            targetDate.getMonth() + 1 === month &&
            targetDate.getDate() === day
          );
        }
        return false;
        
      case "weekly":
        // Check if today's day of week matches
        if (!reminder.daysOfWeek || reminder.daysOfWeek.length === 0) {
          return false;
        }
        return reminder.daysOfWeek.includes(dayOfWeek);
        
      case "monthly":
        // Check if today's day of month matches
        const reminderDay = reminder.dayOfMonth ?? 1;
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const targetDay = Math.min(reminderDay, lastDayOfMonth);
        return day === targetDay;
        
      case "yearly":
        // Check if today's month and day match
        const reminderMonth = reminder.month ?? 1;
        const reminderDayOfMonth = reminder.dayOfMonth ?? 1;
        const lastDayOfYearMonth = new Date(year, reminderMonth, 0).getDate();
        const targetDayOfYear = Math.min(reminderDayOfMonth, lastDayOfYearMonth);
        return month === reminderMonth && day === targetDayOfYear;
        
      default:
        return false;
    }
  };

  // Helper function to calculate next occurrence time for sorting
  const getNextOccurrenceTime = (reminder: any, userTimezone?: string): Date | null => {
    if (!reminder.active) return null;
    
    const now = new Date();
    
    try {
      // For daily reminders, calculate next occurrence today
      if (reminder.frequency === "daily" && reminder.time) {
        const [hours, minutes] = reminder.time.split(":").map(Number);
        const today = new Date();
        today.setHours(hours || 0, minutes || 0, 0, 0);
        
        // If time has passed today, it's tomorrow
        if (today <= now) {
          today.setDate(today.getDate() + 1);
        }
        return today;
      }
      
      // For weekly reminders, find next occurrence
      if (reminder.frequency === "weekly" && reminder.daysOfWeek && reminder.daysOfWeek.length > 0 && reminder.time) {
        const [hours, minutes] = reminder.time.split(":").map(Number);
        const today = new Date();
        const currentDayOfWeek = today.getDay();
        const sortedDays = [...reminder.daysOfWeek].sort((a, b) => a - b);
        
        // Find next day this week
        for (const day of sortedDays) {
          if (day > currentDayOfWeek) {
            const nextDate = new Date(today);
            const daysToAdd = day - currentDayOfWeek;
            nextDate.setDate(nextDate.getDate() + daysToAdd);
            nextDate.setHours(hours || 0, minutes || 0, 0, 0);
            return nextDate;
          }
          if (day === currentDayOfWeek) {
            const todayAtTime = new Date(today);
            todayAtTime.setHours(hours || 0, minutes || 0, 0, 0);
            if (todayAtTime > now) {
              return todayAtTime;
            }
          }
        }
        
        // If no day found this week, use first day of next week
        const firstDay = sortedDays[0];
        const nextDate = new Date(today);
        const daysUntilNextWeek = 7 - currentDayOfWeek;
        nextDate.setDate(nextDate.getDate() + daysUntilNextWeek + firstDay);
        nextDate.setHours(hours || 0, minutes || 0, 0, 0);
        return nextDate;
      }
      
      // For other frequencies, return a default time today
      return new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    } catch (error) {
      return null;
    }
  };

  // Filter active reminders that occur today
  const activeReminders = useMemo(() => {
    const userTimezone = (userData as any)?.timezone;
    
    // Filter only active reminders (all active reminders, not just today)
    const filtered = reminders
      .map((r: any) => ({
        ...r,
        nextAt: getNextOccurrenceTime(r, userTimezone),
      }))
      .filter((r: any) => {
        if (!r.active) return false;
        // Only include reminders that have a valid next occurrence time
        return r.nextAt !== null;
      });
    
    // Sort by next occurrence time (earliest first)
    const sorted = [...filtered].sort((a, b) => {
      const timeA = a.nextAt?.getTime() || Infinity;
      const timeB = b.nextAt?.getTime() || Infinity;
      return timeA - timeB;
    });
    
    // Return next 3 reminders
    return sorted.slice(0, 3);
  }, [reminders, userData]);

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
        calendarId: event.calendarId,
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

  // Get next events (upcoming events, not just today)
  const scheduledEvents = useMemo(() => {
    if (!processedEvents || processedEvents.length === 0) return [];
    
    // Get current date for filtering
    const now = new Date();
    
    // Filter events that start from now onwards (upcoming events)
    const upcomingEvents = processedEvents.filter(event => {
      // Include events that haven't ended yet
      return event.end.getTime() >= now.getTime();
    });
    
    // Format events for display (same as calendar page)
    const formattedEvents = upcomingEvents.map((event: any) => {
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
        calendarId: event.calendarId,
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
    
    // Sort by start time (earliest first)
    formattedEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    
    return formattedEvents.slice(0, 3); // Show next 3 events
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
      <div className="mx-auto max-w-md md:max-w-4xl lg:max-w-7xl">
        {/* Header Section */}
        <div className="bg-white rounded-xl shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)]">
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
              <div className="flex-1 relative">
                {hasVerifiedWhatsApp && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Badge className="bg-green-100 text-green-700 border border-green-300 text-[11px] font-semibold px-2 py-0.5 h-auto rounded-full shadow-sm flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-green-600 flex items-center justify-center">
                        <Check className="h-2 w-2 text-white stroke-[3]" />
                      </div>
                      Connected
                    </Badge>
                  </div>
                )}
                <button
                  onClick={() =>
                    router.push(
                      hasVerifiedWhatsApp
                        ? "/settings/whatsapp"
                        : "/settings/whatsapp?from=dashboard"
                    )
                  }
                  className="w-full flex items-center justify-center gap-2 px-3 py-[10px] rounded-xl border border-[#D0D5DD] bg-white"
                >
                  <WhatsappIcon />
                  <span className="text-[14px] font-medium text-[#344054]">Link Whatsapp</span>
                </button>
              </div>
              <div className="flex-1 relative">
                {hasCalendar && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Badge className="bg-green-100 text-green-700 border border-green-300 text-[11px] font-semibold px-2 py-0.5 h-auto rounded-full shadow-sm flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-green-600 flex items-center justify-center">
                        <Check className="h-2 w-2 text-white stroke-[3]" />
                      </div>
                      Connected
                    </Badge>
                  </div>
                )}
                <button
                  onClick={() => router.push("/calendars")}
                  className="w-full flex items-center justify-center gap-2 px-3 py-[10px] rounded-xl border border-[#D0D5DD] bg-white"
                >
                  <CalendarIcon />
                  <span className="text-[14px] font-medium text-[#344054]">Link Calendar</span>
                </button>
              </div>
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

          {/* Next Events */}
          {shouldShowEvents && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-[16px] font-semibold leading-[130%] text-black">
                  Next Events
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
                    <p className="text-sm text-gray-500">No upcoming events</p>
                  </div>
                ) : (
                  scheduledEvents.map((event: any) => {
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
                        onClick={() => handleEventClick(event)}
                        onEdit={() => {
                          handleEventClick(event);
                          setTimeout(() => {
                            handleEditEvent();
                          }, 100);
                        }}
                        onDelete={() => {
                          handleDeleteEvent(event.calendarId, event.id);
                        }}
                      />
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Next Reminders */}
          {shouldShowReminders && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-[16px] font-semibold leading-[130%] text-black">
                  Next Reminders
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
                  activeReminders.map((reminder: any) => (
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

      {/* Event Details Modal */}
      <AlertDialog
        open={eventDetailsModal.open}
        onOpenChange={(open) => {
          if (!open) {
            resetEditFields();
            setEventDetailsModal({
              open: false,
              event: null,
              isEditing: false,
            });
          }
        }}
      >
        <AlertDialogContent className="w-[95vw] sm:w-full max-w-[500px] max-h-[90vh] overflow-y-auto p-6">
          <AlertDialogHeader className="pb-4 border-b border-gray-200 mb-4 px-0">
            <div className="flex items-center justify-between">
              <AlertDialogTitle className="text-lg sm:text-xl font-semibold text-black">
                {processedIndividualEvent?.title || eventDetailsModal.event?.title || "Event Details"}
              </AlertDialogTitle>
            </div>
            {eventDetailsModal.isEditing && (
              <AlertDialogDescription className="text-sm mt-2 text-gray-600">
                Edit event details. Make changes below.
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>

          {eventDetailsModal.event && (
            <div className="space-y-4 py-2">
              {individualEventQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading event details...
                  </div>
                </div>
              ) : eventDetailsModal.isEditing ? (
                /* Edit Mode */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="edit-event-title" className="text-sm font-medium">
                      Event Title
                    </label>
                    <Input
                      id="edit-event-title"
                      placeholder="Enter event title"
                      value={editEventTitle}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditEventTitle(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (
                          e.key === "Enter" &&
                          editEventTitle.trim() &&
                          editEventDate &&
                          eventDetailsModal.event?.calendarId
                        ) {
                          handleSaveEdit();
                        }
                      }}
                      className="text-sm sm:text-base"
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
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditEventDate(e.target.value)}
                        className="text-sm sm:text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="edit-event-time" className="text-sm font-medium">
                        Time
                      </label>
                      <TimePicker
                        id="edit-event-time"
                        value={editEventTime}
                        onChange={setEditEventTime}
                      />
                    </div>
                  </div>

                  {/* Address Selection */}
                  <div className="space-y-2">
                    <label htmlFor="edit-event-address" className="text-sm font-medium">
                      Address (optional)
                    </label>

                    {/* Saved Addresses Dropdown */}
                    {addresses.length > 0 && (
                      <div className="space-y-2">
                        <Select
                          value={editEventAddressId}
                          onValueChange={(value) => {
                            setEditEventAddressId(value);
                            if (value) {
                              const selectedAddr = addresses.find((addr: any) => addr.id === value);
                              if (selectedAddr) {
                                const components = {
                                  street: selectedAddr.street ?? undefined,
                                  city: selectedAddr.city ?? undefined,
                                  state: selectedAddr.state ?? undefined,
                                  zip: selectedAddr.zip ?? undefined,
                                  country: selectedAddr.country ?? undefined,
                                };
                                setEditAddressComponents(components);
                                
                                const fullAddress = formatFullAddress(components);
                                
                                if (!fullAddress && selectedAddr.latitude != null && selectedAddr.longitude != null) {
                                  setEditEventCoordinates(`${selectedAddr.latitude}, ${selectedAddr.longitude}`);
                                  if (window.google?.maps) {
                                    const geocoder = new window.google.maps.Geocoder();
                                    geocoder.geocode(
                                      { location: { lat: selectedAddr.latitude, lng: selectedAddr.longitude } },
                                      (results: any, status: string) => {
                                        if (status === "OK" && results?.[0]) {
                                          setEditEventAddress(results[0].formatted_address);
                                        } else {
                                          setEditEventAddress(selectedAddr.name || "");
                                        }
                                      }
                                    );
                                  } else {
                                    setEditEventAddress(selectedAddr.name || "");
                                  }
                                } else {
                                  setEditEventAddress(fullAddress || selectedAddr.name || "");
                                }
                                
                                if (selectedAddr.latitude != null && selectedAddr.longitude != null) {
                                  setEditEventCoordinates(`${selectedAddr.latitude}, ${selectedAddr.longitude}`);
                                }
                              }
                            } else {
                              setEditEventAddress("");
                              setEditEventCoordinates("");
                              setEditAddressComponents({});
                            }
                          }}
                        >
                          <SelectTrigger className="w-full text-sm sm:text-base">
                            <SelectValue placeholder="Select from saved addresses" />
                          </SelectTrigger>
                          <SelectContent>
                            {addresses.map((address: any) => (
                              <SelectItem key={address.id} value={address.id}>
                                {address.name} - {[
                                  address.street,
                                  address.city,
                                  address.state,
                                  address.country,
                                ].filter(Boolean).join(", ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <div className="h-px bg-gray-200 flex-1"></div>
                          <span className="text-xs text-gray-500 bg-white px-2">or</span>
                          <div className="h-px bg-gray-200 flex-1"></div>
                        </div>
                      </div>
                    )}

                    {/* Address Input */}
                    <div className="space-y-2">
                      <div className="relative">
                        <Input
                          id="edit-event-address"
                          placeholder="Type or paste the full address"
                          value={editEventAddress}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleEditAddressPaste(e.target.value)
                          }
                          className="h-20 pr-10"
                        />
                        {editIsGeocoding && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        You can also paste a Google Maps link here. Your backend can normalise it and store the coordinates.
                      </p>
                    </div>

                    {/* Coordinates Input */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="edit-event-coordinates" className="text-sm font-medium">
                          Pin / coordinates (optional)
                        </Label>
                        <button
                          type="button"
                          className={cn(
                            "text-sm font-medium transition-colors",
                            editEnableDropPin
                              ? "text-red-600 hover:text-red-700"
                              : "text-blue-600 hover:text-blue-700"
                          )}
                          onClick={() => {
                            if (editEnableDropPin) {
                              setEditEnableDropPin(false);
                              toast({
                                title: "Drop pin cancelled",
                                description: "Click 'Drop pin on map' again to enable.",
                              });
                            } else {
                              if (window.google?.maps) {
                                setEditEnableDropPin(true);
                                toast({
                                  title: "Drop pin enabled",
                                  description: "Click anywhere on the map to drop a pin.",
                                });
                              } else {
                                toast({
                                  title: "Google Maps not loaded",
                                  description: "Please wait for Google Maps to load, or enter coordinates manually.",
                                  variant: "destructive",
                                });
                              }
                            }
                          }}
                        >
                          {editEnableDropPin ? "Cancel drop pin" : "Drop pin on map"}
                        </button>
                      </div>
                      <Input
                        id="edit-event-coordinates"
                        placeholder="e.g. -34.0822, 18.8501"
                        value={editEventCoordinates}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setEditEventCoordinates(e.target.value);
                          if (e.target.value.trim() && window.google?.maps) {
                            const { lat, lng } = parseCoordinates(e.target.value);
                            if (lat && lng) {
                              setEditIsGeocoding(true);
                              const geocoder = new window.google.maps.Geocoder();
                              geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
                                setEditIsGeocoding(false);
                                if (status === "OK" && results?.[0]) {
                                  const result = results[0];
                                  setEditEventAddress(result.formatted_address);

                                  const components: {
                                    street?: string;
                                    city?: string;
                                    state?: string;
                                    zip?: string;
                                    country?: string;
                                  } = {};

                                  if (result.address_components) {
                                    result.address_components.forEach((component: any) => {
                                      const types = component.types;

                                      if (types.includes("street_number") || types.includes("route")) {
                                        const streetNumber = result.address_components.find((c: any) => c.types.includes("street_number"))?.long_name || "";
                                        const route = result.address_components.find((c: any) => c.types.includes("route"))?.long_name || "";
                                        components.street = [streetNumber, route].filter(Boolean).join(" ").trim();
                                      }

                                      if (types.includes("locality")) {
                                        components.city = component.long_name;
                                      } else if (types.includes("administrative_area_level_1")) {
                                        components.state = component.long_name;
                                      } else if (types.includes("postal_code")) {
                                        components.zip = component.long_name;
                                      } else if (types.includes("country")) {
                                        components.country = component.long_name;
                                      }
                                    });
                                  }

                                  setEditAddressComponents(components);
                                }
                              });
                            }
                          }
                        }}
                        className="text-sm"
                      />
                      {editEnableDropPin && (
                        <div className="mt-4">
                          <div className="mb-2">
                            <p className="text-sm text-blue-600 font-medium mb-1">
                              Click on the map below to drop a pin
                            </p>
                            <p className="text-xs text-gray-500">
                              The coordinates and address will be automatically filled in.
                            </p>
                          </div>
                          <GoogleMap
                            lat={null}
                            lng={null}
                            address=""
                            enableClickToDrop={true}
                            onPinDrop={handleEditPinDrop}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant={editCreateGoogleMeet ? "default" : "outline"}
                    onClick={() => setEditCreateGoogleMeet(!editCreateGoogleMeet)}
                    className={editCreateGoogleMeet ? "w-full sm:w-auto bg-primary text-primary-foreground hover:font-bold hover:bg-primary" : "w-full sm:w-auto"}
                  >
                    <Video className="h-4 w-4 mr-2" />
                    {editCreateGoogleMeet ? "Google Meet Added" : "Add Google Meet"}
                  </Button>

                  {/* Attendees Section */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Attendees (optional)
                    </label>
                    <p className="text-xs text-gray-500">
                      Add people to invite to this event. Google Calendar requires email addresses.
                    </p>
                    
                    {/* Select from Friends */}
                    {friends.length > 0 && (
                      <div className="space-y-2">
                        <Select
                          value=""
                          onValueChange={(friendId) => {
                            const friend = friends.find((f: any) => f.id === friendId);
                            if (friend && friend.email && !editEventAttendees.includes(friend.email)) {
                              setEditEventAttendees([...editEventAttendees, friend.email]);
                            }
                          }}
                        >
                          <SelectTrigger className="w-full text-sm">
                            <SelectValue placeholder="Select from friends" />
                          </SelectTrigger>
                          <SelectContent>
                            {friends
                              .filter((f: any) => f.email && !editEventAttendees.includes(f.email))
                              .map((friend: any) => (
                                <SelectItem key={friend.id} value={friend.id}>
                                  {friend.name} {friend.email ? `(${friend.email})` : ''}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Email/Phone Entry with Autocomplete */}
                    <Popover open={editAttendeeSearchOpen} onOpenChange={setEditAttendeeSearchOpen}>
                      <div className="flex gap-2">
                        <PopoverTrigger asChild>
                          <div className="relative flex-1">
                            <Input
                              type="text"
                              placeholder="Type email or phone to search users..."
                              value={editManualAttendeeInput}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                const value = e.target.value;
                                setEditManualAttendeeInput(value);
                                setEditAttendeeSearchTerm(value);
                                if (value.length >= 2) {
                                  setEditAttendeeSearchOpen(true);
                                }
                              }}
                              onFocus={() => {
                                if (editManualAttendeeInput.length >= 2) {
                                  setEditAttendeeSearchOpen(true);
                                }
                              }}
                              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === "Enter" && editManualAttendeeInput.trim()) {
                                  e.preventDefault();
                                  handleAddEditAttendee(editManualAttendeeInput.trim());
                                } else if (e.key === "Escape") {
                                  setEditAttendeeSearchOpen(false);
                                }
                              }}
                              className="text-sm"
                            />
                          </div>
                        </PopoverTrigger>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (editManualAttendeeInput.trim()) {
                              handleAddEditAttendee(editManualAttendeeInput.trim());
                            }
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search by email or phone..."
                            value={editAttendeeSearchTerm}
                            onValueChange={setEditAttendeeSearchTerm}
                          />
                          <CommandList>
                            {isEditSearchingUsers && (
                              <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            )}
                            {!isEditSearchingUsers && editSearchedUsers.length > 0 && (
                              <CommandGroup heading="Users">
                                {editSearchedUsers
                                  .filter((user: any) => {
                                    const email = user.email?.toLowerCase() || "";
                                    return email && !editEventAttendees.includes(email);
                                  })
                                  .map((user: any) => {
                                    const displayName = user.firstName && user.lastName
                                      ? `${user.firstName} ${user.lastName}`
                                      : user.name || user.email || "Unknown";
                                    const email = user.email?.toLowerCase() || "";
                                    return (
                                      <CommandItem
                                        key={user.id}
                                        value={user.id}
                                        onSelect={() => {
                                          if (email && !editEventAttendees.includes(email)) {
                                            setEditEventAttendees([...editEventAttendees, email]);
                                            setEditManualAttendeeInput("");
                                            setEditAttendeeSearchTerm("");
                                            setEditAttendeeSearchOpen(false);
                                          }
                                        }}
                                        className="flex items-center gap-2 cursor-pointer"
                                      >
                                        {user.avatarUrl ? (
                                          <img
                                            src={user.avatarUrl}
                                            alt={displayName}
                                            className="h-6 w-6 rounded-full"
                                          />
                                        ) : (
                                          <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center">
                                            <User className="h-4 w-4 text-gray-500" />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm truncate">{displayName}</div>
                                          <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                                            {email && (
                                              <>
                                                <Mail className="h-3 w-3" />
                                                {email}
                                              </>
                                            )}
                                            {user.phone && (
                                              <>
                                                {email && <span className="mx-1">•</span>}
                                                <Phone className="h-3 w-3" />
                                                {user.phone}
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                              </CommandGroup>
                            )}
                            {!isEditSearchingUsers && editAttendeeSearchTerm.length >= 2 && editSearchedUsers.length === 0 && (
                              <CommandEmpty>
                                <div className="py-4 text-center text-sm text-gray-500">
                                  No users found. You can still add "{editAttendeeSearchTerm}" as an email address.
                                </div>
                              </CommandEmpty>
                            )}
                            {!isEditSearchingUsers && editAttendeeSearchTerm.length >= 2 && (
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    handleAddEditAttendee(editAttendeeSearchTerm);
                                  }}
                                  className="flex items-center gap-2 cursor-pointer text-blue-600"
                                >
                                  <Plus className="h-4 w-4" />
                                  <span>Add "{editAttendeeSearchTerm}" as email</span>
                                </CommandItem>
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    {/* Selected Attendees List */}
                    {editEventAttendees.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700">Selected attendees:</p>
                        <div className="flex flex-wrap gap-2">
                          {editEventAttendees.map((email: string, index: number) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="flex items-center gap-1 px-2 py-1"
                            >
                              <span className="text-xs">{email}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditEventAttendees(editEventAttendees.filter((_: string, i: number) => i !== index));
                                }}
                                className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Color
                    </label>
                    <div className="grid grid-cols-6 gap-2 p-2">
                      {[
                        { value: "blue", color: "bg-blue-500" },
                        { value: "green", color: "bg-green-500" },
                        { value: "purple", color: "bg-purple-500" },
                        { value: "red", color: "bg-red-500" },
                        { value: "yellow", color: "bg-yellow-500" },
                        { value: "orange", color: "bg-orange-500" },
                        { value: "turquoise", color: "bg-cyan-500" },
                        { value: "gray", color: "bg-gray-500" },
                        { value: "bold-blue", color: "bg-blue-700" },
                        { value: "bold-green", color: "bg-green-700" },
                        { value: "bold-red", color: "bg-red-700" },
                      ].map(({ value, color }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setEditEventColor(value)}
                          className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                            editEventColor === value
                              ? "border-gray-800 scale-110"
                              : "border-gray-300 hover:border-gray-500"
                          } ${color}`}
                          title={value.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase())}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div className="px-0 py-2">
                  {(() => {
                    const event = processedIndividualEvent || eventDetailsModal.event;
                    if (!event) return null;
                    
                    // Normalize attendees
                    const normalizedAttendees = (() => {
                      if (!event?.attendees || !Array.isArray(event.attendees)) return [];
                      return event.attendees
                        .map((attendee: any) => {
                          if (typeof attendee === 'string') return attendee;
                          if (attendee && typeof attendee === 'object' && attendee.email) return attendee.email;
                          if (attendee && typeof attendee === 'object') {
                            return attendee.email || attendee.mail || attendee.emailAddress || null;
                          }
                          return null;
                        })
                        .filter((email: string | null): email is string => email !== null && email.trim().length > 0);
                    })();
                    
                    const displayAttendees = normalizedAttendees.slice(0, 2);
                    const additionalCount = normalizedAttendees.length > 2 ? normalizedAttendees.length - 2 : 0;
                    
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

                    const conferenceUrl = event?.conferenceUrl || '';
                    const isMicrosoftTeams = conferenceUrl.includes('teams.microsoft.com') || 
                                            conferenceUrl.includes('teams.live.com') ||
                                            conferenceUrl.includes('microsoft.com/meet');
                    const isGoogleMeet = conferenceUrl.includes('meet.google.com');
                    
                    // Format time as "05:00 PM"
                    const formatTimeForDisplay = () => {
                      if (!event?.start) return "N/A";
                      const date = new Date(event.start);
                      const timezone = event.userTimezone || processedIndividualEvent?.userTimezone || 'America/New_York';
                      
                      // Format time in 12-hour format
                      const timeStr = new Intl.DateTimeFormat('en-US', {
                        timeZone: timezone,
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      }).format(date);
                      
                      return timeStr;
                    };

                    return (
                      <div className="space-y-5">
                        {/* Time */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Time</span>
                          <span className="text-sm font-normal text-black">{formatTimeForDisplay()}</span>
                        </div>

                        {/* Attendees */}
                        {displayAttendees.length > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-500">Attendees</span>
                            <div className="flex items-center gap-1 px-1 pr-2 py-1 rounded-[114px] border border-[#EBEBEB] bg-white">
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
                          </div>
                        )}

                        {/* Platform */}
                        {conferenceUrl && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-500">Platform</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isMicrosoftTeams) {
                                  // Microsoft Teams links - ensure they open correctly
                                  const teamsUrl = conferenceUrl.startsWith('http') 
                                    ? conferenceUrl 
                                    : `https://${conferenceUrl}`;
                                  window.open(teamsUrl, '_blank', 'noopener,noreferrer');
                                } else {
                                  window.open(conferenceUrl, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              className="flex items-center gap-1 px-[7px] py-1 rounded border border-black/10 bg-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                              {isMicrosoftTeams ? (
                                <MicrosoftIcon className="w-3 h-[10px]" />
                              ) : isGoogleMeet ? (
                                <img src="/google_meet.png" alt="Google Meet" className="w-3 h-[10px] object-contain" />
                              ) : (
                                <Video className="w-3 h-[10px] text-[#9999A5]" />
                              )}
                              <span className="text-[10px] font-medium text-[#9999A5] lowercase">
                                {isMicrosoftTeams ? 'Microsoft Teams' : isGoogleMeet ? 'Google meet' : 'Meeting'}
                              </span>
                            </button>
                          </div>
                        )}

                        {/* Venue */}
                        {event?.location && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-500">Venue</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const location = event.location;
                                if (location) {
                                  const coordMatch = location.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
                                  if (coordMatch) {
                                    const lat = coordMatch[1];
                                    const lng = coordMatch[2];
                                    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                                  } else {
                                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, '_blank');
                                  }
                                }
                              }}
                              className="text-sm font-normal text-black hover:text-blue-600 hover:underline text-right max-w-[60%] sm:max-w-none truncate"
                            >
                              {event.location}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter className="flex-row gap-3 pt-4 border-t border-gray-200 mt-6 px-0">
            {eventDetailsModal.isEditing ? (
              <>
                <AlertDialogCancel
                  onClick={handleCancelEdit}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg"
                >
                  Cancel
                </AlertDialogCancel>
                <Button
                  onClick={handleSaveEdit}
                  disabled={updateEventMutation.isPending || !editEventTitle.trim()}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg"
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
              </>
            ) : (
              <>
                <AlertDialogCancel
                  onClick={() => {
                    resetEditFields();
                    setEventDetailsModal({
                      open: false,
                      event: null,
                      isEditing: false,
                    });
                  }}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg mt-0"
                >
                  Cancel
                </AlertDialogCancel>
                <Button
                  onClick={() => {
                    if (eventDetailsModal.event) {
                      router.push("/calendars");
                      setEventDetailsModal({ open: false, event: null, isEditing: false });
                    }
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  View in Events
                </Button>
              </>
            )}
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
      <div className="relative flex items-start">
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center justify-between w-full gap-2">
            <div className="text-[32px] font-medium leading-none tracking-[-1.28px] text-black">
              {number}
            </div>
            <div className="w-8 h-8 flex items-center justify-center rounded-[19px]" style={{ background: iconBg }}>
              {icon}
            </div>
          </div>
          <div className="text-[12px] font-normal tracking-[-0.48px] text-[#4C4C4C]">
            {label}
          </div>
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

function EventCard({ borderColor, bgColor, event, onClick, onEdit, onDelete }: { borderColor: string; bgColor: string; event: any; onClick?: () => void; onEdit?: () => void; onDelete?: () => void }) {
  // Normalize attendees - handle both string arrays and object arrays with email property
  const normalizedAttendees = useMemo(() => {
    if (!event?.attendees || !Array.isArray(event.attendees)) return [];
    return event.attendees
      .map((attendee: any) => {
        // If it's a string, use it directly
        if (typeof attendee === 'string') return attendee;
        // If it's an object with email property, extract the email
        if (attendee && typeof attendee === 'object' && attendee.email) return attendee.email;
        // If it's an object with other properties, try to find email
        if (attendee && typeof attendee === 'object') {
          // Check common email property names
          return attendee.email || attendee.mail || attendee.emailAddress || null;
        }
        return null;
      })
      .filter((email: string | null): email is string => email !== null && email.trim().length > 0);
  }, [event?.attendees]);

  // Get first 2 attendees for display
  const displayAttendees = normalizedAttendees.slice(0, 2);
  const additionalCount = normalizedAttendees.length > 2 ? normalizedAttendees.length - 2 : 0;
  
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

  const handleConferenceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (event?.conferenceUrl) {
      window.open(event.conferenceUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Detect meeting type from conferenceUrl
  const conferenceUrl = event?.conferenceUrl || '';
  const isMicrosoftTeams = conferenceUrl.includes('teams.microsoft.com') || 
                          conferenceUrl.includes('teams.live.com') ||
                          conferenceUrl.includes('microsoft.com/meet');
  const isGoogleMeet = conferenceUrl.includes('meet.google.com');
  const meetingLabel = isMicrosoftTeams ? 'Microsoft Teams' : isGoogleMeet ? 'Google meet' : 'Meeting';

  // Handle location click
  const handleLocationClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (event?.location) {
      const location = event.location;
      // Try to extract coordinates from the location string
      const coordMatch = location.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (coordMatch) {
        // If coordinates are found, use them for Google Maps
        const lat = coordMatch[1];
        const lng = coordMatch[2];
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
      } else {
        // Otherwise, search for the location text
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't trigger if clicking on interactive elements
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
      return;
    }
    onClick?.();
  };

  const handleMoreClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="flex justify-between items-start p-4 rounded-xl border shadow-[0_2px_24px_0_rgba(0,0,0,0.05)] cursor-pointer" 
      style={{ borderColor, background: bgColor }}
      onClick={handleCardClick}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-[15px] font-medium leading-[130%] text-[#1D2228]">
              {event?.title || "Event"}
            </span>
            {event?.conferenceUrl && (
              <button
                onClick={handleConferenceClick}
                className="flex items-center gap-1 px-[7px] py-1 rounded border border-black/10 bg-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                title={`Join ${meetingLabel}`}
              >
                {isMicrosoftTeams ? (
                  <MicrosoftIcon className="w-3 h-[10px]" />
                ) : (
                  <Video className="w-3 h-[10px] text-[#9999A5]" />
                )}
                <span className="text-[10px] font-medium text-[#9999A5]">{meetingLabel}</span>
              </button>
            )}
          </div>
          <div className="text-[12px] font-normal text-black/40">
            {event?.timeRange || "9AM -10PM (EST)"}
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

        {event?.location && (
          <button
            onClick={handleLocationClick}
            className="flex items-center gap-[2px] hover:opacity-80 transition-opacity cursor-pointer text-left"
          >
            <LocationIcon />
            <span className="text-[12px] font-normal text-black/40">
              {event.location}
            </span>
          </button>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            className="text-[#9B9BA7] hover:opacity-80 transition-opacity"
            onClick={handleMoreClick}
          >
            <MoreVertIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40 rounded-lg">
          {onEdit && (
            <DropdownMenuItem
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex items-center gap-2 cursor-pointer rounded-md"
            >
              <Edit3 className="h-4 w-4" />
              <span>Edit</span>
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              {onEdit && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 rounded-md"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="mask0_208_934" style={{ maskType: "alpha" as const }} maskUnits="userSpaceOnUse" x="0" y="0" width="14" height="14">
<rect width="14" height="14" fill="#D9D9D9"/>
</mask>
<g mask="url(#mask0_208_934)">
<path d="M6.99992 12.4396C6.86381 12.4396 6.7277 12.4153 6.59159 12.3667C6.45547 12.3181 6.33395 12.2451 6.227 12.1479C5.59506 11.5646 5.03603 10.9958 4.54992 10.4417C4.06381 9.8875 3.6579 9.35034 3.33221 8.83021C3.00652 8.31007 2.7586 7.80937 2.58846 7.32812C2.41832 6.84687 2.33325 6.3875 2.33325 5.95C2.33325 4.49166 2.80235 3.32986 3.74054 2.46458C4.67874 1.5993 5.7652 1.16666 6.99992 1.16666C8.23464 1.16666 9.3211 1.5993 10.2593 2.46458C11.1975 3.32986 11.6666 4.49166 11.6666 5.95C11.6666 6.3875 11.5815 6.84687 11.4114 7.32812C11.2412 7.80937 10.9933 8.31007 10.6676 8.83021C10.3419 9.35034 9.93603 9.8875 9.44992 10.4417C8.96381 10.9958 8.40478 11.5646 7.77283 12.1479C7.66589 12.2451 7.54436 12.3181 7.40825 12.3667C7.27214 12.4153 7.13603 12.4396 6.99992 12.4396ZM6.99992 7C7.32075 7 7.5954 6.88576 7.82388 6.65729C8.05235 6.42882 8.16658 6.15416 8.16658 5.83333C8.16658 5.5125 8.05235 5.23784 7.82388 5.00937C7.5954 4.7809 7.32075 4.66666 6.99992 4.66666C6.67909 4.66666 6.40443 4.7809 6.17596 5.00937C5.94749 5.23784 5.83325 5.5125 5.83325 5.83333C5.83325 6.15416 5.94749 6.42882 6.17596 6.65729C6.40443 6.88576 6.67909 7 6.99992 7Z" fill="#3C84F6"/>
</g>
</svg>

  );
}

function ClockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="mask0_208_1310" style={{ maskType: "alpha" as const }} maskUnits="userSpaceOnUse" x="0" y="0" width="17" height="17">
<rect width="17" height="17" fill="#D9D9D9"/>
</mask>
<g mask="url(#mask0_208_1310)">
<path d="M9.20842 8.62395L10.8022 10.2177C10.932 10.3476 10.997 10.5099 10.997 10.7047C10.997 10.8995 10.932 11.0677 10.8022 11.2094C10.6605 11.351 10.4923 11.4219 10.2975 11.4219C10.1027 11.4219 9.93446 11.351 9.79279 11.2094L8.00425 9.42082C7.93342 9.34999 7.88029 9.2703 7.84487 9.18176C7.80946 9.09322 7.79175 9.00173 7.79175 8.90728V6.37499C7.79175 6.1743 7.85963 6.00607 7.99539 5.8703C8.13116 5.73454 8.29939 5.66666 8.50008 5.66666C8.70078 5.66666 8.86901 5.73454 9.00477 5.8703C9.14053 6.00607 9.20842 6.1743 9.20842 6.37499V8.62395ZM8.50008 4.24999C8.29939 4.24999 8.13116 4.18211 7.99539 4.04634C7.85963 3.91058 7.79175 3.74235 7.79175 3.54166V2.83332H9.20842V3.54166C9.20842 3.74235 9.14053 3.91058 9.00477 4.04634C8.86901 4.18211 8.70078 4.24999 8.50008 4.24999ZM12.7501 8.49999C12.7501 8.2993 12.818 8.13107 12.9537 7.9953C13.0895 7.85954 13.2577 7.79166 13.4584 7.79166H14.1667V9.20832H13.4584C13.2577 9.20832 13.0895 9.14044 12.9537 9.00468C12.818 8.86891 12.7501 8.70068 12.7501 8.49999ZM8.50008 12.75C8.70078 12.75 8.86901 12.8179 9.00477 12.9536C9.14053 13.0894 9.20842 13.2576 9.20842 13.4583V14.1667H7.79175V13.4583C7.79175 13.2576 7.85963 13.0894 7.99539 12.9536C8.13116 12.8179 8.29939 12.75 8.50008 12.75ZM4.25008 8.49999C4.25008 8.70068 4.1822 8.86891 4.04644 9.00468C3.91067 9.14044 3.74244 9.20832 3.54175 9.20832H2.83341V7.79166H3.54175C3.74244 7.79166 3.91067 7.85954 4.04644 7.9953C4.1822 8.13107 4.25008 8.2993 4.25008 8.49999ZM8.50008 15.5833C7.52022 15.5833 6.59939 15.3974 5.73758 15.0255C4.87578 14.6536 4.12612 14.1489 3.48862 13.5114C2.85112 12.8739 2.34644 12.1243 1.97456 11.2625C1.60269 10.4007 1.41675 9.47985 1.41675 8.49999C1.41675 7.52013 1.60269 6.5993 1.97456 5.73749C2.34644 4.87568 2.85112 4.12603 3.48862 3.48853C4.12612 2.85103 4.87578 2.34634 5.73758 1.97447C6.59939 1.60259 7.52022 1.41666 8.50008 1.41666C9.47994 1.41666 10.4008 1.60259 11.2626 1.97447C12.1244 2.34634 12.874 2.85103 13.5115 3.48853C14.149 4.12603 14.6537 4.87568 15.0256 5.73749C15.3975 6.5993 15.5834 7.52013 15.5834 8.49999C15.5834 9.47985 15.3975 10.4007 15.0256 11.2625C14.6537 12.1243 14.149 12.8739 13.5115 13.5114C12.874 14.1489 12.1244 14.6536 11.2626 15.0255C10.4008 15.3974 9.47994 15.5833 8.50008 15.5833ZM14.1667 8.49999C14.1667 6.91805 13.6178 5.57812 12.5199 4.4802C11.422 3.38228 10.082 2.83332 8.50008 2.83332C6.91814 2.83332 5.57821 3.38228 4.48029 4.4802C3.38237 5.57812 2.83341 6.91805 2.83341 8.49999C2.83341 10.0819 3.38237 11.4219 4.48029 12.5198C5.57821 13.6177 6.91814 14.1667 8.50008 14.1667C10.082 14.1667 11.422 13.6177 12.5199 12.5198C13.6178 11.4219 14.1667 10.0819 14.1667 8.49999Z" fill="#6D6DE2"/>
</g>
</svg>

  );
}

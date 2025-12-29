"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { Label } from "@imaginecalendar/ui/label";
import { Checkbox } from "@imaginecalendar/ui/checkbox";
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
  MapPin,
  X,
  Loader2,
  Video,
} from "lucide-react";

// Google Maps component
declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

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

// Google Maps component
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
  const maxInitAttempts = 20; // 2 seconds max (20 * 100ms)

  // Initialize map when Google Maps is available
  useEffect(() => {
    if (!window.google?.maps) {
      setMapInitialized(false);
      return;
    }

    // If no coordinates but click-to-drop is enabled, show map centered on a default location
    const hasValidCoords = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);

    // If no valid coordinates and click-to-drop is not enabled, don't initialize
    if (!hasValidCoords && !enableClickToDrop) {
      setMapInitialized(false);
      if (mapInstanceRef.current) {
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
      return;
    }

    // Reset attempts when coordinates change
    initAttemptsRef.current = 0;
    setMapInitialized(false);

    // Wait for DOM element to be available
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
        // Determine center and zoom
        // Use a reasonable default center (center of world map) if no coordinates
        const centerLat = hasValidCoords ? lat : 20;
        const centerLng = hasValidCoords ? lng : 0;
        const zoom = hasValidCoords ? 15 : 3; // Zoom out if no coordinates, but not too much

        // Create or update map
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

          // Wait for map to be ready - use both idle and tilesloaded events
          let mapReady = false;
          const onMapReady = () => {
            if (!mapReady) {
              mapReady = true;
              setMapInitialized(true);
              setMapError(null);

              // Add click listener AFTER map is ready
              if (enableClickToDrop && onPinDrop) {
                // Remove existing listener if any
                if (clickListenerRef.current) {
                  window.google.maps.event.removeListener(clickListenerRef.current);
                }
                // Add click listener
                try {
                  clickListenerRef.current = mapInstanceRef.current.addListener('click', (e: any) => {
                    if (e && e.latLng && onPinDrop) {
                      try {
                        const clickedLat = e.latLng.lat();
                        const clickedLng = e.latLng.lng();
                        console.log('Map clicked at:', clickedLat, clickedLng);
                        if (typeof clickedLat === 'number' && typeof clickedLng === 'number' && !isNaN(clickedLat) && !isNaN(clickedLng)) {
                          onPinDrop(clickedLat, clickedLng);
                        } else {
                          console.error('Invalid coordinates from click:', clickedLat, clickedLng);
                        }
                      } catch (error) {
                        console.error('Error handling map click:', error);
                      }
                    } else {
                      console.warn('Map click event missing latLng:', e);
                    }
                  });
                  console.log('Click listener added for drop pin, enableClickToDrop:', enableClickToDrop, 'onPinDrop:', !!onPinDrop);
                } catch (error) {
                  console.error('Error adding click listener:', error);
                }
              }
            }
          };

          mapInstanceRef.current.addListener('idle', onMapReady);
          mapInstanceRef.current.addListener('tilesloaded', onMapReady);

          // Fallback: set initialized after a short delay if events don't fire
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

        // Create or update marker only if we have valid coordinates
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
          // Remove marker if no valid coordinates
          markerRef.current.setMap(null);
        }

        setMapError(null);
      } catch (error) {
        console.error("GoogleMap: Error initializing map:", error);
        setMapError(`Failed to initialize map: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setMapInitialized(false);
      }
    };

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(initMap, 100);
    return () => {
      clearTimeout(timeoutId);
      // Clean up click listener
      if (clickListenerRef.current) {
        window.google?.maps?.event?.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [lat, lng, address, enableClickToDrop, onPinDrop]);

  // Update click listener when enableClickToDrop changes (for existing maps)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps || !mapInitialized) return;

    // Remove existing listener
    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current);
      clickListenerRef.current = null;
    }

    // Add new listener if enabled
    if (enableClickToDrop && onPinDrop) {
      try {
        clickListenerRef.current = mapInstanceRef.current.addListener('click', (e: any) => {
          if (e && e.latLng && onPinDrop) {
            try {
              const clickedLat = e.latLng.lat();
              const clickedLng = e.latLng.lng();
              console.log('Map clicked at:', clickedLat, clickedLng);
              if (typeof clickedLat === 'number' && typeof clickedLng === 'number' && !isNaN(clickedLat) && !isNaN(clickedLng)) {
                onPinDrop(clickedLat, clickedLng);
              } else {
                console.error('Invalid coordinates from click:', clickedLat, clickedLng);
              }
            } catch (error) {
              console.error('Error handling map click:', error);
            }
          } else {
            console.warn('Map click event missing latLng:', e);
          }
        });
        console.log('Click listener updated for drop pin, enableClickToDrop:', enableClickToDrop, 'onPinDrop:', !!onPinDrop);
      } catch (error) {
        console.error('Error adding click listener:', error);
      }
    } else {
      console.log('Click listener removed (drop pin disabled)');
    }

    return () => {
      if (clickListenerRef.current) {
        window.google?.maps?.event?.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [enableClickToDrop, onPinDrop, mapInitialized]);

  // Show placeholder if no coordinates and click-to-drop is not enabled
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

  // Show loading state
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

  // Show error state
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

  // Show map
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
  const [eventLocation, setEventLocation] = useState("");
  const [eventAddressId, setEventAddressId] = useState<string>("");
  const [eventAddress, setEventAddress] = useState("");
  const [eventCoordinates, setEventCoordinates] = useState("");
  const [enableDropPin, setEnableDropPin] = useState(false);
  const [addressComponents, setAddressComponents] = useState<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  }>({});
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [autocomplete, setAutocomplete] = useState<any>(null);
  const autocompleteRef = useRef<any>(null);
  const [createGoogleMeet, setCreateGoogleMeet] = useState(false);
  const [eventColor, setEventColor] = useState("blue");
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

  // Update edit form fields when fresh event data loads
  useEffect(() => {
    if (individualEventQuery.data && eventDetailsModal.isEditing) {
      const freshEvent = individualEventQuery.data;

      // Update edit form with fresh data
      setEditEventTitle(freshEvent.title || "");
      setEditEventLocation(freshEvent.location || "");

      // Reset address fields
      setEditEventAddressId("");
      setEditEventAddress(freshEvent.location || "");
      setEditEventCoordinates("");
      setEditEnableDropPin(false);
      setEditAddressComponents({});

      // Set Google Meet status based on fresh data
      setEditCreateGoogleMeet(!!freshEvent.conferenceUrl);

      // Set color based on fresh data
      setEditEventColor(freshEvent.color || "blue");

      // Format date and time for form inputs
      if (freshEvent.start) {
        const eventDate = new Date(freshEvent.start);
        const dateStr = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = eventDate.toTimeString().slice(0, 5); // HH:MM

        setEditEventDate(dateStr || "");
        setEditEventTime(timeStr || "");
      } else {
        setEditEventDate("");
        setEditEventTime("");
      }
    }
  }, [individualEventQuery.data, eventDetailsModal.isEditing]);

  const [dayDetailsModal, setDayDetailsModal] = useState<{
    open: boolean;
    date: Date | null;
    events: any[];
  }>({
    open: false,
    date: null,
    events: [],
  });

  // Mobile day selection state
  const [selectedMobileDay, setSelectedMobileDay] = useState<{
    date: Date | null;
    events: any[];
  }>({
    date: null,
    events: [],
  });

  // Mobile sidebar state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

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

  // Fetch user's calendars
  const { data: calendars = [], isLoading, refetch } = useQuery(
    trpc.calendar.list.queryOptions()
  );

  // Fetch addresses
  const { data: addresses = [] } = useQuery(trpc.addresses.list.queryOptions());

  // Parse coordinates from string
  const parseCoordinates = (coordString: string | undefined): { lat: number | null; lng: number | null } => {
    if (!coordString || !coordString.trim()) return { lat: null, lng: null };

    // Try to parse "lat, lng" format
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

  // Handle pin drop from map click for create event
  const handlePinDrop = (lat: number, lng: number) => {
    setEventCoordinates(`${lat}, ${lng}`);
    setEnableDropPin(false);

    // Perform reverse geocoding
    if (window.google?.maps) {
      setIsGeocoding(true);
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
        setIsGeocoding(false);
        if (status === "OK" && results?.[0]) {
          const result = results[0];
          setEventAddress(result.formatted_address);

          // Extract address components
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

          setAddressComponents(components);

          toast({
            title: "Pin dropped",
            description: "Location captured. You can now save it.",
          });
        } else {
          toast({
            title: "Address lookup failed",
            description: "Coordinates captured, but couldn't find the address. You can still save the location.",
            variant: "default",
          });
        }
      });
    } else {
      toast({
        title: "Pin dropped",
        description: "Coordinates captured. You can now save it.",
      });
    }
  };

  // Handle pin drop from map click for edit event
  const handleEditPinDrop = (lat: number, lng: number) => {
    setEditEventCoordinates(`${lat}, ${lng}`);
    setEditEnableDropPin(false);

    // Perform reverse geocoding
    if (window.google?.maps) {
      setEditIsGeocoding(true);
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
        setEditIsGeocoding(false);
        if (status === "OK" && results?.[0]) {
          const result = results[0];
          setEditEventAddress(result.formatted_address);

          // Extract address components
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

          toast({
            title: "Pin dropped",
            description: "Location captured. You can now save it.",
          });
        } else {
          toast({
            title: "Address lookup failed",
            description: "Coordinates captured, but couldn't find the address. You can still save the location.",
            variant: "default",
          });
        }
      });
    } else {
      toast({
        title: "Pin dropped",
        description: "Coordinates captured. You can now save it.",
      });
    }
  };

  // Handle address paste/input
  const handleAddressPaste = (value: string) => {
    setEventAddress(value);

    // Try to extract coordinates from Google Maps link
    const googleMapsRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = value.match(googleMapsRegex);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        setEventCoordinates(`${lat}, ${lng}`);
      }
    } else if (value.trim() && window.google?.maps) {
      // Try to geocode the address and extract components
      setIsGeocoding(true);
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: value }, (results: any, status: string) => {
        setIsGeocoding(false);
        if (status === "OK" && results?.[0]) {
          const result = results[0];

          // Extract coordinates
          if (result.geometry?.location) {
            const lat = result.geometry.location.lat();
            const lng = result.geometry.location.lng();
            setEventCoordinates(`${lat}, ${lng}`);
          }

          // Extract address components
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

          setAddressComponents(components);
        }
      });
    }
  };

  // Handle edit address paste/input
  const handleEditAddressPaste = (value: string) => {
    setEditEventAddress(value);

    // Try to extract coordinates from Google Maps link
    const googleMapsRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = value.match(googleMapsRegex);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        setEditEventCoordinates(`${lat}, ${lng}`);
      }
    } else if (value.trim() && window.google?.maps) {
      // Try to geocode the address and extract components
      setEditIsGeocoding(true);
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: value }, (results: any, status: string) => {
        setEditIsGeocoding(false);
        if (status === "OK" && results?.[0]) {
          const result = results[0];

          // Extract coordinates
          if (result.geometry?.location) {
            const lat = result.geometry.location.lat();
            const lng = result.geometry.location.lng();
            setEditEventCoordinates(`${lat}, ${lng}`);
          }

          // Extract address components
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

  // Auto-select first active calendar when calendars load
  useEffect(() => {
    if (calendars.length > 0 && !selectedCalendarId) {
      const firstActiveCalendar = calendars.find((cal: any) => cal.isActive);
      if (firstActiveCalendar) {
        setSelectedCalendarId(firstActiveCalendar.id);
      }
    }
  }, [calendars, selectedCalendarId]);

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

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobileSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileSidebarOpen]);

  // Initialize Google Maps Autocomplete when dialogs open
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if either dialog is open
    const isAnyDialogOpen = createEventDialogOpen || (eventDetailsModal.open && eventDetailsModal.isEditing);

    if (!isAnyDialogOpen) {
      // Clean up autocomplete when dialogs close
      if (autocompleteRef.current) {
        if (window.google?.maps?.event) {
          window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        }
        autocompleteRef.current = null;
        setAutocomplete(null);
      }
      if (editAutocompleteRef.current) {
        if (window.google?.maps?.event) {
          window.google.maps.event.clearInstanceListeners(editAutocompleteRef.current);
        }
        editAutocompleteRef.current = null;
        setEditAutocomplete(null);
      }
      return;
    }

    let timeoutId: NodeJS.Timeout;
    let retryCount = 0;
    const maxRetries = 100;

    const initAutocomplete = () => {
      if (!window.google?.maps?.places) {
        // Wait for Google Maps to load
        retryCount++;
        if (retryCount < maxRetries) {
          timeoutId = setTimeout(initAutocomplete, 100);
        }
        return;
      }

      // Initialize autocomplete for create event dialog
      if (createEventDialogOpen) {
        const input = document.getElementById("event-address") as HTMLInputElement;
        if (input && !autocompleteRef.current) {
          try {
            const autocompleteInstance = new window.google.maps.places.Autocomplete(input, {
              types: ["address"],
              componentRestrictions: { country: [] },
            });

            autocompleteInstance.addListener("place_changed", () => {
              const place = autocompleteInstance.getPlace();
              if (place.geometry?.location) {
                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();
                setEventCoordinates(`${lat}, ${lng}`);

                // Format address
                const formattedAddress = place.formatted_address || place.name || "";
                setEventAddress(formattedAddress);

                // Extract address components from Google Places API
                const components: {
                  street?: string;
                  city?: string;
                  state?: string;
                  zip?: string;
                  country?: string;
                } = {};

                if (place.address_components) {
                  place.address_components.forEach((component: any) => {
                    const types = component.types;

                    if (types.includes("street_number") || types.includes("route")) {
                      const streetNumber = place.address_components.find((c: any) => c.types.includes("street_number"))?.long_name || "";
                      const route = place.address_components.find((c: any) => c.types.includes("route"))?.long_name || "";
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

                setAddressComponents(components);
              }
            });

            autocompleteRef.current = autocompleteInstance;
            setAutocomplete(autocompleteInstance);
          } catch (error) {
            console.error("Error initializing create event autocomplete:", error);
          }
        }
      }

      // Initialize autocomplete for edit event dialog
      if (eventDetailsModal.open && eventDetailsModal.isEditing) {
        const input = document.getElementById("edit-event-address") as HTMLInputElement;
        if (input && !editAutocompleteRef.current) {
          try {
            const autocompleteInstance = new window.google.maps.places.Autocomplete(input, {
              types: ["address"],
              componentRestrictions: { country: [] },
            });

            autocompleteInstance.addListener("place_changed", () => {
              const place = autocompleteInstance.getPlace();
              if (place.geometry?.location) {
                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();
                setEditEventCoordinates(`${lat}, ${lng}`);

                // Format address
                const formattedAddress = place.formatted_address || place.name || "";
                setEditEventAddress(formattedAddress);

                // Extract address components from Google Places API
                const components: {
                  street?: string;
                  city?: string;
                  state?: string;
                  zip?: string;
                  country?: string;
                } = {};

                if (place.address_components) {
                  place.address_components.forEach((component: any) => {
                    const types = component.types;

                    if (types.includes("street_number") || types.includes("route")) {
                      const streetNumber = place.address_components.find((c: any) => c.types.includes("street_number"))?.long_name || "";
                      const route = place.address_components.find((c: any) => c.types.includes("route"))?.long_name || "";
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

            editAutocompleteRef.current = autocompleteInstance;
            setEditAutocomplete(autocompleteInstance);
          } catch (error) {
            console.error("Error initializing edit event autocomplete:", error);
          }
        }
      }
    };

    // Small delay to ensure modal is fully rendered
    timeoutId = setTimeout(() => {
      initAutocomplete();
    }, 300);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [createEventDialogOpen, eventDetailsModal.open, eventDetailsModal.isEditing]);

  // Load Google Maps script on page load
  useEffect(() => {
    // Check if already loaded
    if (window.google?.maps) {
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      return;
    }

    // Load the script
    const script = document.createElement("script");
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyB_W7D5kzZDahDM5NpS4u8_k8_ZbD55-pc";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

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
        maxResults: 10000, // Fetch more events with pagination
      }),
      enabled: cal.isActive && !!cal.id,
    })),
  });

  // Color mapping for Tailwind classes to hex colors
  const tailwindToHexMap: { [key: string]: string } = {
    'bg-blue-500': '#3b82f6',
    'bg-green-500': '#10b981',
    'bg-purple-500': '#8b5cf6',
    'bg-red-500': '#ef4444',
    'bg-yellow-500': '#eab308',
    'bg-orange-500': '#f97316',
    'bg-cyan-500': '#06b6d4',
    'bg-gray-500': '#6b7280',
    'bg-blue-700': '#1d4ed8',
    'bg-green-700': '#047857',
    'bg-red-700': '#b91c1c'
  };

  // Process individual event data to add colorHex
  const processedIndividualEvent = useMemo(() => {
    if (!individualEventQuery.data) return null;

    const event = individualEventQuery.data;
    let colorClass = "bg-blue-500"; // default Tailwind class
    let colorHex = "#3b82f6"; // default hex color

    if (event.color) {
      const colorMap: { [key: string]: string } = {
        'blue': 'bg-blue-500',
        'green': 'bg-green-500',
        'purple': 'bg-purple-500',
        'red': 'bg-red-500',
        'yellow': 'bg-yellow-500',
        'orange': 'bg-orange-500',
        'turquoise': 'bg-cyan-500',
        'gray': 'bg-gray-500',
        'bold-blue': 'bg-blue-700',
        'bold-green': 'bg-green-700',
        'bold-red': 'bg-red-700'
      };
      colorClass = colorMap[event.color] || "bg-blue-500";
      colorHex = tailwindToHexMap[colorClass] || "#3b82f6";
    }

    return {
      ...event,
      colorClass,
      colorHex,
    };
  }, [individualEventQuery.data, tailwindToHexMap]);

  const allEvents = useMemo(() => {
    return eventQueries
      .flatMap((query, idx) => {
        const calendarId = activeCalendars[idx]?.id;
        const calendar = activeCalendars[idx];
        const provider = calendar?.provider || "google";

        return (query.data || []).map((event: any) => {
          // Determine event color
          let colorClass = "bg-blue-500"; // default Tailwind class
          let colorHex = "#3b82f6"; // default hex color

          if (event.color) {
            // Use the assigned color
            const colorMap: { [key: string]: string } = {
              'blue': 'bg-blue-500',
              'green': 'bg-green-500',
              'purple': 'bg-purple-500',
              'red': 'bg-red-500',
              'yellow': 'bg-yellow-500',
              'orange': 'bg-orange-500',
              'turquoise': 'bg-cyan-500',
              'gray': 'bg-gray-500',
              'bold-blue': 'bg-blue-700',
              'bold-green': 'bg-green-700',
              'bold-red': 'bg-red-700'
            };
            colorClass = colorMap[event.color] || "bg-blue-500";
            colorHex = tailwindToHexMap[colorClass] || "#3b82f6";
          } else {
            // Use consistent default color for events without assigned colors
            colorClass = "bg-blue-500"; // Default blue for all events without colors
            colorHex = "#3b82f6";
          }

          return {
            ...event,
            calendarId,
            color: colorClass, // Keep Tailwind class for consistency
            colorHex, // Add hex color for styling
            provider
          };
        });
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
        setEventLocation("");
        setEventAddressId("");
        setEventAddress("");
        setEventCoordinates("");
        setEnableDropPin(false);
        setAddressComponents({});
        setIsGeocoding(false);
        setCreateGoogleMeet(false);
        setEventColor("blue");
        setSelectedCalendarId("");
        // Close modal
        setCreateEventDialogOpen(false);
        // Refresh calendars and events
        refetch();

        // If Google Meet was requested, wait for conference creation before refetching events
        if (createGoogleMeet) {
          setTimeout(() => {
        eventQueries.forEach((query) => query.refetch());
          }, 8000); // Wait 8 seconds for conference creation
        } else {
          eventQueries.forEach((query) => query.refetch());
        }
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

    if (!selectedCalendarId || selectedCalendarId.trim() === "") {
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
      location: eventAddress.trim() || eventLocation.trim() || undefined,
      allDay: !eventTime, // If no time, treat as all-day
      createGoogleMeet,
      color: eventColor,
    });
  };

  const handleEventClick = (event: any) => {
    // Populate edit form fields with current event data
    setEditEventTitle(event.title || "");
    setEditEventLocation(event.location || "");
    // Reset address fields since event.location contains the full address string
    setEditEventAddressId("");
    setEditEventAddress(event.location || "");
    setEditEventCoordinates("");
    setEditEnableDropPin(false);
    setEditAddressComponents({});
    setEditIsGeocoding(false);
    setEditCreateGoogleMeet(!!event.conferenceUrl);
    setEditEventColor(event.color || "blue");

    // Format date and time for form inputs
    if (event.start) {
    const eventDate = new Date(event.start);
    const dateStr = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = eventDate.toTimeString().slice(0, 5); // HH:MM

      setEditEventDate(dateStr || "");
      setEditEventTime(timeStr || "");
    } else {
      setEditEventDate("");
      setEditEventTime("");
    }

    // Ensure event has calendarId
    const eventWithCalendarId = {
      ...event,
      calendarId: event.calendarId || selectedCalendarId,
    };

    setEventDetailsModal({
      open: true,
      event: eventWithCalendarId,
      isEditing: false,
    });
  };

  // Check if device is mobile
  const isMobile = () => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024; // lg breakpoint in Tailwind
  };

  const handleDateClick = (date: Date) => {
    const dayEvents = getEventsForDate(date);

    if (isMobile()) {
      // On mobile, show events below calendar instead of modal
      setSelectedMobileDay({
        date: date,
        events: dayEvents,
      });
    } else {
      // On desktop/tablet, open modal
      setDayDetailsModal({
        open: true,
        date: date,
        events: dayEvents,
      });
    }
  };

  const handleGoToCalendar = (event: any) => {
    if (event.htmlLink) {
      window.open(event.htmlLink, "_blank");
    }
  };

  const handleEditEvent = () => {
    // Populate edit form fields with current event data
    if (eventDetailsModal.event) {
      const event = eventDetailsModal.event;
      setEditEventTitle(event.title || "");
      setEditEventLocation(event.location || "");

      // Format date and time for form inputs
    if (event.start) {
      const eventDate = new Date(event.start);
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
  };

  const handleCancelEdit = () => {
    resetEditFields();
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

    updateEventMutation.mutate(updateData);
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
    // Event already has color and colorHex from allEvents processing
    const color = event.color || "bg-blue-500";
    const colorHex = event.colorHex || "#3b82f6";

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
      colorHex,
      location: event.location,
      htmlLink: event.htmlLink,
      webLink: event.webLink,
      userTimezone, // Use user's timezone for all formatting
      calendarId: event.calendarId, // Keep calendarId for API calls
      conferenceUrl: event.conferenceUrl, // Include conference URL
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
    <div>
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm overflow-x-auto">
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
      <div className="my-4 sm:my-6 space-y-3 sm:space-y-4">
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

          <div className="hidden lg:flex lg:flex-row gap-3 w-full xl:w-auto">
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

      {/* Mobile - Calendars Button */}
      <div className="lg:hidden mb-4">
        <Button
                                    variant="outline"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 h-auto hover:bg-gray-50 border-2 hover:border-blue-300 transition-all"
                >
                  <Calendar className="h-4 w-4" />
          <span className="font-medium">Calendars</span>
                </Button>
          </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left Column: Connected Calendars */}
        <div className="lg:col-span-1">

          {/* Desktop: View Mode first, Connected Calendars second */}
          <div className="hidden lg:block space-y-4 md:space-y-6">
            {/* View Mode Selector - Desktop first */}
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
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">Year</span>
                </Button>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
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
              <div className="space-y-3">
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
                              "text-sm md:text-base font-medium transition-all duration-200 relative",
                              isToday &&
                                "h-7 w-7 md:h-8 md:w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm",
                              isSelected &&
                                !isToday &&
                                "h-7 w-7 md:h-8 md:w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center",
                              !isToday &&
                                !isSelected &&
                                dayEvents.length > 0 &&
                                "text-blue-700 font-semibold hover:bg-blue-50 rounded-full h-7 w-7 md:h-8 md:w-8 flex items-center justify-center",
                              !isToday &&
                                !isSelected &&
                                dayEvents.length === 0 &&
                                "text-gray-900 hover:bg-gray-100 rounded-full h-7 w-7 md:h-8 md:w-8 flex items-center justify-center"
                            )}
                          >
                            {format(day, "d")}
                          </button>
                        </div>
                        {/* Desktop/Tablet: Show events */}
                        <div className="hidden md:block space-y-1 flex-1 overflow-y-auto">
                          {dayEvents.map((event, eventIdx) => (
                            <div
                              key={eventIdx}
                              className={cn(
                                "text-xs px-2 py-1 rounded truncate cursor-pointer hover:opacity-90 text-white font-medium shadow-sm"
                              )}
                              style={{ backgroundColor: event.colorHex || '#3b82f6' }}
                              title={event.title}
                              onClick={() => handleEventClick(event)}
                            >
                              <div className="font-semibold truncate">
                                {event.title}
                              </div>
                              <div className="text-[10px] opacity-90">
                                {formatInTimezone(event.start, event.userTimezone || 'Africa/Johannesburg', 'time')}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Mobile: Show event indicator dot */}
                        <div className="md:hidden flex justify-center mt-1">
                          {dayEvents.length > 0 && (
                            <div
                              className="w-1.5 h-1.5 rounded-full bg-blue-500"
                              title={`${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : viewMode === "year" ? (
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
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
                                  "h-4 text-[9px] flex items-center justify-center cursor-pointer hover:bg-gray-100 rounded relative",
                                  isToday &&
                                    "bg-blue-500 text-white font-semibold",
                                  dayEvents.length > 0 &&
                                    !isToday &&
                                    "bg-blue-100 text-blue-700 font-semibold"
                                )}
                                title={
                                  dayEvents.length > 0
                                    ? `${dayEvents.length} event(s)`
                                    : format(day, "d")
                                }
                              >
                                {format(day, "d")}
                                {/* Event indicator for mobile */}
                                <div className="md:hidden absolute -bottom-1 left-1/2 transform -translate-x-1/2">
                                  {dayEvents.length > 0 && (
                                    <div className="w-0.5 h-0.5 rounded-full bg-blue-600" />
                                  )}
                                </div>
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
                              "text-xs md:text-sm font-medium transition-all duration-200 relative",
                              isToday &&
                                "h-6 w-6 md:h-7 md:w-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm",
                              isSelected &&
                                !isToday &&
                                "h-6 w-6 md:h-7 md:w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center",
                              !isToday &&
                                !isSelected &&
                                isCurrentMonth &&
                                dayEvents.length > 0 &&
                                "text-blue-700 font-semibold hover:bg-blue-50 rounded-full h-6 w-6 md:h-7 md:w-7 flex items-center justify-center",
                              !isToday &&
                                !isSelected &&
                                isCurrentMonth &&
                                dayEvents.length === 0 &&
                                "text-gray-900 hover:bg-gray-100 rounded-full h-6 w-6 md:h-7 md:w-7 flex items-center justify-center",
                              !isCurrentMonth && "text-gray-400"
                            )}
                          >
                            {format(day, "d")}
                          </button>
                        </div>
                        {/* Desktop/Tablet: Show events */}
                        <div className="hidden md:block space-y-0.5 md:space-y-1 flex-1 overflow-hidden">
                          {dayEvents.slice(0, 2).map((event, eventIdx) => (
                            <div
                              key={eventIdx}
                              className={cn(
                                "text-[10px] md:text-xs px-1 md:px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-90 text-white font-medium shadow-sm"
                              )}
                              style={{ backgroundColor: event.colorHex || '#3b82f6' }}
                              title={`${event.title} - ${formatInTimezone(event.start, event.userTimezone || 'Africa/Johannesburg', 'time')}`}
                              onClick={() => handleEventClick(event)}
                            >
                              <span className="hidden md:inline">• </span>
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

                        {/* Mobile: Show event indicator dot */}
                        <div className="md:hidden flex justify-center mt-1">
                          {dayEvents.length > 0 && (
                            <div
                              className="w-1.5 h-1.5 rounded-full bg-blue-500"
                              title={`${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                            />
                          )}
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

      {/* Mobile Day Details Section */}
      <div className="lg:hidden mt-6">
        {(() => {
          // Show today's events by default, or selected date's events if one is selected
          const displayDate = selectedMobileDay.date || new Date();
          const displayEvents = selectedMobileDay.date ? selectedMobileDay.events : getEventsForDate(displayDate);

          return (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                    {format(displayDate, "MMMM d, yyyy")}
                    {!selectedMobileDay.date && (
                      <span className="block text-sm font-normal text-gray-500 mt-1">
                        Today
                      </span>
                    )}
                  </h2>
                  {displayEvents.length > 0 && (
                    <Badge variant="secondary" className="text-sm">
                      {displayEvents.length} event{displayEvents.length === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>

                {displayEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm mb-4">No events scheduled for this day</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEventTitle("");
                        setEventDate(format(displayDate, "yyyy-MM-dd"));
                        setEventTime("");
                        setEventLocation("");
                        setEventAddressId("");
                        setEventAddress("");
                        setEventCoordinates("");
                        setEnableDropPin(false);
                        setAddressComponents({});
                        setIsGeocoding(false);
                        setCreateGoogleMeet(false);
                        setSelectedCalendarId("");
                        setCreateEventDialogOpen(true);
                      }}
                      className="text-sm"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Event
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {displayEvents
                      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                      .map((event, index) => {
                      const start = new Date(event.start);
                      const end = new Date(event.end);
                      const duration = end.getTime() - start.getTime();
                      const hours = Math.floor(duration / (1000 * 60 * 60));
                      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
                      const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

                      return (
                        <div
                          key={index}
                          className="group relative bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all duration-200 cursor-pointer"
                          onClick={() => handleEventClick(event)}
                        >
                          {/* Event color indicator */}
                          <div
                            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                            style={{ backgroundColor: event.colorHex || '#3b82f6' }}
                          />

                          <div className="flex items-start gap-4">
                            {/* Time */}
                            <div className="flex-shrink-0 w-20 text-center">
                              <div className="text-sm font-semibold text-gray-900">
                                {formatInTimezone(event.start, event.userTimezone || 'Africa/Johannesburg', 'time')}
                              </div>
                              {duration > 0 && (
                                <div className="text-xs text-gray-500">
                                  {durationText}
                                </div>
                              )}
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
                                      <MapPin className="h-3 w-3 flex-shrink-0" />
                                      <span className="truncate">{event.location}</span>
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
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        );
        })()}
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
            {/* Address Selection */}
            <div className="space-y-2">
              <label htmlFor="event-address" className="text-sm font-medium">
                Address (optional)
              </label>

              {/* Saved Addresses Dropdown */}
              {addresses.length > 0 && (
                <div className="space-y-2">
                  <Select
                    value={eventAddressId}
                    onValueChange={(value) => {
                      setEventAddressId(value);
                      if (value) {
                        const selectedAddr = addresses.find((addr: any) => addr.id === value);
                        if (selectedAddr) {
                          setEventAddress(selectedAddr.name || "");
                          if (selectedAddr.latitude != null && selectedAddr.longitude != null) {
                            setEventCoordinates(`${selectedAddr.latitude}, ${selectedAddr.longitude}`);
                          }
                          setAddressComponents({
                            street: selectedAddr.street || undefined,
                            city: selectedAddr.city || undefined,
                            state: selectedAddr.state || undefined,
                            zip: selectedAddr.zip || undefined,
                            country: selectedAddr.country || undefined,
                          });
                        }
                      } else {
                        setEventAddress("");
                        setEventCoordinates("");
                        setAddressComponents({});
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
                    id="event-address"
                    placeholder="Type or paste the full address"
                    value={eventAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleAddressPaste(e.target.value)
                    }
                    className="h-20 pr-10"
                  />
                  {isGeocoding && (
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
                  <Label htmlFor="event-coordinates" className="text-sm font-medium">
                    Pin / coordinates (optional)
                  </Label>
                  <button
                    type="button"
                    className={cn(
                      "text-sm font-medium transition-colors",
                      enableDropPin
                        ? "text-red-600 hover:text-red-700"
                        : "text-blue-600 hover:text-blue-700"
                    )}
                    onClick={() => {
                      if (enableDropPin) {
                        setEnableDropPin(false);
                        toast({
                          title: "Drop pin cancelled",
                          description: "Click 'Drop pin on map' again to enable.",
                        });
                      } else {
                        if (window.google?.maps?.places) {
                          setEnableDropPin(true);
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
                    {enableDropPin ? "Cancel drop pin" : "Drop pin on map"}
                  </button>
                </div>
                <Input
                  id="event-coordinates"
                  placeholder="e.g. -34.0822, 18.8501"
                  value={eventCoordinates}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setEventCoordinates(e.target.value);
                    // If coordinates are entered, try reverse geocoding
                    if (e.target.value.trim() && window.google?.maps) {
                      const { lat, lng } = parseCoordinates(e.target.value);
                      if (lat && lng) {
                        setIsGeocoding(true);
                        const geocoder = new window.google.maps.Geocoder();
                        geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
                          setIsGeocoding(false);
                          if (status === "OK" && results?.[0]) {
                            const result = results[0];
                            setEventAddress(result.formatted_address);

                            // Extract address components
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

                            setAddressComponents(components);
                          }
                        });
                      }
                    }
                  }}
                className="text-sm sm:text-base"
              />
                {enableDropPin && (
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
                      onPinDrop={handlePinDrop}
                    />
                  </div>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant={createGoogleMeet ? "primary" : "outline"}
              onClick={() => setCreateGoogleMeet(!createGoogleMeet)}
              className={editCreateGoogleMeet ? "w-full sm:w-auto bg-primary text-primary-foreground hover:font-bold hover:bg-primary" : "w-full sm:w-auto"}
            >
              <Video className="h-4 w-4 mr-2" />
              {createGoogleMeet ? "Google Meet Added" : "Add Google Meet"}
            </Button>

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
                    onClick={() => setEventColor(value)}
                    className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                      eventColor === value
                        ? "border-gray-800 scale-110"
                        : "border-gray-300 hover:border-gray-500"
                    } ${color}`}
                    title={value.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase())}
                  />
                ))}
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
                        style={{ backgroundColor: event.colorHex || '#3b82f6' }}
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
                                  <span className="truncate">{event.location}</span>
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
            resetEditFields();
            setEventDetailsModal({
              open: false,
              event: null,
              isEditing: false,
            });
          }
        }}
      >
        <AlertDialogContent className="w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <CalendarDays className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="truncate">
                {processedIndividualEvent?.title || eventDetailsModal.event?.title || "Edit Event"}
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Edit event details. Make changes below.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {eventDetailsModal.event && (
            <div className="space-y-4 py-2">
              {individualEventQuery.isLoading ? (
                // Loading state while fetching fresh event data
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
                                setEditEventAddress(selectedAddr.name || "");
                                if (selectedAddr.latitude != null && selectedAddr.longitude != null) {
                                  setEditEventCoordinates(`${selectedAddr.latitude}, ${selectedAddr.longitude}`);
                                }
                                setEditAddressComponents({
                                  street: selectedAddr.street || undefined,
                                  city: selectedAddr.city || undefined,
                                  state: selectedAddr.state || undefined,
                                  zip: selectedAddr.zip || undefined,
                                  country: selectedAddr.country || undefined,
                                });
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
                    <div className="relative">
                      <Textarea
                        id="edit-event-address"
                        placeholder="Enter address or drop pin on map"
                        value={editEventAddress}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                          setEditEventAddress(e.target.value);
                          if (e.target.value.trim() && window.google?.maps) {
                            setEditIsGeocoding(true);
                            const geocoder = new window.google.maps.Geocoder();
                            geocoder.geocode({ address: e.target.value.trim() }, (results: any, status: string) => {
                              setEditIsGeocoding(false);
                              if (status === "OK" && results?.[0]) {
                                const result = results[0];
                                const location = result.geometry.location;
                                setEditEventCoordinates(`${location.lat()}, ${location.lng()}`);

                                // Extract address components
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
                        }}
                        className="min-h-[80px] text-sm sm:text-base pr-10"
                        disabled={editIsGeocoding}
                      />
                      {editIsGeocoding && (
                        <div className="absolute right-2 top-2">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Coordinates Input */}
                    <div className="space-y-2">
                      <label htmlFor="edit-event-coordinates" className="text-sm font-medium">
                        Pin / coordinates (optional)
                      </label>
                      <div className="flex gap-2">
                    <Input
                          id="edit-event-coordinates"
                          placeholder="Latitude, Longitude"
                          value={editEventCoordinates}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditEventCoordinates(e.target.value)}
                          className="text-sm sm:text-base"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.google?.maps?.places) {
                              setEditEnableDropPin(true);
                            } else {
                              toast({
                                title: "Google Maps not loaded",
                                description: "Please wait for Google Maps to load and try again.",
                                variant: "error",
                              });
                            }
                          }}
                          disabled={!window.google?.maps?.places}
                          className="flex-shrink-0"
                        >
                          <MapPin className="h-4 w-4" />
                        </Button>
                      </div>
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

                  {/* Address Selection */}
                  <div className="space-y-2">
                    <label htmlFor="edit-event-address" className="text-sm font-medium">
                      Address
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
                                setEditEventAddress(selectedAddr.name || "");
                                if (selectedAddr.latitude != null && selectedAddr.longitude != null) {
                                  setEditEventCoordinates(`${selectedAddr.latitude}, ${selectedAddr.longitude}`);
                                }
                                setEditAddressComponents({
                                  street: selectedAddr.street || undefined,
                                  city: selectedAddr.city || undefined,
                                  state: selectedAddr.state || undefined,
                                  zip: selectedAddr.zip || undefined,
                                  country: selectedAddr.country || undefined,
                                });
                              }
                            } else {
                              setEditEventAddress("");
                              setEditEventCoordinates("");
                              setEditAddressComponents({});
                            }
                          }}
                        >
                          <SelectTrigger className="w-full text-sm">
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
                          // If coordinates are entered, try reverse geocoding
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

                                  // Extract address components
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

                </div>
              ) : (
                /* View Mode */
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                      style={{ backgroundColor: processedIndividualEvent?.colorHex || eventDetailsModal.event?.colorHex || '#3b82f6' }}
                    ></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">
                        {formatInTimezone(
                          (processedIndividualEvent || eventDetailsModal.event).start,
                          (processedIndividualEvent || eventDetailsModal.event).userTimezone || 'Africa/Johannesburg',
                          'datetime'
                        )}
                      </div>
                    </div>
                  </div>

                  {(processedIndividualEvent || eventDetailsModal.event).location && (
                    <div className="flex items-start gap-3">
                      <MapPin
                        className="w-4 h-4 mt-1 flex-shrink-0"
                        style={{ color: processedIndividualEvent?.colorHex || eventDetailsModal.event?.colorHex || '#3b82f6' }}
                      />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => {
                            const event = processedIndividualEvent || eventDetailsModal.event;
                            const location = event.location;
                            if (location) {
                              // Try to extract coordinates from the location string
                              const coordMatch = location.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
                              if (coordMatch) {
                                // If coordinates are found, use them for Google Maps
                                const lat = coordMatch[1];
                                const lng = coordMatch[2];
                                window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                              } else {
                                // Otherwise, search for the location text
                                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, '_blank');
                              }
                            }
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left"
                        >
                          {(processedIndividualEvent || eventDetailsModal.event).location}
                        </button>
                        </div>
                    </div>
                  )}

                  {(processedIndividualEvent || eventDetailsModal.event).conferenceUrl && (
                    <div className="flex items-start gap-3">
                      <Video
                        className="w-4 h-4 mt-1 flex-shrink-0"
                        style={{ color: processedIndividualEvent?.colorHex || eventDetailsModal.event?.colorHex || '#3b82f6' }}
                      />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => {
                            const event = processedIndividualEvent || eventDetailsModal.event;
                            window.open(event.conferenceUrl, '_blank');
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left flex items-center gap-2"
                        >
                          <Video className="h-3 w-3" />
                          Join Google Meet
                        </button>
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

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          style={{ margin: 0 }}
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ margin: 0 }}
      >
        <div className="p-4">
          {/* Close Button */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Calendars</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Connect Calendar Buttons */}
          <div className="space-y-3 mb-6">
            <Button
              onClick={() => {
                handleConnectCalendar("google");
                setIsMobileSidebarOpen(false);
              }}
              disabled={connectingProvider === "google" || !canAddMore}
              variant="outline"
              size="default"
              className={cn(
                "flex items-center justify-center gap-3 w-full",
                "bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300",
                "px-4 py-3 h-auto font-medium text-sm",
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
              onClick={() => {
                handleConnectCalendar("microsoft");
                setIsMobileSidebarOpen(false);
              }}
              disabled={connectingProvider === "microsoft" || !canAddMore}
              variant="outline"
              size="default"
              className={cn(
                "flex items-center justify-center gap-3 w-full",
                "bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300",
                "px-4 py-3 h-auto font-medium text-sm",
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

          {/* Connected Calendars */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
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
              <div className="space-y-3">
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
        </div>
      </div>
    </div>
  );
}

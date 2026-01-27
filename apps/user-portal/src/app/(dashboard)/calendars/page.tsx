"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSetupRedirect } from "@/hooks/use-setup-redirect";
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
  ChevronDown,
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
  Mail,
  Phone,
  User,
  Star,
  MoreVertical,
  Edit3,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@imaginecalendar/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@imaginecalendar/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";

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

// Time Picker Component (12-hour format display)
const TimePicker = ({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) => {
  // Parse 24-hour format (HH:mm) and convert to 12-hour format
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

  // Format time for display (12-hour format)
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

// LocationIcon component
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

// MoreVertIcon component (matching dashboard)
function MoreVertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 13.3333C9.54167 13.3333 9.14931 13.1701 8.82292 12.8437C8.49653 12.5174 8.33333 12.125 8.33333 11.6667C8.33333 11.2083 8.49653 10.816 8.82292 10.4896C9.14931 10.1632 9.54167 10 10 10C10.4583 10 10.8507 10.1632 11.1771 10.4896C11.5035 10.816 11.6667 11.2083 11.6667 11.6667C11.6667 12.125 11.5035 12.5174 11.1771 12.8437C10.8507 13.1701 10.4583 13.3333 10 13.3333ZM10 8.33333C9.54167 8.33333 9.14931 8.17014 8.82292 7.84375C8.49653 7.51736 8.33333 7.125 8.33333 6.66667C8.33333 6.20833 8.49653 5.81597 8.82292 5.48958C9.14931 5.16319 9.54167 5 10 5C10.4583 5 10.8507 5.16319 11.1771 5.48958C11.5035 5.81597 11.6667 6.20833 11.6667 6.66667C11.6667 7.125 11.5035 7.51736 11.1771 7.84375C10.8507 8.17014 10.4583 8.33333 10 8.33333ZM10 3.33333C9.54167 3.33333 9.14931 3.17014 8.82292 2.84375C8.49653 2.51736 8.33333 2.125 8.33333 1.66667C8.33333 1.20833 8.49653 0.815972 8.82292 0.489583C9.14931 0.163194 9.54167 0 10 0C10.4583 0 10.8507 0.163194 11.1771 0.489583C11.5035 0.815972 11.6667 1.20833 11.6667 1.66667C11.6667 2.125 11.5035 2.51736 11.1771 2.84375C10.8507 3.17014 10.4583 3.33333 10 3.33333Z" fill="#9B9BA7" transform="translate(0, 3)" />
    </svg>
  );
}

// EventCard component (matching dashboard design)
function EventCard({ 
  borderColor, 
  bgColor, 
  event,
  onClick,
  onEdit,
  onDelete,
}: { 
  borderColor: string; 
  bgColor: string; 
  event: any;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const normalizedAttendees = useMemo(() => {
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
  }, [event?.attendees]);

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

  const handleLocationClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (event?.location) {
      const location = event.location;
      const coordMatch = location.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (coordMatch) {
        const lat = coordMatch[1];
        const lng = coordMatch[2];
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
      } else {
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
            {event?.timeRange || "9AM -10PM"}
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

export default function CalendarsPage() {
  const trpc = useTRPC();
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  
  // Redirect if setup is incomplete
  useSetupRedirect();
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
  const colorScrollRef = useRef<HTMLDivElement>(null);
  const [createGoogleMeet, setCreateGoogleMeet] = useState(false);
  const [eventColor, setEventColor] = useState("blue");
  const [eventAttendees, setEventAttendees] = useState<string[]>([]); // Array of email addresses
  const [manualAttendeeInput, setManualAttendeeInput] = useState(""); // For manual email/phone entry
  const [attendeeSearchOpen, setAttendeeSearchOpen] = useState(false); // For autocomplete popover
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(() => {
    // Try to load from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('selectedCalendarIds');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  // Removed viewMode - only monthly calendar view is supported
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
    calendarIdsToDisconnect?: string[]; // For bulk disconnect by email
  }>({
    open: false,
    calendarId: null,
    calendarName: null,
    calendarIdsToDisconnect: undefined,
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

      // Set attendees from fresh data
      setEditEventAttendees(freshEvent.attendees || []);
      setEditManualAttendeeInput("");

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
  const [editEventAttendees, setEditEventAttendees] = useState<string[]>([]); // Array of email addresses
  const [editManualAttendeeInput, setEditManualAttendeeInput] = useState(""); // For manual email/phone entry
  const [editAttendeeSearchOpen, setEditAttendeeSearchOpen] = useState(false); // For autocomplete popover

  // Fetch user's calendars
  const { data: calendars = [], isLoading, refetch } = useQuery(
    trpc.calendar.list.queryOptions()
  );

  // Fetch addresses
  const { data: addresses = [] } = useQuery(trpc.addresses.list.queryOptions());
  
  // Fetch friends for attendee selection
  const { data: friends = [] } = useQuery(trpc.friends.list.queryOptions());
  
  // Search users for attendee autocomplete (create form)
  const [attendeeSearchTerm, setAttendeeSearchTerm] = useState("");
  const { data: searchedUsers = [], isLoading: isSearchingUsers } = useQuery({
    ...trpc.friends.searchUsers.queryOptions({ searchTerm: attendeeSearchTerm }),
    enabled: attendeeSearchTerm.length >= 2 && attendeeSearchOpen,
  });
  
  // Search users for attendee autocomplete (edit form)
  const [editAttendeeSearchTerm, setEditAttendeeSearchTerm] = useState("");
  const { data: editSearchedUsers = [], isLoading: isEditSearchingUsers } = useQuery({
    ...trpc.friends.searchUsers.queryOptions({ searchTerm: editAttendeeSearchTerm }),
    enabled: editAttendeeSearchTerm.length >= 2 && editAttendeeSearchOpen,
  });

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

  // Draggable scroll handler for colors
  const handleDragScroll = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return;
    
    const isTouch = 'touches' in e;
    
    // For touch events, don't preventDefault on touchStart - only on touchMove
    if (!isTouch) {
      e.preventDefault();
    }
    e.stopPropagation();
    
    const clientX = isTouch ? e.touches[0]?.clientX : (e as React.MouseEvent).clientX;
    if (clientX === undefined) return;
    
    const startX = clientX;
    const scrollLeft = ref.current.scrollLeft;
    let isDown = true;
    let hasMoved = false;

    const onMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDown || !ref.current) return;
      
      const moveIsTouch = 'touches' in moveEvent;
      const moveClientX = moveIsTouch ? (moveEvent as TouchEvent).touches[0]?.clientX : (moveEvent as MouseEvent).clientX;
      if (moveClientX === undefined) return;
      
      // Mark that we've moved
      if (!hasMoved) {
        hasMoved = true;
      }
      
      // Prevent default to stop page scrolling only after we start moving
      if (hasMoved) {
        moveEvent.preventDefault();
      }
      
      const x = moveClientX - startX;
      ref.current.scrollLeft = scrollLeft - x;
    };

    const onMouseUp = () => {
      isDown = false;
      hasMoved = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onMouseMove);
      document.removeEventListener('touchend', onMouseUp);
      document.removeEventListener('touchcancel', onMouseUp);
    };

    if (isTouch) {
      document.addEventListener('touchmove', onMouseMove, { passive: false });
      document.addEventListener('touchend', onMouseUp, { passive: true });
      document.addEventListener('touchcancel', onMouseUp, { passive: true });
    } else {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
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

  // Save selectedCalendarIds to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedCalendarIds.length > 0) {
      localStorage.setItem('selectedCalendarIds', JSON.stringify(selectedCalendarIds));
    }
  }, [selectedCalendarIds]);

  // Auto-select primary calendar (or first active calendar) when calendars load (only if no saved selection)
  useEffect(() => {
    if (calendars.length > 0 && selectedCalendarIds.length === 0) {
      const activeCalendars = calendars.filter((cal: any) => cal.isActive);
      if (activeCalendars.length > 0) {
        // Prefer primary calendar, otherwise use first active calendar
        const primaryCalendar = activeCalendars.find((cal: any) => cal.isPrimary);
        const defaultCalendar = primaryCalendar || activeCalendars[0];
        if (defaultCalendar) {
          setSelectedCalendarIds([defaultCalendar.id]);
        }
      }
    }
  }, [calendars, selectedCalendarIds.length]);

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

  // Fetch user preferences
  const { data: userPreferences } = useQuery(
    trpc.preferences.get.queryOptions()
  );
  
  // Get plan limits
  const { limits, canAddCalendar, getCalendarsRemaining, tier } = usePlanLimits();

  // Fetch events from all active calendars
  const activeCalendars = useMemo(() => calendars.filter((cal: any) => cal.isActive), [calendars]);
  
  const timeRange = useMemo(() => {
    // Only monthly view
      return {
        timeMin: startOfMonth(currentMonth).toISOString(),
        timeMax: endOfMonth(currentMonth).toISOString(),
      };
  }, [currentMonth]);

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
  // Count only active calendars for limit check
  const activeCalendarCount = calendars.filter((cal: any) => cal.isActive).length;
  const canAddMore = canAddCalendar(activeCalendarCount);
  const remainingCalendars = getCalendarsRemaining(activeCalendarCount);

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
      onSuccess: (_, variables) => {
        // Remove disconnected calendar from selectedCalendarIds
        setSelectedCalendarIds(prev => prev.filter(id => id !== variables.id));
        
        toast({
          title: "Calendar disconnected",
          description: "Your calendar has been disconnected.",
          variant: "success",
        });
        
        // Refresh calendar list
        refetch();
        
        // Close disconnect dialog
        setDisconnectDialog({ open: false, calendarId: null, calendarName: null, calendarIdsToDisconnect: undefined });
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
      onSuccess: (data, variables) => {
        if (variables.isPrimary) {
          toast({
            title: "Primary calendar set",
            description: "This calendar is now your primary calendar. Events created via WhatsApp will be added here by default.",
            variant: "success",
          });
        } else {
          toast({
            title: "Calendar updated",
            description: "Calendar settings have been updated.",
            variant: "success",
          });
        }
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

  // Handler to set primary calendar
  const handleSetPrimaryCalendar = (calendarId: string) => {
    updateCalendarMutation.mutate({
      id: calendarId,
      isPrimary: true,
    });
  };

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
         setEventAttendees([]);
         setManualAttendeeInput("");
         setSelectedCalendarIds([]);
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

  // Delete event mutation - using utils pattern
  const deleteEventMutation = useMutation({
    mutationFn: async (input: { calendarId: string; eventId: string }) => {
      // Use trpc utils to call the mutation
      const result = await (trpc as any).calendar.deleteEvent.mutate(input);
      return result;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Event deleted",
        description: data?.message || "Event has been deleted successfully.",
        variant: "success",
      });
      // Close modal if open
      setEventDetailsModal({
        open: false,
        event: null,
        isEditing: false,
      });
      // Refresh events
      eventQueries.forEach((query) => query.refetch());
    },
    onError: (error: any) => {
      toast({
        title: "Event deletion failed",
        description: error.message || "Failed to delete event. Please try again.",
        variant: "error",
        duration: 3500,
      });
    },
  });

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

  const handleDisconnectProvider = (provider: string, providerCalendars: any[]) => {
    const activeCalendars = providerCalendars.filter((cal: any) => cal.isActive);
    if (activeCalendars.length === 0) {
      toast({
        title: "No active calendars",
        description: `No active ${provider === "google" ? "Google" : "Microsoft"} calendars to disconnect.`,
        variant: "info",
      });
      return;
    }

    const providerName = provider === "google" ? "Google" : "Microsoft";
    const email = activeCalendars[0]?.email || "";
    const calendarIds = activeCalendars.map(cal => cal.id);
    
    setDisconnectDialog({
      open: true,
      calendarId: `${provider}-${email}`, // Use composite key for bulk disconnect
      calendarName: `${providerName} (${email}) - ${activeCalendars.length} calendar${activeCalendars.length > 1 ? 's' : ''}`,
      calendarIdsToDisconnect: calendarIds,
    });
  };

  const confirmDisconnect = async () => {
    if (disconnectDialog.calendarId) {
      // Check if this is a bulk disconnect (by email)
      if (disconnectDialog.calendarIdsToDisconnect && disconnectDialog.calendarIdsToDisconnect.length > 0) {
        const calendarIds = disconnectDialog.calendarIdsToDisconnect;
        
        // Disconnect all calendars sequentially
        const disconnectedIds: string[] = [];
        const errors: string[] = [];

        for (const calendarId of calendarIds) {
          try {
            await disconnectCalendarMutation.mutateAsync({ id: calendarId });
            disconnectedIds.push(calendarId);
          } catch (error: any) {
            errors.push(error.message || `Failed to disconnect calendar ${calendarId}`);
          }
        }

        // Remove all successfully disconnected calendars from selectedCalendarIds
        if (disconnectedIds.length > 0) {
          setSelectedCalendarIds(prev => prev.filter(id => !disconnectedIds.includes(id)));
        }

        // Show appropriate message
        if (errors.length === 0) {
          toast({
            title: "Calendars disconnected",
            description: `Successfully disconnected ${disconnectedIds.length} calendar${disconnectedIds.length > 1 ? 's' : ''}.`,
            variant: "success",
          });
        } else if (disconnectedIds.length > 0) {
          toast({
            title: "Partially disconnected",
            description: `Disconnected ${disconnectedIds.length} of ${calendarIds.length} calendars. Some errors occurred.`,
            variant: "warning",
            duration: 5000,
          });
        } else {
          toast({
            title: "Disconnect failed",
            description: "Failed to disconnect calendars. Please try again.",
            variant: "error",
            duration: 3500,
          });
        }

        refetch();
        setDisconnectDialog({ open: false, calendarId: null, calendarName: null, calendarIdsToDisconnect: undefined });
      } else {
        // Single calendar disconnect
        disconnectCalendarMutation.mutate({ id: disconnectDialog.calendarId });
      }
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

  // Helper function to add attendee (validates email and checks duplicates)
  const handleAddAttendee = (input: string) => {
    const trimmed = input.trim().toLowerCase();
    
    // Check if it's already added
    if (eventAttendees.includes(trimmed)) {
      toast({
        title: "Already added",
        description: "This email is already in the attendees list.",
        variant: "info",
      });
      return;
    }
    
    // Validate email format (basic validation)
    if (trimmed.includes("@") && trimmed.includes(".")) {
      // Looks like an email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(trimmed)) {
        setEventAttendees([...eventAttendees, trimmed]);
        setManualAttendeeInput("");
        setAttendeeSearchTerm("");
        setAttendeeSearchOpen(false);
      } else {
        toast({
          title: "Invalid email",
          description: "Please enter a valid email address.",
          variant: "error",
        });
      }
    } else {
      // Not an email format - show error
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address. Google Calendar requires email addresses for attendees.",
        variant: "error",
      });
    }
  };

  // Helper function to add attendee for edit form
  const handleAddEditAttendee = (input: string) => {
    const trimmed = input.trim().toLowerCase();
    
    // Check if it's already added
    if (editEventAttendees.includes(trimmed)) {
      toast({
        title: "Already added",
        description: "This email is already in the attendees list.",
        variant: "info",
      });
      return;
    }
    
    // Validate email format (basic validation)
    if (trimmed.includes("@") && trimmed.includes(".")) {
      // Looks like an email
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
      // Not an email format - show error
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address. Google Calendar requires email addresses for attendees.",
        variant: "error",
      });
    }
  };

  // Helper function to format full address from address components
  const formatFullAddress = (address: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
  }): string => {
    // Filter out null, undefined, and empty strings, then join
    const addressParts = [
      address.street,
      address.city,
      address.state,
      address.zip,
      address.country,
    ].filter((part): part is string => Boolean(part) && typeof part === 'string' && part.trim().length > 0);
    return addressParts.join(", ");
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

    if (selectedCalendarIds.length === 0) {
      toast({
        title: "Calendar required",
        description: "Please select at least one calendar for the event.",
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
      calendarId: selectedCalendarIds[0] || "", // Use the first selected calendar
      title: eventTitle.trim(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      location: eventAddress.trim() || eventLocation.trim() || undefined,
      allDay: !eventTime, // If no time, treat as all-day
      createGoogleMeet,
      color: eventColor,
      attendees: eventAttendees.length > 0 ? eventAttendees : undefined,
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
      calendarId: event.calendarId || selectedCalendarIds[0],
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
    setSelectedDate(date); // Always update selected date for events list

    if (isMobile()) {
      // On mobile, show events below calendar instead of modal
      setSelectedMobileDay({
        date: date,
        events: dayEvents,
      });
    } else {
      // On desktop, events are shown in the right column, no modal needed
    }
  };

  const handleGoToCalendar = (event: any) => {
    if (event.htmlLink) {
      window.open(event.htmlLink, "_blank");
    }
  };

  const handleDeleteEvent = (calendarId: string, eventId: string) => {
    deleteEventMutation.mutate(
      { calendarId, eventId },
      {
        onSuccess: () => {
          // Refetch events for all calendars
          eventQueries.forEach((query) => query.refetch());
          toast({
            title: "Event deleted",
            description: "Event has been deleted successfully.",
            variant: "success",
          });
        },
        onError: (error: any) => {
          toast({
            title: "Failed to delete event",
            description: error?.message || "An error occurred while deleting the event.",
            variant: "error",
          });
        },
      }
    );
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

    // Add attendees to update data
    if (editEventAttendees.length > 0) {
      updateData.attendees = editEventAttendees;
    }

    updateEventMutation.mutate(updateData);
  };

  // Group calendars by provider and email
  const groupedCalendars = calendars.reduce((acc: any, calendar: any) => {
    const key = `${calendar.provider}-${calendar.email}`;
    if (!acc[key]) {
      acc[key] = {
        provider: calendar.provider,
        email: calendar.email,
        calendars: []
      };
    }
    acc[key].calendars.push(calendar);
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
      options.hour12 = false;
    } else if (formatStr === 'date') {
      options.weekday = 'short';
      options.month = 'short';
      options.day = 'numeric';
    } else {
      options.hour = 'numeric';
      options.minute = '2-digit';
      options.hour12 = false;
      options.weekday = 'short';
      options.month = 'short';
      options.day = 'numeric';
    }
    
    return new Intl.DateTimeFormat('en-US', options).format(date);
  };

  // Process events for display (filter by selected calendars)
  const processedEvents = allEvents
    .filter((event: any) => selectedCalendarIds.includes(event.calendarId))
    .map((event: any) => {
    // Event already has color and colorHex from allEvents processing
    const color = event.color || "bg-blue-500";
    const colorHex = event.colorHex || "#3b82f6";

    // Use user's timezone from users table
    const userTimezone = user?.timezone || 'Africa/Johannesburg';

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
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
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

  // Get first day of week for the month (week starts on Monday)
  // getDay() returns 0=Sunday, 1=Monday, ..., 6=Saturday
  // For Monday-start week: Sunday(0) needs 6 days before, Monday(1) needs 0, Tuesday(2) needs 1, etc.
  const firstDayOfWeekRaw = monthStart.getDay();
  const firstDayOfWeek = firstDayOfWeekRaw === 0 ? 6 : firstDayOfWeekRaw - 1; // Convert to Monday=0, Sunday=6
  const daysBeforeMonth = Array.from({ length: firstDayOfWeek }, (_, i) => {
    const date = new Date(monthStart);
    date.setDate(date.getDate() - firstDayOfWeek + i);
    return date;
  });

  // Get days after month to fill the grid (week ends on Sunday)
  // For Monday-start week: if month ends on Sunday(0), we need 6 more days; if Saturday(6), we need 0
  const lastDayOfWeekRaw = monthEnd.getDay();
  const lastDayOfWeek = lastDayOfWeekRaw === 0 ? 6 : lastDayOfWeekRaw - 1; // Convert to Monday=0, Sunday=6
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
    <div className="min-h-screen bg-white">
      {/* Breadcrumb Navigation - Hidden on mobile */}
      {/* <div className="hidden lg:flex items-center gap-2 text-sm overflow-x-auto px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
        >
          <Home className="h-3 w-3 sm:h-4 sm:w-4" />
          <span>Dashboard</span>
        </Link>
        <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 rotate-180 text-muted-foreground flex-shrink-0" />
        <span className="font-medium whitespace-nowrap">Calendar Connections</span>
      </div> */}

      {/* Main Container */}
      <div className="mx-auto max-w-md md:max-w-4xl lg:max-w-7xl">
      {/* Page Header */}
        <div className="px-4 pt-4 pb-2 lg:my-4 lg:px-0 lg:pt-0 space-y-3 sm:space-y-4">
          {/* Mobile Header - Simple title with Link Calendar button */}
          <div className="lg:hidden flex items-center justify-between">
            <h1 className="text-[20px] font-semibold leading-[130%] text-[#141718]">Events</h1>
            <Button
              onClick={() => setIsMobileSidebarOpen(true)}
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Link2 className="h-4 w-4" />
              Link Calendar
            </Button>
          </div>
          
          {/* Desktop Header */}
          <div className="hidden lg:flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-start xl:justify-between">
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


      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 md:gap-6 px-4 lg:px-0">
        {/* Left Column: Connected Calendars and Monthly Calendar */}
        <div className="lg:col-span-1">

          {/* Desktop: Connected Calendars */}
          <div className="hidden lg:block space-y-4 md:space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              {calendars.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No calendars connected</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {Object.entries(groupedCalendars).map(
                    ([key, group]: [string, any], groupIndex: number) => {
                      // Get user name from user object or use email
                      const userName = user?.firstName && user?.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user?.name || user?.firstName || group.email?.split('@')[0] || 'User';
                      const userEmail = group.email || user?.email || '';
                      
                      return (
                        <div key={key}>
                          {/* Header with name and email */}
                          <div className="mb-3">
                            <div className="font-semibold text-gray-900 text-sm mb-1">
                              {userName}
                              </div>
                            <div className="text-xs text-gray-600 mb-2">
                              {userEmail}
                            </div>
                            {/* Horizontal separator */}
                            <div className="h-px bg-gray-200"></div>
                          </div>

                          {/* Calendar list items */}
                          <div className="space-y-0">
                            {group.calendars.map((calendar: any, calendarIndex: number) => (
                              <div
                                key={calendar.id}
                                className={cn(
                                  "flex items-center gap-3 py-2",
                                  calendarIndex < group.calendars.length - 1 && "border-b border-gray-100"
                                )}
                              >
                                {/* Checkbox */}
                                <Checkbox
                                  id={`calendar-${calendar.id}`}
                                  checked={selectedCalendarIds.includes(calendar.id)}
                                  onCheckedChange={(checked: boolean) => {
                                    if (checked) {
                                      setSelectedCalendarIds(prev => [...prev, calendar.id]);
                                    } else {
                                      setSelectedCalendarIds(prev => prev.filter(id => id !== calendar.id));
                                    }
                                  }}
                                  disabled={!calendar.isActive}
                                  className="h-4 w-4"
                                />
                                
                                {/* Calendar name */}
                                <label
                                  htmlFor={`calendar-${calendar.id}`}
                                  className="flex-1 text-sm text-gray-900 cursor-pointer min-w-0"
                                >
                                  {calendar.calendarName || calendar.email || 'Calendar'}
                                </label>

                                {/* Star icon (outline) */}
                                {calendar.isActive && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (calendar.isPrimary) {
                                        // Already primary, do nothing or show tooltip
                                      } else {
                                        handleSetPrimaryCalendar(calendar.id);
                                      }
                                    }}
                                        disabled={updateCalendarMutation.isPending}
                                    className={cn(
                                      "p-1 hover:bg-gray-100 rounded transition-colors",
                                      calendar.isPrimary && "text-yellow-500"
                                    )}
                                    title={calendar.isPrimary ? "Primary calendar" : "Set as primary calendar"}
                                      >
                                    <Star className={cn(
                                      "h-4 w-4",
                                      calendar.isPrimary ? "fill-yellow-500 stroke-yellow-500" : "stroke-gray-400"
                                    )} />
                                  </button>
                                    )}

                                {/* Trash icon */}
                                {calendar.isActive && (
                                  <button
                                    type="button"
                                      onClick={() =>
                                        handleDisconnectCalendar(
                                          calendar.id,
                                          calendar.calendarName || calendar.email
                                        )
                                      }
                                      disabled={disconnectCalendarMutation.isPending}
                                    className="p-1 hover:bg-red-50 rounded transition-colors text-gray-400 hover:text-red-600"
                                      title="Disconnect calendar"
                                    >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Separator between groups (except last) */}
                          {groupIndex < Object.entries(groupedCalendars).length - 1 && (
                            <div className="h-px bg-gray-200 my-4"></div>
                  )}
                </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Monthly Calendar and Events List */}
        <div className="lg:col-span-1">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
            {/* Monthly Calendar */}
            <div className="xl:col-span-1 bg-white rounded-xl shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)]">
          <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 md:p-6 shadow-sm">
            {/* Event Creation Button - Hidden on mobile */}
            <div className="hidden md:flex mb-3 sm:mb-4 md:mb-6 flex w-full justify-end">
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
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-4">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              {/* Month Select */}
              <Select
                value={format(currentMonth, "MMMM")}
                onValueChange={(monthName) => {
                  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
                  const newDate = new Date(currentMonth);
                  newDate.setMonth(monthIndex);
                  setCurrentMonth(newDate);
                }}
              >
                <SelectTrigger className="w-[110px] sm:w-[130px] h-9 sm:h-10 text-sm sm:text-base font-semibold text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"
                  ].map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Year Select */}
              <Select
                value={format(currentMonth, "yyyy")}
                onValueChange={(yearStr) => {
                  const year = parseInt(yearStr, 10);
                  const newDate = new Date(currentMonth);
                  newDate.setFullYear(year);
                  setCurrentMonth(newDate);
                }}
              >
                <SelectTrigger className="w-[110px] sm:w-[130px] h-9 sm:h-10 text-sm sm:text-base font-semibold text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 21 }, (_, i) => {
                    const year = new Date().getFullYear() - 10 + i;
                    return (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Calendar Grid - Monthly View Only */}
              <div className="bg-white rounded-lg overflow-hidden">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 border-b border-gray-200">
                  {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                    (day) => (
                      <div
                        key={day}
                        className="px-1 sm:px-2 py-2 sm:py-3 text-[10px] sm:text-xs font-medium text-gray-500 text-center"
                      >
                        {day}
                      </div>
                    )
                  )}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7">
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
                          "min-h-[40px] md:min-h-[80px] p-1 md:p-2 flex flex-col",
                          !isCurrentMonth && "bg-gray-50/50"
                        )}
                      >
                        <div className="flex items-center justify-center mb-1">
                          <button
                            onClick={() => handleDateClick(day)}
                            className={cn(
                              "text-xs md:text-sm font-medium transition-all duration-200 relative",
                              isSelected &&
                                "h-7 w-7 md:h-8 md:w-8 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-sm",
                                !isSelected &&
                                isCurrentMonth &&
                                "text-gray-900 hover:bg-gray-100 rounded-full h-7 w-7 md:h-8 md:w-8 flex items-center justify-center",
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
          </div>
        </div>

            {/* Events List for Selected Date - Hidden on mobile, shown on xl+ */}
            <div className="hidden xl:block xl:col-span-1">
              <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 md:p-6 shadow-sm">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
                  {selectedDate ? format(selectedDate, "MMMM d, yyyy") : format(new Date(), "MMMM d, yyyy")}
                </h2>
                {(() => {
                  const displayDate = selectedDate || new Date();
                  const dayEvents = getEventsForDate(displayDate);
                  
                  // Format events like dashboard
                  const formattedEvents = dayEvents.map((event: any) => {
                    const startDate = new Date(event.start);
                    const endDate = new Date(event.end);
                    
                    // Check if it's an all-day event
                    const isAllDay = startDate.getHours() === 0 && 
                                     startDate.getMinutes() === 0 &&
                                     startDate.getSeconds() === 0 &&
                                     (endDate.getTime() - startDate.getTime() >= 24 * 60 * 60 * 1000);
                    
                    // Format time range using user timezone (same as other places)
                    const userTimezone = event.userTimezone || user?.timezone || 'Africa/Johannesburg';
                    // Use 12-hour format for time range
                    const startTimeStr = new Intl.DateTimeFormat('en-US', {
                      timeZone: userTimezone,
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    }).format(startDate);
                    const endTimeStr = new Intl.DateTimeFormat('en-US', {
                      timeZone: userTimezone,
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    }).format(endDate);
                    // Convert "5:00 PM" to "5PM" format
                    const startTime = startTimeStr.replace(/:\d{2}\s/, '').replace(/\s(AM|PM)/i, '$1');
                    const endTime = endTimeStr.replace(/:\d{2}\s/, '').replace(/\s(AM|PM)/i, '$1');
                    const timeRange = isAllDay ? "All day" : `${startTime} -${endTime}`;
                    
                    return {
                      id: event.id,
                      title: event.title || "Untitled Event",
                      start: startDate,
                      end: endDate,
                      startDate: startDate,
                      endDate: endDate,
                      timeRange,
                      location: event.location,
                      description: event.description,
                      htmlLink: event.htmlLink,
                      webLink: event.webLink,
                      color: event.color,
                      eventColor: event.eventColor || "blue",
                      conferenceUrl: event.conferenceUrl,
                      attendees: event.attendees || [],
                    };
                  }).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

                  if (formattedEvents.length === 0) {
                    return (
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
                            setSelectedCalendarIds([]);
                            setCreateEventDialogOpen(true);
                          }}
                          className="text-sm"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create Event
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-col gap-2">
                      {formattedEvents.map((event: any) => {
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
                              if (confirm(`Are you sure you want to delete "${event.title}"?`)) {
                                handleDeleteEvent(event.calendarId, event.id);
                              }
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Day Details Section */}
        <div className="lg:hidden px-4 mt-6 pb-20">
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
                        setSelectedCalendarIds([]);
                        setCreateEventDialogOpen(true);
                      }}
                      className="text-sm"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Event
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {displayEvents
                      .map((event: any) => {
                        const startDate = new Date(event.start);
                        const endDate = new Date(event.end);
                        
                        // Check if it's an all-day event
                        const isAllDay = startDate.getHours() === 0 && 
                                         startDate.getMinutes() === 0 &&
                                         startDate.getSeconds() === 0 &&
                                         (endDate.getTime() - startDate.getTime() >= 24 * 60 * 60 * 1000);
                        
                        // Format time range using user timezone
                        const userTimezone = event.userTimezone || user?.timezone || 'Africa/Johannesburg';
                        // Use 12-hour format for time range
                        const startTimeStr = new Intl.DateTimeFormat('en-US', {
                          timeZone: userTimezone,
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }).format(startDate);
                        const endTimeStr = new Intl.DateTimeFormat('en-US', {
                          timeZone: userTimezone,
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }).format(endDate);
                        // Convert "5:00 PM" to "5PM" format
                        const startTime = startTimeStr.replace(/:\d{2}\s/, '').replace(/\s(AM|PM)/i, '$1');
                        const endTime = endTimeStr.replace(/:\d{2}\s/, '').replace(/\s(AM|PM)/i, '$1');
                        const timeRange = isAllDay ? "All day" : `${startTime} -${endTime}`;
                        
                        return {
                          id: event.id,
                          title: event.title || "Untitled Event",
                          start: startDate,
                          end: endDate,
                          startDate: startDate,
                          endDate: endDate,
                          timeRange,
                          location: event.location,
                          description: event.description,
                          htmlLink: event.htmlLink,
                          webLink: event.webLink,
                          color: event.color,
                          eventColor: event.eventColor || "blue",
                          conferenceUrl: event.conferenceUrl,
                          attendees: event.attendees || [],
                        };
                      })
                      .sort((a: any, b: any) => a.startDate.getTime() - b.startDate.getTime())
                      .map((event: any) => {
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
                              if (confirm("Are you sure you want to delete this event?")) {
                                // Find the calendar that contains this event
                                const eventCalendar = calendars.find((cal: any) => 
                                  cal.id === event.calendarId || cal.calendarId === event.calendarId
                                );
                                if (eventCalendar) {
                                  deleteEventMutation.mutate({
                                    calendarId: eventCalendar.id,
                                    eventId: event.id,
                                  });
                                } else {
                                  toast({
                                    title: "Error",
                                    description: "Could not find calendar for this event",
                                    variant: "error",
                                  });
                                }
                              }
                            }}
                          />
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        );
        })()}
        </div>

        {/* Floating Action Button for Add Event - Mobile only */}
        <button
          onClick={() => setCreateEventDialogOpen(true)}
          className="fixed bottom-20 left-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg flex items-center justify-center transition-colors z-50 lg:hidden"
        >
          <Plus className="h-6 w-6 text-white" />
        </button>
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
            // Reset form when closing
            setEventTitle("");
            setEventDate("");
            setEventTime("");
            setEventLocation("");
            setEventAddress("");
            setEventAddressId("");
            setEventCoordinates("");
            setEnableDropPin(false);
            setAddressComponents({});
            setCreateGoogleMeet(false);
            setEventColor("blue");
            setEventAttendees([]);
            setManualAttendeeInput("");
          }
        }}
      >
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <AlertDialogHeader className="text-center pb-4">
            <AlertDialogTitle className="text-xl font-bold text-[#141718]">
              Create Event
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500 mt-1">
              Create a New Meeting Request
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-5 overflow-x-hidden">
            {/* Event Title - First Field */}
            <div className="space-y-2">
              <label htmlFor="event-title" className="text-sm font-semibold text-[#141718]">
                Event Title
              </label>
              <Input
                id="event-title"
                placeholder="Title..."
                value={eventTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEventTitle(e.target.value)
                }
                className="bg-gray-50 border-0 text-sm"
              />
            </div>

            {/* Select Color */}
            <div className="space-y-1.5 sm:space-y-2 mr-[-10px]">
              <label className="text-sm font-semibold text-[#141718]">
                Select Color
              </label>
              <div
                ref={colorScrollRef}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDragScroll(e, colorScrollRef as React.RefObject<HTMLDivElement | null>);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  handleDragScroll(e, colorScrollRef as React.RefObject<HTMLDivElement | null>);
                }}
                onTouchMove={(e) => {
                  e.stopPropagation();
                }}
                className="flex gap-2 sm:gap-3 overflow-x-auto p-2 cursor-grab active:cursor-grabbing [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  width: '100%',
                  maxWidth: '100%',
                  touchAction: 'pan-x',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                }}
              >
                {[
                  { name: "pink", value: "#FCE7F3", label: "Pink" },
                  { name: "purple", value: "#F3E8FF", label: "Purple" },
                  { name: "blue", value: "#DBEAFE", label: "Blue" },
                  { name: "cyan", value: "#CFFAFE", label: "Cyan" },
                  { name: "green", value: "#D1FAE5", label: "Green" },
                  { name: "yellow", value: "#FEF3C7", label: "Yellow" },
                  { name: "orange", value: "#FED7AA", label: "Orange" },
                  { name: "red", value: "#FEE2E2", label: "Red" },
                  { name: "indigo", value: "#E0E7FF", label: "Indigo" },
                ].map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    onClick={() => setEventColor(color.name)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className={cn(
                      "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0 transition-all select-none",
                      eventColor === color.name
                        ? "ring-2 ring-gray-900 ring-offset-1 sm:ring-offset-2"
                        : "hover:ring-2 hover:ring-gray-300"
                    )}
                    style={{ backgroundColor: color.value }}
                    title={color.label}
                  />
                ))}
              </div>
            </div>

            {/* Calendar */}
            <div className="space-y-2">
              <label htmlFor="event-calendar" className="text-sm font-semibold text-[#141718]">
                Calendar
              </label>
              <Select
                value={selectedCalendarIds[0] || ""}
                onValueChange={(value) => {
                  if (!selectedCalendarIds.includes(value)) {
                    setSelectedCalendarIds([value, ...selectedCalendarIds.filter(id => id !== value)]);
                  } else {
                    setSelectedCalendarIds([value, ...selectedCalendarIds.filter(id => id !== value)]);
                  }
                }}
              >
                <SelectTrigger id="event-calendar" className="w-full bg-white border border-gray-200 text-sm">
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
            {/* Select Date and Time */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#141718]">
                Select Date and Time
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-normal text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span className={eventDate ? "text-gray-900" : "text-gray-500"}>
                          {eventDate ? format(new Date(eventDate), "dd/MM/yy") : format(new Date(), "dd/MM/yy")}
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={eventDate ? new Date(eventDate) : undefined}
                      onSelect={(date: Date | undefined) => {
                        if (date) {
                          setEventDate(format(date, "yyyy-MM-dd"));
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <TimePicker
                  id="event-time"
                  value={eventTime}
                  onChange={setEventTime}
                />
              </div>
            </div>
                        {/* Attendees Section */}
                        <div className="space-y-2">
              <label className="text-sm font-semibold text-[#141718]">
                Attendees <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <p className="text-xs text-gray-500">
                Add people to invite to this event. Google calendar requires email addresses
              </p>

              {/* Email/Phone Entry with Autocomplete */}
              <Popover open={attendeeSearchOpen} onOpenChange={setAttendeeSearchOpen}>
                  <PopoverTrigger asChild>
                  <div className="relative">
                          <Input
                            type="text"
                      placeholder="Type email or friend name..."
                            value={manualAttendeeInput}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const value = e.target.value;
                          setManualAttendeeInput(value);
                          setAttendeeSearchTerm(value);
                          if (value.length >= 2) {
                            setAttendeeSearchOpen(true);
                          }
                        }}
                        onFocus={() => {
                          if (manualAttendeeInput.length >= 2) {
                            setAttendeeSearchOpen(true);
                          }
                        }}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === "Enter" && manualAttendeeInput.trim()) {
                            e.preventDefault();
                            handleAddAttendee(manualAttendeeInput.trim());
                          } else if (e.key === "Escape") {
                            setAttendeeSearchOpen(false);
                          }
                        }}
                      className="bg-gray-50 border-gray-200 text-sm"
                      />
                    </div>
                  </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by email or phone..."
                      value={attendeeSearchTerm}
                      onValueChange={setAttendeeSearchTerm}
                    />
                    <CommandList>
                      {isSearchingUsers && (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!isSearchingUsers && searchedUsers.length > 0 && (
                        <CommandGroup heading="Users">
                          {searchedUsers
                            .filter((user: any) => {
                              const email = user.email?.toLowerCase() || "";
                              return email && !eventAttendees.includes(email);
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
                                    if (email && !eventAttendees.includes(email)) {
                                      setEventAttendees([...eventAttendees, email]);
                                      setManualAttendeeInput("");
                                      setAttendeeSearchTerm("");
                                      setAttendeeSearchOpen(false);
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
                      {!isSearchingUsers && attendeeSearchTerm.length >= 2 && searchedUsers.length === 0 && (
                        <CommandEmpty>
                          <div className="py-4 text-center text-sm text-gray-500">
                            No users found. You can still add "{attendeeSearchTerm}" as an email address.
                          </div>
                        </CommandEmpty>
                      )}
                      {!isSearchingUsers && attendeeSearchTerm.length >= 2 && (
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              handleAddAttendee(attendeeSearchTerm);
                            }}
                            className="flex items-center gap-2 cursor-pointer text-blue-600"
                          >
                            <Plus className="h-4 w-4" />
                            <span>Add "{attendeeSearchTerm}" as email</span>
                          </CommandItem>
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Selected Attendees List */}
              {eventAttendees.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700">Selected attendees:</p>
                  <div className="flex flex-wrap gap-2">
                    {eventAttendees.map((email, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="flex items-center gap-1 px-2 py-1"
                      >
                        <span className="text-xs">{email}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEventAttendees(eventAttendees.filter((_, i) => i !== index));
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
            {/* Venue Section */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#141718]">
                Venue <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateGoogleMeet(!createGoogleMeet)}
                className="w-full bg-white border border-gray-200 hover:bg-gray-50 justify-center"
              >
                <img src="/google_meet.png" alt="Google Meet" className="h-5 w-5 mr-2" />
                <span className="text-gray-700 font-normal">
                {createGoogleMeet ? "Google Meet Added" : "Add Google Meet"}
                </span>
              </Button>
              <div className="flex items-center justify-center my-2">
                <span className="text-xs text-gray-500">OR</span>
                  </div>

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
                          const components = {
                            street: selectedAddr.street ?? undefined,
                            city: selectedAddr.city ?? undefined,
                            state: selectedAddr.state ?? undefined,
                            zip: selectedAddr.zip ?? undefined,
                            country: selectedAddr.country ?? undefined,
                          };
                          setAddressComponents(components);
                          const fullAddress = formatFullAddress(components);
                          if (!fullAddress && selectedAddr.latitude != null && selectedAddr.longitude != null) {
                            setEventCoordinates(`${selectedAddr.latitude}, ${selectedAddr.longitude}`);
                            if (window.google?.maps) {
                              const geocoder = new window.google.maps.Geocoder();
                              geocoder.geocode(
                                { location: { lat: selectedAddr.latitude, lng: selectedAddr.longitude } },
                                (results: any, status: string) => {
                                  if (status === "OK" && results?.[0]) {
                                    setEventAddress(results[0].formatted_address);
                                  } else {
                                    setEventAddress(selectedAddr.name || "");
                                  }
                                }
                              );
                            } else {
                              setEventAddress(selectedAddr.name || "");
                            }
                          } else {
                            setEventAddress(fullAddress || selectedAddr.name || "");
                          }
                          if (selectedAddr.latitude != null && selectedAddr.longitude != null) {
                            setEventCoordinates(`${selectedAddr.latitude}, ${selectedAddr.longitude}`);
                          }
                        }
                      } else {
                        setEventAddress("");
                        setEventCoordinates("");
                        setAddressComponents({});
                      }
                    }}
                  >
                    <SelectTrigger className="w-full bg-gray-50 border-gray-200 text-sm">
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

              {/* Address Input with Autocomplete */}
              <div className="space-y-2">
                <div className="relative">
              <Input
                    id="event-address"
                    placeholder="Add location..."
                    value={eventAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleAddressPaste(e.target.value)
                    }
                    className="bg-gray-50 border-gray-200 text-sm pr-10"
                  />
                  {isGeocoding && (
                    <div className="absolute right-10 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                        if (window.google?.maps?.places) {
                          setEnableDropPin(true);
                          toast({
                            title: "Drop pin enabled",
                            description: "Click anywhere on the map to drop a pin.",
                          });
                        } else {
                          toast({
                            title: "Google Maps not loaded",
                          description: "Please wait for Google Maps to load.",
                            variant: "destructive",
                          });
                      }
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <MapPin className="h-4 w-4 text-blue-600 cursor-pointer" />
                  </button>
                </div>
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
              </div>
          <AlertDialogFooter className="flex-row gap-3 pt-4">
            <AlertDialogCancel
              disabled={createEventMutation.isPending}
              className="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg mt-0"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateEvent}
              disabled={
                !eventTitle.trim() ||
                !eventDate ||
                selectedCalendarIds.length === 0 ||
                createEventMutation.isPending
              }
              className="flex-1 bg-blue-400 hover:bg-blue-500 text-white rounded-lg border-0"
            >
              {createEventMutation.isPending ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
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
              calendarIdsToDisconnect: undefined,
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
                                // Build address components object - handle null/undefined properly
                                const components = {
                                  street: selectedAddr.street ?? undefined,
                                  city: selectedAddr.city ?? undefined,
                                  state: selectedAddr.state ?? undefined,
                                  zip: selectedAddr.zip ?? undefined,
                                  country: selectedAddr.country ?? undefined,
                                };
                                setEditAddressComponents(components);
                                
                                // Format full address from components
                                const fullAddress = formatFullAddress(components);
                                
                                // If we have coordinates but no formatted address, try reverse geocoding
                                if (!fullAddress && selectedAddr.latitude != null && selectedAddr.longitude != null) {
                                  setEditEventCoordinates(`${selectedAddr.latitude}, ${selectedAddr.longitude}`);
                                  // Try reverse geocoding to get full address
                                  if (window.google?.maps) {
                                    const geocoder = new window.google.maps.Geocoder();
                                    geocoder.geocode(
                                      { location: { lat: selectedAddr.latitude, lng: selectedAddr.longitude } },
                                      (results: any, status: string) => {
                                        if (status === "OK" && results?.[0]) {
                                          setEditEventAddress(results[0].formatted_address);
                                        } else {
                                          // Fallback to name if reverse geocoding fails
                                          setEditEventAddress(selectedAddr.name || "");
                                        }
                                      }
                                    );
                                  } else {
                                    // Fallback to name if Google Maps not loaded
                                    setEditEventAddress(selectedAddr.name || "");
                                  }
                                } else {
                                  // Use full address if available, otherwise fall back to name
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
                          {editEventAttendees.map((email, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="flex items-center gap-1 px-2 py-1"
                            >
                              <span className="text-xs">{email}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditEventAttendees(editEventAttendees.filter((_, i) => i !== index));
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
                                // Build address components object - handle null/undefined properly
                                const components = {
                                  street: selectedAddr.street ?? undefined,
                                  city: selectedAddr.city ?? undefined,
                                  state: selectedAddr.state ?? undefined,
                                  zip: selectedAddr.zip ?? undefined,
                                  country: selectedAddr.country ?? undefined,
                                };
                                setEditAddressComponents(components);
                                
                                // Format full address from components
                                const fullAddress = formatFullAddress(components);
                                
                                // If we have coordinates but no formatted address, try reverse geocoding
                                if (!fullAddress && selectedAddr.latitude != null && selectedAddr.longitude != null) {
                                  setEditEventCoordinates(`${selectedAddr.latitude}, ${selectedAddr.longitude}`);
                                  // Try reverse geocoding to get full address
                                  if (window.google?.maps) {
                                    const geocoder = new window.google.maps.Geocoder();
                                    geocoder.geocode(
                                      { location: { lat: selectedAddr.latitude, lng: selectedAddr.longitude } },
                                      (results: any, status: string) => {
                                        if (status === "OK" && results?.[0]) {
                                          setEditEventAddress(results[0].formatted_address);
                                        } else {
                                          // Fallback to name if reverse geocoding fails
                                          setEditEventAddress(selectedAddr.name || "");
                                        }
                                      }
                                    );
                                  } else {
                                    // Fallback to name if Google Maps not loaded
                                    setEditEventAddress(selectedAddr.name || "");
                                  }
                                } else {
                                  // Use full address if available, otherwise fall back to name
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
                    
                    // Format time as "05:00 PM" using user timezone from database
                    const formatTimeForDisplay = () => {
                      if (!event?.start) return "N/A";
                      const date = new Date(event.start);
                      // Always use user timezone from users table
                      const timezone = user?.timezone || 'Africa/Johannesburg';
                      
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
                        handleGoToCalendar(eventDetailsModal.event);
                        setEventDetailsModal({ open: false, event: null, isEditing: false });
                      }
                    }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    Go to Calendar
                  </Button>
                </>
              )}
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
          "fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ borderTopRightRadius: '12px' }}
      >
        <div className="p-4 space-y-4">
          {/* Close Button */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Calendars</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* View Mode Selector removed - only monthly view */}

          {/* Connect Calendar Buttons */}
          <div className="space-y-3">
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
          <div className="bg-white">
            {calendars.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No calendars connected</p>
              </div>
            ) : (
              <div className="space-y-0">
                {Object.entries(groupedCalendars).map(
                  ([key, group]: [string, any], groupIndex: number) => {
                    // Get user name from user object or use email
                    const userName = user?.firstName && user?.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user?.name || user?.firstName || group.email?.split('@')[0] || 'User';
                    const userEmail = group.email || user?.email || '';
                    
                    return (
                      <div key={key}>
                        {/* Header with name and email */}
                        <div className="mb-3">
                          <div className="font-semibold text-gray-900 text-sm mb-1">
                            {userName}
                            </div>
                          <div className="text-xs text-gray-600 mb-2">
                            {userEmail}
                          </div>
                          {/* Horizontal separator */}
                          <div className="h-px bg-gray-200"></div>
                        </div>

                        {/* Calendar list items */}
                        <div className="space-y-0">
                          {group.calendars.map((calendar: any, calendarIndex: number) => (
                            <div
                              key={calendar.id}
                              className={cn(
                                "flex items-center gap-3 py-2",
                                calendarIndex < group.calendars.length - 1 && "border-b border-gray-100"
                              )}
                            >
                              {/* Checkbox */}
                              <Checkbox
                                id={`mobile-calendar-${calendar.id}`}
                                checked={selectedCalendarIds.includes(calendar.id)}
                                onCheckedChange={(checked: boolean) => {
                                  if (checked) {
                                    setSelectedCalendarIds(prev => [...prev, calendar.id]);
                                  } else {
                                    setSelectedCalendarIds(prev => prev.filter(id => id !== calendar.id));
                                  }
                                }}
                                disabled={!calendar.isActive}
                                className="h-4 w-4"
                              />
                              
                              {/* Calendar name */}
                              <label
                                htmlFor={`mobile-calendar-${calendar.id}`}
                                className="flex-1 text-sm text-gray-900 cursor-pointer min-w-0"
                              >
                                {calendar.calendarName || calendar.email || 'Calendar'}
                              </label>

                              {/* Star icon (outline) */}
                              {calendar.isActive && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (calendar.isPrimary) {
                                      // Already primary, do nothing or show tooltip
                                    } else {
                                      handleSetPrimaryCalendar(calendar.id);
                                    }
                                  }}
                                      disabled={updateCalendarMutation.isPending}
                                  className={cn(
                                    "p-1 hover:bg-gray-100 rounded transition-colors",
                                    calendar.isPrimary && "text-yellow-500"
                                  )}
                                  title={calendar.isPrimary ? "Primary calendar" : "Set as primary calendar"}
                                    >
                                  <Star className={cn(
                                    "h-4 w-4",
                                    calendar.isPrimary ? "fill-yellow-500 stroke-yellow-500" : "stroke-gray-400"
                                  )} />
                                </button>
                                  )}

                              {/* Trash icon */}
                              {calendar.isActive && (
                                <button
                                  type="button"
                                    onClick={() =>
                                      handleDisconnectCalendar(
                                        calendar.id,
                                        calendar.calendarName || calendar.email
                                      )
                                    }
                                    disabled={disconnectCalendarMutation.isPending}
                                  className="p-1 hover:bg-red-50 rounded transition-colors text-gray-400 hover:text-red-600"
                                    title="Disconnect calendar"
                                  >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Separator between groups (except last) */}
                        {groupIndex < Object.entries(groupedCalendars).length - 1 && (
                          <div className="h-px bg-gray-200 my-4"></div>
                )}
              </div>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

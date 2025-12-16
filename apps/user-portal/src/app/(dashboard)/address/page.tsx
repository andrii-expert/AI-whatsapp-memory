"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Home, ChevronLeft, MapPin, MessageCircle, Loader2, Edit2, Trash2, MoreVertical, Plus, Menu, X } from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import { Card, CardContent } from "@imaginecalendar/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { cn } from "@imaginecalendar/ui/cn";

// Google Maps component
declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

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
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const clickListenerRef = useRef<any>(null);
  const initAttemptsRef = useRef(0);
  const maxInitAttempts = 20; // 2 seconds max (20 * 100ms)

  // Load Google Maps script
  useEffect(() => {
    // Check if already loaded
    if (window.google?.maps) {
      setScriptLoaded(true);
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for script to load
      const checkLoaded = setInterval(() => {
        if (window.google?.maps) {
          setScriptLoaded(true);
          clearInterval(checkLoaded);
        }
      }, 100);
      
      // Timeout after 10 seconds
      const timeoutId = setTimeout(() => {
        clearInterval(checkLoaded);
        if (!window.google?.maps) {
          setMapError("Failed to load Google Maps. Please refresh the page.");
        }
      }, 10000);
      
      return () => {
        clearInterval(checkLoaded);
        clearTimeout(timeoutId);
      };
    }

    // Load the script
    const script = document.createElement("script");
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyB_W7D5kzZDahDM5NpS4u8_k8_ZbD55-pc";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      // Give it a moment for the API to fully initialize
      setTimeout(() => {
        if (window.google?.maps) {
          setScriptLoaded(true);
          setMapError(null);
        } else {
          setMapError("Google Maps API loaded but not available. Please check your API key.");
        }
      }, 100);
    };
    
    script.onerror = () => {
      setMapError("Failed to load Google Maps script. Please check your internet connection and API key.");
      console.error("Failed to load Google Maps script.");
    };
    
    document.head.appendChild(script);
    
    return () => {
      // Cleanup if component unmounts
    };
  }, []);

  // Initialize map when script is loaded
  useEffect(() => {
    if (!scriptLoaded || !window.google?.maps) {
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
  }, [scriptLoaded, lat, lng, address, enableClickToDrop, onPinDrop]);
  
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
  if (!scriptLoaded) {
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
            setScriptLoaded(false);
            setMapInitialized(false);
            mapInstanceRef.current = null;
            markerRef.current = null;
            // Force reload by removing script and re-adding
            const script = document.querySelector('script[src*="maps.googleapis.com"]');
            if (script) {
              script.remove();
            }
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

export default function AddressPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [locationLabel, setLocationLabel] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [coordinates, setCoordinates] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [autocomplete, setAutocomplete] = useState<any>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [addressComponents, setAddressComponents] = useState<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  }>({});
  const [editingAddress, setEditingAddress] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<any>(null);
  const [enableDropPin, setEnableDropPin] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Fetch addresses
  const { data: addresses = [], isLoading } = useQuery(trpc.addresses.list.queryOptions());

  // Auto-select first address if available and none selected
  useEffect(() => {
    if (addresses.length > 0 && !selectedAddress) {
      setSelectedAddress(addresses[0]);
    }
  }, [addresses, selectedAddress]);

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

  // Create address mutation
  const createAddressMutation = useMutation(
    trpc.addresses.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({
          title: "Location saved",
          description: "Your location has been saved successfully.",
        });
        setLocationLabel("");
        setStreetAddress("");
        setCoordinates("");
        setAddressComponents({});
        setEditingAddress(null);
        setIsAddModalOpen(false);
        setEnableDropPin(false);
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to save location",
          variant: "destructive",
        });
      },
    })
  );

  // Update address mutation
  const updateAddressMutation = useMutation(
    trpc.addresses.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({
          title: "Location updated",
          description: "Your location has been updated successfully.",
        });
        setLocationLabel("");
        setStreetAddress("");
        setCoordinates("");
        setAddressComponents({});
        setEditingAddress(null);
        setIsAddModalOpen(false);
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to update location",
          variant: "destructive",
        });
      },
    })
  );

  // Delete address mutation
  const deleteAddressMutation = useMutation(
    trpc.addresses.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setIsDeleteDialogOpen(false);
        setAddressToDelete(null);
        if (selectedAddress?.id === addressToDelete?.id) {
          setSelectedAddress(null);
        }
        toast({
          title: "Location deleted",
          description: "Your location has been deleted successfully.",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to delete location",
          variant: "destructive",
        });
      },
    })
  );

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

  // Handle pin drop from map click
  const handlePinDrop = (lat: number, lng: number) => {
    setCoordinates(`${lat}, ${lng}`);
    setEnableDropPin(false);
    
    // Perform reverse geocoding
    if (window.google?.maps) {
      setIsGeocoding(true);
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
        setIsGeocoding(false);
        if (status === "OK" && results?.[0]) {
          const result = results[0];
          setStreetAddress(result.formatted_address);
          
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

  // Initialize Google Maps Autocomplete
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initAutocomplete = () => {
      if (!window.google?.maps?.places) {
        // Wait for Google Maps to load
        setTimeout(initAutocomplete, 100);
        return;
      }

      const input = document.getElementById("modal-street-address") as HTMLInputElement;
      if (!input || autocomplete) return;

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
            setCoordinates(`${lat}, ${lng}`);
            
            // Format address
            const formattedAddress = place.formatted_address || place.name || "";
            setStreetAddress(formattedAddress);
            
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

        setAutocomplete(autocompleteInstance);
      } catch (error) {
        console.error("Error initializing autocomplete:", error);
      }
    };

    initAutocomplete();
  }, [autocomplete]);

  // Handle Google Maps link parsing
  const handleAddressPaste = (value: string) => {
    setStreetAddress(value);
    
    // Try to extract coordinates from Google Maps link
    const googleMapsRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = value.match(googleMapsRegex);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        setCoordinates(`${lat}, ${lng}`);
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
            setCoordinates(`${lat}, ${lng}`);
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

  // Handle save location
  const handleSaveLocation = () => {
    if (!locationLabel.trim()) {
      toast({
        title: "Error",
        description: "Location label is required",
        variant: "destructive",
      });
      return;
    }

    const { lat, lng } = parseCoordinates(coordinates);
    
    // Use address components from Google Places API if available, otherwise parse from streetAddress
    let street = addressComponents.street;
    let city = addressComponents.city;
    let state = addressComponents.state;
    let zip = addressComponents.zip;
    let country = addressComponents.country;
    
    // Fallback: if no components from Google Places, try to parse from streetAddress
    if (!street && !city && streetAddress) {
      const addressParts = streetAddress.split(",").map(p => p.trim());
      street = addressParts[0] || "";
      city = addressParts[1] || "";
      state = addressParts[2] || "";
      zip = addressParts[3] || "";
      country = addressParts[4] || "";
    }

    // Prepare address data with proper null handling
    const addressData = {
      name: locationLabel.trim(),
      folderId: null,
      connectedUserId: null,
      street: street?.trim() || undefined,
      city: city?.trim() || undefined,
      state: state?.trim() || undefined,
      zip: zip?.trim() || undefined,
      country: country?.trim() || undefined,
      latitude: lat != null && !isNaN(lat) ? lat : undefined,
      longitude: lng != null && !isNaN(lng) ? lng : undefined,
    };

    if (editingAddress) {
      // Update existing address
      updateAddressMutation.mutate({
        id: editingAddress.id,
        ...addressData,
      });
    } else {
      // Create new address
      createAddressMutation.mutate(addressData);
    }
  };

  // Handle edit address
  const handleEditAddress = (address: any) => {
    setEditingAddress(address);
    setLocationLabel(address.name);
    setStreetAddress(getFullAddress(address) || "");
    if (address.latitude != null && address.longitude != null) {
      setCoordinates(`${address.latitude}, ${address.longitude}`);
    } else {
      setCoordinates("");
    }
    setAddressComponents({
      street: address.street || undefined,
      city: address.city || undefined,
      state: address.state || undefined,
      zip: address.zip || undefined,
      country: address.country || undefined,
    });
    setIsAddModalOpen(true);
  };

  // Handle delete address
  const handleDeleteAddress = (address: any) => {
    setAddressToDelete(address);
    setIsDeleteDialogOpen(true);
  };

  // Confirm delete
  const confirmDelete = () => {
    if (addressToDelete) {
      deleteAddressMutation.mutate({ id: addressToDelete.id });
    }
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingAddress(null);
    setLocationLabel("");
    setStreetAddress("");
    setCoordinates("");
    setAddressComponents({});
    setIsAddModalOpen(false);
    setEnableDropPin(false);
  };

  // Handle open add modal
  const handleOpenAddModal = () => {
    setEditingAddress(null);
    setLocationLabel("");
    setStreetAddress("");
    setCoordinates("");
    setAddressComponents({});
    setEnableDropPin(false);
    setIsAddModalOpen(true);
  };

  // Handle address selection
  const handleSelectAddress = (address: any) => {
    setSelectedAddress(address);
  };

  // Handle WhatsApp share
  const handleWhatsAppShare = () => {
    if (!selectedAddress) return;

    const addressText = [
      selectedAddress.name,
      selectedAddress.street,
      selectedAddress.city,
      selectedAddress.state,
      selectedAddress.country,
    ]
      .filter(Boolean)
      .join(", ");

    const coordinatesText = selectedAddress.latitude && selectedAddress.longitude
      ? `${selectedAddress.latitude}, ${selectedAddress.longitude}`
      : "";

    const message = `📍 ${addressText}${coordinatesText ? `\n\nCoordinates: ${coordinatesText}` : ""}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  // Get full address string
  const getFullAddress = (address: any) => {
    return [
      address.street,
      address.city,
      address.state,
      address.zip,
      address.country,
    ]
      .filter(Boolean)
      .join(", ");
  };

  // Get coordinates string
  const getCoordinatesString = (address: any) => {
    if (address.latitude != null && address.longitude != null && 
        !isNaN(Number(address.latitude)) && !isNaN(Number(address.longitude))) {
      // Format coordinates to show reasonable precision (4 decimal places)
      const lat = typeof address.latitude === 'number' 
        ? parseFloat(address.latitude.toFixed(4)).toString() 
        : String(address.latitude);
      const lng = typeof address.longitude === 'number' 
        ? parseFloat(address.longitude.toFixed(4)).toString() 
        : String(address.longitude);
      return `Pin: ${lat}, ${lng}`;
    }
    return "";
  };

  return (
    <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm justify-between mb-4 sm:mb-6">
        <div className="flex items-center justify-center gap-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
          <span className="font-medium">Saved addresses</span>
        </div>

        <Button
          onClick={handleOpenAddModal}
          variant="orange-primary"
          className="flex-shrink-0 lg:hidden"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Address
        </Button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden mt-0"
          style={{ margin: 0 }}
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto m-0",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ margin: 0 }}
      >
        <div className="p-4">
          {/* Close Button */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Addresses</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Saved Locations List */}
          <div className="space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : addresses.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <MapPin className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p>No saved locations yet.</p>
                <p className="text-xs mt-1">
                  Add your first location to get started.
                </p>
              </div>
            ) : (
              addresses.map((address: any) => (
                <button
                  key={address.id}
                  onClick={() => {
                    handleSelectAddress(address);
                    setIsMobileSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-left",
                    selectedAddress?.id === address.id
                      ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                      : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                  )}
                >
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{address.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {getFullAddress(address) || "No address provided"}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Saved addresses</h1>
              <Button
                onClick={handleOpenAddModal}
                variant="orange-primary"
                className="flex-shrink-0 hidden lg:flex"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Address
              </Button>
            </div>
            <p className="text-sm sm:text-base text-gray-600">
              Add your frequent locations, view them on the map and share directions to WhatsApp in a single tap.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* Desktop Left Panel - Saved Locations */}
        <div className="hidden lg:block space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Saved locations</h2>

            {/* Saved Locations List */}
            <div className="space-y-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : addresses.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  <MapPin className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No saved locations yet.</p>
                  <p className="text-xs mt-1">
                    Add your first location to get started.
                  </p>
                </div>
              ) : (
                addresses.map((address: any) => (
                  <button
                    key={address.id}
                    onClick={() => handleSelectAddress(address)}
                    className={cn(
                      "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-left",
                      selectedAddress?.id === address.id
                        ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                        : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                    )}
                  >
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{address.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {getFullAddress(address) || "No address provided"}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="space-y-6">
          {/* Mobile - Addresses Button */}
          <div className="lg:hidden">
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant="outline"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 h-auto hover:bg-gray-50 border-2 hover:border-blue-300 transition-all"
              >
                <Menu className="h-4 w-4" />
                <span className="font-medium">Addresses</span>
              </Button>
            </div>
          </div>

          {/* Map Preview */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2 mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Map Preview</h2>
                {selectedAddress && (
                  <Button
                    onClick={handleWhatsAppShare}
                    className="bg-green-600 hover:bg-green-700 w-full sm:w-auto touch-manipulation text-sm sm:text-base py-2.5 sm:py-2"
                    size="sm"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Send to WhatsApp
                  </Button>
                )}
              </div>

              {selectedAddress ? (
                <>
                  <div className="mb-3 sm:mb-4">
                    <h3 className="font-bold text-sm sm:text-base text-gray-900 mb-1">{selectedAddress.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">
                      {getFullAddress(selectedAddress) || "No address provided"}
                    </p>
                  </div>
                  <GoogleMap
                    lat={selectedAddress.latitude != null ? Number(selectedAddress.latitude) : null}
                    lng={selectedAddress.longitude != null ? Number(selectedAddress.longitude) : null}
                    address={selectedAddress.name}
                  />
                </>
              ) : (
                <>
                  <div className="mb-3 sm:mb-4">
                    <p className="text-xs sm:text-sm text-gray-500">
                      Select a location from the list to view it on the map.
                    </p>
                  </div>
                  <GoogleMap lat={null} lng={null} address="" />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add/Edit Address Modal */}
      <AlertDialog 
        open={isAddModalOpen} 
        onOpenChange={(open) => {
          setIsAddModalOpen(open);
          if (!open) {
            // Reset form when modal closes
            handleCancelEdit();
          }
        }}
      >
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg sm:text-xl">
              {editingAddress ? "Edit location" : "Add new location"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              Save an address or coordinates to use across your dashboard and mobile app.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4 px-1 sm:px-0">
            <div className="space-y-2">
              <Label htmlFor="modal-location-label">Location label</Label>
              <Input
                id="modal-location-label"
                placeholder="e.g. Home, Office, Client - OK Foods"
                value={locationLabel}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocationLabel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="modal-street-address">Street address</Label>
              <div className="relative">
                <Input
                  id="modal-street-address"
                  placeholder="Type or paste the full address"
                  value={streetAddress}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleAddressPaste(e.target.value)}
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="modal-coordinates">Pin / coordinates (optional)</Label>
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
                      // Cancel drop pin mode
                      setEnableDropPin(false);
                      toast({
                        title: "Drop pin cancelled",
                        description: "Click 'Drop pin on map' again to enable.",
                      });
                    } else {
                      // Enable drop pin mode
                      if (window.google?.maps) {
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
                id="modal-coordinates"
                placeholder="e.g. -34.0822, 18.8501"
                value={coordinates}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setCoordinates(e.target.value);
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
                          setStreetAddress(result.formatted_address);
                          
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

            <div className="pt-2">
              <p className="text-xs text-gray-500 mb-4">
                Once saved, locations are available across your web dashboard and mobile app.
              </p>
            </div>
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel
              onClick={handleCancelEdit}
              disabled={createAddressMutation.isPending || updateAddressMutation.isPending}
              className="w-full sm:w-auto touch-manipulation order-2 sm:order-1"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSaveLocation}
              disabled={createAddressMutation.isPending || updateAddressMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto touch-manipulation order-1 sm:order-2"
            >
              {(createAddressMutation.isPending || updateAddressMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {editingAddress ? "Updating..." : "Saving..."}
                </>
              ) : (
                editingAddress ? "Update location" : "Save location"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{addressToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeleteDialogOpen(false);
              setAddressToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteAddressMutation.isPending}
            >
              {deleteAddressMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

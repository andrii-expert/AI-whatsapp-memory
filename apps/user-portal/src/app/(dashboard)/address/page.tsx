"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Home, ChevronLeft, MapPin, MessageCircle, Loader2, Edit2, Trash2, MoreVertical } from "lucide-react";
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

function GoogleMap({ lat, lng, address }: { lat?: number | null; lng?: number | null; address?: string }) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapIdRef = useRef(`google-map-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    // Load Google Maps script if not already loaded
    if (window.google?.maps) {
      setScriptLoaded(true);
      return;
    }

    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      if (window.google?.maps) {
        setScriptLoaded(true);
      } else {
        const checkLoaded = setInterval(() => {
          if (window.google?.maps) {
            setScriptLoaded(true);
            clearInterval(checkLoaded);
          }
        }, 100);
        return () => clearInterval(checkLoaded);
      }
      return;
    }

    const script = document.createElement("script");
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyB_W7D5kzZDahDM5NpS4u8_k8_ZbD55-pc";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setScriptLoaded(true);
    };
    script.onerror = () => {
      console.warn("Failed to load Google Maps script.");
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !window.google?.maps) return;
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      setMapLoaded(false);
      return;
    }

    const mapElement = document.getElementById(mapIdRef.current);
    if (!mapElement) return;

    try {
      // Create or update map
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new window.google.maps.Map(mapElement, {
          center: { lat, lng },
          zoom: 15,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
          mapTypeId: window.google.maps.MapTypeId.ROADMAP,
        });
      } else {
        mapInstanceRef.current.setCenter({ lat, lng });
        mapInstanceRef.current.setZoom(15);
      }

      // Create or update marker
      if (markerRef.current) {
        markerRef.current.setPosition({ lat, lng });
        markerRef.current.setTitle(address || "Location");
      } else {
        markerRef.current = new window.google.maps.Marker({
          position: { lat, lng },
          map: mapInstanceRef.current,
          title: address || "Location",
          animation: window.google.maps.Animation.DROP,
        });
      }

      setMapLoaded(true);
    } catch (error) {
      console.error("Error initializing map:", error);
    }
  }, [scriptLoaded, lat, lng, address]);

  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    return (
      <div className="w-full h-[400px] bg-green-50 border-2 border-dashed border-green-200 rounded-lg flex flex-col items-center justify-center p-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <p className="text-sm text-green-700 font-medium">Map placeholder - Integrate Google Maps / Mapbox here</p>
        </div>
        {address && (
          <p className="text-xs text-green-600 text-center mt-2">
            Showing preview for {address}.
          </p>
        )}
        <p className="text-xs text-green-600 text-center mt-1">
          In your production app, this area will be replaced by an interactive map component using your preferred provider.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-[400px] rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
      <div id={mapIdRef.current} className="w-full h-full" />
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

  // Fetch addresses
  const { data: addresses = [], isLoading } = useQuery(trpc.addresses.list.queryOptions());

  // Auto-select first address if available and none selected
  useEffect(() => {
    if (addresses.length > 0 && !selectedAddress) {
      setSelectedAddress(addresses[0]);
    }
  }, [addresses, selectedAddress]);

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

  // Initialize Google Maps Autocomplete
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initAutocomplete = () => {
      if (!window.google?.maps?.places) {
        // Wait for Google Maps to load
        setTimeout(initAutocomplete, 100);
        return;
      }

      const input = document.getElementById("street-address") as HTMLInputElement;
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

    if (editingAddress) {
      // Update existing address
      updateAddressMutation.mutate({
        id: editingAddress.id,
        name: locationLabel.trim(),
        folderId: null,
        connectedUserId: null,
        street: street || undefined,
        city: city || undefined,
        state: state || undefined,
        zip: zip || undefined,
        country: country || undefined,
        latitude: lat || undefined,
        longitude: lng || undefined,
      });
    } else {
      // Create new address
      createAddressMutation.mutate({
        name: locationLabel.trim(),
        folderId: null,
        connectedUserId: null,
        street: street || undefined,
        city: city || undefined,
        state: state || undefined,
        zip: zip || undefined,
        country: country || undefined,
        latitude: lat || undefined,
        longitude: lng || undefined,
      });
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
    // Scroll to form
    document.getElementById("location-label")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
        <span className="font-medium">Saved addresses</span>
      </div>

      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Saved addresses</h1>
            <p className="text-gray-600">
              Add your frequent locations, view them on the map and share directions to WhatsApp in a single tap.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
              One tap share to WhatsApp
            </span>
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
              Responsive · Dashboard & mobile
            </span>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Add new location Card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingAddress ? "Edit location" : "Add new location"}
                </h2>
                <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                  STEP 1 - CAPTURE
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Save an address or coordinates to use across your dashboard and mobile app.
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="location-label">Location label</Label>
                  <Input
                    id="location-label"
                    placeholder="e.g. Home, Office, Client - OK Foods"
                    value={locationLabel}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocationLabel(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="street-address">Street address</Label>
                  <div className="relative">
                    <Input
                      id="street-address"
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
                    <Label htmlFor="coordinates">Pin / coordinates (optional)</Label>
                    <button
                      type="button"
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      onClick={() => {
                        if (window.google?.maps && coordinates) {
                          const { lat, lng } = parseCoordinates(coordinates);
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
                          } else {
                            toast({
                              title: "Invalid coordinates",
                              description: "Please enter valid coordinates in the format: lat, lng",
                              variant: "destructive",
                            });
                          }
                        } else {
                          toast({
                            title: "Google Maps not loaded",
                            description: "Please wait for Google Maps to load, or enter coordinates manually.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Drop pin on map
                    </button>
                  </div>
                  <Input
                    id="coordinates"
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
                </div>

                <div className="pt-2">
                  <p className="text-xs text-gray-500 mb-4">
                    Once saved, locations are available across your web dashboard and mobile app.
                  </p>
                  <div className="flex gap-2">
                    {editingAddress && (
                      <Button
                        onClick={handleCancelEdit}
                        variant="outline"
                        className="flex-1"
                        disabled={createAddressMutation.isPending || updateAddressMutation.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      onClick={handleSaveLocation}
                      disabled={createAddressMutation.isPending || updateAddressMutation.isPending}
                      className={cn("flex-1 bg-blue-600 hover:bg-blue-700", editingAddress && "flex-1")}
                    >
                      {(createAddressMutation.isPending || updateAddressMutation.isPending) ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {editingAddress ? "Updating..." : "Saving..."}
                        </>
                      ) : (
                        editingAddress ? "Update location" : "Save location"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Saved locations Card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Saved locations</h2>
                <span className="text-sm text-gray-600">{addresses.length} saved</span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : addresses.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>No saved locations yet.</p>
                  <p className="text-sm mt-1">Add your first location above.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {addresses.map((address: any) => (
                    <div
                      key={address.id}
                      className={cn(
                        "p-4 rounded-lg border-2 transition-all cursor-pointer",
                        selectedAddress?.id === address.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      )}
                      onClick={() => handleSelectAddress(address)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 mb-1">{address.name}</h3>
                          <p className="text-sm text-gray-600 mb-1">
                            {getFullAddress(address) || "No address provided"}
                          </p>
                          {getCoordinatesString(address) && (
                            <p className="text-xs text-gray-500">
                              {getCoordinatesString(address)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className="text-sm text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              handleSelectAddress(address);
                            }}
                          >
                            Tap to view on map
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                handleEditAddress(address);
                              }}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  handleDeleteAddress(address);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Map Preview */}
        <div>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">MAP PREVIEW</h2>
                {selectedAddress && (
                  <Button
                    onClick={handleWhatsAppShare}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Send to WhatsApp
                  </Button>
                )}
              </div>

              {selectedAddress ? (
                <>
                  <div className="mb-4">
                    <h3 className="font-bold text-gray-900 mb-1">{selectedAddress.name}</h3>
                    <p className="text-sm text-gray-600">
                      {getFullAddress(selectedAddress) || "No address provided"}
                    </p>
                  </div>
                  <GoogleMap
                    lat={selectedAddress.latitude}
                    lng={selectedAddress.longitude}
                    address={selectedAddress.name}
                  />
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-gray-500">
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

      {/* Responsive Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-gray-900 mb-2">Dashboard view</h3>
            <p className="text-sm text-gray-600">
              On larger screens, the form, list and map sit side by side for quick dispatch and routing.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-gray-900 mb-2">Mobile view</h3>
            <p className="text-sm text-gray-600">
              On phones, the layout stacks vertically so users can scroll from saved locations down into the map and WhatsApp share button.
            </p>
          </CardContent>
        </Card>
      </div>

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

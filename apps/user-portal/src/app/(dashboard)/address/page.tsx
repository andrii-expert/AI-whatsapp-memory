"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Home,
  ChevronLeft,
  Folder,
  FolderClosed,
  Plus,
  Search,
  Edit2,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Share2,
  SortAsc,
  SortDesc,
  Users,
  Eye,
  Edit3,
  MoreVertical,
  UserPlus,
  Mail,
  Phone,
  Loader2,
  MapPin,
} from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@imaginecalendar/ui/use-toast";
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
import { Label } from "@imaginecalendar/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";
import { ShareButton } from "@/components/share-button";
import { ShareModal } from "@/components/share-modal";
import { ShareDetailsModal } from "@/components/share-details-modal";

export default function AddressPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewAllAddresses, setViewAllAddresses] = useState(true);
  const [viewAllShared, setViewAllShared] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "alphabetical">("alphabetical");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Address modal states
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressModalMode, setAddressModalMode] = useState<"add" | "edit">("add");
  const [addressModalName, setAddressModalName] = useState("");
  const [addressModalId, setAddressModalId] = useState<string | null>(null);
  const [addressModalFolderId, setAddressModalFolderId] = useState<string | null>(null);
  const [addressModalConnectedUserId, setAddressModalConnectedUserId] = useState<string | null>(null);
  const [addressModalConnectedUser, setAddressModalConnectedUser] = useState<any>(null);
  
  // Address fields
  const [addressModalType, setAddressModalType] = useState<"home" | "office" | "parents_house" | "">("");
  const [addressModalStreet, setAddressModalStreet] = useState("");
  const [addressModalCity, setAddressModalCity] = useState("");
  const [addressModalState, setAddressModalState] = useState("");
  const [addressModalZip, setAddressModalZip] = useState("");
  const [addressModalCountry, setAddressModalCountry] = useState("");
  const [addressModalLatitude, setAddressModalLatitude] = useState<number | null>(null);
  const [addressModalLongitude, setAddressModalLongitude] = useState<number | null>(null);
  const [addressSearchQuery, setAddressSearchQuery] = useState("");
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const viewMapRef = useRef<HTMLDivElement>(null);
  const viewMapInstanceRef = useRef<google.maps.Map | null>(null);
  const viewMarkerRef = useRef<google.maps.Marker | null>(null);
  
  // User search states
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  // View address modal state
  const [isViewAddressModalOpen, setIsViewAddressModalOpen] = useState(false);
  const [viewAddressData, setViewAddressData] = useState<any>(null);

  // Folder states (inline editing like document page)
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleteFolderDialogOpen, setIsDeleteFolderDialogOpen] = useState(false);

  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: "folder" | "address"; id: string; name: string } | null>(null);

  // Share states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShareDetailsModalOpen, setIsShareDetailsModalOpen] = useState(false);
  const [shareResourceType, setShareResourceType] = useState<"address" | "address_folder">("address");
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [shareResourceName, setShareResourceName] = useState("");

  // Fetch folders and addresses
  const { data: allFolders = [], isLoading: isLoadingFolders } = useQuery(
    trpc.addresses.folders.list.queryOptions()
  );
  const { data: allAddresses = [], isLoading: isLoadingAddresses } = useQuery(
    trpc.addresses.list.queryOptions()
  );
  const { data: myShares = [] } = useQuery(
    trpc.addressSharing.getMyShares.queryOptions()
  );
  const { data: sharedResources } = useQuery(
    trpc.addressSharing.getSharedWithMe.queryOptions()
  );

  // Extract shared addresses and folders from sharedResources
  const sharedAddresses = useMemo(() => {
    return (sharedResources?.addresses || []).map((address: any) => ({
      ...address,
      isSharedWithMe: true,
      sharePermission: address.shareInfo?.permission || "view",
      ownerId: address.shareInfo?.ownerId,
    }));
  }, [sharedResources]);

  const sharedFolders = useMemo(() => {
    return (sharedResources?.folders || []).map((folder: any) => {
      const folderPermission = folder.shareInfo?.permission || "view";
      return {
        ...folder,
        isSharedWithMe: true,
        sharePermission: folderPermission,
        ownerId: folder.shareInfo?.ownerId,
        addresses: (folder.addresses || []).map((address: any) => ({
          ...address,
          isSharedWithMe: true,
          sharePermission: folderPermission,
          sharedViaFolder: true,
        })),
      };
    });
  }, [sharedResources]);

  // Filter out shared folders from main folder list
  const folders = allFolders.filter((folder: any) => !folder.isSharedWithMe);

  // Filter addresses based on selected folder
  const filteredAddresses = useMemo(() => {
    let addresses = viewAllShared
      ? [...sharedAddresses, ...sharedFolders.flatMap((f: any) => f.addresses || [])]
      : viewAllAddresses
      ? allAddresses
      : selectedFolderId
      ? allAddresses.filter((addr: any) => addr.folderId === selectedFolderId)
      : allAddresses.filter((addr: any) => !addr.folderId);

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      addresses = addresses.filter((addr: any) =>
        addr.name.toLowerCase().includes(query) ||
        (addr.connectedUser?.email && addr.connectedUser.email.toLowerCase().includes(query)) ||
        (addr.connectedUser?.phone && addr.connectedUser.phone.includes(query))
      );
    }

    // Apply sorting
    if (sortBy === "alphabetical") {
      addresses.sort((a: any, b: any) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        return sortOrder === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
      });
    } else {
      addresses.sort((a: any, b: any) => {
        const aDate = new Date(a.createdAt).getTime();
        const bDate = new Date(b.createdAt).getTime();
        return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
      });
    }

    return addresses;
  }, [allAddresses, selectedFolderId, viewAllAddresses, viewAllShared, searchQuery, sortBy, sortOrder, sharedAddresses, sharedFolders]);

  // Mutations
  const createFolderMutation = useMutation(
    trpc.addresses.folders.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Folder created", variant: "default" });
        setNewFolderName("");
      },
      onError: (error) => {
        toast({
          title: "Folder create failed",
          description: error.message || "Could not create folder",
          variant: "destructive",
        });
      },
    })
  );

  const updateFolderMutation = useMutation(
    trpc.addresses.folders.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Folder updated", variant: "default" });
        setEditingFolderId(null);
        setEditFolderName("");
      },
      onError: (error) => {
        toast({
          title: "Folder update failed",
          description: error.message || "Could not update folder",
          variant: "destructive",
        });
      },
    })
  );

  const deleteFolderMutation = useMutation(
    trpc.addresses.folders.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setIsDeleteFolderDialogOpen(false);
        setFolderToDelete(null);
        if (selectedFolderId === folderToDelete?.id) {
          setSelectedFolderId(null);
        }
        toast({ title: "Folder deleted", variant: "default" });
      },
      onError: (error) => {
        toast({
          title: "Folder delete failed",
          description: error.message || "Could not delete folder",
          variant: "destructive",
        });
      },
    })
  );

  const createAddressMutation = useMutation(
    trpc.addresses.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setIsAddressModalOpen(false);
        resetAddressModal();
        toast({
          title: "Address created",
          description: "Address has been created successfully.",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to create address",
          variant: "destructive",
        });
      },
    })
  );

  const updateAddressMutation = useMutation(
    trpc.addresses.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setIsAddressModalOpen(false);
        resetAddressModal();
        toast({
          title: "Address updated",
          description: "Address has been updated successfully.",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to update address",
          variant: "destructive",
        });
      },
    })
  );

  const deleteAddressMutation = useMutation(
    trpc.addresses.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setDeleteConfirmOpen(false);
        setItemToDelete(null);
        toast({
          title: "Address deleted",
          description: "Address has been deleted successfully.",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to delete address",
          variant: "destructive",
        });
      },
    })
  );

  // User search - using query directly in handleSearchUsers

  // Helper functions
  const resetAddressModal = () => {
    setAddressModalName("");
    setAddressModalId(null);
    setAddressModalFolderId(null);
    setAddressModalConnectedUserId(null);
    setAddressModalConnectedUser(null);
    setUserSearchTerm("");
    setUserSearchResults([]);
    setAddressModalType("");
    setAddressModalStreet("");
    setAddressModalCity("");
    setAddressModalState("");
    setAddressModalZip("");
    setAddressModalCountry("");
    setAddressModalLatitude(null);
    setAddressModalLongitude(null);
    setAddressSearchQuery("");
    if (autocompleteRef.current) {
      autocompleteRef.current.value = "";
    }
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current = null;
    }
    if (viewMarkerRef.current) {
      viewMarkerRef.current.setMap(null);
      viewMarkerRef.current = null;
    }
    if (viewMapInstanceRef.current) {
      viewMapInstanceRef.current = null;
    }
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate({ name: newFolderName.trim() }, {
      onSuccess: () => {
        setNewFolderName("");
      }
    });
  };

  const handleEditFolder = (folderId: string, currentName: string) => {
    setEditingFolderId(folderId);
    setEditFolderName(currentName);
  };

  const handleSaveFolder = (folderId: string) => {
    if (!editFolderName.trim()) {
      setEditingFolderId(null);
      setEditFolderName("");
      return;
    }
    updateFolderMutation.mutate({ id: folderId, name: editFolderName.trim() });
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    setFolderToDelete({ id: folderId, name: folderName });
    setIsDeleteFolderDialogOpen(true);
  };

  const confirmDeleteFolder = () => {
    if (folderToDelete) {
      deleteFolderMutation.mutate({ id: folderToDelete.id });
    }
  };

  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setViewAllAddresses(false);
    setViewAllShared(false);
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllAddresses = () => {
    setSelectedFolderId(null);
    setViewAllAddresses(true);
    setViewAllShared(false);
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllShared = () => {
    setSelectedFolderId(null);
    setViewAllAddresses(false);
    setViewAllShared(true);
    setIsMobileSidebarOpen(false);
  };

  // Get share count for a resource
  const getShareCount = (resourceType: "address" | "address_folder", resourceId: string): number => {
    return myShares.filter(
      (share: any) => share.resourceType === resourceType && share.resourceId === resourceId
    ).length;
  };

  const handleCreateAddress = () => {
    if (!addressModalName.trim()) {
      toast({
        title: "Error",
        description: "Address name is required",
        variant: "destructive",
      });
      return;
    }
    createAddressMutation.mutate({
      name: addressModalName.trim(),
      folderId: addressModalFolderId || null,
      connectedUserId: addressModalConnectedUserId || null,
      addressType: addressModalType || undefined,
      street: addressModalStreet.trim() || undefined,
      city: addressModalCity.trim() || undefined,
      state: addressModalState.trim() || undefined,
      zip: addressModalZip.trim() || undefined,
      country: addressModalCountry.trim() || undefined,
      latitude: addressModalLatitude || undefined,
      longitude: addressModalLongitude || undefined,
    });
  };

  const handleUpdateAddress = () => {
    if (!addressModalId || !addressModalName.trim()) return;
    updateAddressMutation.mutate({
      id: addressModalId,
      name: addressModalName.trim(),
      folderId: addressModalFolderId || null,
      connectedUserId: addressModalConnectedUserId || null,
      addressType: addressModalType || undefined,
      street: addressModalStreet.trim() || undefined,
      city: addressModalCity.trim() || undefined,
      state: addressModalState.trim() || undefined,
      zip: addressModalZip.trim() || undefined,
      country: addressModalCountry.trim() || undefined,
      latitude: addressModalLatitude || undefined,
      longitude: addressModalLongitude || undefined,
    });
  };

  const handleDeleteAddress = () => {
    if (!itemToDelete || itemToDelete.type !== "address") return;
    deleteAddressMutation.mutate({ id: itemToDelete.id });
  };

  const selectedFolder = folders.find((f: any) => f.id === selectedFolderId) || 
    sharedFolders.find((f: any) => f.id === selectedFolderId);

  const handleSearchUsers = async (searchTerm: string) => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setUserSearchResults([]);
      return;
    }

    setIsSearchingUsers(true);
    try {
      const results = await queryClient.fetchQuery(
        trpc.addresses.searchUsers.queryOptions({ searchTerm: searchTerm.trim() })
      );
      setUserSearchResults(results);
    } catch (error) {
      console.error("Error searching users:", error);
      setUserSearchResults([]);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleSelectUser = (user: any) => {
    setAddressModalConnectedUserId(user.id);
    setAddressModalConnectedUser(user);
    setUserSearchTerm("");
    setUserSearchResults([]);
  };

  const handleRemoveConnectedUser = () => {
    setAddressModalConnectedUserId(null);
    setAddressModalConnectedUser(null);
  };

  const openAddAddressModal = (folderId?: string | null) => {
    setAddressModalMode("add");
    setAddressModalFolderId(folderId || null);
    setIsAddressModalOpen(true);
  };

  const openEditAddressModal = (address: any) => {
    setAddressModalMode("edit");
    setAddressModalId(address.id);
    setAddressModalName(address.name);
    setAddressModalFolderId(address.folderId || null);
    setAddressModalConnectedUserId(address.connectedUserId || null);
    setAddressModalConnectedUser(address.connectedUser || null);
    setAddressModalType(address.addressType || "");
    setAddressModalStreet(address.street || "");
    setAddressModalCity(address.city || "");
    setAddressModalState(address.state || "");
    setAddressModalZip(address.zip || "");
    setAddressModalCountry(address.country || "");
    setAddressModalLatitude(address.latitude || null);
    setAddressModalLongitude(address.longitude || null);
    setAddressSearchQuery(
      [address.street, address.city, address.state, address.zip, address.country]
        .filter(Boolean)
        .join(", ") || ""
    );
    setIsAddressModalOpen(true);
  };

  const openViewAddressModal = (address: any) => {
    setViewAddressData(address);
    setIsViewAddressModalOpen(true);
  };

  const openShareModal = (resourceType: "address" | "address_folder", resourceId: string, resourceName: string) => {
    setShareResourceType(resourceType);
    setShareResourceId(resourceId);
    setShareResourceName(resourceName);
    setIsShareModalOpen(true);
  };

  const openShareDetailsModal = (resourceType: "address" | "address_folder", resourceId: string, resourceName: string) => {
    setShareResourceType(resourceType);
    setShareResourceId(resourceId);
    setShareResourceName(resourceName);
    setIsShareDetailsModalOpen(true);
  };

  const getFolderAddressCount = (folderId: string | null) => {
    if (folderId === null) return allAddresses.filter((addr: any) => !addr.folderId && !addr.isSharedWithMe).length;
    return allAddresses.filter((addr: any) => addr.folderId === folderId && !addr.isSharedWithMe).length;
  };
  const allAddressesCount = allAddresses.filter((addr: any) => !addr.isSharedWithMe).length;
  
  // Calculate total shared address count (deduplicated)
  const totalSharedAddressCount = useMemo(() => {
    const addressesFromSharedFolders = sharedFolders.flatMap((folder: any) => folder.addresses || []);
    const allSharedAddresses = [...sharedAddresses, ...addressesFromSharedFolders];
    const uniqueAddressIds = new Set(allSharedAddresses.map((addr: any) => addr.id));
    return uniqueAddressIds.size;
  }, [sharedAddresses, sharedFolders]);

  const isLoading = isLoadingFolders || isLoadingAddresses;

  // Load Google Maps script
  useEffect(() => {
    if (typeof window === "undefined") return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set");
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setIsGoogleMapsLoaded(true);
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      toast({
        title: "Error",
        description: "Failed to load Google Maps. Please check your API key.",
        variant: "destructive",
      });
    };

    if (!document.querySelector(`script[src="${script.src}"]`)) {
      document.head.appendChild(script);
    } else {
      // Script already exists, check if maps is loaded
      if (window.google?.maps) {
        setIsGoogleMapsLoaded(true);
      }
    }

    return () => {
      // Cleanup if needed
    };
  }, [toast]);

  // Initialize autocomplete when Google Maps is loaded and modal is open
  useEffect(() => {
    if (!isGoogleMapsLoaded || !isAddressModalOpen || !autocompleteRef.current || !window.google?.maps?.places) {
      return;
    }

    if (!window.google?.maps) return;

    const autocompleteInstance = new window.google.maps.places.Autocomplete(autocompleteRef.current, {
      types: ["address"],
      fields: ["address_components", "geometry", "formatted_address"],
    });

    autocompleteInstance.addListener("place_changed", () => {
      const place = autocompleteInstance.getPlace();
      
      if (!place.geometry || !place.geometry.location) {
        return;
      }

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      
      setAddressModalLatitude(lat);
      setAddressModalLongitude(lng);

      // Parse address components
      let street = "";
      let city = "";
      let state = "";
      let zip = "";
      let country = "";

      if (place.address_components) {
        place.address_components.forEach((component: google.maps.places.AddressComponent) => {
          const types = component.types;
          
          if (types.includes("street_number")) {
            street = component.long_name + " ";
          }
          if (types.includes("route")) {
            street += component.long_name;
          }
          if (types.includes("locality")) {
            city = component.long_name;
          }
          if (types.includes("administrative_area_level_1")) {
            state = component.short_name;
          }
          if (types.includes("postal_code")) {
            zip = component.long_name;
          }
          if (types.includes("country")) {
            country = component.long_name;
          }
        });
      }

      setAddressModalStreet(street.trim());
      setAddressModalCity(city);
      setAddressModalState(state);
      setAddressModalZip(zip);
      setAddressModalCountry(country);
      setAddressSearchQuery(place.formatted_address || "");
    });

    setAutocomplete(autocompleteInstance);

    return () => {
      if (autocompleteInstance && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteInstance);
      }
    };
  }, [isGoogleMapsLoaded, isAddressModalOpen]);

  // Initialize map when coordinates are available in edit modal
  useEffect(() => {
    if (!isGoogleMapsLoaded || !mapRef.current || !isAddressModalOpen || !window.google?.maps) return;

    const hasCoordinates = addressModalLatitude !== null && addressModalLongitude !== null;
    if (!hasCoordinates) return;

    const lat = addressModalLatitude;
    const lng = addressModalLongitude;

    if (!lat || !lng) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat, lng },
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
    } else {
      mapInstanceRef.current.setCenter({ lat, lng });
    }

    // Add or update marker
    if (markerRef.current) {
      markerRef.current.setPosition({ lat, lng });
    } else {
      markerRef.current = new window.google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
      });
    }
  }, [isGoogleMapsLoaded, addressModalLatitude, addressModalLongitude, isAddressModalOpen]);

  // Initialize map for view modal
  useEffect(() => {
    if (!isGoogleMapsLoaded || !viewMapRef.current || !isViewAddressModalOpen || !window.google?.maps) return;

    const hasCoordinates = viewAddressData?.latitude && viewAddressData?.longitude;
    if (!hasCoordinates) return;

    const lat = viewAddressData.latitude;
    const lng = viewAddressData.longitude;

    if (!lat || !lng) return;

    if (!viewMapInstanceRef.current) {
      viewMapInstanceRef.current = new window.google.maps.Map(viewMapRef.current, {
        center: { lat, lng },
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
    } else {
      viewMapInstanceRef.current.setCenter({ lat, lng });
    }

    // Add or update marker
    if (viewMarkerRef.current) {
      viewMarkerRef.current.setPosition({ lat, lng });
    } else {
      viewMarkerRef.current = new window.google.maps.Marker({
        position: { lat, lng },
        map: viewMapInstanceRef.current,
      });
    }
  }, [isGoogleMapsLoaded, isViewAddressModalOpen, viewAddressData]);

  return (
    <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm justify-between">
        <div className="flex items-center justify-center gap-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Link>
          <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
          <span className="font-medium">Address Book</span>
        </div>

        <Button
          onClick={() => openAddAddressModal()}
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
            <h2 className="text-xl font-bold text-gray-900">Folders</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* New Folder Input */}
          <form onSubmit={handleCreateFolder} className="flex gap-2 mb-4">
            <Input
              placeholder="New folder"
              value={newFolderName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewFolderName(e.target.value)
              }
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              disabled={createFolderMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          {/* Folders List */}
          <div className="space-y-1">
            {/* All Addresses Button - Always show */}
            <button
              onClick={handleViewAllAddresses}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                viewAllAddresses
                  ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                  : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
              )}
            >
              <Folder className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">All Addresses</span>
              <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                {allAddressesCount}
              </span>
            </button>

            {folders.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p>No folders yet.</p>
                <p className="text-xs mt-1">
                  Create a folder above to get started.
                </p>
              </div>
            ) : (
              <>
                {/* Divider */}
                <div className="h-px bg-gray-200 my-2" />

                {/* Individual Folders */}
                {folders.map((folder: any) => {
                  const isEditing = editingFolderId === folder.id;
                  const shareCount = getShareCount("address_folder", folder.id);
                  const isShared = shareCount > 0;
                  
                  return (
                    <div
                      key={folder.id}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium group",
                        selectedFolderId === folder.id && !viewAllAddresses && !viewAllShared
                          ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                          : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                      )}
                    >
                      {isEditing ? (
                        <Input
                          value={editFolderName}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setEditFolderName(e.target.value)
                          }
                          onBlur={() => handleSaveFolder(folder.id)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === "Enter") handleSaveFolder(folder.id);
                            if (e.key === "Escape") {
                              setEditingFolderId(null);
                              setEditFolderName("");
                            }
                          }}
                          autoFocus
                          className="flex-1 h-7 text-sm"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <button
                            onClick={() => handleFolderSelect(folder.id)}
                            className="flex items-center gap-2 flex-1 text-left min-w-0"
                          >
                            <FolderClosed className="h-4 w-4 flex-shrink-0" />
                            <span className="flex-1 truncate">{folder.name}</span>
                          </button>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Share button */}
                            <ShareButton
                              onClick={() => {
                                if (isShared) {
                                  openShareDetailsModal("address_folder", folder.id, folder.name);
                                } else {
                                  openShareModal("address_folder", folder.id, folder.name);
                                }
                              }}
                              isShared={isShared}
                              shareCount={shareCount}
                              size="sm"
                            />
                            {/* Dropdown menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 hover:bg-gray-200 transition-opacity"
                                  title="Folder options"
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                  }}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                <DropdownMenuItem
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    if (isShared) {
                                      openShareDetailsModal("address_folder", folder.id, folder.name);
                                    } else {
                                      openShareModal("address_folder", folder.id, folder.name);
                                    }
                                  }}
                                  className="flex items-center gap-2 cursor-pointer"
                                >
                                  {isShared ? (
                                    <>
                                      <Users className="h-4 w-4" />
                                      <span>Shared</span>
                                      <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                        {shareCount}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <Users className="h-4 w-4" />
                                      <span>Share</span>
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    handleEditFolder(folder.id, folder.name);
                                  }}
                                  className="flex items-center gap-2 cursor-pointer"
                                >
                                  <Edit2 className="h-4 w-4" />
                                  <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    handleDeleteFolder(folder.id, folder.name);
                                  }}
                                  className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>Delete</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                            {getFolderAddressCount(folder.id)}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* Shared Section */}
            {(sharedAddresses.length > 0 || sharedFolders.length > 0) && (
              <>
                {/* Divider */}
                <div className="h-px bg-gray-200 my-2" />

                {/* Shared Section Header */}
                <div className="px-2 py-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Shared with me
                  </h3>
                </div>

                {/* All Shared Addresses Button */}
                {totalSharedAddressCount > 0 && (
                  <button
                    onClick={handleViewAllShared}
                    className={cn(
                      "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                      viewAllShared && !selectedFolderId
                        ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300"
                        : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                    )}
                  >
                    <Folder className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 text-left">All Shared</span>
                    <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                      {totalSharedAddressCount}
                    </span>
                  </button>
                )}

                {/* Shared Folders */}
                {sharedFolders.length > 0 &&
                  sharedFolders.map((folder: any) => (
                    <div
                      key={folder.id}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium group",
                        selectedFolderId === folder.id &&
                          !viewAllAddresses &&
                          !viewAllShared
                          ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300"
                          : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                      )}
                    >
                      <button
                        onClick={() => handleFolderSelect(folder.id)}
                        className="flex items-center gap-2 flex-1 text-left min-w-0"
                      >
                        <FolderClosed className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1 text-left truncate">
                          {folder.name}
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openShareDetailsModal(
                            "address_folder",
                            folder.id,
                            folder.name
                          );
                        }}
                        className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium flex-shrink-0 hover:bg-purple-200 transition-colors"
                        title="View who shared this folder with you"
                      >
                        <Users className="h-2.5 w-2.5" />
                        <span className="hidden sm:inline">
                          {folder.sharePermission === "view" ? "View" : "Edit"}
                        </span>
                      </button>
                      {folder.addresses && folder.addresses.length > 0 && (
                        <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                          {folder.addresses.length}
                        </span>
                      )}
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* Desktop Left Panel - Folders */}
        <div className="hidden lg:block space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Folders</h2>

            {/* New Folder Input */}
            <form onSubmit={handleCreateFolder} className="flex gap-2 mb-4">
              <Input
                placeholder="New folder"
                value={newFolderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewFolderName(e.target.value)
                }
                className="flex-1"
              />
              <Button
                type="submit"
                size="icon"
                variant="outline"
                disabled={createFolderMutation.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </form>

              {/* Folders List */}
              <div className="space-y-1">
                {/* All Addresses Button - Always show */}
                <button
                  onClick={handleViewAllAddresses}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                    viewAllAddresses
                      ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                      : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                  )}
                >
                  <Folder className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 text-left">All Addresses</span>
                  <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                    {allAddressesCount}
                  </span>
                </button>

                {folders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p>No folders yet.</p>
                    <p className="text-xs mt-1">
                      Create a folder above to get started.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Divider */}
                    <div className="h-px bg-gray-200 my-2" />

                    {/* Individual Folders */}
                    {folders.map((folder: any) => {
                      const isEditing = editingFolderId === folder.id;
                      const shareCount = getShareCount("address_folder", folder.id);
                      const isShared = shareCount > 0;
                      
                      return (
                        <div
                          key={folder.id}
                          className={cn(
                            "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium group",
                            selectedFolderId === folder.id && !viewAllAddresses && !viewAllShared
                              ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                              : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                          )}
                        >
                          {isEditing ? (
                            <Input
                              value={editFolderName}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setEditFolderName(e.target.value)
                              }
                              onBlur={() => handleSaveFolder(folder.id)}
                              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === "Enter") handleSaveFolder(folder.id);
                                if (e.key === "Escape") {
                                  setEditingFolderId(null);
                                  setEditFolderName("");
                                }
                              }}
                              autoFocus
                              className="flex-1 h-7 text-sm"
                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              <button
                                onClick={() => handleFolderSelect(folder.id)}
                                className="flex items-center gap-2 flex-1 text-left min-w-0"
                              >
                                <FolderClosed className="h-4 w-4 flex-shrink-0" />
                                <span className="flex-1 truncate">{folder.name}</span>
                              </button>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {/* Share button */}
                                <ShareButton
                                  onClick={() => {
                                    if (isShared) {
                                      openShareDetailsModal("address_folder", folder.id, folder.name);
                                    } else {
                                      openShareModal("address_folder", folder.id, folder.name);
                                    }
                                  }}
                                  isShared={isShared}
                                  shareCount={shareCount}
                                  size="sm"
                                />
                                {/* Dropdown menu */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 hover:bg-gray-200 transition-opacity"
                                      title="Folder options"
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                      }}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        if (isShared) {
                                          openShareDetailsModal("address_folder", folder.id, folder.name);
                                        } else {
                                          openShareModal("address_folder", folder.id, folder.name);
                                        }
                                      }}
                                      className="flex items-center gap-2 cursor-pointer"
                                    >
                                      {isShared ? (
                                        <>
                                          <Users className="h-4 w-4" />
                                          <span>Shared</span>
                                          <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                            {shareCount}
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <Users className="h-4 w-4" />
                                          <span>Share</span>
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        handleEditFolder(folder.id, folder.name);
                                      }}
                                      className="flex items-center gap-2 cursor-pointer"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                      <span>Edit</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        handleDeleteFolder(folder.id, folder.name);
                                      }}
                                      className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      <span>Delete</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                                {getFolderAddressCount(folder.id)}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Shared Section */}
                {(sharedAddresses.length > 0 || sharedFolders.length > 0) && (
                  <>
                    {/* Divider */}
                    <div className="h-px bg-gray-200 my-2" />

                    {/* Shared Section Header */}
                    <div className="px-2 py-2">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        Shared with me
                      </h3>
                    </div>

                    {/* All Shared Addresses Button */}
                    {totalSharedAddressCount > 0 && (
                      <button
                        onClick={handleViewAllShared}
                        className={cn(
                          "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                          viewAllShared && !selectedFolderId
                            ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300"
                            : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                        )}
                      >
                        <Folder className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1 text-left">All Shared</span>
                        <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                          {totalSharedAddressCount}
                        </span>
                      </button>
                    )}

                    {/* Shared Folders */}
                    {sharedFolders.length > 0 &&
                      sharedFolders.map((folder: any) => (
                        <div
                          key={folder.id}
                          className={cn(
                            "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium group",
                            selectedFolderId === folder.id &&
                              !viewAllAddresses &&
                              !viewAllShared
                              ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300"
                              : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                          )}
                        >
                          <button
                            onClick={() => handleFolderSelect(folder.id)}
                            className="flex items-center gap-2 flex-1 text-left min-w-0"
                          >
                            <FolderClosed className="h-4 w-4 flex-shrink-0" />
                            <span className="flex-1 text-left truncate">
                              {folder.name}
                            </span>
                          </button>
                          <button
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              openShareDetailsModal(
                                "address_folder",
                                folder.id,
                                folder.name
                              );
                            }}
                            className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium flex-shrink-0 hover:bg-purple-200 transition-colors"
                            title="View who shared this folder with you"
                          >
                            <Users className="h-2.5 w-2.5" />
                            <span className="hidden sm:inline">
                              {folder.sharePermission === "view" ? "View" : "Edit"}
                            </span>
                          </button>
                          {folder.addresses && folder.addresses.length > 0 && (
                            <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                              {folder.addresses.length}
                            </span>
                          )}
                        </div>
                      ))}
                  </>
                )}
              </div>
            </div>
          </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Search and Sort */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search addresses..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alphabetical">Alphabetical</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              >
                {sortOrder === "asc" ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={() => openAddAddressModal(selectedFolderId)} className="md:hidden">
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>

          {/* Addresses List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAddresses.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? "No addresses found matching your search." : "No addresses yet."}
              </p>
              {!searchQuery && (
                <Button onClick={() => openAddAddressModal()} className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Address
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAddresses.map((address: any) => (
                <div
                  key={address.id}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg">{address.name}</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openViewAddressModal(address)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        {!address.isSharedWithMe && (
                          <>
                            <DropdownMenuItem onClick={() => openEditAddressModal(address)}>
                              <Edit3 className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openShareModal("address", address.id, address.name)}>
                              <Share2 className="h-4 w-4 mr-2" />
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setItemToDelete({ type: "address", id: address.id, name: address.name });
                                setDeleteConfirmOpen(true);
                              }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {(address.street || address.city || address.state || address.zip) && (
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3" />
                        <span>
                          {[address.street, address.city, address.state, address.zip]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </div>
                    </div>
                  )}
                  {address.connectedUser && (
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {address.connectedUser.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          <span>{address.connectedUser.email}</span>
                        </div>
                      )}
                      {address.connectedUser.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          <span>{address.connectedUser.phone}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {address.isSharedWithMe && (
                    <div className="mt-2">
                      <span className="text-xs text-muted-foreground">Shared with you</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Address Modal */}
      <AlertDialog open={isAddressModalOpen} onOpenChange={setIsAddressModalOpen}>
        <AlertDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{addressModalMode === "add" ? "Add Address" : "Edit Address"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-4">
                  {addressModalMode === "add"
                    ? "Create a new address entry. You can optionally connect it to a user account."
                    : "Update the address details."}
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address-name">Title *</Label>
                    <Input
                      id="address-name"
                      value={addressModalName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddressModalName(e.target.value)}
                      placeholder="e.g., John Doe, Company Name, Home Address"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address-folder">Folder</Label>
                    <Select
                      value={addressModalFolderId || "uncategorized"}
                      onValueChange={(value) => setAddressModalFolderId(value === "uncategorized" ? null : value)}
                    >
                      <SelectTrigger id="address-folder">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uncategorized">Uncategorized</SelectItem>
                        {folders.map((folder: any) => (
                          <SelectItem key={folder.id} value={folder.id}>
                            {folder.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address-type">Address Type</Label>
                    <Select
                      value={addressModalType || "none"}
                      onValueChange={(value) => {
                        if (value === "none") {
                          setAddressModalType("");
                        } else {
                          setAddressModalType(value as "home" | "office" | "parents_house");
                        }
                      }}
                    >
                      <SelectTrigger id="address-type">
                        <SelectValue placeholder="Select address type (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="home">Home</SelectItem>
                        <SelectItem value="office">Office</SelectItem>
                        <SelectItem value="parents_house">Parents House</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address-search">Search Address (Google Maps) *</Label>
                    <Input
                      ref={autocompleteRef}
                      id="address-search"
                      value={addressSearchQuery}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddressSearchQuery(e.target.value)}
                      placeholder="Start typing an address..."
                      disabled={!isGoogleMapsLoaded}
                    />
                    {!isGoogleMapsLoaded && (
                      <p className="text-xs text-muted-foreground">
                        Loading Google Maps...
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="address-street">Street</Label>
                      <Input
                        id="address-street"
                        value={addressModalStreet}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddressModalStreet(e.target.value)}
                        placeholder="Street address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address-city">City</Label>
                      <Input
                        id="address-city"
                        value={addressModalCity}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddressModalCity(e.target.value)}
                        placeholder="City"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="address-state">State/Province</Label>
                      <Input
                        id="address-state"
                        value={addressModalState}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddressModalState(e.target.value)}
                        placeholder="State"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address-zip">ZIP/Postal Code</Label>
                      <Input
                        id="address-zip"
                        value={addressModalZip}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddressModalZip(e.target.value)}
                        placeholder="ZIP"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address-country">Country</Label>
                      <Input
                        id="address-country"
                        value={addressModalCountry}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddressModalCountry(e.target.value)}
                        placeholder="Country"
                      />
                    </div>
                  </div>

                  {(addressModalLatitude !== null && addressModalLongitude !== null) && (
                    <div className="space-y-2">
                      <Label>Map Preview</Label>
                      <div
                        ref={mapRef}
                        className="w-full h-64 rounded-lg border overflow-hidden"
                        style={{ minHeight: "256px" }}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Connect to User (Optional)</Label>
                    {addressModalConnectedUser ? (
                      <div className="border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {addressModalConnectedUser.firstName || addressModalConnectedUser.name || "User"}
                          </div>
                          {addressModalConnectedUser.email && (
                            <div className="text-sm text-muted-foreground">{addressModalConnectedUser.email}</div>
                          )}
                          {addressModalConnectedUser.phone && (
                            <div className="text-sm text-muted-foreground">{addressModalConnectedUser.phone}</div>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleRemoveConnectedUser}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search by email or phone number..."
                            value={userSearchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              setUserSearchTerm(e.target.value);
                              if (e.target.value.length >= 2) {
                                handleSearchUsers(e.target.value);
                              } else {
                                setUserSearchResults([]);
                              }
                            }}
                            className="pl-10"
                          />
                        </div>
                        {isSearchingUsers && (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {userSearchResults.length > 0 && (
                          <div className="border rounded-lg max-h-48 overflow-y-auto">
                            {userSearchResults.map((user) => (
                              <div
                                key={user.id}
                                className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0"
                                onClick={() => handleSelectUser(user)}
                              >
                                <div className="font-medium">
                                  {user.firstName || user.name || "User"}
                                </div>
                                {user.email && (
                                  <div className="text-sm text-muted-foreground">{user.email}</div>
                                )}
                                {user.phone && (
                                  <div className="text-sm text-muted-foreground">{user.phone}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {userSearchTerm.length >= 2 && !isSearchingUsers && userSearchResults.length === 0 && (
                          <div className="text-sm text-muted-foreground text-center py-4">
                            No users found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsAddressModalOpen(false);
              resetAddressModal();
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (addressModalMode === "add") {
                  handleCreateAddress();
                } else {
                  handleUpdateAddress();
                }
              }}
              disabled={!addressModalName.trim() || createAddressMutation.isPending || updateAddressMutation.isPending}
            >
              {addressModalMode === "add" ? "Create" : "Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Address Modal */}
      <AlertDialog open={isViewAddressModalOpen} onOpenChange={setIsViewAddressModalOpen}>
        <AlertDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{viewAddressData?.name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {viewAddressData?.addressType && (
                  <div className="space-y-2">
                    <Label>Address Type</Label>
                    <div className="text-sm capitalize">
                      {viewAddressData.addressType.replace("_", " ")}
                    </div>
                  </div>
                )}
                
                {(viewAddressData?.street || viewAddressData?.city || viewAddressData?.state || viewAddressData?.zip || viewAddressData?.country) && (
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <div className="border rounded-lg p-3 space-y-1">
                      {viewAddressData.street && (
                        <div className="text-sm">{viewAddressData.street}</div>
                      )}
                      <div className="text-sm">
                        {[
                          viewAddressData.city,
                          viewAddressData.state,
                          viewAddressData.zip
                        ].filter(Boolean).join(", ")}
                      </div>
                      {viewAddressData.country && (
                        <div className="text-sm">{viewAddressData.country}</div>
                      )}
                    </div>
                  </div>
                )}

                {(viewAddressData?.latitude && viewAddressData?.longitude) && (
                  <div className="space-y-2">
                    <Label>Location Map</Label>
                    <div
                      ref={viewMapRef}
                      className="w-full h-64 rounded-lg border overflow-hidden"
                      style={{ minHeight: "256px" }}
                    />
                  </div>
                )}

                {viewAddressData?.connectedUser && (
                  <div className="space-y-2">
                    <Label>Connected User</Label>
                    <div className="border rounded-lg p-3">
                      <div className="font-medium">
                        {viewAddressData.connectedUser.firstName || viewAddressData.connectedUser.name || "User"}
                      </div>
                      {viewAddressData.connectedUser.email && (
                        <div className="text-sm text-muted-foreground mt-1">
                          <Mail className="h-3 w-3 inline mr-1" />
                          {viewAddressData.connectedUser.email}
                        </div>
                      )}
                      {viewAddressData.connectedUser.phone && (
                        <div className="text-sm text-muted-foreground mt-1">
                          <Phone className="h-3 w-3 inline mr-1" />
                          {viewAddressData.connectedUser.phone}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {viewAddressData?.folderId && (
                  <div className="space-y-2">
                    <Label>Folder</Label>
                    <div className="text-sm">
                      {allFolders.find((f: any) => f.id === viewAddressData.folderId)?.name || "Unknown"}
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            {!viewAddressData?.isSharedWithMe && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsViewAddressModalOpen(false);
                    if (viewAddressData) openEditAddressModal(viewAddressData);
                  }}
                  className="w-full sm:w-auto"
                >
                  Edit
                </Button>
                <Button
                  onClick={() => {
                    setIsViewAddressModalOpen(false);
                    if (viewAddressData) {
                      openShareModal("address", viewAddressData.id, viewAddressData.name);
                    }
                  }}
                  className="w-full sm:w-auto"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </>
            )}
            <AlertDialogCancel onClick={() => setIsViewAddressModalOpen(false)} className="w-full sm:w-auto">
              Close
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Address Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Address?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAddress}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog open={isDeleteFolderDialogOpen} onOpenChange={setIsDeleteFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{folderToDelete?.name}"? All addresses in this folder will be moved to Uncategorized. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteFolder}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        resourceType={shareResourceType}
        resourceId={shareResourceId || ""}
        resourceName={shareResourceName}
      />

      {/* Share Details Modal */}
      <ShareDetailsModal
        isOpen={isShareDetailsModalOpen}
        onClose={() => setIsShareDetailsModalOpen(false)}
        resourceType={shareResourceType}
        resourceId={shareResourceId || ""}
        resourceName={shareResourceName}
      />

    </div>
  );
}


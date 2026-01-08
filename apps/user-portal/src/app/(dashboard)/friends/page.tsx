"use client";

import { useState, useMemo } from "react";
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
  ArrowLeft,
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

export default function FriendsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewAllAddresses, setViewAllAddresses] = useState(false);
  const [viewAllShared, setViewAllShared] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "alphabetical" | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

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
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);

  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: "folder" | "address"; id: string; name: string } | null>(null);

  // Share states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShareDetailsModalOpen, setIsShareDetailsModalOpen] = useState(false);
  const [shareResourceType, setShareResourceType] = useState<"address" | "address_folder">("address");
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [shareResourceName, setShareResourceName] = useState("");

  // Fetch folders and friends
  const { data: allFolders = [], isLoading: isLoadingFolders } = useQuery(
    trpc.friends.folders.list.queryOptions()
  );
  const { data: allAddresses = [], isLoading: isLoadingAddresses } = useQuery(
    trpc.friends.list.queryOptions()
  );
  // TODO: Add friends sharing functionality later if needed
  // const { data: myShares = [] } = useQuery(
  //   trpc.addressSharing.getMyShares.queryOptions()
  // );
  // const { data: sharedResources } = useQuery(
  //   trpc.addressSharing.getSharedWithMe.queryOptions()
  // );
  const myShares: any[] = [];
  const sharedResources: any = { addresses: [], folders: [] };

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
    if (sortBy === "alphabetical" && sortOrder) {
      addresses.sort((a: any, b: any) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        return sortOrder === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
      });
    } else if (sortBy === "date" && sortOrder) {
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
    trpc.friends.folders.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Folder created", variant: "default" });
        setNewFolderName("");
        setIsCreateFolderModalOpen(false);
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
    trpc.friends.folders.update.mutationOptions({
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
    trpc.friends.folders.delete.mutationOptions({
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
    trpc.friends.create.mutationOptions({
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
    trpc.friends.update.mutationOptions({
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
    trpc.friends.delete.mutationOptions({
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
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate({ name: newFolderName.trim() });
  };

  const handleOpenCreateFolderModal = () => {
    setNewFolderName("");
    setIsCreateFolderModalOpen(true);
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
  };

  const handleViewAllAddresses = () => {
    setSelectedFolderId(null);
    setViewAllAddresses(true);
    setViewAllShared(false);
  };

  const handleViewAllShared = () => {
    setSelectedFolderId(null);
    setViewAllAddresses(false);
    setViewAllShared(true);
  };

  const handleBackToFolders = () => {
    setSelectedFolderId(null);
    setViewAllAddresses(false);
    setViewAllShared(false);
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
        trpc.friends.searchUsers.queryOptions({ searchTerm: searchTerm.trim() })
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
          <span className="font-medium">My Friends</span>
        </div>

      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 w-full">
        {/* Mobile Folders View - Show when no folder is selected */}
        {!selectedFolderId && !viewAllAddresses && !viewAllShared && (
          <div className="lg:hidden space-y-4 w-full">
            <div className="space-y-4">
              {/* Your Friends Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Your Friends</h2>
                <Button
                  onClick={handleOpenCreateFolderModal}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Add New
                </Button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchQuery(e.target.value)
                  }
                  className="pr-10"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>

              {/* Folders List */}
              <div className="space-y-2">
                {/* All Friends Card */}
                <div
                  onClick={handleViewAllAddresses}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer",
                    viewAllAddresses
                      ? "bg-blue-50 border-blue-200"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FCE7F3" }}>
                    <Users className="h-6 w-6 text-gray-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 truncate">All Friends</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        {allAddressesCount} friends
                      </span>
                    </div>
                  </div>
                </div>

                {/* Folder Cards */}
                {folders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p>No folders yet.</p>
                    <p className="text-xs mt-1">Create a folder to get started.</p>
                  </div>
                ) : (
                  folders
                    .filter((folder: any) => {
                      // Filter folders based on search query
                      if (!searchQuery.trim()) return true;
                      return folder.name.toLowerCase().includes(searchQuery.toLowerCase());
                    })
                    .map((folder: any) => {
                      const isSelected = selectedFolderId === folder.id && !viewAllAddresses;
                      const shareCount = getShareCount("address_folder", folder.id);
                      const isShared = shareCount > 0;
                      
                      return (
                        <div
                          key={folder.id}
                          onClick={() => handleFolderSelect(folder.id)}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer group",
                            isSelected
                              ? "bg-blue-50 border-blue-200"
                              : "bg-white border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FCE7F3" }}>
                            <FolderClosed className="h-6 w-6 text-gray-700" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                {getFolderAddressCount(folder.id)} friends
                              </span>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                }}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                              {(() => {
                                return (
                                  <DropdownMenuItem
                                    onClick={(e: React.MouseEvent) => {
                                      e.stopPropagation();
                                      if (isShared) {
                                        openShareDetailsModal("address_folder", folder.id, folder.name);
                                      } else {
                                        openShareModal("address_folder", folder.id, folder.name);
                                      }
                                    }}
                                    className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
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
                                        <Share2 className="h-4 w-4" />
                                        <span>Share</span>
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                );
                              })()}
                              <DropdownMenuItem
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  handleEditFolder(folder.id, folder.name);
                                }}
                                className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                              >
                                <Edit2 className="h-4 w-4" />
                                <span>Edit</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  handleDeleteFolder(folder.id, folder.name);
                                }}
                                className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 rounded-md px-2 py-1.5"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })
                )}

                {/* Shared Section */}
                {sharedFolders.length > 0 && (
                  <>
                    <div className="h-px bg-gray-200 my-2" />
                    {sharedFolders.map((folder: any) => {
                      const isSelected = selectedFolderId === folder.id && !viewAllAddresses;
                      
                      return (
                        <div
                          key={folder.id}
                          onClick={() => handleFolderSelect(folder.id)}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer group",
                            isSelected
                              ? "bg-blue-50 border-blue-200"
                              : "bg-white border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          <div className="w-12 h-12 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                            <FolderClosed className="h-6 w-6 text-gray-700" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {folder.addresses && folder.addresses.length > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                  {folder.addresses.length} friends
                                </span>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                }}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                              <DropdownMenuItem
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  openShareDetailsModal("address_folder", folder.id, folder.name);
                                }}
                                className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                              >
                                <Users className="h-4 w-4" />
                                <span>Shared</span>
                              </DropdownMenuItem>
                              {folder.sharePermission === "edit" && (
                                <DropdownMenuItem
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    handleEditFolder(folder.id, folder.name);
                                  }}
                                  className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                                >
                                  <Edit2 className="h-4 w-4" />
                                  <span>Edit</span>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Desktop Left Panel - Folders */}
        {/* Desktop Left Panel - Folders */}
        <div className="hidden lg:block space-y-4">
          <div className="space-y-4">
            {/* Your Friends Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Your Friends</h2>
              <Button
                onClick={handleOpenCreateFolderModal}
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add New
              </Button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchQuery(e.target.value)
                }
                className="pr-10"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>

            {/* Folders List */}
            <div className="space-y-2">
              {/* All Friends Card */}
              <div
                onClick={handleViewAllAddresses}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer",
                  viewAllAddresses
                    ? "bg-blue-50 border-blue-200"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                )}
              >
                <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FCE7F3" }}>
                  <Users className="h-6 w-6 text-gray-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-900 truncate">All Friends</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      {allAddressesCount} friends
                    </span>
                  </div>
                </div>
              </div>

              {/* Folder Cards */}
              {folders.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No folders yet.</p>
                  <p className="text-xs mt-1">Create a folder to get started.</p>
                </div>
              ) : (
                folders
                  .filter((folder: any) => {
                    // Filter folders based on search query
                    if (!searchQuery.trim()) return true;
                    return folder.name.toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .map((folder: any) => {
                    const isSelected = selectedFolderId === folder.id && !viewAllAddresses;
                    const shareCount = getShareCount("address_folder", folder.id);
                    const isShared = shareCount > 0;
                    
                    return (
                      <div
                        key={folder.id}
                        onClick={() => handleFolderSelect(folder.id)}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer group",
                          isSelected
                            ? "bg-blue-50 border-blue-200"
                            : "bg-white border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FCE7F3" }}>
                          <FolderClosed className="h-6 w-6 text-gray-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                              {getFolderAddressCount(folder.id)} friends
                            </span>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                              }}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                            {(() => {
                              return (
                                <DropdownMenuItem
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    if (isShared) {
                                      openShareDetailsModal("address_folder", folder.id, folder.name);
                                    } else {
                                      openShareModal("address_folder", folder.id, folder.name);
                                    }
                                  }}
                                  className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
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
                                      <Share2 className="h-4 w-4" />
                                      <span>Share</span>
                                    </>
                                  )}
                                </DropdownMenuItem>
                              );
                            })()}
                            <DropdownMenuItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                handleEditFolder(folder.id, folder.name);
                              }}
                              className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                            >
                              <Edit2 className="h-4 w-4" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                handleDeleteFolder(folder.id, folder.name);
                              }}
                              className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 rounded-md px-2 py-1.5"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })
              )}

              {/* Shared Section */}
              {sharedFolders.length > 0 && (
                <>
                  <div className="h-px bg-gray-200 my-2" />
                  {sharedFolders.map((folder: any) => {
                    const isSelected = selectedFolderId === folder.id && !viewAllAddresses;
                    
                    return (
                      <div
                        key={folder.id}
                        onClick={() => handleFolderSelect(folder.id)}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer group",
                          isSelected
                            ? "bg-blue-50 border-blue-200"
                            : "bg-white border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        <div className="w-12 h-12 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                          <FolderClosed className="h-6 w-6 text-gray-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            {folder.addresses && folder.addresses.length > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                {folder.addresses.length} friends
                              </span>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                              }}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                            <DropdownMenuItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                openShareDetailsModal("address_folder", folder.id, folder.name);
                              }}
                              className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                            >
                              <Users className="h-4 w-4" />
                              <span>Shared</span>
                            </DropdownMenuItem>
                            {folder.sharePermission === "edit" && (
                              <DropdownMenuItem
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  handleEditFolder(folder.id, folder.name);
                                }}
                                className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                              >
                                <Edit2 className="h-4 w-4" />
                                <span>Edit</span>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </>
              )}
              </div>
            </div>
          </div>

        {/* Right Panel - Friends */}
        <div className={cn(
          "space-y-4 w-full min-w-0",
          (!selectedFolderId && !viewAllAddresses && !viewAllShared) ? "hidden lg:block" : "block"
        )}>
          <div>
            {/* Header with folder name and actions */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Mobile Back Button */}
                  {(selectedFolder || viewAllAddresses || viewAllShared) && (
                    <button
                      onClick={handleBackToFolders}
                      className="lg:hidden h-10 w-10 flex-shrink-0 bg-white rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
                    >
                      <ArrowLeft className="h-5 w-5 text-gray-800" />
                    </button>
                  )}
                  {viewAllAddresses ? (
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "#FCE7F3" }}
                      >
                        <Users className="h-5 w-5 text-gray-700" />
                      </div>
                      <span className="font-bold text-gray-900 text-lg">All Friends</span>
                    </div>
                  ) : viewAllShared ? (
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-gray-600" />
                      <span className="font-bold text-gray-900 text-lg">All Shared</span>
                    </div>
                  ) : selectedFolder && sharedFolders.find((f: any) => f.id === selectedFolderId) ? (
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "#FCE7F3" }}
                      >
                        <FolderClosed className="h-5 w-5 text-gray-700" />
                      </div>
                      <span className="font-bold text-gray-900 text-lg">
                        {sharedFolders.find((f: any) => f.id === selectedFolderId)?.name}
                      </span>
                    </div>
                  ) : selectedFolder ? (
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "#FCE7F3" }}
                      >
                        <FolderClosed className="h-5 w-5 text-gray-700" />
                      </div>
                      <span className="font-bold text-gray-900 text-lg">{selectedFolder.name}</span>
                    </div>
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
                
                {/* Shared button and Add Friend button (desktop) */}
                <div className="flex items-center gap-2">
                  {selectedFolder && (() => {
                    const shareCount = getShareCount("address_folder", selectedFolder.id);
                    const folderShares = myShares.filter(
                      (s: any) => s.resourceType === "address_folder" && s.resourceId === selectedFolder.id
                    );
                    if (shareCount > 0) {
                      return (
                        <button
                          onClick={() => openShareDetailsModal("address_folder", selectedFolder.id, selectedFolder.name)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                          title="View who this folder is shared with"
                        >
                          <span className="text-sm font-medium text-gray-700">Shared</span>
                          <div className="flex items-center gap-1">
                            {folderShares.slice(0, 2).map((share: any, idx: number) => {
                              const sharedUser = share.sharedWithUser;
                              if (!sharedUser) return null;
                              // For friends page, we might not have getUserInitials/getAvatarColor, so we'll use a simple approach
                              return (
                                <div
                                  key={share.id}
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold bg-blue-500"
                                  style={{ marginLeft: idx > 0 ? '-8px' : '0' }}
                                  title={sharedUser.name || sharedUser.email || "User"}
                                >
                                  {(sharedUser.name || sharedUser.email || "U").charAt(0).toUpperCase()}
                                </div>
                              );
                            })}
                          </div>
                        </button>
                      );
                    }
                    return null;
                  })()}
                  {/* Desktop Add Friend Button */}
                  <Button
                    onClick={() => openAddAddressModal(selectedFolderId)}
                    className="hidden lg:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Add Friend
                  </Button>
                </div>
              </div>
            </div>

            {/* Search and Sort Bar */}
            <div className="mb-4 w-full flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Search friends..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchQuery(e.target.value)
                  }
                  className="pr-10 h-11"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
              <Select
                value={sortBy && sortOrder ? `${sortBy}-${sortOrder}` : undefined}
                onValueChange={(value) => {
                  const [by, order] = value.split("-") as [
                    "date" | "alphabetical",
                    "asc" | "desc"
                  ];
                  setSortBy(by);
                  setSortOrder(order);
                }}
              >
                <SelectTrigger className="w-[140px] h-11">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alphabetical-asc">A-Z</SelectItem>
                  <SelectItem value="alphabetical-desc">Z-A</SelectItem>
                  <SelectItem value="date-desc">Date (Newest)</SelectItem>
                  <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Friends List */}
            <div className="space-y-4 relative pb-20">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAddresses.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Users className="h-12 w-12 mx-auto text-gray-400" />
                  <p className="text-lg font-medium">No friends found</p>
                  <p className="text-sm mt-1">
                    {searchQuery
                      ? "Try adjusting your search"
                      : "Add your first friend to get started"}
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.1),0_1px_2px_-1px_rgb(0,0,0,0.1)] hover:shadow-[0_4px_6px_-1px_rgb(0,0,0,0.1),0_2px_4px_-2px_rgb(0,0,0,0.1)] transition-shadow duration-200">
                  <div>
                    {filteredAddresses.map((address: any, index) => (
                      <div key={address.id}>
                        <div className="flex items-center gap-3 py-3 px-4 hover:bg-gray-50 transition-colors">
                          {/* Friend Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-900 text-base">
                                  {address.name}
                                </div>
                                {address.connectedUser && (
                                  <div className="mt-1 space-y-0.5">
                                    {address.connectedUser.email && (
                                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                                        <Mail className="h-3 w-3" />
                                        <span>{address.connectedUser.email}</span>
                                      </div>
                                    )}
                                    {address.connectedUser.phone && (
                                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                                        <Phone className="h-3 w-3" />
                                        <span>{address.connectedUser.phone}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {address.isSharedWithMe && (
                                  <div className="mt-1">
                                    <span className="text-xs text-gray-500">Shared with you</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Three dots menu */}
                          <div className="flex items-center flex-shrink-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-500 hover:text-gray-700"
                                >
                                  <MoreVertical className="h-5 w-5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                                <DropdownMenuItem
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    openViewAddressModal(address);
                                  }}
                                  className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                                >
                                  <Eye className="h-4 w-4" />
                                  <span>View</span>
                                </DropdownMenuItem>
                                {!address.isSharedWithMe && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        openEditAddressModal(address);
                                      }}
                                      className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                                    >
                                      <Edit3 className="h-4 w-4" />
                                      <span>Edit</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        openShareModal("address", address.id, address.name);
                                      }}
                                      className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                                    >
                                      <Share2 className="h-4 w-4" />
                                      <span>Share</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        setItemToDelete({ type: "address", id: address.id, name: address.name });
                                        setDeleteConfirmOpen(true);
                                      }}
                                      className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 rounded-md px-2 py-1.5"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      <span>Delete</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        {/* Divider - 90% width, only show if not last item */}
                        {index < filteredAddresses.length - 1 && (
                          <div className="w-[90%] mx-auto h-px bg-gray-100" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Floating Action Button - Mobile Only */}
          {(() => {
            const isSharedFolder = selectedFolder?.isSharedWithMe || false;
            const folderPermission = selectedFolder?.sharePermission;
            const canAddToFolder = !isSharedFolder || folderPermission === "edit";
            const isDisabled = Boolean(viewAllShared || (!selectedFolderId && !viewAllAddresses) || (selectedFolderId && !canAddToFolder));
            
            return (
              <button
                onClick={() => !isDisabled && openAddAddressModal(selectedFolderId)}
                disabled={!!isDisabled}
                className={cn(
                  "lg:hidden fixed bottom-20 left-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg flex items-center justify-center transition-all z-50",
                  isDisabled && "opacity-50 cursor-not-allowed"
                )}
                title={selectedFolderId && !canAddToFolder ? "View only - You cannot add friends to this folder" : "Add Friend"}
              >
                <Plus className="h-6 w-6" />
              </button>
            );
          })()}
        </div>
      </div>

      {/* Add/Edit Friend Modal */}
      <AlertDialog open={isAddressModalOpen} onOpenChange={setIsAddressModalOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{addressModalMode === "add" ? "Add Friend" : "Edit Friend"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-4">
                  {addressModalMode === "add"
                    ? "Create a new friend entry. You can optionally connect it to a user account."
                    : "Update the friend details."}
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address-name">Friend Name *</Label>
                    <Input
                      id="address-name"
                      value={addressModalName}
                      onChange={(e) => setAddressModalName(e.target.value)}
                      placeholder="e.g., John Doe, Company Name"
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
                            onChange={(e) => {
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{viewAddressData?.name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
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
            <AlertDialogTitle>Delete Friend?</AlertDialogTitle>
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

      {/* Create New Folder Modal */}
      <AlertDialog open={isCreateFolderModalOpen} onOpenChange={setIsCreateFolderModalOpen}>
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg max-h-[90vh] overflow-y-hidden overflow-x-hidden p-4 sm:p-6">
          <div className="relative mb-4">
            {/* Centered Title and Subtitle */}
            <div className="text-center">
              <AlertDialogTitle className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                Create New Folder
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-gray-500">
                Organize your friends better
              </AlertDialogDescription>
            </div>
          </div>
          
          <form onSubmit={handleCreateFolder} className="overflow-x-hidden">
            <div className="space-y-4 sm:space-y-6">
              {/* Folder Name */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="folder-name" className="text-sm font-medium text-gray-900">
                  Folder Name
                </Label>
                <Input
                  id="folder-name"
                  value={newFolderName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewFolderName(e.target.value)
                  }
                  placeholder="e.g., Family, Work"
                  className="bg-gray-50 h-10 sm:h-11 w-full"
                />
              </div>
            </div>
            <AlertDialogFooter className="flex-col gap-2 sm:gap-2 pt-2 sm:pt-4 mt-4 sm:mt-6">
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 sm:h-11 text-sm sm:text-base"
                disabled={!newFolderName.trim() || createFolderMutation.isPending}
              >
                Create Folder
              </Button>
              <AlertDialogCancel
                onClick={() => {
                  setIsCreateFolderModalOpen(false);
                  setNewFolderName("");
                }}
                className="w-full border-gray-300 h-10 sm:h-11 text-sm sm:text-base"
              >
                Cancel
              </AlertDialogCancel>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}


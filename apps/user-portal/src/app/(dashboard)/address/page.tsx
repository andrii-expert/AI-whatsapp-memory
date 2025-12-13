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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@imaginecalendar/ui/dialog";
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
    });
  };

  const handleUpdateAddress = () => {
    if (!addressModalId || !addressModalName.trim()) return;
    updateAddressMutation.mutate({
      id: addressModalId,
      name: addressModalName.trim(),
      folderId: addressModalFolderId || null,
      connectedUserId: addressModalConnectedUserId || null,
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Address Book</h1>
              <p className="text-muted-foreground text-sm">Manage your contacts and addresses</p>
            </div>
          </div>
          <Button onClick={() => openAddAddressModal()} className="hidden md:flex">
            <Plus className="h-4 w-4 mr-2" />
            Add Address
          </Button>
        </div>

        <div className="flex gap-6">
          {/* Sidebar - Folders */}
          <div className={cn(
            "w-64 flex-shrink-0 hidden md:block",
            "border-r pr-6"
          )}>
            <div className="space-y-4">
              {/* View Options */}
              <div className="space-y-2">
                <Button
                  variant={viewAllAddresses ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => {
                    setViewAllAddresses(true);
                    setViewAllShared(false);
                    setSelectedFolderId(null);
                  }}
                >
                  <Users className="h-4 w-4 mr-2" />
                  All Addresses
                </Button>
                <Button
                  variant={viewAllShared ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => {
                    setViewAllShared(true);
                    setViewAllAddresses(false);
                    setSelectedFolderId(null);
                  }}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Shared with Me
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
                              onClick={(e) => e.stopPropagation()}
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

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Search and Sort */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search addresses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
      </div>

      {/* Add/Edit Address Modal */}
      <Dialog open={isAddressModalOpen} onOpenChange={setIsAddressModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{addressModalMode === "add" ? "Add Address" : "Edit Address"}</DialogTitle>
            <DialogDescription>
              {addressModalMode === "add"
                ? "Create a new address entry. You can optionally connect it to a user account."
                : "Update the address details."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="address-name">Address Name *</Label>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddressModalOpen(false);
              resetAddressModal();
            }}>
              Cancel
            </Button>
            <Button
              onClick={addressModalMode === "add" ? handleCreateAddress : handleUpdateAddress}
              disabled={!addressModalName.trim() || createAddressMutation.isPending || updateAddressMutation.isPending}
            >
              {addressModalMode === "add" ? "Create" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Address Modal */}
      <Dialog open={isViewAddressModalOpen} onOpenChange={setIsViewAddressModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewAddressData?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
          <DialogFooter>
            {!viewAddressData?.isSharedWithMe && (
              <>
                <Button variant="outline" onClick={() => {
                  setIsViewAddressModalOpen(false);
                  if (viewAddressData) openEditAddressModal(viewAddressData);
                }}>
                  Edit
                </Button>
                <Button onClick={() => {
                  setIsViewAddressModalOpen(false);
                  if (viewAddressData) {
                    openShareModal("address", viewAddressData.id, viewAddressData.name);
                  }
                }}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setIsViewAddressModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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


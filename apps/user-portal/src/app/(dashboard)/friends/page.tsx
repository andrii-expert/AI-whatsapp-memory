"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Home,
  ChevronLeft,
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
  const [sortBy, setSortBy] = useState<"date" | "alphabetical" | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  // Address modal states
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressModalMode, setAddressModalMode] = useState<"add" | "edit">("add");
  const [addressModalName, setAddressModalName] = useState("");
  const [addressModalId, setAddressModalId] = useState<string | null>(null);
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


  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);

  // Share states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShareDetailsModalOpen, setIsShareDetailsModalOpen] = useState(false);
  const [shareResourceType, setShareResourceType] = useState<"address">("address");
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [shareResourceName, setShareResourceName] = useState("");

  // Invite modal states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteFriends, setInviteFriends] = useState<Array<{ name: string; email: string }>>([{ name: "", email: "" }]);

  // Fetch friends
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
  const sharedResources: any = { addresses: [] };

  // Extract shared addresses and folders from sharedResources
  const sharedAddresses = useMemo(() => {
    return (sharedResources?.addresses || []).map((address: any) => ({
      ...address,
      isSharedWithMe: true,
      sharePermission: address.shareInfo?.permission || "view",
      ownerId: address.shareInfo?.ownerId,
    }));
  }, [sharedResources]);


  // Filter addresses
  const filteredAddresses = useMemo(() => {
    let addresses = [...allAddresses, ...sharedAddresses];

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
  }, [allAddresses, searchQuery, sortBy, sortOrder, sharedAddresses]);

  // Mutations

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

  // Get share count for a resource
  const getShareCount = (resourceType: "address", resourceId: string): number => {
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
      folderId: null,
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
      folderId: null,
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
    if (!itemToDelete) return;
    deleteAddressMutation.mutate({ id: itemToDelete.id });
  };

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

  const openAddAddressModal = () => {
    setAddressModalMode("add");
    setIsAddressModalOpen(true);
  };

  const openEditAddressModal = (address: any) => {
    setAddressModalMode("edit");
    setAddressModalId(address.id);
    setAddressModalName(address.name);
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

  const openShareModal = (resourceType: "address", resourceId: string, resourceName: string) => {
    setShareResourceType(resourceType);
    setShareResourceId(resourceId);
    setShareResourceName(resourceName);
    setIsShareModalOpen(true);
  };

  const openShareDetailsModal = (resourceType: "address", resourceId: string, resourceName: string) => {
    setShareResourceType(resourceType);
    setShareResourceId(resourceId);
    setShareResourceName(resourceName);
    setIsShareDetailsModalOpen(true);
  };

  // Invite modal handlers
  const handleAddMoreInvite = () => {
    setInviteFriends([...inviteFriends, { name: "", email: "" }]);
  };

  const handleRemoveInvite = (index: number) => {
    if (inviteFriends.length > 1) {
      setInviteFriends(inviteFriends.filter((_, i) => i !== index));
    }
  };

  const handleInviteFriendChange = (index: number, field: "name" | "email", value: string) => {
    const updated = [...inviteFriends];
    updated[index] = { 
      name: updated[index]?.name || "", 
      email: updated[index]?.email || "",
      ...updated[index], 
      [field]: value 
    };
    setInviteFriends(updated);
  };

  const inviteMutation = useMutation(
    trpc.friends.invite.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Invites sent successfully", variant: "default" });
        setIsInviteModalOpen(false);
        setInviteFriends([{ name: "", email: "" }]);
      },
      onError: (error) => {
        toast({
          title: "Invite failed",
          description: error.message || "Could not send invites",
          variant: "destructive",
        });
      },
    })
  );

  const handleSendInvites = () => {
    // Validate all entries
    const validFriends = inviteFriends.filter(f => f.name.trim() && f.email.trim());
    if (validFriends.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one friend with name and email",
        variant: "destructive",
      });
      return;
    }

    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = validFriends.filter(f => !emailRegex.test(f.email.trim()));
    if (invalidEmails.length > 0) {
      toast({
        title: "Invalid emails",
        description: `Please check the email format for: ${invalidEmails.map(f => f.email).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    inviteMutation.mutate({
      friends: validFriends
        .filter(f => f.name.trim() && f.email.trim())
        .map(f => ({
          name: f.name.trim(),
          email: f.email.trim().toLowerCase(),
        })),
    });
  };

  // Get initials for friend avatar
  const getFriendInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Get avatar color based on name/id
  const getAvatarColor = (identifier: string) => {
    if (!identifier) return "bg-green-100";
    
    const colors = [
      "bg-green-100",      // light green
      "bg-pink-100",       // light pink
      "bg-yellow-100",     // light beige/yellow
      "bg-purple-100",     // light purple
      "bg-blue-100",       // light blue
      "bg-orange-100",     // light orange
      "bg-teal-100",       // light teal
    ];
    
    const hash = identifier.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const getAvatarTextColor = (bgColor: string) => {
    if (bgColor.includes("yellow") || bgColor.includes("orange")) {
      return "text-yellow-800";
    }
    if (bgColor.includes("green")) {
      return "text-green-800";
    }
    if (bgColor.includes("pink")) {
      return "text-pink-800";
    }
    if (bgColor.includes("purple")) {
      return "text-purple-800";
    }
    if (bgColor.includes("blue")) {
      return "text-blue-800";
    }
    if (bgColor.includes("teal")) {
      return "text-teal-800";
    }
    return "text-gray-800";
  };

  const isLoading = isLoadingAddresses;

  return (
    <>
    <div className="min-h-screen bg-white">
      {/* Breadcrumb Navigation */}
      <div className="hidden lg:flex items-center gap-2 text-sm justify-between px-4 pt-6 pb-4">
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

      {/* Main Container */}
      <div className="mx-auto max-w-md md:max-w-4xl lg:max-w-7xl">
        {/* Header */}
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[20px] font-semibold leading-[130%] text-[#141718]">Your Friends</h1>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setIsInviteModalOpen(true)}
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5"
              >
                <UserPlus className="h-4 w-4" />
                <span>Send Invites</span>
              </Button>
              <Button
                onClick={openAddAddressModal}
                variant="outline"
                size="sm"
                className="hidden lg:flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add Contact
              </Button>
            </div>
          </div>
        </div>

        {/* Search and Sort Bar */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B9BA7] pointer-events-none" size={18} />
              <Input
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchQuery(e.target.value)
                }
                className="w-full h-10 sm:h-11 bg-white border border-gray-200 rounded-lg pr-10 pl-4 text-sm"
              />
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
              <SelectTrigger className="w-[140px] h-10 sm:h-11 bg-white border border-gray-200">
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
        </div>

        {/* Friends List */}
        <div className="px-4 pb-20">
          <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAddresses.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="h-12 w-12 mx-auto text-gray-400" />
              <p className="text-[17px] font-medium">No friends found</p>
              <p className="text-[13px] mt-1">
                {searchQuery
                  ? "Try adjusting your search"
                  : "Add your first friend to get started"}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div>
                {filteredAddresses.map((address: any, index) => {
                  const addressName = String(address?.name ?? "");
                  const addressId = String(address?.id ?? "");
                  const avatarBgColor = getAvatarColor(addressId || addressName);
                  const avatarTextColor = getAvatarTextColor(String(avatarBgColor));
                  const initials: string = getFriendInitials(addressName);
                  
                  return (
                    <div key={address.id}>
                      <div className="flex items-center gap-2 py-4 px-2 hover:bg-gray-50 transition-colors">
                        {/* Avatar */}
                        <div className={`w-12 h-12 rounded-full ${avatarBgColor} flex items-center justify-center flex-shrink-0`}>
                          <span className={`text-[13px] font-semibold ${avatarTextColor}`}>
                            {initials}
                          </span>
                        </div>
                        
                        {/* Friend Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 justify-between">
                            <div className="font-bold text-gray-900 text-[15px] flex gap-2">
                              {address.name}
                              {/* Pending badge - show if email exists but no connectedUserId */}
                              {address.email && !address.connectedUserId && (
                                <span className="px-2 py-0.5 text-[11px] font-medium bg-yellow-100 text-yellow-800 rounded-full">
                                  Pending
                                </span>
                              )}
                            </div>
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
                                        setItemToDelete({ id: address.id, name: address.name });
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
                          {(address.connectedUser || address.email) && (
                            <div className="space-y-1">
                              {(address.connectedUser?.email || address.email) && (
                                <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                                  <Mail className="h-3.5 w-3.5" />
                                  <span>{address.connectedUser?.email || address.email}</span>
                                </div>
                              )}
                              {address.connectedUser?.phone && (
                                <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                                  <Phone className="h-3.5 w-3.5" />
                                  <span>{address.connectedUser.phone}</span>
                                </div>
                              )}
                            </div>
                          )}
                          {!address.connectedUser && !address.email && (
                            <div className="text-[13px] text-gray-400 italic">
                              No contact information
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Divider - 90% width, only show if not last item */}
                      {index < filteredAddresses.length - 1 && (
                        <div className="w-[90%] mx-auto h-px bg-gray-100" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Floating Action Button - Mobile Only */}
      <button
        onClick={() => openAddAddressModal()}
        className="lg:hidden fixed bottom-20 left-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg flex items-center justify-center transition-all z-50"
        title="Add Friend"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>

      {/* Add/Edit Friend Modal */}
      <AlertDialog open={isAddressModalOpen} onOpenChange={setIsAddressModalOpen}>
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <div className="relative mb-4">
            {/* Centered Title and Subtitle */}
            <div className="text-center">
              <AlertDialogTitle className="text-[17px] sm:text-[19px] font-bold text-gray-900 mb-1">
                {addressModalMode === "add" ? "Add Contact" : "Edit Contact"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] text-gray-500">
                {addressModalMode === "add"
                  ? "Does your contact already have CrackOn? Search below and add them."
                  : "Update the contact details."}
              </AlertDialogDescription>
            </div>
          </div>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            if (addressModalMode === "add") {
              handleCreateAddress();
            } else {
              handleUpdateAddress();
            }
          }} className="space-y-4 sm:space-y-6 overflow-x-hidden">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="address-name" className="text-[13px] font-medium text-gray-900">Friend Name *</Label>
              <Input
                id="address-name"
                value={addressModalName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddressModalName(e.target.value)}
                placeholder="e.g., John Doe, Company Name"
                className="bg-gray-50 h-10 sm:h-11 w-full"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-[13px] font-medium text-gray-900">Connect to User</Label>
              {addressModalConnectedUser ? (
                <div className="border border-gray-200 rounded-lg p-3 flex items-center justify-between bg-gray-50">
                  <div>
                    <div className="font-medium text-gray-900">
                      {addressModalConnectedUser.firstName || addressModalConnectedUser.name || "User"}
                    </div>
                    {addressModalConnectedUser.email && (
                      <div className="text-[13px] text-gray-500 mt-1">{addressModalConnectedUser.email}</div>
                    )}
                    {addressModalConnectedUser.phone && (
                      <div className="text-[13px] text-gray-500 mt-1">{addressModalConnectedUser.phone}</div>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleRemoveConnectedUser} className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
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
                      className="pl-10 bg-gray-50 h-10 sm:h-11 w-full"
                    />
                  </div>
                  {isSearchingUsers && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )}
                  {userSearchResults.length > 0 && (
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto bg-white">
                      {userSearchResults.map((user) => (
                        <div
                          key={user.id}
                          className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                          onClick={() => handleSelectUser(user)}
                        >
                          <div className="font-medium text-gray-900">
                            {user.firstName || user.name || "User"}
                          </div>
                          {user.email && (
                            <div className="text-[13px] text-gray-500 mt-1">{user.email}</div>
                          )}
                          {user.phone && (
                            <div className="text-[13px] text-gray-500 mt-1">{user.phone}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {userSearchTerm.length >= 2 && !isSearchingUsers && userSearchResults.length === 0 && (
                    <div className="text-[13px] text-gray-500 text-center py-4">
                      No users found
                    </div>
                  )}
                </div>
              )}
            </div>

            <AlertDialogFooter className="flex-col gap-2 sm:gap-2 pt-2 sm:pt-4">
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 sm:h-11 text-[13px] sm:text-[15px]"
                disabled={!addressModalName.trim() || createAddressMutation.isPending || updateAddressMutation.isPending}
              >
                {addressModalMode === "add" ? "Add Contact" : "Update Contact"}
              </Button>
              <AlertDialogCancel
                onClick={() => {
                  setIsAddressModalOpen(false);
                  resetAddressModal();
                }}
                className="w-full border-gray-300 h-10 sm:h-11 text-[13px] sm:text-[15px]"
              >
                Cancel
              </AlertDialogCancel>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Address Modal */}
      <AlertDialog open={isViewAddressModalOpen} onOpenChange={setIsViewAddressModalOpen}>
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <div className="relative mb-4">
            {/* Centered Title and Subtitle */}
            <div className="text-center">
              <AlertDialogTitle className="text-[17px] sm:text-[19px] font-bold text-gray-900 mb-1">
                {viewAddressData?.name}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] text-gray-500">
                Friend details
              </AlertDialogDescription>
            </div>
          </div>
          
          <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
            {viewAddressData?.connectedUser && (
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[13px] font-medium text-gray-900">Connected User</Label>
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="font-medium text-gray-900">
                    {viewAddressData.connectedUser.firstName || viewAddressData.connectedUser.name || "User"}
                  </div>
                  {viewAddressData.connectedUser.email && (
                    <div className="text-[13px] text-gray-500 mt-1 flex items-center gap-1.5">
                      <Mail className="h-3 w-3" />
                      {viewAddressData.connectedUser.email}
                    </div>
                  )}
                  {viewAddressData.connectedUser.phone && (
                    <div className="text-[13px] text-gray-500 mt-1 flex items-center gap-1.5">
                      <Phone className="h-3 w-3" />
                      {viewAddressData.connectedUser.phone}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <AlertDialogFooter className="flex-col gap-2 sm:gap-2 pt-2 sm:pt-4">
            {!viewAddressData?.isSharedWithMe && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsViewAddressModalOpen(false);
                    if (viewAddressData) openEditAddressModal(viewAddressData);
                  }}
                  className="w-full border-gray-300 h-10 sm:h-11 text-[13px] sm:text-[15px]"
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
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 sm:h-11 text-[13px] sm:text-[15px]"
                >
                  Share
                </Button>
              </>
            )}
            <AlertDialogCancel 
              onClick={() => setIsViewAddressModalOpen(false)}
              className="w-full border-gray-300 h-10 sm:h-11 text-sm sm:text-base"
            >
              Close
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Address Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg p-4 sm:p-6">
          <div className="relative mb-4">
            <AlertDialogTitle className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
              Delete Friend?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500">
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </div>
          <AlertDialogFooter className="flex-col gap-2 sm:gap-2 pt-2 sm:pt-4">
            <AlertDialogAction
              onClick={handleDeleteAddress}
              className="w-full bg-red-600 hover:bg-red-700 text-white h-10 sm:h-11 text-[13px] sm:text-[15px]"
            >
              Delete
            </AlertDialogAction>
            <AlertDialogCancel className="w-full border-gray-300 h-10 sm:h-11 text-sm sm:text-base">
              Cancel
            </AlertDialogCancel>
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

      {/* Invite Friends Modal */}
      <AlertDialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <div className="relative mb-4">
            {/* Centered Title and Subtitle */}
            <div className="text-center">
              <AlertDialogTitle className="text-[17px] sm:text-[19px] font-bold text-gray-900 mb-1">
                Invite Friends
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] text-gray-500">
                Invite friends to access and collaborate.
              </AlertDialogDescription>
            </div>
          </div>
          
          <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
            {inviteFriends.map((friend, index) => (
              <div key={index} className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor={`friend-name-${index}`} className="text-[13px] font-medium text-gray-900">
                    Friend Name
                  </Label>
                  <Input
                    id={`friend-name-${index}`}
                    value={friend.name || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInviteFriendChange(index, "name", e.target.value)}
                    placeholder="Name"
                    className="bg-gray-50 h-10 sm:h-11 w-full"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor={`friend-email-${index}`} className="text-[13px] font-medium text-gray-900">
                    Email Address
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`friend-email-${index}`}
                      type="email"
                      value={friend.email || ""}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInviteFriendChange(index, "email", e.target.value)}
                      placeholder="email"
                      className="bg-gray-50 h-10 sm:h-11 w-full"
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={handleAddMoreInvite}
                className="flex items-center gap-2 border-gray-300 bg-white text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" />
                Add More
              </Button>
            </div>
          </div>

          <AlertDialogFooter className="flex-col gap-2 sm:gap-2 pt-2 sm:pt-4 mt-4 sm:mt-6">
            <Button
              onClick={handleSendInvites}
              disabled={inviteMutation.isPending}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white h-10 sm:h-11 text-[13px] sm:text-[15px]"
            >
              {inviteMutation.isPending ? "Sending..." : "Send Invite"}
            </Button>
            <AlertDialogCancel
              onClick={() => {
                setIsInviteModalOpen(false);
                setInviteFriends([{ name: "", email: "" }]);
              }}
              className="w-full border-gray-300 h-10 sm:h-11 text-sm sm:text-base"
            >
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


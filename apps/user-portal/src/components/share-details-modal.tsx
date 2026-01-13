"use client";

import { Users, Mail, Phone, Trash2, Edit3, Eye, Loader2, Search, UserPlus, X } from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
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
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useState } from "react";
import { cn } from "@imaginecalendar/ui/cn";

interface ShareDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: "task" | "task_folder" | "shopping_list_folder" | "note" | "note_folder" | "file" | "file_folder" | "address" | "address_folder";
  resourceId: string;
  resourceName: string;
}

export function ShareDetailsModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
}: ShareDetailsModalProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [shareToDelete, setShareToDelete] = useState<string | null>(null);
  const [isAddingUsers, setIsAddingUsers] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFriendsList, setShowFriendsList] = useState(true);
  const [activeTab, setActiveTab] = useState<"friends" | "others">("friends");

  // Fetch friends list
  const { data: friendsList = [] } = useQuery(trpc.friends.list.queryOptions());

  // Filter friends that have connectedUserId (linked to user accounts)
  const friendsWithAccounts = friendsList.filter((friend: any) => friend.connectedUserId && friend.connectedUser);

  // Determine which sharing router to use based on resource type
  const isNoteResource = resourceType === "note" || resourceType === "note_folder";
  const isFileResource = resourceType === "file" || resourceType === "file_folder";
  const isAddressResource = resourceType === "address" || resourceType === "address_folder";

  // Fetch shares for this resource (only works if you're the owner)
  const { data: shares = [], isLoading, isError } = useQuery(
    isNoteResource
      ? trpc.noteSharing.getResourceShares.queryOptions({
          resourceType,
          resourceId,
        })
      : isFileResource
      ? trpc.fileSharing.getResourceShares.queryOptions({
          resourceType,
          resourceId,
        })
      : isAddressResource
      ? trpc.addressSharing.getResourceShares.queryOptions({
          resourceType,
          resourceId,
        })
      : trpc.taskSharing.getResourceShares.queryOptions({
          resourceType,
          resourceId,
        })
  );

  // If query errors, it means we're viewing a shared resource (not the owner)
  // Fetch the shared resources to get owner info
  const { data: sharedResources } = useQuery(
    (isNoteResource 
        ? trpc.noteSharing.getSharedWithMe.queryOptions() 
        : isFileResource
        ? trpc.fileSharing.getSharedWithMe.queryOptions()
        : isAddressResource
        ? trpc.addressSharing.getSharedWithMe.queryOptions()
        : trpc.taskSharing.getSharedWithMe.queryOptions()) as any
  );

  // Find the owner info and permission from shared resources
  const sharedResourceInfo = isError && sharedResources ? (() => {
    const sharedData: any = sharedResources;
    const allShared = [
      ...(sharedData.tasks || sharedData.notes || sharedData.files || sharedData.addresses || []),
      ...(sharedData.folders || [])
    ];
    const resource = allShared.find((r: any) => r.id === resourceId);
    return {
      owner: resource?.shareInfo?.owner || null,
      permission: resource?.shareInfo?.permission || "view",
    };
  })() : null;

  const ownerInfo = sharedResourceInfo?.owner || null;
  const myPermission = sharedResourceInfo?.permission || "view";
  const isViewingShared = isError && ownerInfo;

  const createShareMutation = useMutation(
    (isNoteResource
      ? trpc.noteSharing.createShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "User added",
              description: "User has been added successfully",
            });
            setSearchTerm("");
            setSearchResults([]);
          },
          onError: (error) => {
            toast({
              title: "Failed to add user",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })
      : isFileResource
      ? trpc.fileSharing.createShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "User added",
              description: "User has been added successfully",
            });
            setSearchTerm("");
            setSearchResults([]);
          },
          onError: (error) => {
            toast({
              title: "Failed to add user",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })
      : isAddressResource
      ? trpc.addressSharing.createShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "User added",
              description: "User has been added successfully",
            });
            setSearchTerm("");
            setSearchResults([]);
          },
          onError: (error) => {
            toast({
              title: "Failed to add user",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })
      : trpc.taskSharing.createShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "User added",
              description: "User has been added successfully",
            });
            setSearchTerm("");
            setSearchResults([]);
          },
          onError: (error) => {
            toast({
              title: "Failed to add user",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })) as any
  );

  const updatePermissionMutation = useMutation(
    (isNoteResource
      ? trpc.noteSharing.updatePermission.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "Permission updated",
              description: "Share permission has been updated",
            });
          },
          onError: (error) => {
            toast({
              title: "Failed to update permission",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })
      : isFileResource
      ? trpc.fileSharing.updatePermission.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "Permission updated",
              description: "Share permission has been updated",
            });
          },
          onError: (error) => {
            toast({
              title: "Failed to update permission",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })
      : isAddressResource
      ? trpc.addressSharing.updateSharePermission.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "Permission updated",
              description: "Share permission has been updated",
            });
          },
          onError: (error) => {
            toast({
              title: "Failed to update permission",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })
      : trpc.taskSharing.updatePermission.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "Permission updated",
              description: "Share permission has been updated",
            });
          },
          onError: (error) => {
            toast({
              title: "Failed to update permission",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })) as any
  );

  const deleteShareMutation = useMutation(
    (isNoteResource
      ? trpc.noteSharing.deleteShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "Share removed",
              description: "User no longer has access",
            });
            setShareToDelete(null);
          },
          onError: (error) => {
            toast({
              title: "Failed to remove share",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })
      : isFileResource
      ? trpc.fileSharing.deleteShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "Share removed",
              description: "User no longer has access",
            });
            setShareToDelete(null);
          },
          onError: (error) => {
            toast({
              title: "Failed to remove share",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })
      : isAddressResource
      ? trpc.addressSharing.deleteShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "Share removed",
              description: "User no longer has access",
            });
            setShareToDelete(null);
          },
          onError: (error) => {
            toast({
              title: "Failed to remove share",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })
      : trpc.taskSharing.deleteShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
            toast({
              title: "Share removed",
              description: "User no longer has access",
            });
            setShareToDelete(null);
          },
          onError: (error) => {
            toast({
              title: "Failed to remove share",
              description: error.message || "An error occurred",
              variant: "destructive",
            });
          },
        })) as any
  );

  const handlePermissionChange = (shareId: string, permission: "view" | "edit") => {
    (updatePermissionMutation.mutate as any)({
      shareId,
      permission,
    });
  };

  const handleDeleteShare = () => {
    if (shareToDelete) {
      (deleteShareMutation.mutate as any)({ shareId: shareToDelete });
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await queryClient.fetchQuery(
        isNoteResource
          ? trpc.noteSharing.searchUsers.queryOptions({
              searchTerm: searchTerm.trim(),
            })
          : isFileResource
          ? trpc.fileSharing.searchUsers.queryOptions({
              searchTerm: searchTerm.trim(),
            })
          : isAddressResource
          ? trpc.addresses.searchUsers.queryOptions({
              searchTerm: searchTerm.trim(),
            })
          : trpc.taskSharing.searchUsers.queryOptions({
              searchTerm: searchTerm.trim(),
            })
      );
      
      // Filter out users who are already shared with
      const existingUserIds = shares.map((s: any) => s.sharedWithUser.id);
      const filteredResults = (results || []).filter(
        (user: any) => !existingUserIds.includes(user.id)
      );
      
      setSearchResults(filteredResults);
      
      if (filteredResults.length === 0) {
        toast({
          title: "No new users found",
          description: results && results.length > 0 
            ? "All matching users already have access"
            : `No users match "${searchTerm.trim()}"`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error?.message || "Could not search for users",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddUser = (user: any, permission: "view" | "edit" = "view") => {
    (createShareMutation.mutate as any)({
      resourceType,
      resourceId,
      sharedWithUserId: user.id,
      permission,
    });
  };

  const handleAddFriend = (friend: any, permission: "view" | "edit" = "view") => {
    // Use the connectedUser for sharing
    if (!friend.connectedUser) {
      toast({
        title: "Cannot share",
        description: "This friend is not linked to a user account",
        variant: "destructive",
      });
      return;
    }

    handleAddUser(friend.connectedUser, permission);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <>
      <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-6">
          <AlertDialogHeader className="pb-4 border-b border-gray-200 mb-4 px-0">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <AlertDialogTitle className="text-lg sm:text-xl font-semibold text-black">
                  Share With Friends
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-gray-500 mt-1">
                  People who have access to "{resourceName}"
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          {/* Tabs and Search - only show when not viewing shared resource */}
          {!isViewingShared && (
            <>
              {/* Tabs */}
              <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
                <button
                  onClick={() => setActiveTab("friends")}
                  className={cn(
                    "flex-1 px-4 py-2 text-sm font-medium transition-all rounded-md",
                    activeTab === "friends"
                      ? "bg-white border border-gray-300 text-black"
                      : "bg-transparent text-gray-500"
                  )}
                >
                  Friends
                </button>
                <button
                  onClick={() => setActiveTab("others")}
                  className={cn(
                    "flex-1 px-4 py-2 text-sm font-medium transition-all rounded-md",
                    activeTab === "others"
                      ? "bg-white border border-gray-300 text-black"
                      : "bg-transparent text-gray-500"
                  )}
                >
                  Others
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative mb-4">
                <Input
                  placeholder="Search friends..."
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pr-10 h-10 text-sm bg-white"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </>
          )}

          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 sm:py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : isViewingShared && ownerInfo ? (
              // Show owner info when viewing a shared resource
              <div className="space-y-3">
                {/* Owner Info */}
                <div className="border rounded-lg p-3 sm:p-4 bg-purple-50 border-purple-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">
                        {[ownerInfo.firstName, ownerInfo.lastName].filter(Boolean).join(' ') || 
                         ownerInfo.email?.split('@')[0] || "Owner"}
                      </div>
                      <div className="flex flex-col gap-1 mt-1">
                        {ownerInfo.email && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Mail className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{ownerInfo.email}</span>
                          </div>
                        )}
                        {ownerInfo.phone && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            <span>{ownerInfo.phone}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                          Owner
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Your Permission */}
                <div className="border rounded-lg p-3 sm:p-4 bg-blue-50 border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      {myPermission === "edit" ? (
                        <Edit3 className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Eye className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Your Permission</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {myPermission === "edit" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded font-medium">
                            <Edit3 className="h-3.5 w-3.5" />
                            Can Edit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 rounded font-medium">
                            <Eye className="h-3.5 w-3.5" />
                            View Only
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-black">Shared with</h3>
                <div className="space-y-2">
                  {(() => {
                    // Filter shares based on active tab
                    const filteredShares = shares.filter((share: any) => {
                      if (activeTab === "friends") {
                        // Check if the shared user is in friends list
                        return friendsWithAccounts.some(
                          (friend: any) => friend.connectedUserId === share.sharedWithUser.id
                        );
                      } else {
                        // Others: users not in friends list
                        return !friendsWithAccounts.some(
                          (friend: any) => friend.connectedUserId === share.sharedWithUser.id
                        );
                      }
                    });

                    // Get initials for avatar
                    const getInitials = (name: string) => {
                      if (!name) return "U";
                      const parts = name.split(" ");
                      if (parts.length >= 2 && parts[0] && parts[1]) {
                        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
                      }
                      return name.substring(0, 2).toUpperCase();
                    };

                    if (filteredShares.length === 0) {
                      return (
                        <div className="text-center py-6 text-gray-500">
                          <p className="text-sm">
                            {activeTab === "friends" 
                              ? "No friends have access yet"
                              : "No other users have access yet"}
                          </p>
                        </div>
                      );
                    }

                    return filteredShares.map((share: any) => {
                      const displayName = [share.sharedWithUser.firstName, share.sharedWithUser.lastName]
                        .filter(Boolean)
                        .join(' ') || share.sharedWithUser.email?.split('@')[0] || "Unknown User";
                      
                      const initials = getInitials(displayName);
                      
                      return (
                        <div
                          key={share.id}
                          className="flex items-center gap-3"
                        >
                          {/* Avatar with initials in pink */}
                          <div className="w-10 h-10 rounded-full bg-pink-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-medium text-pink-700">
                              {initials}
                            </span>
                          </div>
                          
                          {/* Name */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-normal text-black">
                              {displayName}
                            </div>
                          </div>
                          
                          {/* Permission Dropdown */}
                          <Select
                            value={share.permission}
                            onValueChange={(value: "view" | "edit") =>
                              handlePermissionChange(share.id, value)
                            }
                            disabled={updatePermissionMutation.isPending}
                          >
                            <SelectTrigger className="w-[120px] h-9 border border-gray-200 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="view">Can view</SelectItem>
                              <SelectItem value="edit">Can edit</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    });
                  })()}
                </div>
                
                {/* Search Results - show when there are search results */}
                {searchResults.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-semibold text-black mb-3">Search Results</h4>
                    <div className="space-y-2">
                      {searchResults.map((user: any) => {
                        const displayName = [user.firstName, user.lastName]
                          .filter(Boolean)
                          .join(' ') || user.email?.split('@')[0] || "Unknown User";
                        
                        // Get initials for avatar
                        const getInitials = (name: string) => {
                          if (!name) return "U";
                          const parts = name.split(" ");
                          if (parts.length >= 2 && parts[0] && parts[1]) {
                            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
                          }
                          return name.substring(0, 2).toUpperCase();
                        };
                        
                        const initials = getInitials(displayName);
                        const existingUserIds = shares.map((s: any) => s.sharedWithUser.id);
                        const isAlreadyShared = existingUserIds.includes(user.id);
                        
                        return (
                          <div
                            key={user.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                          >
                            {/* Avatar with initials in pink */}
                            <div className="w-10 h-10 rounded-full bg-pink-200 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-medium text-pink-700">
                                {initials}
                              </span>
                            </div>
                            
                            {/* Name */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-normal text-black">
                                {displayName}
                              </div>
                              {user.email && (
                                <div className="text-xs text-gray-500 truncate">
                                  {user.email}
                                </div>
                              )}
                            </div>
                            
                            {/* Add Button */}
                            <Button
                              size="sm"
                              onClick={() => handleAddUser(user, "edit")}
                              disabled={createShareMutation.isPending || isAlreadyShared}
                              className="h-9 px-4"
                            >
                              {isAlreadyShared ? "Added" : "Add"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!shareToDelete}
        onOpenChange={() => setShareToDelete(null)}
      >
        <AlertDialogContent className="w-[90vw] sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg sm:text-xl">Remove Access</AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base">
              Are you sure you want to remove this user's access? They will no longer
              be able to view or edit this {resourceType === "task" ? "task" : "folder"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto h-9 sm:h-10 mt-0">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteShare}
              className="w-full sm:w-auto h-9 sm:h-10 bg-red-600 hover:bg-red-700"
            >
              Remove Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


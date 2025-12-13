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

interface ShareDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: "task" | "task_folder" | "note" | "note_folder" | "file" | "file_folder" | "address" | "address_folder";
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <>
      <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <AlertDialogHeader className="space-y-2 sm:space-y-3">
            <AlertDialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              </div>
              <span className="truncate">{isViewingShared ? "Shared By" : "Shared With"}</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base pt-1 break-all">
              {isViewingShared 
                ? `This ${resourceType === "task" || resourceType === "note" ? (resourceType === "task" ? "task" : "note") : "folder"} was shared with you by:`
                : `People who have access to "${resourceName}"`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4">
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
            ) : shares.length === 0 ? (
              <div className="text-center py-6 sm:py-8 text-gray-500">
                <Users className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 text-gray-300" />
                <p className="text-xs sm:text-sm">
                  This {resourceType === "task" || resourceType === "note" ? (resourceType === "task" ? "task" : "note") : "folder"} hasn't been shared yet
                </p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {shares.map((share: any) => {
                  const displayName = [share.sharedWithUser.firstName, share.sharedWithUser.lastName]
                    .filter(Boolean)
                    .join(' ') || share.sharedWithUser.email?.split('@')[0] || "Unknown User";
                  
                  return (
                    <div
                      key={share.id}
                      className="border rounded-lg p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                    >
                      {/* Mobile: Stacked Layout */}
                      <div className="flex sm:hidden flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {displayName}
                            </div>
                            <div className="flex flex-col gap-1 mt-1">
                              {share.sharedWithUser.email && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <Mail className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{share.sharedWithUser.email}</span>
                                </div>
                              )}
                              {share.sharedWithUser.phone && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <Phone className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{share.sharedWithUser.phone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 hover:bg-red-50 hover:text-red-600 flex-shrink-0"
                            onClick={() => setShareToDelete(share.id)}
                            title="Remove access"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Select
                          value={share.permission}
                          onValueChange={(value: "view" | "edit") =>
                            handlePermissionChange(share.id, value)
                          }
                          disabled={updatePermissionMutation.isPending}
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="view">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3.5 w-3.5" />
                                <span>View Only</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="edit">
                              <div className="flex items-center gap-2">
                                <Edit3 className="h-3.5 w-3.5" />
                                <span>Can Edit</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Desktop: Horizontal Layout */}
                      <div className="hidden sm:flex items-center gap-4">
                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {displayName}
                          </div>
                          <div className="flex flex-col gap-1 mt-1">
                            {share.sharedWithUser.email && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Mail className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{share.sharedWithUser.email}</span>
                              </div>
                            )}
                            {share.sharedWithUser.phone && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Phone className="h-3 w-3 flex-shrink-0" />
                                <span>{share.sharedWithUser.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Permission Select */}
                        <div className="flex-shrink-0">
                          <Select
                            value={share.permission}
                            onValueChange={(value: "view" | "edit") =>
                              handlePermissionChange(share.id, value)
                            }
                            disabled={updatePermissionMutation.isPending}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="view">
                                <div className="flex items-center gap-2">
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>View</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="edit">
                                <div className="flex items-center gap-2">
                                  <Edit3 className="h-3.5 w-3.5" />
                                  <span>Edit</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Delete Button */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 hover:bg-red-50 hover:text-red-600 flex-shrink-0"
                          onClick={() => setShareToDelete(share.id)}
                          title="Remove access"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add More Users Section - only show if you're the owner */}
          {!isViewingShared && (
            <div className="border-t pt-3 sm:pt-4 mt-3 sm:mt-4">
              {!isAddingUsers ? (
                <Button
                variant="outline"
                onClick={() => setIsAddingUsers(true)}
                className="w-full h-9 sm:h-10 text-sm"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add More Users
              </Button>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs sm:text-sm font-semibold text-gray-700">
                    Add More Users
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsAddingUsers(false);
                      setSearchTerm("");
                      setSearchResults([]);
                    }}
                    className="h-7 w-7"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Search Input */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Search by email or phone..."
                      value={searchTerm}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="pr-10 h-9 sm:h-10 text-sm"
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  </div>
                  <Button
                    onClick={handleSearch}
                    disabled={!searchTerm.trim() || isSearching}
                    variant="blue-primary"
                    size="sm"
                    className="h-9 sm:h-10 sm:w-auto"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="h-4 w-4 sm:hidden mr-2" />
                        <span>Search</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-[120px] sm:max-h-[150px] overflow-y-auto">
                    {searchResults.map((user: any) => {
                      const displayName = [user.firstName, user.lastName]
                        .filter(Boolean)
                        .join(' ') || user.email?.split('@')[0] || "Unknown User";
                      
                      return (
                        <div
                          key={user.id}
                          className="p-2 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-gray-50"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {displayName}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {user.email}
                            </div>
                          </div>
                          <div className="flex gap-1.5 sm:gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddUser(user, "view")}
                              disabled={createShareMutation.isPending}
                              className="flex-1 sm:flex-none text-xs h-7 sm:h-8"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="blue-primary"
                              onClick={() => handleAddUser(user, "edit")}
                              disabled={createShareMutation.isPending}
                              className="flex-1 sm:flex-none text-xs h-7 sm:h-8"
                            >
                              <Edit3 className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          )}

          <div className="flex justify-end gap-2 sm:gap-3 pt-3 sm:pt-4 border-t mt-3 sm:mt-4">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="w-full sm:w-auto h-9 sm:h-10"
            >
              Close
            </Button>
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


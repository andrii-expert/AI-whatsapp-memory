"use client";

import { useState } from "react";
import { Search, UserPlus, X, Loader2, Mail, Phone } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@imaginecalendar/ui/alert-dialog";
import { Input } from "@imaginecalendar/ui/input";
import { Button } from "@imaginecalendar/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { cn } from "@imaginecalendar/ui/cn";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: "task" | "task_folder" | "note" | "note_folder" | "file" | "file_folder";
  resourceId: string;
  resourceName: string;
}

export function ShareModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
}: ShareModalProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingShares, setPendingShares] = useState<Array<{
    user: any;
    permission: "view" | "edit";
  }>>([]);

  // Determine which sharing router to use based on resource type
  const isNoteResource = resourceType === "note" || resourceType === "note_folder";
  const isFileResource = resourceType === "file" || resourceType === "file_folder";
  
  const createShareMutation = useMutation(
    (isNoteResource 
      ? trpc.noteSharing.createShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
          },
          onError: (error) => {
            toast({
              title: "Failed to share",
              description: error.message || "An error occurred while sharing",
              variant: "destructive",
            });
          },
        })
      : isFileResource
      ? trpc.fileSharing.createShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
          },
          onError: (error) => {
            toast({
              title: "Failed to share",
              description: error.message || "An error occurred while sharing",
              variant: "destructive",
            });
          },
        })
      : trpc.taskSharing.createShare.mutationOptions({
          onSuccess: () => {
            queryClient.invalidateQueries();
          },
          onError: (error) => {
            toast({
              title: "Failed to share",
              description: error.message || "An error occurred while sharing",
              variant: "destructive",
            });
          },
        })) as any
  );

  const handleShareAll = async () => {
    if (pendingShares.length === 0) return;

    try {
      // Share with all users in parallel
      await Promise.all(
        pendingShares.map((share) =>
          (createShareMutation.mutateAsync as any)({
            resourceType,
            resourceId,
            sharedWithUserId: share.user.id,
            permission: share.permission,
          })
        )
      );

      toast({
        title: "Shared successfully",
        description: `${resourceType === "task" || resourceType === "file" ? (resourceType === "task" ? "Task" : "File") : "Folder"} shared with ${pendingShares.length} ${pendingShares.length === 1 ? "person" : "people"}`,
      });
      
      setSearchTerm("");
      setSearchResults([]);
      setPendingShares([]);
      onClose();
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Use queryClient to fetch the query - use appropriate router based on resource type
      const results = await queryClient.fetchQuery(
        isNoteResource
          ? trpc.noteSharing.searchUsers.queryOptions({
              searchTerm: searchTerm.trim(),
            })
          : isFileResource
          ? trpc.fileSharing.searchUsers.queryOptions({
              searchTerm: searchTerm.trim(),
            })
          : trpc.taskSharing.searchUsers.queryOptions({
              searchTerm: searchTerm.trim(),
            })
      );
      
      console.log('Search term:', searchTerm.trim());
      console.log('Search results:', results);
      setSearchResults(results || []);
      
      if (!results || results.length === 0) {
        toast({
          title: "No users found",
          description: `No users match "${searchTerm.trim()}"`,
        });
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast({
        title: "Search failed",
        description: error?.message || "Could not search for users",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddUser = (user: any) => {
    // Check if user is already in pending shares
    if (pendingShares.some(share => share.user.id === user.id)) {
      toast({
        title: "User already added",
        description: "This user is already in your sharing list",
      });
      return;
    }

    setPendingShares([...pendingShares, { user, permission: "view" }]);
    setSearchTerm("");
    setSearchResults([]);
  };

  const handleRemoveUser = (userId: string) => {
    setPendingShares(pendingShares.filter(share => share.user.id !== userId));
  };

  const handlePermissionChange = (userId: string, permission: "view" | "edit") => {
    setPendingShares(pendingShares.map(share => 
      share.user.id === userId ? { ...share, permission } : share
    ));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="w-[95vw] sm:max-w-[550px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <AlertDialogHeader className="space-y-2 sm:space-y-3">
          <AlertDialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <UserPlus className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            </div>
            <span className="truncate">Share {resourceType === "task" || resourceType === "file" ? (resourceType === "task" ? "Task" : "File") : "Folder"}</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm sm:text-base break-all pt-1">
            Share "{resourceName}" with users by searching for their email or phone
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4">
          {/* Pending Shares List */}
          {pendingShares.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-semibold text-gray-700">
                Users to Share With ({pendingShares.length})
              </label>
              <div className="border rounded-lg divide-y max-h-[180px] sm:max-h-[200px] overflow-y-auto">
                {pendingShares.map((share) => {
                  const displayName = [share.user.firstName, share.user.lastName]
                    .filter(Boolean)
                    .join(' ') || share.user.email?.split('@')[0] || "Unknown User";
                  
                  return (
                    <div key={share.user.id} className="p-2 sm:p-3">
                      {/* Mobile: Stacked Layout */}
                      <div className="flex sm:hidden flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {displayName}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {share.user.email}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 hover:bg-red-50 hover:text-red-600 flex-shrink-0"
                            onClick={() => handleRemoveUser(share.user.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Select
                          value={share.permission}
                          onValueChange={(value: "view" | "edit") => 
                            handlePermissionChange(share.user.id, value)
                          }
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="view">View Only</SelectItem>
                            <SelectItem value="edit">Can Edit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Desktop: Horizontal Layout */}
                      <div className="hidden sm:flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">
                            {displayName}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {share.user.email}
                          </div>
                        </div>
                        <Select
                          value={share.permission}
                          onValueChange={(value: "view" | "edit") => 
                            handlePermissionChange(share.user.id, value)
                          }
                        >
                          <SelectTrigger className="w-[100px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="view">View</SelectItem>
                            <SelectItem value="edit">Edit</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleRemoveUser(share.user.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-semibold text-gray-700">
              {pendingShares.length > 0 ? "Add More Users" : "Search User"}
            </label>
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
            <p className="text-xs text-gray-500">
              Type any part of the email or phone number
            </p>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-semibold text-gray-700">
                Search Results
              </label>
              <div className="border rounded-lg divide-y max-h-[180px] sm:max-h-[200px] overflow-y-auto">
                {searchResults.map((user) => {
                  const displayName = [user.firstName, user.lastName]
                    .filter(Boolean)
                    .join(' ') || user.email?.split('@')[0] || "Unknown User";
                  
                  return (
                    <div
                      key={user.id}
                      className="p-2 sm:p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between hover:bg-gray-50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm sm:text-base text-gray-900 truncate">
                          {displayName}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1">
                          {user.email && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Mail className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{user.email}</span>
                            </div>
                          )}
                          {user.phoneNumber && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Phone className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{user.phoneNumber}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAddUser(user)}
                        variant="blue-primary"
                        className="w-full sm:w-auto sm:ml-3 h-8 text-xs sm:text-sm"
                      >
                        Add
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {searchResults.length === 0 && searchTerm && !isSearching && (
            <div className="text-center py-6 sm:py-8 text-gray-500">
              <div className="text-xs sm:text-sm">
                No user found with that email or phone number
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 sm:gap-3 pt-3 sm:pt-4 border-t mt-4">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="w-full sm:w-auto h-9 sm:h-10"
          >
            Cancel
          </Button>
          <Button 
            variant="blue-primary" 
            onClick={handleShareAll}
            disabled={pendingShares.length === 0 || createShareMutation.isPending}
            className="w-full sm:w-auto h-9 sm:h-10"
          >
            {createShareMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sharing...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                <span className="truncate">
                  Share with {pendingShares.length} {pendingShares.length === 1 ? "User" : "Users"}
                </span>
              </>
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}


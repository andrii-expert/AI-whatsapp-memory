"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { Home, ChevronLeft, Plus, Search, Edit2, Trash2, Check, ShoppingCart, X, Share2, Users, Calendar, ArrowUp, ArrowDown, SortAsc, SortDesc, Bell, StickyNote, Folder, FolderClosed, ChevronDown, ChevronRight, Menu, MoreVertical, Eye } from "lucide-react";
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
import { ShareButton } from "@/components/share-button";
import { ShareModal } from "@/components/share-modal";
import { ShareDetailsModal } from "@/components/share-details-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@imaginecalendar/ui/sheet";
import { useSearchParams } from "next/navigation";

export default function ShoppingListPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewAllItems, setViewAllItems] = useState(true); // Default to All Items view
  const [viewAllShared, setViewAllShared] = useState(false); // View all shared items
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "completed">("all");
  const [sortBy, setSortBy] = useState<"date" | "alphabetical">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "name" | "description">("all");
  const [newItemName, setNewItemName] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newItemDescription, setNewItemDescription] = useState("");
  const [editItemDescription, setEditItemDescription] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [editItemCategory, setEditItemCategory] = useState("");
  const [isCategoryInputMode, setIsCategoryInputMode] = useState<"select" | "manual">("select");
  const [isLoadingAISuggestion, setIsLoadingAISuggestion] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const lastExpandedFolderRef = useRef<string | null>(null);
  const foldersRef = useRef<any[]>([]);

  // Folder states
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [deleteFolderConfirmOpen, setDeleteFolderConfirmOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);

  // Share states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShareDetailsModalOpen, setIsShareDetailsModalOpen] = useState(false);
  const [shareResourceType, setShareResourceType] = useState<"task" | "task_folder" | "shopping_list_folder" | "note" | "note_folder" | "file" | "file_folder" | "address" | "address_folder">("task");
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [shareResourceName, setShareResourceName] = useState("");

  // Fetch folders and items
  const { data: allFolders = [], isLoading: isLoadingFolders } = useQuery(
    trpc.shoppingList.folders.list.queryOptions()
  );
  const { data: allItems = [], isLoading: isLoadingItems } = useQuery(
    trpc.shoppingList.list.queryOptions({})
  );
  
  // Get existing categories in the selected folder
  const { data: existingCategories = [] } = useQuery(
    trpc.shoppingList.getCategories.queryOptions({
      folderId: selectedFolderId || undefined,
    })
  );
  const { data: myShares = [], isLoading: isLoadingShares } = useQuery(
    trpc.taskSharing.getMyShares.queryOptions()
  );
  const { data: sharedResources, isLoading: isLoadingSharedResources } = useQuery(
    trpc.taskSharing.getSharedWithMe.queryOptions()
  );
  const { data: userPreferences } = useQuery(
    trpc.preferences.get.queryOptions()
  );
  
  // Get friends list to check if shared users are friends
  const { data: friendsList = [] } = useQuery(
    trpc.friends.list.queryOptions()
  );

  // Check if initial data is loading
  const isLoading = isLoadingFolders || isLoadingItems || isLoadingShares || isLoadingSharedResources;

  // Extract shared items and folders from sharedResources
  const sharedItems = useMemo(() => {
    // Shopping list items don't have direct sharing, but we can check if they're in shared folders
    return [];
  }, []);

  const sharedFolders = useMemo(() => {
    // Filter only shopping list folders from shared resources
    return (sharedResources?.folders || [])
      .filter((folder: any) => {
        // Check if this is a shopping list folder by checking if it has items property
        // or by checking the share resource type
        const share = myShares.find((s: any) => 
          s.resourceType === "shopping_list_folder" && s.resourceId === folder.id
        );
        return share || (folder.items && Array.isArray(folder.items));
      })
      .map((folder: any) => {
        const folderPermission = folder.shareInfo?.permission || "view";
        return {
          ...folder,
          isSharedWithMe: true,
          sharePermission: folderPermission,
          ownerId: folder.shareInfo?.ownerId,
          items: (folder.items || []).map((item: any) => ({
            ...item,
            // Preserve user information if it exists
            user: item.user || undefined,
            isSharedWithMe: true,
            sharePermission: folderPermission,
            sharedViaFolder: true,
          })),
        };
      });
  }, [sharedResources, myShares]);

  // Filter out shared folders from main folder list - only show owned folders
  const folders = allFolders.filter((folder: any) => !folder.isSharedWithMe);

  // Helper function to flatten all folders including categories
  const flattenFolders = (folderList: any[]): any[] => {
    // Only return top-level folders, ignore subfolders
    return folderList.filter((folder: any) => !folder.parentId);
  };

  const allOwnedFolders = useMemo(() => flattenFolders(folders), [folders]);

  // Sort folders to show "General" at the top
  const sortedFolders = useMemo(() => {
    // Only show top-level folders (no subfolders)
    const topLevelFolders = folders.filter((folder: any) => !folder.parentId);
    return [...topLevelFolders].sort((a, b) => {
      const aIsGeneral = a.name.toLowerCase() === "general";
      const bIsGeneral = b.name.toLowerCase() === "general";
      
      if (aIsGeneral && !bIsGeneral) return -1;
      if (!aIsGeneral && bIsGeneral) return 1;
      
      return 0;
    });
  }, [folders]);

  // Update folders ref when allOwnedFolders changes
  useEffect(() => {
    foldersRef.current = allOwnedFolders;
  }, [allOwnedFolders]);

  // Handle folderId from URL parameters
  useEffect(() => {
    const folderIdFromUrl = searchParams.get("folderId");
    if (folderIdFromUrl && allOwnedFolders.length > 0) {
      const folderExists = allOwnedFolders.some((f: any) => f.id === folderIdFromUrl);
      if (folderExists) {
        setSelectedFolderId(folderIdFromUrl);
        setViewAllItems(false);
      }
    }
  }, [searchParams, allOwnedFolders]);

  // Get selected folder
  const selectedFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    return allOwnedFolders.find((f) => f.id === selectedFolderId) || 
           sharedFolders.find((f: any) => f.id === selectedFolderId) || 
           null;
  }, [selectedFolderId, allOwnedFolders, sharedFolders]);
  
  // Get shared users for selected folder (if it's owned by current user)
  const { data: folderShares = [] } = useQuery({
    ...trpc.taskSharing.getResourceShares.queryOptions({
      resourceType: "shopping_list_folder",
      resourceId: selectedFolderId || "",
    }),
    enabled: !!selectedFolderId && !!selectedFolder && !selectedFolder.isSharedWithMe,
  });


  // Get folder path (breadcrumb trail) - simplified since no subfolders
  const getFolderPath = (folderId: string): string[] => {
    const folder = allOwnedFolders.find((f) => f.id === folderId) || 
                   sharedFolders.find((f: any) => f.id === folderId);
    return folder ? [folder.name] : [];
  };

  const folderPath = selectedFolder ? getFolderPath(selectedFolder.id) : [];

  // Check if a folder is accessible
  const isFolderAccessible = (folderId: string | null): boolean => {
    if (!folderId) return false;
    return !!(allOwnedFolders.find((f) => f.id === folderId) || 
              sharedFolders.find((f: any) => f.id === folderId));
  };

  // Mutations
  const createItemMutation = useMutation(
    trpc.shoppingList.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.taskSharing.getSharedWithMe.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.folders.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.getCategories.queryKey() });
        setNewItemName("");
        setNewItemDescription("");
        setNewItemCategory("");
        setIsCategoryInputMode("select");
        setIsAddModalOpen(false);
        toast({
          title: "Item added",
          description: "Item has been added to your shopping list",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to add item",
          variant: "error",
        });
      },
    })
  );

  const updateItemMutation = useMutation(
    trpc.shoppingList.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.taskSharing.getSharedWithMe.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.folders.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.getCategories.queryKey() });
        setEditingItemId(null);
        setEditItemName("");
        setEditItemDescription("");
        setEditItemCategory("");
        setIsEditModalOpen(false);
        toast({
          title: "Item updated",
          description: "Item has been updated",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to update item",
          variant: "error",
        });
      },
    })
  );

  const deleteItemMutation = useMutation(
    trpc.shoppingList.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.taskSharing.getSharedWithMe.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.folders.list.queryKey() });
        setDeleteConfirmOpen(false);
        setItemToDelete(null);
        toast({
          title: "Item deleted",
          description: "Item has been removed from your shopping list",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to delete item",
          variant: "error",
        });
      },
    })
  );

  const toggleItemMutation = useMutation(
    trpc.shoppingList.toggle.mutationOptions({
      onMutate: async ({ id }) => {
        // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
        await queryClient.cancelQueries({ queryKey: trpc.shoppingList.list.queryKey() });

        // Snapshot the previous value
        const previousItems = queryClient.getQueryData(trpc.shoppingList.list.queryKey());

        // Optimistically update to the new value
        queryClient.setQueryData(trpc.shoppingList.list.queryKey(), (old: any) => {
          if (!old) return old;
          return old.map((item: any) => {
            if (item.id === id) {
              return {
                ...item,
                status: item.status === "completed" ? "open" : "completed",
              };
            }
            return item;
          });
        });

        // Return a context object with the snapshotted value
        return { previousItems };
      },
      onError: (error, variables, context) => {
        // If the mutation fails, use the context returned from onMutate to roll back
        if (context?.previousItems) {
          queryClient.setQueryData(trpc.shoppingList.list.queryKey(), context.previousItems);
        }
        toast({
          title: "Error",
          description: error.message || "Failed to update item",
          variant: "error",
        });
      },
      onSettled: () => {
        // Always refetch after error or success to ensure we have the latest data
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.taskSharing.getSharedWithMe.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.folders.list.queryKey() });
      },
    })
  );

  // Folder mutations
  const createFolderMutation = useMutation(
    trpc.shoppingList.folders.create.mutationOptions({
      onSuccess: (newFolder) => {
        queryClient.invalidateQueries();
        setNewFolderName("");
        if (newFolder) {
          setSelectedFolderId(newFolder.id);
          setViewAllItems(false);
        }
        toast({
          title: "Success",
          description: "Folder created successfully",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to create folder",
          variant: "error",
        });
      },
    })
  );

  const updateFolderMutation = useMutation(
    trpc.shoppingList.folders.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditingFolderId(null);
        setEditFolderName("");
        toast({
          title: "Success",
          description: "Folder updated successfully",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to update folder",
          variant: "error",
        });
      },
    })
  );

  const deleteFolderMutation = useMutation(
    trpc.shoppingList.folders.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setDeleteFolderConfirmOpen(false);
        setFolderToDelete(null);
        if (selectedFolderId === folderToDelete?.id) {
          setSelectedFolderId(null);
          setViewAllItems(true);
        }
        toast({
          title: "Success",
          description: "Folder deleted successfully",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to delete folder",
          variant: "error",
        });
      },
    })
  );

  // Folder handlers
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate({ name: newFolderName.trim() });
  };


  const handleEditFolder = (folderId: string, folderName: string) => {
    setEditingFolderId(folderId);
    setEditFolderName(folderName);
  };

  const handleSaveFolder = (folderId: string) => {
    if (!editFolderName.trim()) {
      setEditingFolderId(null);
      return;
    }
    updateFolderMutation.mutate({ id: folderId, name: editFolderName.trim() });
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    setFolderToDelete({ id: folderId, name: folderName });
    setDeleteFolderConfirmOpen(true);
  };

  const confirmDeleteFolder = () => {
    if (folderToDelete) {
      deleteFolderMutation.mutate({ id: folderToDelete.id });
    }
  };

  // Format date for shopping list items: "16 Dec, 2025"
  const formatShoppingListDate = (dateTimeStr: string | Date | null | undefined) => {
    if (!dateTimeStr) return "";
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return "";
    
    const timezone = userPreferences?.timezone || "Africa/Johannesburg";
    
    // Use Intl.DateTimeFormat to format date in user's timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === "year")?.value || "";
    const month = parts.find(p => p.type === "month")?.value || "";
    const day = parts.find(p => p.type === "day")?.value || "";
    
    return `${day} ${month}, ${year}`;
  };

  // Get user display name (first name + first letter of last name)
  const getUserDisplayName = (user: any) => {
    if (!user) return "Unknown";
    if (user.firstName || user.lastName) {
      const firstName = user.firstName || "";
      const lastName = user.lastName || "";
      if (firstName && lastName) {
        return `${firstName} ${lastName.charAt(0)}`;
      }
      return firstName || lastName || "Unknown";
    }
    return user.email || "Unknown";
  };
  
  // Get display name for shared user (friend name if exists, otherwise first name + first letter of last name)
  const getSharedUserDisplayName = (sharedUser: any) => {
    if (!sharedUser) return "Unknown";
    
    // Check if this user is in friends list
    const friend = friendsList.find((f: any) => f.connectedUserId === sharedUser.id);
    if (friend) {
      return friend.name;
    }
    
    // Otherwise return first name + first letter of last name
    return getUserDisplayName(sharedUser);
  };
  
  // Get user initials for avatar
  const getUserInitials = (user: any) => {
    if (!user) return "U";
    
    const displayName = getSharedUserDisplayName(user);
    if (displayName === "Unknown") return "U";
    
    const parts = displayName.split(" ");
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return displayName.substring(0, 2).toUpperCase();
  };
  
  // Get avatar color based on user ID
  const getAvatarColor = (userId: string) => {
    if (!userId) return "bg-blue-500";
    
    const colors = [
      "bg-blue-500",
      "bg-purple-500",
      "bg-green-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-teal-500",
    ];
    
    const hash = userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const handleFolderSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
    setViewAllItems(false);
    setViewAllShared(false);
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllItems = () => {
    setSelectedFolderId(null);
    setViewAllItems(true);
    setViewAllShared(false);
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllShared = () => {
    setSelectedFolderId(null);
    setViewAllItems(false);
    setViewAllShared(true);
    setIsMobileSidebarOpen(false);
  };

  const handleSharedFolderSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
    setViewAllItems(false);
    setViewAllShared(false);
    setIsMobileSidebarOpen(false);
  };


  // Get share count for a resource
  const getShareCount = (resourceType: "task" | "task_folder" | "shopping_list_folder", resourceId: string): number => {
    return myShares.filter(
      (share: any) => share.resourceType === resourceType && share.resourceId === resourceId
    ).length;
  };

  // Filter and search items
  const filteredItems = useMemo(() => {
    let items = allItems;

    // Filter by folder - if viewing all, show all items
    // If a folder is selected, show only items in that folder
    if (!viewAllItems && !viewAllShared && selectedFolderId) {
      // Check if it's a shared folder
      const isSharedFolder = sharedFolders.some((f: any) => f.id === selectedFolderId);
      if (isSharedFolder) {
        // Show items from the shared folder
        const sharedFolder = sharedFolders.find((f: any) => f.id === selectedFolderId);
        items = (sharedFolder?.items || []).map((item: any) => ({
          ...item,
          // Preserve user information if it exists
          user: item.user || undefined,
          isSharedWithMe: true,
          sharePermission: sharedFolder.sharePermission || "view",
        }));
      } else {
        // Regular owned folder - filter items by folderId
        items = items.filter((item: any) => item.folderId === selectedFolderId && !item.isSharedWithMe);
      }
    }
    // When viewing "All Items", exclude shared items
    else if (viewAllItems) {
      items = items.filter((item: any) => !item.isSharedWithMe);
    }
    // When viewing "All Shared", show only shared items from all shared folders
    else if (viewAllShared) {
      // Collect all items from shared folders
      const sharedItemsFromFolders = sharedFolders.flatMap((folder: any) => 
        (folder.items || []).map((item: any) => ({
          ...item,
          // Preserve user information if it exists
          user: item.user || undefined,
          isSharedWithMe: true,
          sharePermission: folder.sharePermission || "view",
        }))
      );
      // Combine with items that are already marked as shared
      const directSharedItems = items.filter((item: any) => item.isSharedWithMe);
      items = [...directSharedItems, ...sharedItemsFromFolders];
    }

    // Filter by status
    if (filterStatus !== "all") {
      items = items.filter((item) => item.status === filterStatus);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter((item) => {
        if (searchScope === "name") {
          return item.name.toLowerCase().includes(query);
        } else if (searchScope === "description") {
          return item.description?.toLowerCase().includes(query) || false;
        } else {
          // searchScope === "all"
          return (
            item.name.toLowerCase().includes(query) ||
            item.description?.toLowerCase().includes(query)
          );
        }
      });
    }

    // Sort items
    if (sortBy === "alphabetical") {
      items = [...items].sort((a, b) => {
        const comparison = a.name.localeCompare(b.name);
        return sortOrder === "asc" ? comparison : -comparison;
      });
    } else if (sortBy === "date") {
      items = [...items].sort((a, b) => {
        // Items without dates always go to the end
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;  // a goes to end
        if (!b.createdAt) return -1; // b goes to end
        
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        const comparison = dateA - dateB;
        return sortOrder === "asc" ? comparison : -comparison;
      });
    }

    return items;
  }, [allItems, selectedFolderId, viewAllItems, viewAllShared, sharedFolders, filterStatus, searchQuery, searchScope, sortBy, sortOrder]);

  // Calculate item counts for status badges (before search filtering, but after folder filtering)
  const itemCounts = useMemo(() => {
    let items = allItems;

    // Filter by folder - same logic as filteredItems, but without status/search filters
    if (!viewAllItems && !viewAllShared && selectedFolderId) {
      // Check if it's a shared folder
      const isSharedFolder = sharedFolders.some((f: any) => f.id === selectedFolderId);
      if (isSharedFolder) {
        // Show items from the shared folder
        const sharedFolder = sharedFolders.find((f: any) => f.id === selectedFolderId);
        items = sharedFolder?.items || [];
      } else {
        // Regular owned folder - filter items by folderId
        items = items.filter((item: any) => item.folderId === selectedFolderId && !item.isSharedWithMe);
      }
    }
    // When viewing "All Items", exclude shared items
    else if (viewAllItems) {
      items = items.filter((item: any) => !item.isSharedWithMe);
    }
    // When viewing "All Shared", show only shared items
    else if (viewAllShared) {
      items = items.filter((item: any) => item.isSharedWithMe);
    }

    const openCount = items.filter((item) => item.status === "open").length;
    const completedCount = items.filter((item) => item.status === "completed").length;
    const allCount = items.length;

    return { open: openCount, completed: completedCount, all: allCount };
  }, [allItems, selectedFolderId, viewAllItems, viewAllShared, sharedFolders]);

  // Calculate deletable items (only completed items that user owns)
  const deletableItems = useMemo(() => {
    return filteredItems.filter((item) => item.status === "completed");
  }, [filteredItems]);

  // Get AI category suggestion
  const getAICategorySuggestion = async () => {
    if (!newItemName.trim()) {
      toast({
        title: "Item name required",
        description: "Please enter an item name first",
        variant: "error",
      });
      return;
    }

    setIsLoadingAISuggestion(true);
    try {
      console.log('Requesting AI category suggestion for:', {
        itemName: newItemName.trim(),
        description: newItemDescription.trim(),
        folderId: selectedFolderId
      });
      
      const queryOptions = trpc.shoppingList.suggestCategory.queryOptions({
        itemName: newItemName.trim(),
        description: newItemDescription.trim() || undefined,
        folderId: selectedFolderId || undefined,
      });
      const result = await queryClient.fetchQuery(queryOptions);

      console.log('AI category suggestion result:', result);

      if (result && result.suggestedCategory) {
        const suggestedCategory = result.suggestedCategory.trim();
        if (suggestedCategory) {
          setNewItemCategory(suggestedCategory);
          setIsCategoryInputMode("manual");
          console.log('Setting category to:', suggestedCategory, 'Mode:', "manual");
          toast({
            title: "Category suggested",
            description: `Suggested category: ${suggestedCategory}`,
          });
        } else {
          toast({
            title: "No suggestion",
            description: "AI couldn't suggest a category for this item.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "No suggestion",
          description: "AI couldn't suggest a category for this item.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('AI suggestion error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI suggestion. Please try again.",
        variant: "error",
      });
    } finally {
      setIsLoadingAISuggestion(false);
    }
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    createItemMutation.mutate({
      folderId: selectedFolderId || undefined,
      name: newItemName.trim(),
      description: newItemDescription.trim() || undefined,
      category: newItemCategory.trim() || undefined,
    });
  };

  const handleUpdateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItemName.trim() || !editingItemId) return;

    updateItemMutation.mutate({
      id: editingItemId,
      name: editItemName.trim(),
      description: editItemDescription.trim() || undefined,
      category: editItemCategory.trim() || null,
    });
  };

  const handleEditItem = (item: any) => {
    setEditingItemId(item.id);
    setEditItemName(item.name);
    setEditItemDescription(item.description || "");
    setIsEditModalOpen(true);
  };

  const handleDeleteItem = (itemId: string, itemName: string) => {
    setItemToDelete({ id: itemId, name: itemName });
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      deleteItemMutation.mutate({ id: itemToDelete.id });
    }
  };

  const handleToggleItem = (itemId: string) => {
    toggleItemMutation.mutate({ id: itemId });
  };

  const handleDeleteAll = async () => {
    if (deletableItems.length === 0) return;
    
    try {
      // Delete all completed items
      await Promise.all(
        deletableItems.map((item) => deleteItemMutation.mutateAsync({ id: item.id }))
      );
      toast({
        title: "Items deleted",
        description: `${deletableItems.length} completed ${deletableItems.length === 1 ? "item" : "items"} deleted`,
      });
    } catch (error) {
      // Error handling is done by the mutation
    }
  };



  // Folder rendering component
  const renderFolder = (folder: any) => {
    const isSelected = selectedFolderId === folder.id && !viewAllItems;
    const isEditingFolder = editingFolderId === folder.id;
    
    // Check if folder is shared with user (not owned)
    const isSharedFolder = folder.isSharedWithMe || false;
    const canEdit = !isSharedFolder || folder.sharePermission === "edit";
    const isOwner = !isSharedFolder;

    return (
      <div key={folder.id}>
        <div
          className={cn(
            "flex items-center justify-between px-4 py-2 rounded-lg transition-colors group",
            isSelected ? "bg-blue-100 text-blue-900" : "hover:bg-gray-100 text-gray-700"
          )}
        >
          {/* Left side: Folder name */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {isEditingFolder ? (
              <Input
                value={editFolderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditFolderName(e.target.value)
                }
                onBlur={() => handleSaveFolder(folder.id)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") handleSaveFolder(folder.id);
                  if (e.key === "Escape") setEditingFolderId(null);
                }}
                autoFocus
                className="flex-1 h-7 text-sm"
              />
            ) : (
              <button
                onClick={() => handleFolderSelect(folder.id)}
                className="flex items-center gap-2 flex-1 text-left min-w-0"
              >
                {folder.icon === "shopping-cart" ? (
                  <ShoppingCart className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <FolderClosed className="h-4 w-4 flex-shrink-0" />
                )}
                <span className="font-medium truncate">{folder.name}</span>
                {isSharedFolder && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openShareDetails("shopping_list_folder", folder.id, folder.name);
                    }}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 transition-colors",
                      folder.sharePermission === "view"
                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                    )}
                    title={folder.sharePermission === "view" ? "View only - You have view permission" : "Edit - You have edit permission"}
                  >
                    {folder.sharePermission === "view" ? (
                      <Eye className="h-2.5 w-2.5" />
                    ) : (
                      <Users className="h-2.5 w-2.5" />
                    )}
                    <span className="hidden sm:inline">
                      {folder.sharePermission === "view" ? "View" : "Edit"}
                    </span>
                  </button>
                )}
              </button>
            )}
          </div>

          {/* Right side: 3-dot menu button with dropdown */}
          {!isEditingFolder && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 hover:bg-gray-200"
                  title="Folder options"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                  }}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                {isOwner && (() => {
                  const shareCount = getShareCount("shopping_list_folder", folder.id);
                  const isShared = shareCount > 0;
                  return (
                    <DropdownMenuItem
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (isShared) {
                          openShareDetails("shopping_list_folder", folder.id, folder.name);
                        } else {
                          openShareModal("shopping_list_folder", folder.id, folder.name);
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
                          <Share2 className="h-4 w-4" />
                          <span>Share</span>
                        </>
                      )}
                    </DropdownMenuItem>
                  );
                })()}
                {canEdit && (
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
                )}
                {isOwner && folder.name.toLowerCase() !== "general" && (
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
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

      </div>
    );
  };

  // Share functions
  const openShareModal = (type: "task" | "task_folder" | "shopping_list_folder", id: string, name: string) => {
    setShareResourceType(type);
    setShareResourceId(id);
    setShareResourceName(name);
    setIsShareModalOpen(true);
  };

  const openShareDetails = (type: "task" | "task_folder" | "shopping_list_folder", id: string, name: string) => {
    setShareResourceType(type);
    setShareResourceId(id);
    setShareResourceName(name);
    setIsShareDetailsModalOpen(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full px-0 py-0 md:px-4 md:py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-0 py-0 md:px-4 md:py-8 space-y-6">
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
          <span className="font-medium">Shopping Lists</span>
        </div>
        {/* Mobile: Lists button */}
        <div className="lg:hidden">
          <Button
            variant="outline"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 h-auto hover:bg-gray-50 border-2 hover:border-blue-300 transition-all"
          >
            <Menu className="h-4 w-4" />
            <span className="font-medium">Lists</span>
          </Button>
        </div>
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
      <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <SheetContent 
          side="left" 
          className="p-0 !left-0 !w-[300px] !max-w-[300px] overflow-y-auto"
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Folders</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="h-8 w-8"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Folders List */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
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

              {/* All Items Button */}
              <button
                onClick={handleViewAllItems}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                  viewAllItems
                    ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                    : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                )}
              >
                <Folder className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">All Items</span>
                <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                  {allItems.filter((item: any) => !item.isSharedWithMe).length}
                </span>
              </button>

              {folders.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No folders yet.</p>
                  <p className="text-xs mt-1">Create a folder above to get started.</p>
                </div>
              ) : (
                <>
                  <div className="h-px bg-gray-200 my-2" />
                  {sortedFolders.map((folder) => renderFolder(folder))}
                </>
              )}

              {/* Shared Section */}
              {sharedFolders.length > 0 && (
                <>
                  <div className="h-px bg-gray-200 my-2" />
                  <div className="px-2 py-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      Shared with me
                    </h3>
                  </div>
                  {sharedFolders.map((folder: any) => (
                    <button
                      key={folder.id}
                      onClick={() => handleSharedFolderSelect(folder.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                        selectedFolderId === folder.id && !viewAllItems && !viewAllShared
                          ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300"
                          : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                      )}
                    >
                      {folder.icon === "shopping-cart" ? (
                        <ShoppingCart className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <FolderClosed className="h-4 w-4 flex-shrink-0" />
                      )}
                      <span className="flex-1 text-left truncate">{folder.name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 w-full">
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
              {/* All Items Button */}
              <button
                onClick={handleViewAllItems}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                  viewAllItems
                    ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                    : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                )}
              >
                <Folder className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">All Items</span>
                <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                  {allItems.filter((item: any) => !item.isSharedWithMe).length}
                </span>
              </button>

              {folders.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No folders yet.</p>
                  <p className="text-xs mt-1">Create a folder above to get started.</p>
                </div>
              ) : (
                <>
                  <div className="h-px bg-gray-200 my-2" />
                  {sortedFolders.map((folder) => renderFolder(folder))}
                </>
              )}

              {/* Shared Section */}
              {sharedFolders.length > 0 && (
                <>
                  <div className="h-px bg-gray-200 my-2" />
                  <div className="px-2 py-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      Shared with me
                    </h3>
                  </div>
                  {sharedFolders.map((folder: any) => (
                    <button
                      key={folder.id}
                      onClick={() => handleSharedFolderSelect(folder.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                        selectedFolderId === folder.id && !viewAllItems && !viewAllShared
                          ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300"
                          : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                      )}
                    >
                      {folder.icon === "shopping-cart" ? (
                        <ShoppingCart className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <FolderClosed className="h-4 w-4 flex-shrink-0" />
                      )}
                      <span className="flex-1 text-left truncate">{folder.name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Items */}
        <div className="space-y-4 w-full min-w-0">

          {/* Folder breadcrumb, Shared with, and Add Item button */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {viewAllItems ? (
                  <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                    <Folder className="h-6 w-6 flex-shrink-0 text-blue-600" />
                    <span className="font-bold text-gray-900">All Items</span>
                  </div>
                ) : viewAllShared ? (
                  <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                    <Users className="h-6 w-6 flex-shrink-0 text-purple-600" />
                    <span className="font-bold text-gray-900">All Shared</span>
                  </div>
                ) : selectedFolder && folderPath.length > 0 ? (
                  <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                    <FolderClosed className="h-6 w-6 flex-shrink-0" />
                    {folderPath.map((name, index) => (
                      <span key={index} className="flex items-center gap-2">
                        {index > 0 && <span className="text-gray-400">/</span>}
                        <span
                          className={cn(
                            index === folderPath.length - 1
                              ? "font-semibold text-gray-900"
                              : "",
                            "truncate"
                          )}
                        >
                          {name}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
                
                {/* Desktop: Lists button */}
                <div className="hidden lg:block">
                  <Button
                    variant="outline"
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 h-auto hover:bg-gray-50 border-2 hover:border-blue-300 transition-all"
                  >
                    <Menu className="h-4 w-4" />
                    <span className="font-medium">Lists</span>
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                {(() => {
                  // Check if selected folder is shared and user has view permission only
                  const isSharedFolder = selectedFolder?.isSharedWithMe || false;
                  const folderPermission = selectedFolder?.sharePermission;
                  const canAddToFolder = !isSharedFolder || folderPermission === "edit";
                  const isDisabled = viewAllShared || (!selectedFolderId && !viewAllItems) || (selectedFolderId && !canAddToFolder);
                  
                  return (
                    <Button
                      onClick={() => setIsAddModalOpen(true)}
                      variant="orange-primary"
                      className="flex-shrink-0"
                      disabled={isDisabled}
                      title={selectedFolderId && !canAddToFolder ? "View only - You cannot add items to this folder" : undefined}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                  );
                })()}
              </div>
            </div>
            
            {/* Shared with section */}
            {selectedFolder && !selectedFolder.isSharedWithMe && folderShares.length > 0 && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <span className="font-medium">Shared with</span>
                <div className="flex items-center gap-1.5">
                  {folderShares.map((share: any) => {
                    const sharedUser = share.sharedWithUser;
                    if (!sharedUser) return null;
                    
                    return (
                      <div
                        key={share.id}
                        className="group relative flex items-center overflow-visible"
                      >
                        <div
                          className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold transition-all duration-200 hover:scale-110 hover:shadow-md",
                            getAvatarColor(sharedUser.id)
                          )}
                        >
                          {getUserInitials(sharedUser)}
                        </div>
                        <span className="ml-2 max-w-0 overflow-hidden whitespace-nowrap font-medium text-gray-900 opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out">
                          {getSharedUserDisplayName(sharedUser)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="mb-4 w-full justify-between flex gap-2">
        <div className="relative flex-1">
          <Input
            placeholder={
              searchScope === "all"
                ? "Search items..."
                : searchScope === "name"
                ? "Search by name..."
                : "Search by description..."
            }
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            className="pr-10 h-11"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>
        {/* Mobile: Dropdown Menu */}
        <div className="sm:hidden w-full max-w-[100px]">
          <Select
            value={`${sortBy}-${sortOrder}`}
            onValueChange={(value) => {
              const [by, order] = value.split("-") as [
                "date" | "alphabetical",
                "asc" | "desc"
              ];
              setSortBy(by);
              setSortOrder(order);
            }}
          >
            <SelectTrigger className="w-full h-11">
              <SelectValue>
                <div className="flex items-center gap-2">
                  {sortBy === "date" ? (
                    <>
                      <Calendar className="h-4 w-4" />
                      {sortOrder === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </>
                  ) : (
                    <>
                      {sortOrder === "asc" ? (
                        <>
                          <SortAsc className="h-4 w-4" />
                          <span className="text-sm">A-Z</span>
                        </>
                      ) : (
                        <>
                          <SortDesc className="h-4 w-4" />
                          <span className="text-sm">Z-A</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <ArrowDown className="h-3 w-3" />
                </div>
              </SelectItem>
              <SelectItem value="date-asc">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <ArrowUp className="h-3 w-3" />
                </div>
              </SelectItem>
              <SelectItem value="alphabetical-asc">
                <div className="flex items-center gap-2">
                  <SortAsc className="h-4 w-4" />
                  <span>A-Z</span>
                </div>
              </SelectItem>
              <SelectItem value="alphabetical-desc">
                <div className="flex items-center gap-2">
                  <SortDesc className="h-4 w-4" />
                  <span>Z-A</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          </div>
          </div>

          {/* Filter and Sort Controls */}
          <div className="flex flex-row w-full justify-between items-center sm:gap-3 mb-4">
        {/* Filter Buttons and Delete All */}
        <div className="flex w-full sm:w-auto justify-start gap-1.5 sm:gap-2 flex-wrap items-center">
          <Button
            variant={filterStatus === "all" ? "blue-primary" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("all")}
            className="relative"
          >
            All
            {itemCounts.all > 0 && filterStatus !== "all" && (
              <span className="ml-2 text-xs bg-[hsl(var(--brand-orange))] text-white px-1.5 py-0.5 rounded-full font-semibold">
                {itemCounts.all}
              </span>
            )}
          </Button>
          <Button
            variant={filterStatus === "open" ? "blue-primary" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("open")}
            className="relative"
          >
            Open
            {itemCounts.open > 0 && filterStatus !== "open" && (
              <span className="ml-2 text-xs bg-[hsl(var(--brand-orange))] text-white px-1.5 py-0.5 rounded-full font-semibold">
                {itemCounts.open}
              </span>
            )}
          </Button>
          <Button
            variant={
              filterStatus === "completed" ? "blue-primary" : "outline"
            }
            size="sm"
            onClick={() => setFilterStatus("completed")}
            className="relative"
          >
            Completed
            {itemCounts.completed > 0 && filterStatus !== "completed" && (
              <span className="ml-2 text-xs bg-[hsl(var(--brand-orange))] text-white px-1.5 py-0.5 rounded-full font-semibold">
                {itemCounts.completed}
              </span>
            )}
          </Button>

          {/* Delete All Button */}
          {deletableItems.length > 0 &&
            filterStatus === "completed" &&
            !searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteAll}
                className="bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700"
              >
                Delete All
              </Button>
            )}
        </div>

        {/* Sort Controls - Dropdown on mobile, buttons on desktop */}
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          {/* Desktop: Sort Buttons */}
          <div className="hidden sm:flex gap-2 flex-wrap">
            {/* Date Sort */}
            <div className="flex gap-0 border rounded-lg overflow-hidden">
              <Button
                variant={
                  sortBy === "date" && sortOrder === "desc"
                    ? "blue-primary"
                    : "outline"
                }
                size="sm"
                onClick={() => {
                  setSortBy("date");
                  setSortOrder("desc");
                }}
                className="gap-1.5 rounded-none border-0 border-r"
              >
                <Calendar className="h-3.5 w-3.5" />
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                variant={
                  sortBy === "date" && sortOrder === "asc"
                    ? "blue-primary"
                    : "outline"
                }
                size="sm"
                onClick={() => {
                  setSortBy("date");
                  setSortOrder("asc");
                }}
                className="gap-1.5 rounded-none border-0"
              >
                <Calendar className="h-3.5 w-3.5" />
                <ArrowUp className="h-3 w-3" />
              </Button>
            </div>

            {/* Alphabetical Sort */}
            <div className="flex gap-0 border rounded-lg overflow-hidden">
              <Button
                variant={
                  sortBy === "alphabetical" && sortOrder === "asc"
                    ? "blue-primary"
                    : "outline"
                }
                size="sm"
                onClick={() => {
                  setSortBy("alphabetical");
                  setSortOrder("asc");
                }}
                className="gap-1.5 rounded-none border-0 border-r"
              >
                <SortAsc className="h-3.5 w-3.5" />
                A-Z
              </Button>
              <Button
                variant={
                  sortBy === "alphabetical" && sortOrder === "desc"
                    ? "blue-primary"
                    : "outline"
                }
                size="sm"
                onClick={() => {
                  setSortBy("alphabetical");
                  setSortOrder("desc");
                }}
                className="gap-1.5 rounded-none border-0"
              >
                <SortDesc className="h-3.5 w-3.5" />
                Z-A
              </Button>
            </div>
          </div>
          </div>
          </div>

          {/* Items List */}
          <div className="space-y-2">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium">No items found</p>
            <p className="text-sm mt-1">
              {searchQuery
                ? "Try adjusting your search"
                : filterStatus === "completed"
                ? "No completed items"
                : "Add your first item to get started"}
            </p>
          </div>
        ) : (
          (() => {
            // Group items by category
            const groupedByCategory = filteredItems.reduce((acc: Record<string, any[]>, item: any) => {
              const category = item.category || "Uncategorized";
              if (!acc[category]) {
                acc[category] = [];
              }
              acc[category].push(item);
              return acc;
            }, {});

            // Sort categories alphabetically, with "Uncategorized" at the end
            const sortedCategories = Object.keys(groupedByCategory).sort((a, b) => {
              if (a === "Uncategorized") return 1;
              if (b === "Uncategorized") return -1;
              return a.localeCompare(b);
            });

            return sortedCategories.map((category) => (
              <div key={category} className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 px-2">
                  {category}
                </h3>
                <div className="space-y-2">
                  {groupedByCategory[category]?.map((item) => {
                    // Check if item is shared and what permission the user has
                    // Items inherit permission from their folder
                    const isSharedItem = (item as any).isSharedWithMe || false;
                    const itemPermission = (item as any).sharePermission || (isSharedItem ? "view" : undefined);
                    // If item doesn't have explicit permission, check if it's in a shared folder
                    let finalPermission = itemPermission;
                    if (!finalPermission && selectedFolder) {
                      const folder = selectedFolder as any;
                      if (folder.isSharedWithMe) {
                        finalPermission = folder.sharePermission || "view";
                      }
                    }
                    const canEditItem = !isSharedItem || finalPermission === "edit";
                    
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-all",
                          item.status === "completed" && "opacity-70"
                        )}
                      >
                {/* Checkbox */}
                <button
                  onClick={() => canEditItem && handleToggleItem(item.id)}
                  disabled={!canEditItem}
                  className={cn(
                    "flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors",
                    !canEditItem && "opacity-50 cursor-not-allowed",
                    item.status === "completed"
                      ? "bg-[#036cea] border-[#036cea] text-white"
                      : "border-gray-300 hover:border-[#036cea]"
                  )}
                  title={!canEditItem ? "View only - You cannot edit this item" : undefined}
                >
                  {item.status === "completed" && <Check className="h-4 w-4" />}
                </button>

                {/* Item Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div
                      className={cn(
                        "font-medium text-gray-700",
                        item.status === "completed" && "line-through text-gray-400"
                      )}
                    >
                      {item.name}
                    </div>
                    {item.description && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-medium">
                        {item.description}
                      </span>
                    )}
                    {isSharedItem && finalPermission === "view" && (
                      <span title="View only" className="flex items-center">
                        <Eye className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                      </span>
                    )}
                  </div>
                  {/* Added by and date */}
                  {(item.createdAt || item.user) && (
                    <div className="mt-1 text-xs text-gray-400">
                      <span>
                        Added by: {item.user ? getUserDisplayName(item.user) : "Unknown"}
                        {item.createdAt && ` on ${formatShoppingListDate(item.createdAt)}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions - Single Edit Icon with Dropdown */}
                <div className="flex items-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!canEditItem}
                        className={cn(
                          "h-8 w-8 text-gray-500 hover:text-gray-700",
                          !canEditItem && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={(e: React.MouseEvent) => {
                          if (!canEditItem) {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          if (canEditItem) {
                            handleEditItem(item);
                          }
                        }}
                        disabled={!canEditItem}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Edit2 className="h-4 w-4" />
                        <span>Edit</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          if (canEditItem) {
                            handleDeleteItem(item.id, item.name);
                          }
                        }}
                        disabled={!canEditItem}
                        className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()
        )}
          </div>
        </div>
      </div>

      {/* Add Item Modal */}
      <AlertDialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add Item</AlertDialogTitle>
            <AlertDialogDescription>Add a new item to your shopping list</AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={handleCreateItem}>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="item-name">Item Name *</Label>
                <Input
                  id="item-name"
                  value={newItemName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemName(e.target.value)}
                  placeholder="e.g., Milk, Bread, Eggs"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="item-description">Description (Optional)</Label>
                <Input
                  id="item-description"
                  value={newItemDescription}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemDescription(e.target.value)}
                  placeholder="e.g., 2% milk, whole wheat bread"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="item-category">Category (Optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={getAICategorySuggestion}
                    disabled={isLoadingAISuggestion || !newItemName.trim()}
                    className="text-xs"
                  >
                    {isLoadingAISuggestion ? "Analyzing..." : "Use AI Suggestion"}
                  </Button>
                </div>
                <div className="flex gap-2">
                  {isCategoryInputMode === "select" ? (
                    <Select
                      value={newItemCategory || undefined}
                      onValueChange={(value) => {
                        if (value === "__none__") {
                          setNewItemCategory("");
                        } else {
                          setNewItemCategory(value);
                        }
                      }}
                    >
                      <SelectTrigger id="item-category" className="flex-1">
                        <SelectValue placeholder="Select a category (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {existingCategories.map((category: string) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="item-category"
                      value={newItemCategory}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemCategory(e.target.value)}
                      placeholder="Enter category name"
                      className="flex-1"
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsCategoryInputMode(isCategoryInputMode === "select" ? "manual" : "select");
                      if (isCategoryInputMode === "select") {
                        setNewItemCategory("");
                      }
                    }}
                    className="shrink-0"
                  >
                    {isCategoryInputMode === "select" ? "Manual" : "Select"}
                  </Button>
                </div>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewItemName("");
                  setNewItemDescription("");
                  setNewItemCategory("");
                  setIsCategoryInputMode("select");
                }}
              >
                Cancel
              </AlertDialogCancel>
              <Button
                type="submit"
                variant="orange-primary"
                disabled={!newItemName.trim() || createItemMutation.isPending}
              >
                Add Item
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Item Modal */}
      <AlertDialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Item</AlertDialogTitle>
            <AlertDialogDescription>Update the item details</AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={handleUpdateItem}>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-item-name">Item Name *</Label>
                <Input
                  id="edit-item-name"
                  value={editItemName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditItemName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="edit-item-description">Description (Optional)</Label>
                <Input
                  id="edit-item-description"
                  value={editItemDescription}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditItemDescription(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-item-category">Category (Optional)</Label>
                <div className="flex gap-2">
                  <Select
                    value={editItemCategory || undefined}
                    onValueChange={(value) => {
                      if (value === "__none__") {
                        setEditItemCategory("");
                      } else {
                        setEditItemCategory(value);
                      }
                    }}
                  >
                    <SelectTrigger id="edit-item-category" className="flex-1">
                      <SelectValue placeholder="Select a category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {existingCategories.map((category: string) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={editItemCategory}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditItemCategory(e.target.value)}
                    placeholder="Or enter manually"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingItemId(null);
                  setEditItemName("");
                  setEditItemDescription("");
                  setEditItemCategory("");
                }}
              >
                Cancel
              </AlertDialogCancel>
              <Button
                type="submit"
                variant="orange-primary"
                disabled={!editItemName.trim() || updateItemMutation.isPending}
              >
                Update Item
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteItemMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Modal */}
      {shareResourceId && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          resourceType={shareResourceType as "task" | "task_folder" | "shopping_list_folder" | "note" | "note_folder" | "file" | "file_folder" | "address" | "address_folder"}
          resourceId={shareResourceId}
          resourceName={shareResourceName}
        />
      )}

      {/* Share Details Modal */}
      {shareResourceId && (
        <ShareDetailsModal
          isOpen={isShareDetailsModalOpen}
          onClose={() => setIsShareDetailsModalOpen(false)}
          resourceType={shareResourceType as "task" | "task_folder" | "shopping_list_folder" | "note" | "note_folder" | "file" | "file_folder" | "address" | "address_folder"}
          resourceId={shareResourceId}
          resourceName={shareResourceName}
        />
      )}

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog open={deleteFolderConfirmOpen} onOpenChange={setDeleteFolderConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the folder "{folderToDelete?.name}"? This action cannot be undone and will not delete the items inside.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteFolder}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteFolderMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


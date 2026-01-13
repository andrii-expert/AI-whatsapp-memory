"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Script from "next/script";
import { Home, ChevronLeft, Plus, Search, Edit2, Trash2, Check, ShoppingCart, X, Share2, Users, Calendar, ArrowUp, ArrowDown, SortAsc, SortDesc, Bell, StickyNote, Folder, FolderClosed, ChevronDown, ChevronRight, Menu, MoreVertical, Eye, LogOut, ArrowLeft } from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { Icons } from "@imaginecalendar/ui/icons";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { useUser } from "@clerk/nextjs";
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

// Shopping list icons - shopping-related emojis
const SHOPPING_LIST_ICONS = [
  { emoji: "🎂", name: "Birthday Cake" },
  { emoji: "🛒", name: "Shopping Cart" },
  { emoji: "🍎", name: "Apple" },
  { emoji: "🥛", name: "Milk" },
  { emoji: "🍞", name: "Bread" },
  { emoji: "🥚", name: "Eggs" },
  { emoji: "🥩", name: "Meat" },
  { emoji: "🐟", name: "Fish" },
  { emoji: "🥬", name: "Vegetables" },
  { emoji: "🍌", name: "Banana" },
  { emoji: "🍊", name: "Orange" },
  { emoji: "🍇", name: "Grapes" },
  { emoji: "🥑", name: "Avocado" },
  { emoji: "🧀", name: "Cheese" },
  { emoji: "🍕", name: "Pizza" },
  { emoji: "🍔", name: "Burger" },
  { emoji: "🌮", name: "Taco" },
  { emoji: "🍝", name: "Pasta" },
  { emoji: "🍰", name: "Cake" },
  { emoji: "☕", name: "Coffee" },
  { emoji: "🍵", name: "Tea" },
  { emoji: "🥤", name: "Drink" },
  { emoji: "🍪", name: "Cookie" },
  { emoji: "🍫", name: "Chocolate" },
  { emoji: "🍭", name: "Candy" },
  { emoji: "🧁", name: "Cupcake" },
  { emoji: "🍩", name: "Donut" },
  { emoji: "🌽", name: "Corn" },
  { emoji: "🥕", name: "Carrot" },
  { emoji: "🥔", name: "Potato" },
  { emoji: "🧄", name: "Garlic" },
  { emoji: "🧅", name: "Onion" },
  { emoji: "🍅", name: "Tomato" },
  { emoji: "🥒", name: "Cucumber" },
  { emoji: "🌶️", name: "Pepper" },
  { emoji: "🥜", name: "Nuts" },
  { emoji: "🍯", name: "Honey" },
  { emoji: "🥖", name: "Baguette" },
  { emoji: "🧈", name: "Butter" },
  { emoji: "🥨", name: "Pretzel" },
  { emoji: "🍤", name: "Shrimp" },
  { emoji: "🦐", name: "Prawn" },
  { emoji: "🦞", name: "Lobster" },
  { emoji: "🦀", name: "Crab" },
  { emoji: "🍗", name: "Chicken" },
  { emoji: "🍖", name: "Meat Bone" },
  { emoji: "🥓", name: "Bacon" },
  { emoji: "🌭", name: "Hot Dog" },
  { emoji: "🌯", name: "Burrito" },
  { emoji: "🥙", name: "Stuffed Flatbread" },
  { emoji: "🥗", name: "Salad" },
  { emoji: "🍲", name: "Pot of Food" },
  { emoji: "🍱", name: "Bento Box" },
  { emoji: "🍘", name: "Rice Cracker" },
  { emoji: "🍙", name: "Rice Ball" },
  { emoji: "🍚", name: "Cooked Rice" },
  { emoji: "🍛", name: "Curry Rice" },
  { emoji: "🍜", name: "Steaming Bowl" },
  { emoji: "🍠", name: "Roasted Sweet Potato" },
  { emoji: "🍢", name: "Oden" },
  { emoji: "🍣", name: "Sushi" },
  { emoji: "🍤", name: "Fried Shrimp" },
  { emoji: "🍥", name: "Fish Cake" },
  { emoji: "🥮", name: "Moon Cake" },
  { emoji: "🍡", name: "Dango" },
  { emoji: "🥟", name: "Dumpling" },
  { emoji: "🥠", name: "Fortune Cookie" },
  { emoji: "🥡", name: "Takeout Box" },
];

// Icon colors
const ICON_COLORS = [
  { name: "pink", value: "#FCE7F3", label: "Pink" },
  { name: "purple", value: "#F3E8FF", label: "Purple" },
  { name: "blue", value: "#DBEAFE", label: "Blue" },
  { name: "cyan", value: "#CFFAFE", label: "Cyan" },
  { name: "green", value: "#D1FAE5", label: "Green" },
  { name: "yellow", value: "#FEF3C7", label: "Yellow" },
  { name: "orange", value: "#FED7AA", label: "Orange" },
  { name: "red", value: "#FEE2E2", label: "Red" },
  { name: "indigo", value: "#E0E7FF", label: "Indigo" },
  { name: "teal", value: "#CCFBF1", label: "Teal" },
];

export default function ShoppingListPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const userId = user?.id;

  // State - default to folder list when landing on the page
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewAllItems, setViewAllItems] = useState<boolean>(false);
  const [viewAllShared, setViewAllShared] = useState(false); // View all shared items
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "completed">("all");
  const [sortBy, setSortBy] = useState<"date" | "alphabetical" | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | undefined>(undefined);
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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCreateListModalOpen, setIsCreateListModalOpen] = useState(false);
  const [isEditListModalOpen, setIsEditListModalOpen] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState("🎂");
  const [selectedColor, setSelectedColor] = useState("pink");
  const [iconSearchQuery, setIconSearchQuery] = useState("");
  const [shareWithInput, setShareWithInput] = useState("");
  const [sharePermission, setSharePermission] = useState<"view" | "edit">("edit");
  
  // Refs for draggable scroll
  const iconScrollRef = useRef<HTMLDivElement>(null);
  const colorScrollRef = useRef<HTMLDivElement>(null);
  const lastExpandedFolderRef = useRef<string | null>(null);
  const foldersRef = useRef<any[]>([]);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const mobileAdContainerRef = useRef<HTMLDivElement>(null);

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
  const [expandedSharedUserId, setExpandedSharedUserId] = useState<string | null>(null);

  // Fetch folders and items
  const { data: allFolders = [], isLoading: isLoadingFolders } = useQuery(
    trpc.shoppingList.folders.list.queryOptions()
  );
  const { data: allItems = [], isLoading: isLoadingItems } = useQuery(
    trpc.shoppingList.list.queryOptions({})
  );
  
  const { data: myShares = [], isLoading: isLoadingShares } = useQuery(
    trpc.taskSharing.getMyShares.queryOptions()
  );
  const { data: sharedResources, isLoading: isLoadingSharedResources } = useQuery(
    trpc.taskSharing.getSharedWithMe.queryOptions()
  );

  // Get raw shares where current user is recipient for exit functionality
  const { data: myRecipientShares = [] } = useQuery(
    trpc.taskSharing.getMySharesAsRecipient.queryOptions()
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
    let topLevelFolders = folders.filter((folder: any) => !folder.parentId);
    
    // Filter by search query if provided
    if (searchQuery.trim() && !selectedFolderId && !viewAllItems && !viewAllShared) {
      const query = searchQuery.toLowerCase();
      topLevelFolders = topLevelFolders.filter((folder: any) =>
        folder.name.toLowerCase().includes(query)
      );
    }
    
    return [...topLevelFolders].sort((a, b) => {
      const aIsGeneral = a.name.toLowerCase() === "general";
      const bIsGeneral = b.name.toLowerCase() === "general";
      
      if (aIsGeneral && !bIsGeneral) return -1;
      if (!aIsGeneral && bIsGeneral) return 1;
      
      return 0;
    });
  }, [folders, searchQuery, selectedFolderId, viewAllItems, viewAllShared]);

  // Calculate folder stats (open/total items)
  const getFolderStats = useMemo(() => {
    return (folderId: string, isSharedFolder: boolean = false) => {
      let folderItems: any[] = [];

      if (isSharedFolder) {
        // For shared folders, get items from sharedResources
        const sharedFolder = sharedFolders.find((folder: any) => folder.id === folderId);
        folderItems = sharedFolder?.items || [];
      } else {
        // For owned folders, get items from allItems
        folderItems = allItems.filter((item: any) =>
          item.folderId === folderId && item.status !== "archived"
        );
      }

      const totalItems = folderItems.length;
      const openItems = folderItems.filter((item: any) =>
        item.status === "open" || !item.status // Default to open if no status
      ).length;
      return { openItems, totalItems };
    };
  }, [allItems, sharedFolders]);

  // Update folders ref when allOwnedFolders changes
  useEffect(() => {
    foldersRef.current = allOwnedFolders;
  }, [allOwnedFolders]);

  // Handle folderId from URL parameters (takes precedence over sessionStorage)
  useEffect(() => {
    if (allOwnedFolders.length === 0 && sharedFolders.length === 0) return;
    
    const folderIdFromUrl = searchParams.get("folderId");
    if (folderIdFromUrl) {
      // URL parameter takes precedence
      const folderExists = allOwnedFolders.some((f: any) => f.id === folderIdFromUrl) ||
                          sharedFolders.some((f: any) => f.id === folderIdFromUrl);
      if (folderExists) {
        setSelectedFolderId(folderIdFromUrl);
        setViewAllItems(false);
      }
    }
  }, [searchParams, allOwnedFolders, sharedFolders]);

  // Initialize Google Ads after script loads
  const initializeGoogleAds = () => {
    if (typeof window !== "undefined" && (window as any).adsbygoogle) {
      try {
        // Initialize desktop ad
        if (adContainerRef.current) {
          const adElement = adContainerRef.current.querySelector('.adsbygoogle') as HTMLElement;
          if (adElement && !adElement.dataset.adsbygoogleStatus) {
            ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
          }
        }
        // Initialize mobile ad
        if (mobileAdContainerRef.current) {
          const mobileAdElement = mobileAdContainerRef.current.querySelector('.adsbygoogle') as HTMLElement;
          if (mobileAdElement && !mobileAdElement.dataset.adsbygoogleStatus) {
            ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
          }
        }
      } catch (e) {
        console.error("Error initializing Google Ads:", e);
      }
    }
  };

  // Fallback: Try to initialize ads if script already loaded
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && (window as any).adsbygoogle) {
        initializeGoogleAds();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Get selected folder
  const selectedFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    return allOwnedFolders.find((f) => f.id === selectedFolderId) || 
           sharedFolders.find((f: any) => f.id === selectedFolderId) || 
           null;
  }, [selectedFolderId, allOwnedFolders, sharedFolders]);
  
  // Get shared users for selected folder (both owned and shared folders)
  const { data: ownedFolderShares = [] } = useQuery({
    ...trpc.taskSharing.getResourceShares.queryOptions({
      resourceType: "shopping_list_folder",
      resourceId: selectedFolderId || "",
    }),
    enabled: !!selectedFolderId && !!selectedFolder && !selectedFolder.isSharedWithMe,
  });

  // For shared folders, get all shares for that folder from myShares
  const sharedFolderShares = useMemo(() => {
    if (!selectedFolderId || !selectedFolder?.isSharedWithMe) return [];

    return myShares.filter((share: any) =>
      share.resourceType === "shopping_list_folder" && share.resourceId === selectedFolderId
    ).map((share: any) => ({
      ...share,
      sharedWithUser: share.sharedWithUser,
    }));
  }, [selectedFolderId, selectedFolder, myShares]);

  // Combine owned folder shares and shared folder shares
  const folderShares = useMemo(() => {
    if (!selectedFolderId || !selectedFolder) return [];

    if (selectedFolder.isSharedWithMe) {
      // For shared folders, show all shares including the owner
      const allShares = [...sharedFolderShares];

      // Add the owner as a "share" entry if not already included
      const ownerAlreadyIncluded = allShares.some(share =>
        share.sharedWithUser?.id === selectedFolder.ownerId
      );

      if (!ownerAlreadyIncluded && selectedFolder.ownerId) {
        // Find owner info from the shared folder data
        const ownerInfo = selectedFolder.shareInfo?.owner;
        if (ownerInfo) {
          allShares.unshift({
            id: `owner-${selectedFolder.ownerId}`,
            sharedWithUser: ownerInfo,
            permission: 'owner',
            isOwner: true,
          });
        }
      }

      return allShares;
    } else {
      // For owned folders, use the existing logic
      return ownedFolderShares;
    }
  }, [selectedFolderId, selectedFolder, ownedFolderShares, sharedFolderShares]);


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
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey({}) });
        queryClient.invalidateQueries({ queryKey: trpc.taskSharing.getSharedWithMe.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.folders.list.queryKey() });
        setNewItemName("");
        setNewItemDescription("");
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
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey({}) });
        queryClient.invalidateQueries({ queryKey: trpc.taskSharing.getSharedWithMe.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.folders.list.queryKey() });
        setEditingItemId(null);
        setEditItemName("");
        setEditItemDescription("");
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
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey({}) });
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
        await queryClient.cancelQueries({ queryKey: trpc.shoppingList.list.queryKey({}) });

        // Snapshot the previous value
        const previousItems = queryClient.getQueryData(trpc.shoppingList.list.queryKey({}));

        // Optimistically update to the new value
        queryClient.setQueryData(trpc.shoppingList.list.queryKey({}), (old: any) => {
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
          queryClient.setQueryData(trpc.shoppingList.list.queryKey({}), context.previousItems);
        }
        toast({
          title: "Error",
          description: error.message || "Failed to update item",
          variant: "error",
        });
      },
      onSettled: () => {
        // Always refetch after error or success to ensure we have the latest data
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey({}) });
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
        if (newFolder) {
          setSelectedFolderId(newFolder.id);
          setViewAllItems(false);
          
          // If share with input is provided, open share modal after creation
          if (shareWithInput.trim()) {
            // Open share modal with the newly created folder
            setShareResourceType("shopping_list_folder");
            setShareResourceId(newFolder.id);
            setShareResourceName(newFolder.name);
            setIsShareModalOpen(true);
          }
        }
        
        // Reset form
        setNewFolderName("");
        setSelectedIcon("🎂");
        setSelectedColor("pink");
        setIconSearchQuery("");
        setShareWithInput("");
        setSharePermission("edit");
        setIsCreateListModalOpen(false);
        
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
        setSelectedIcon("🎂");
        setSelectedColor("pink");
        setIconSearchQuery("");
        setShareWithInput("");
        setSharePermission("edit");
        setIsEditListModalOpen(false);
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

  const exitSharedFolderMutation = useMutation(
    trpc.taskSharing.deleteShare.mutationOptions({
      onSuccess: () => {
        // Specifically invalidate all related queries to ensure UI updates
        queryClient.invalidateQueries({ queryKey: trpc.taskSharing.getSharedWithMe.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.taskSharing.getMySharesAsRecipient.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.taskSharing.getMyShares.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.folders.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });

        // If the user just exited the currently selected folder, navigate away
        if (selectedFolderId) {
          setSelectedFolderId(null);
          setViewAllItems(true);
        }
        toast({
          title: "Exited folder",
          description: "You have been removed from this shared folder",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to exit shared folder",
          variant: "error",
        });
      },
    })
  );

  // Filter icons based on search query
  const filteredIcons = useMemo(() => {
    if (!iconSearchQuery.trim()) return SHOPPING_LIST_ICONS;
    const query = iconSearchQuery.toLowerCase();
    return SHOPPING_LIST_ICONS.filter(
      (icon) => icon.name.toLowerCase().includes(query) || icon.emoji.includes(query)
    );
  }, [iconSearchQuery]);

  // Draggable scroll handler for icons and colors
  const handleDragScroll = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return;
    
    const isTouch = 'touches' in e;
    
    // For touch events, don't preventDefault on touchStart - only on touchMove
    if (!isTouch) {
      e.preventDefault();
    }
    e.stopPropagation();
    
    const clientX = isTouch ? e.touches[0]?.clientX : (e as React.MouseEvent).clientX;
    if (clientX === undefined) return;
    
    const startX = clientX;
    const scrollLeft = ref.current.scrollLeft;
    let isDown = true;
    let hasMoved = false;

    const onMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDown || !ref.current) return;
      
      const moveIsTouch = 'touches' in moveEvent;
      const moveClientX = moveIsTouch ? (moveEvent as TouchEvent).touches[0]?.clientX : (moveEvent as MouseEvent).clientX;
      if (moveClientX === undefined) return;
      
      // Mark that we've moved
      if (!hasMoved) {
        hasMoved = true;
      }
      
      // Prevent default to stop page scrolling only after we start moving
      if (hasMoved) {
        moveEvent.preventDefault();
      }
      
      const x = moveClientX - startX;
      ref.current.scrollLeft = scrollLeft - x;
    };

    const onMouseUp = () => {
      isDown = false;
      hasMoved = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onMouseMove);
      document.removeEventListener('touchend', onMouseUp);
      document.removeEventListener('touchcancel', onMouseUp);
    };

    if (isTouch) {
      document.addEventListener('touchmove', onMouseMove, { passive: false });
      document.addEventListener('touchend', onMouseUp, { passive: true });
      document.addEventListener('touchcancel', onMouseUp, { passive: true });
    } else {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
  };

  // Folder handlers
  const handleCreateFolder = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate({ 
      name: newFolderName.trim(),
      icon: selectedIcon,
      color: selectedColor,
    });
  };

  const handleOpenCreateListModal = () => {
    setNewFolderName(""); // Pre-fill with "Grocery" as shown in image
    setSelectedIcon("🎂");
    setSelectedColor("pink");
    setIconSearchQuery("");
    setShareWithInput("");
    setSharePermission("edit");
    setIsCreateListModalOpen(true);
  };


  const handleEditFolder = (folderId: string, folderName: string) => {
    // Find the folder to get its icon and color
    const folder = allOwnedFolders.find((f: any) => f.id === folderId) || 
                   sharedFolders.find((f: any) => f.id === folderId);
    
    setEditingFolderId(folderId);
    setEditFolderName(folderName);
    setSelectedIcon(folder?.icon || "🎂");
    setSelectedColor(folder?.color || "pink");
    setIsEditListModalOpen(true);
  };

  const handleSaveFolder = (folderId: string) => {
    if (!editFolderName.trim()) {
      setIsEditListModalOpen(false);
      setEditingFolderId(null);
      return;
    }
    updateFolderMutation.mutate({ 
      id: folderId, 
      name: editFolderName.trim(),
      icon: selectedIcon,
      color: selectedColor,
    });
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

  const handleExitSharedFolder = (folderId: string, folderName: string) => {
    // Find the share for this user and folder from myRecipientShares
    // myRecipientShares contains shares where current user is the recipient
    const userShare = myRecipientShares.find((share: any) =>
      share.resourceType === "shopping_list_folder" &&
      share.resourceId === folderId
    );

    if (userShare) {
      // Use the taskSharing mutation to remove the share
      exitSharedFolderMutation.mutate({
        shareId: userShare.id
      });
    } else {
      toast({
        title: "Error",
        description: "Unable to find share information for this folder. Please refresh the page and try again.",
        variant: "error",
      });
    }
  };

  // Format date for shopping list items: "24 Dec"
  const formatShoppingListDate = (dateTimeStr: string | Date | null | undefined) => {
    if (!dateTimeStr) return "";
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return "";
    
    const timezone = userPreferences?.timezone || "Africa/Johannesburg";
    
    // Use Intl.DateTimeFormat to format date in user's timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
    });
    
    const parts = formatter.formatToParts(date);
    const month = parts.find(p => p.type === "month")?.value || "";
    const day = parts.find(p => p.type === "day")?.value || "";
    
    return `${day} ${month}`;
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
  };

  const handleViewAllItems = () => {
    setSelectedFolderId(null);
    setViewAllItems(true);
    setViewAllShared(false);
  };

  const handleViewAllShared = () => {
    setSelectedFolderId(null);
    setViewAllItems(false);
    setViewAllShared(true);
  };

  const handleSharedFolderSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
    setViewAllItems(false);
    setViewAllShared(false);
  };

  // Function to go back to lists view (mobile only)
  const handleBackToLists = () => {
    setSelectedFolderId(null);
    setViewAllItems(false);
    setViewAllShared(false);
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
    if (sortBy === "alphabetical" && sortOrder) {
      items = [...items].sort((a, b) => {
        const comparison = a.name.localeCompare(b.name);
        return sortOrder === "asc" ? comparison : -comparison;
      });
    } else if (sortBy === "date" && sortOrder) {
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


  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    createItemMutation.mutate({
      folderId: selectedFolderId || undefined,
      name: newItemName.trim(),
      description: newItemDescription.trim() || undefined,
    });
  };

  const handleUpdateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItemName.trim() || !editingItemId) return;

    updateItemMutation.mutate({
      id: editingItemId,
      name: editItemName.trim(),
      description: editItemDescription.trim() || undefined,
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
                {/* Folder stats badge */}
                {(() => {
                  const { openItems, totalItems } = getFolderStats(folder.id, isSharedFolder);
                  if (totalItems > 0) {
                    return (
                      <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-orange-100 text-orange-800 rounded">
                        {openItems}/{totalItems}
                      </span>
                    );
                  }
                  return null;
                })()}
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
              <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
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
                {isSharedFolder && !isOwner ? (
                  // For shared folders that user doesn't own, show Exit option
                  <DropdownMenuItem
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      // Handle exiting the shared folder
                      handleExitSharedFolder(folder.id, folder.name);
                    }}
                    className="flex items-center gap-2 cursor-pointer text-orange-600 focus:text-orange-600 focus:bg-orange-50 rounded-md px-2 py-1.5"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Exit</span>
                  </DropdownMenuItem>
                ) : (
                  <>
                    {canEdit && (
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
                    {isOwner && folder.name.toLowerCase() !== "general" && (
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
                    )}
                  </>
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
    <>
      {/* Google Ads Script */}
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7722576468912568"
        crossOrigin="anonymous"
        strategy="lazyOnload"
        onLoad={initializeGoogleAds}
      />
      <div className="min-h-screen bg-white">
        {/* Main Container */}
        <div className="mx-auto max-w-md md:max-w-4xl lg:max-w-7xl">

          {/* Main Content - Three Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_300px] gap-6 w-full">
            {/* Mobile Lists View - Show when no folder is selected */}
            {!selectedFolderId && !viewAllItems && !viewAllShared && (
              <div className="lg:hidden w-full">
                {/* Your Lists Header */}
                <div className="shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)]">
                  <div className="px-4 pt-6 pb-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[20px] font-semibold leading-[130%] text-[#141718]">Your Shopping Lists</h2>
                      <Button
                        onClick={handleOpenCreateListModal}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1.5"
                      >
                        <Plus className="h-4 w-4" />
                        Add New
                      </Button>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="px-4 pb-2">
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
                  </div>
                </div>

                {/* Lists */}
                <div className="px-4 pb-20 pt-2">
                  <div className="space-y-2">
                {/* All Items Card */}
                <div
                  onClick={handleViewAllItems}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer",
                    viewAllItems
                      ? "bg-blue-50 border-blue-200"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FCE7F3" }}>
                    <span className="text-2xl">🎂</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 truncate">All Items</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        {allItems.filter((item: any) => !item.isSharedWithMe && (item.status === "open" || !item.status)).length} out of {allItems.filter((item: any) => !item.isSharedWithMe).length} remaining
                      </span>
                    </div>
                  </div>
                </div>

                {/* Folder Cards */}
                {folders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p>No lists yet.</p>
                    <p className="text-xs mt-1">Create a list to get started.</p>
                  </div>
                ) : (
                  sortedFolders.map((folder) => {
                    const isSelected = selectedFolderId === folder.id && !viewAllItems;
                    const { openItems, totalItems } = getFolderStats(folder.id, false);
                    const remaining = totalItems - openItems;
                    
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
                        <div 
                          className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ 
                            backgroundColor: folder.color 
                              ? ICON_COLORS.find(c => c.name === folder.color)?.value || "#FCE7F3"
                              : "#FCE7F3"
                          }}
                        >
                          <span className="text-2xl">{folder.icon || "🎂"}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            {totalItems > 0 && (
                              <span className={cn(
                                "text-xs px-2 py-0.5 rounded-full font-medium",
                                remaining <= 2 ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"
                              )}>
                                {remaining} out of {totalItems} remaining
                              </span>
                            )}
                            {/* Show avatars for shared folders */}
                            {(() => {
                              const shareCount = getShareCount("shopping_list_folder", folder.id);
                              if (shareCount > 0) {
                                const shares = myShares.filter(
                                  (s: any) => s.resourceType === "shopping_list_folder" && s.resourceId === folder.id
                                );
                                return (
                                  <div className="flex items-center gap-1 ml-auto">
                                    {shares.slice(0, 2).map((share: any, idx: number) => {
                                      const user = share.sharedWithUser;
                                      if (!user) return null;
                                      return (
                                        <div
                                          key={share.id}
                                          className={cn(
                                            "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold",
                                            getAvatarColor(user.id)
                                          )}
                                          style={{ marginLeft: idx > 0 ? '-8px' : '0' }}
                                          title={getSharedUserDisplayName(user)}
                                        >
                                          {getUserInitials(user)}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              return null;
                            })()}
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
                            {folder.name.toLowerCase() !== "general" && (
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
                            )}
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
                    {sharedFolders.map((folder) => {
                      const isSelected = selectedFolderId === folder.id && !viewAllItems;
                      const { openItems, totalItems } = getFolderStats(folder.id, true);
                      const remaining = totalItems - openItems;
                      
                      return (
                        <div
                          key={folder.id}
                          onClick={() => handleSharedFolderSelect(folder.id)}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer group",
                            isSelected
                              ? "bg-blue-50 border-blue-200"
                              : "bg-white border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          <div className="w-12 h-12 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-2xl">🎂</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {totalItems > 0 && (
                                <span className={cn(
                                  "text-xs px-2 py-0.5 rounded-full font-medium",
                                  remaining <= 2 ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"
                                )}>
                                  {remaining} out of {totalItems} remaining
                                </span>
                              )}
                              {/* Show avatars for shared folders */}
                              {(() => {
                                const shares = myShares.filter(
                                  (s: any) => s.resourceType === "shopping_list_folder" && s.resourceId === folder.id
                                );
                                if (shares.length > 0) {
                                  return (
                                    <div className="flex items-center gap-1 ml-auto">
                                      {shares.slice(0, 2).map((share: any, idx: number) => {
                                        const user = share.sharedWithUser;
                                        if (!user) return null;
                                        return (
                                          <div
                                            key={share.id}
                                            className={cn(
                                              "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold",
                                              getAvatarColor(user.id)
                                            )}
                                            style={{ marginLeft: idx > 0 ? '-8px' : '0' }}
                                            title={getSharedUserDisplayName(user)}
                                          >
                                            {getUserInitials(user)}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
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
                                  openShareDetails("shopping_list_folder", folder.id, folder.name);
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
                              <DropdownMenuItem
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  handleExitSharedFolder(folder.id, folder.name);
                                }}
                                className="flex items-center gap-2 cursor-pointer text-orange-600 focus:text-orange-600 focus:bg-orange-50 rounded-md px-2 py-1.5"
                              >
                                <LogOut className="h-4 w-4" />
                                <span>Exit</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </>
                )}
                  </div>
                </div>

                {/* Mobile Google Ad */}
                <div className="px-4 pb-6">
                  <div ref={mobileAdContainerRef} className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[250px] flex items-center justify-center">
                    <div className="text-center text-gray-500 w-full">
                      <div className="text-sm font-medium mb-2">Advertisement</div>
                      {/* Google Ads will be inserted here */}
                      <ins
                        className="adsbygoogle"
                        style={{ 
                          display: 'block',
                          width: '100%',
                          height: '250px'
                        }}
                        data-ad-client="ca-pub-7722576468912568"
                        data-ad-slot="XXXXXXXXXX"
                        data-ad-format="auto"
                        data-full-width-responsive="true"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

        {/* Desktop Left Panel - Lists Sidebar */}
        <div className="hidden lg:block space-y-4">
          <div className="space-y-4">
            {/* Your Lists Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Your Shopping Lists</h2>
              <Button
                onClick={handleOpenCreateListModal}
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

            {/* Lists */}
            <div className="space-y-2">
              {/* All Items Card */}
              <div
                onClick={handleViewAllItems}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer",
                  viewAllItems
                    ? "bg-blue-50 border-blue-200"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                )}
              >
                <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FCE7F3" }}>
                  <span className="text-2xl">🎂</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-900 truncate">All Items</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      {allItems.filter((item: any) => !item.isSharedWithMe && (item.status === "open" || !item.status)).length} out of {allItems.filter((item: any) => !item.isSharedWithMe).length} remaining
                    </span>
                  </div>
                </div>
              </div>

              {/* Folder Cards */}
              {folders.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No lists yet.</p>
                  <p className="text-xs mt-1">Create a list to get started.</p>
                </div>
              ) : (
                sortedFolders.map((folder) => {
                  const isSelected = selectedFolderId === folder.id && !viewAllItems;
                  const { openItems, totalItems } = getFolderStats(folder.id, false);
                  const remaining = totalItems - openItems;
                  
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
                      <div 
                        className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ 
                          backgroundColor: folder.color 
                            ? ICON_COLORS.find(c => c.name === folder.color)?.value || "#FCE7F3"
                            : "#FCE7F3"
                        }}
                      >
                        <span className="text-2xl">{folder.icon || "🎂"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {totalItems > 0 && (
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium",
                              remaining <= 2 ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"
                            )}>
                              {remaining} out of {totalItems} remaining
                            </span>
                          )}
                          {/* Show avatars for shared folders */}
                          {(() => {
                            const shareCount = getShareCount("shopping_list_folder", folder.id);
                            if (shareCount > 0) {
                              const shares = myShares.filter(
                                (s: any) => s.resourceType === "shopping_list_folder" && s.resourceId === folder.id
                              );
                              return (
                                <div className="flex items-center gap-1 ml-auto">
                                  {shares.slice(0, 2).map((share: any, idx: number) => {
                                    const user = share.sharedWithUser;
                                    if (!user) return null;
                                    return (
                                      <div
                                        key={share.id}
                                        className={cn(
                                          "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold",
                                          getAvatarColor(user.id)
                                        )}
                                        style={{ marginLeft: idx > 0 ? '-8px' : '0' }}
                                        title={getSharedUserDisplayName(user)}
                                      >
                                        {getUserInitials(user)}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }
                            return null;
                          })()}
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
                          {folder.name.toLowerCase() !== "general" && (
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
                          )}
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
                  {sharedFolders.map((folder) => {
                    const isSelected = selectedFolderId === folder.id && !viewAllItems;
                    const { openItems, totalItems } = getFolderStats(folder.id, true);
                    const remaining = totalItems - openItems;
                    
                    return (
                      <div
                        key={folder.id}
                        onClick={() => handleSharedFolderSelect(folder.id)}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer group",
                          isSelected
                            ? "bg-blue-50 border-blue-200"
                            : "bg-white border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        <div className="w-12 h-12 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-2xl">🎂</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            {totalItems > 0 && (
                              <span className={cn(
                                "text-xs px-2 py-0.5 rounded-full font-medium",
                                remaining <= 2 ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"
                              )}>
                                {remaining} out of {totalItems} remaining
                              </span>
                            )}
                            {/* Show avatars for shared folders */}
                            {(() => {
                              const shares = myShares.filter(
                                (s: any) => s.resourceType === "shopping_list_folder" && s.resourceId === folder.id
                              );
                              if (shares.length > 0) {
                                return (
                                  <div className="flex items-center gap-1 ml-auto">
                                    {shares.slice(0, 2).map((share: any, idx: number) => {
                                      const user = share.sharedWithUser;
                                      if (!user) return null;
                                      return (
                                        <div
                                          key={share.id}
                                          className={cn(
                                            "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold",
                                            getAvatarColor(user.id)
                                          )}
                                          style={{ marginLeft: idx > 0 ? '-8px' : '0' }}
                                          title={getSharedUserDisplayName(user)}
                                        >
                                          {getUserInitials(user)}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              return null;
                            })()}
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
                            <DropdownMenuItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                openShareDetails("shopping_list_folder", folder.id, folder.name);
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
                            <DropdownMenuItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                handleExitSharedFolder(folder.id, folder.name);
                              }}
                              className="flex items-center gap-2 cursor-pointer text-orange-600 focus:text-orange-600 focus:bg-orange-50 rounded-md px-2 py-1.5"
                            >
                              <LogOut className="h-4 w-4" />
                              <span>Exit</span>
                            </DropdownMenuItem>
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

        {/* Right Panel - Items */}
        <div className={cn(
          "w-full min-w-0",
          (!selectedFolderId && !viewAllItems && !viewAllShared) ? "hidden lg:block" : "block"
        )}>
          <div className="shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)] px-4 pt-4">
            {/* Header with list name and shared info */}
            <div className="pb-2">
              <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Mobile Back Button */}
                {(selectedFolder || viewAllItems || viewAllShared) && (
                  <button
                    onClick={handleBackToLists}
                    className="lg:hidden h-10 w-10 flex-shrink-0 bg-white rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
                  >
                    <ArrowLeft className="h-5 w-5 text-gray-800" />
                  </button>
                )}
                {viewAllItems ? (
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "#FCE7F3" }}
                    >
                      <span className="text-lg">🎂</span>
                    </div>
                    <span className="font-bold text-gray-900 text-lg">All Items</span>
                  </div>
                ) : viewAllShared ? (
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-gray-600" />
                    <span className="font-bold text-gray-900 text-lg">All Shared</span>
                  </div>
                ) : selectedFolder ? (
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ 
                        backgroundColor: selectedFolder.color 
                          ? ICON_COLORS.find(c => c.name === selectedFolder.color)?.value || "#FCE7F3"
                          : "#FCE7F3"
                      }}
                    >
                      <span className="text-lg">{selectedFolder.icon || "🛒"}</span>
                    </div>
                    <span className="font-bold text-gray-900 text-lg">{selectedFolder.name}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400 hidden lg:block" />
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
              </div>
              
              {/* Shared button, avatars, and Add Item button (desktop) */}
              <div className="flex items-center gap-2">
                {selectedFolder && folderShares.length > 0 && (
                  <>
                    <button
                      onClick={() => openShareDetails("shopping_list_folder", selectedFolder.id, selectedFolder.name)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                      title="View who this list is shared with"
                    >
                      <span className="text-sm font-medium text-gray-700">Shared</span>
                      <div className="flex items-center gap-1">
                        {folderShares.slice(0, 2).map((share: any, idx: number) => {
                          const sharedUser = share.sharedWithUser;
                          if (!sharedUser) return null;
                          return (
                            <div
                              key={share.id}
                              className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold",
                                getAvatarColor(sharedUser.id)
                              )}
                              style={{ marginLeft: idx > 0 ? '-8px' : '0' }}
                              title={getSharedUserDisplayName(sharedUser)}
                            >
                              {getUserInitials(sharedUser)}
                            </div>
                          );
                        })}
                      </div>
                    </button>
                  </>
                )}
                {/* Desktop Add Item Button */}
                {(() => {
                  const isSharedFolder = selectedFolder?.isSharedWithMe || false;
                  const folderPermission = selectedFolder?.sharePermission;
                  const canAddToFolder = !isSharedFolder || folderPermission === "edit";
                  const isDisabled = Boolean(viewAllShared || (!selectedFolderId && !viewAllItems) || (selectedFolderId && !canAddToFolder));
                  
                  return (
                    <Button
                      onClick={() => !isDisabled && setIsAddModalOpen(true)}
                      disabled={!!isDisabled}
                      className={cn(
                        "hidden lg:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white",
                        isDisabled && "opacity-50 cursor-not-allowed"
                      )}
                      title={selectedFolderId && !canAddToFolder ? "View only - You cannot add items to this folder" : "Add Item"}
                    >
                      <Plus className="h-4 w-4" />
                      Add Item
                    </Button>
                  );
                })()}
              </div>
            </div>
            </div>

            {/* Search and Sort Bar */}
            <div className="pb-4 lg:px-0 lg:pb-4 mb-4 w-full flex gap-3">
              <div className="relative flex-1">
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchQuery(e.target.value)
                  }
                  className="pr-10 h-10 sm:h-11 bg-white border border-gray-200 rounded-lg"
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
                <SelectTrigger className="w-[150px] h-10 sm:h-11 bg-white border border-gray-200 rounded-lg">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Date (Newest)</SelectItem>
                  <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                  <SelectItem value="alphabetical-asc">A-Z</SelectItem>
                  <SelectItem value="alphabetical-desc">Z-A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-row w-full justify-between items-center gap-2 mb-4 px-4">
            <div className="flex flex-row items-center gap-2">
              <button
                onClick={() => setFilterStatus("all")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                  filterStatus === "all"
                    ? "bg-gray-900 text-white"
                    : "shadow-[0_0_12px_0_rgba(0,0,0,0.04)] hover:bg-gray-50"
                )}
                style={{
                  backgroundColor: filterStatus === "all" ? undefined : "#FAFAFA"
                }}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus("open")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2",
                  filterStatus === "open"
                    ? "bg-gray-900 text-white"
                    : "shadow-[0_0_12px_0_rgba(0,0,0,0.04)] hover:bg-gray-50"
                )}
                style={{
                  backgroundColor: filterStatus === "open" ? undefined : "#FAFAFA"
                }}
              >
                Open
                {itemCounts.open > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                    {itemCounts.open}
                  </span>
                )}
              </button>
              <button
                onClick={() => setFilterStatus("completed")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2",
                  filterStatus === "completed"
                    ? "bg-gray-900 text-white"
                    : "shadow-[0_0_12px_0_rgba(0,0,0,0.04)] hover:bg-gray-50"
                )}
                style={{
                  backgroundColor: filterStatus === "completed" ? undefined : "#FAFAFA"
                }}
              >
                Closed
                {itemCounts.completed > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                    {itemCounts.completed}
                  </span>
                )}
              </button>
            </div>
            {filterStatus === "completed" && deletableItems.length > 0 && (
              <Button
                onClick={handleDeleteAll}
                variant="outline"
                size="sm"
                className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete All
              </Button>
            )}
          </div>

          {/* Items List */}
          <div className="px-4 pb-20 lg:px-0">
            <div className="space-y-3 relative">
              {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ShoppingCart className="h-12 w-12 mx-auto text-gray-400" />
            <p className="text-lg font-medium">No items found</p>
            <p className="text-sm mt-1">
              {searchQuery
                ? "Try adjusting your search"
                : filterStatus === "completed"
                ? "No closed items"
                : "Add your first item to get started"}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-[0_1px_3px_0_rgb(0,0,0,0.1),0_1px_2px_-1px_rgb(0,0,0,0.1)] hover:shadow-[0_4px_6px_-1px_rgb(0,0,0,0.1),0_2px_4px_-2px_rgb(0,0,0,0.1)] transition-shadow duration-200">
            <div>
              {filteredItems.map((item, index) => {
                    // Check if item is shared and what permission the user has
                    // Items inherit permission from their folder
                    const isSharedItem = (item as any).isSharedWithMe || false;
                    const itemPermission = (item as any).sharePermission || (isSharedItem ? "view" : undefined);
                    
                    // Check if current user owns the folder
                    // Folder owners always have full edit permission for all items in their folders,
                    // even if the items were created by shared users
                    const isFolderOwner = selectedFolder && !selectedFolder.isSharedWithMe;
                    
                    // If item doesn't have explicit permission, check if it's in a shared folder
                    let finalPermission = itemPermission;
                    if (!finalPermission && selectedFolder) {
                      const folder = selectedFolder as any;
                      if (folder.isSharedWithMe) {
                        finalPermission = folder.sharePermission || "view";
                      }
                    }
                    
                    // Folder owners can always edit items in their folders, even if created by shared users
                    // Otherwise, check if user has edit permission
                    const canEditItem = isFolderOwner || (!isSharedItem || finalPermission === "edit");
                    
                    // Check if item was created by current user
                    const isCurrentUser = item.user?.id === userId || !item.user;
                    
                    // Get user name for badge - use "You" if current user, otherwise use friend name or display name
                    const itemUserName = isCurrentUser
                      ? "You"
                      : item.user
                      ? (() => {
                          const friend = friendsList.find((f: any) => f.connectedUserId === item.user.id);
                          return friend ? friend.name : getSharedUserDisplayName(item.user);
                        })()
                      : "You";
                    
                    return (
                      <div key={item.id}>
                        <div
                          className="flex items-center gap-2.5 py-2.5 px-3 hover:bg-gray-50 transition-colors"
                        >
                          {/* Checkbox */}
                          <button
                            onClick={() => canEditItem && handleToggleItem(item.id)}
                            disabled={!canEditItem}
                            className={cn(
                              "flex-shrink-0 w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors",
                              !canEditItem && "opacity-50 cursor-not-allowed",
                              item.status === "completed"
                                ? "bg-green-500 border-green-500 text-white"
                                : "border-gray-300 hover:border-gray-400"
                            )}
                            style={{
                              backgroundColor: item.status === "completed" ? undefined : "#FAFAFA"
                            }}
                            title={!canEditItem ? "View only - You cannot edit this item" : undefined}
                          >
                            {item.status === "completed" && <Check className="h-3 w-3" />}
                          </button>

                          <div className="flex justify-between items-center">
                            {/* Item Content */}
                            <div className="flex">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div
                                    className={cn(
                                      "font-semibold text-gray-900 text-[15px] sm:text-[16px]",
                                      item.status === "completed" && "line-through text-gray-400"
                                    )}
                                  >
                                    {item.name}
                                  </div>
                                  {item.description && (
                                    <div className="mt-1 text-[15px] text-gray-500">
                                      {item.description}
                                    </div>
                                  )}
                                </div>
                                {item.createdAt && (
                                  <div className="flex-shrink-0">
                                    <span 
                                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-gray-50 text-xs font-medium text-gray-600 shadow-sm"
                                    >
                                      <span className={cn(isCurrentUser ? "text-gray-700" : "text-pink-600 font-semibold")}>
                                        {itemUserName}
                                      </span>
                                      <span className="text-gray-400">•</span>
                                      <span>{formatShoppingListDate(item.createdAt)}</span>
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Three dots menu */}
                            <div className="flex items-center flex-shrink-0">
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
                                    <MoreVertical className="h-5 w-5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                                  <DropdownMenuItem
                                    onClick={(e: React.MouseEvent) => {
                                      e.stopPropagation();
                                      if (canEditItem) {
                                        handleEditItem(item);
                                      }
                                    }}
                                    disabled={!canEditItem}
                                    className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
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
                                    className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 rounded-md px-2 py-1.5"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                        {/* Divider - 90% width, only show if not last item */}
                        {index < filteredItems.length - 1 && (
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
          
          {/* Floating Action Button - Mobile Only */}
          {(() => {
            const isSharedFolder = selectedFolder?.isSharedWithMe || false;
            const folderPermission = selectedFolder?.sharePermission;
            const canAddToFolder = !isSharedFolder || folderPermission === "edit";
            const isDisabled = Boolean(viewAllShared || (!selectedFolderId && !viewAllItems) || (selectedFolderId && !canAddToFolder));
            
            return (
              <button
                onClick={() => !isDisabled && setIsAddModalOpen(true)}
                disabled={!!isDisabled}
                className={cn(
                  "lg:hidden fixed bottom-20 left-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg flex items-center justify-center transition-all z-50",
                  isDisabled && "opacity-50 cursor-not-allowed"
                )}
                title={selectedFolderId && !canAddToFolder ? "View only - You cannot add items to this folder" : "Add Item"}
              >
                <Plus className="h-6 w-6" />
              </button>
            );
          })()}
        </div>
        {/* Right Panel - Google Ads */}
        <div className="hidden xl:block space-y-4">
          <div className="sticky top-4">
            {/* Google Ads Container */}
            <div ref={adContainerRef} className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[600px] flex items-center justify-center">
              <div className="text-center text-gray-500 w-full">
                <div className="text-sm font-medium mb-2">Advertisement</div>
                {/* Google Ads will be inserted here */}
                <ins
                  className="adsbygoogle"
                  style={{ 
                    display: 'block',
                    width: '300px',
                    height: '600px'
                  }}
                  data-ad-client="ca-pub-7722576468912568"
                  data-ad-slot="XXXXXXXXXX"
                  data-ad-format="rectangle"
                />
              </div>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>

      {/* Add Item Modal */}
      <AlertDialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg max-h-[90vh] overflow-y-hidden overflow-x-hidden p-4 sm:p-6">
          <div className="relative mb-4">
            {/* Centered Title and Subtitle */}
            <div className="text-center">
              <AlertDialogTitle className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                Add Item
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-gray-500">
              Organise your shopping better
              </AlertDialogDescription>
            </div>
          </div>
          <form onSubmit={handleCreateItem} className="overflow-x-hidden">
            <div className="space-y-4 sm:space-y-6">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="item-name" className="text-sm font-medium text-gray-900">Item Name</Label>
                <Input
                  id="item-name"
                  value={newItemName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemName(e.target.value)}
                  placeholder="Milk"
                  className="bg-gray-50 h-10 sm:h-11 w-full"
                  style={{
                    border: 0
                  }}
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="item-description" className="text-sm font-medium text-gray-900">
                  Description <span className="text-gray-500 font-normal">(optional)</span>
                </Label>
                <Input
                  id="item-description"
                  value={newItemDescription}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemDescription(e.target.value)}
                  placeholder="Write details..."
                  className="bg-gray-50 h-10 sm:h-11 w-full"
                  style={{
                    border: 0
                  }}
                />
              </div>
            </div>
            <AlertDialogFooter className="flex-col gap-2 sm:gap-2 pt-2 sm:pt-4 mt-4 sm:mt-6">
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 sm:h-11 text-sm sm:text-base"
                disabled={!newItemName.trim() || createItemMutation.isPending}
              >
                Add Item
              </Button>
              <AlertDialogCancel
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewItemName("");
                  setNewItemDescription("");
                }}
                className="w-full border-gray-300 h-10 sm:h-11 text-sm sm:text-base"
              >
                Cancel
              </AlertDialogCancel>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Item Modal */}
      <AlertDialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg max-h-[90vh] overflow-y-hidden overflow-x-hidden p-4 sm:p-6">
          <div className="relative mb-4">
            {/* Centered Title and Subtitle */}
            <div className="text-center">
              <AlertDialogTitle className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                Edit Item
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-gray-500">
                Update the item details
              </AlertDialogDescription>
            </div>
          </div>
          <form onSubmit={handleUpdateItem} className="overflow-x-hidden">
            <div className="space-y-4 sm:space-y-6">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="edit-item-name" className="text-sm font-medium text-gray-900">Item Name</Label>
                <Input
                  id="edit-item-name"
                  value={editItemName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditItemName(e.target.value)}
                  className="bg-gray-50 h-10 sm:h-11 w-full"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="edit-item-description" className="text-sm font-medium text-gray-900">
                  Description <span className="text-gray-500 font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-item-description"
                  value={editItemDescription}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditItemDescription(e.target.value)}
                  placeholder="Write details..."
                  className="bg-gray-50 h-10 sm:h-11 w-full"
                />
              </div>
            </div>
            <AlertDialogFooter className="flex-col gap-2 sm:gap-2 pt-2 sm:pt-4 mt-4 sm:mt-6">
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 sm:h-11 text-sm sm:text-base"
                disabled={!editItemName.trim() || updateItemMutation.isPending}
              >
                Update Item
              </Button>
              <AlertDialogCancel
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingItemId(null);
                  setEditItemName("");
                  setEditItemDescription("");
                }}
                className="w-full border-gray-300 h-10 sm:h-11 text-sm sm:text-base"
              >
                Cancel
              </AlertDialogCancel>
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
              Are you sure you want to delete "{itemToDelete?.name || 'this item'}"? This action cannot be undone.
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
      {shareResourceId && shareResourceName && (
        <ShareDetailsModal
          isOpen={isShareModalOpen || isShareDetailsModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setIsShareDetailsModalOpen(false);
          }}
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

      {/* Create New List Modal */}
      <AlertDialog open={isCreateListModalOpen} onOpenChange={setIsCreateListModalOpen}>
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <div className="relative">
            
            {/* Centered Title and Subtitle */}
            <div className="text-center">
              <AlertDialogTitle className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                Create New List
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-gray-500">
              Organise your shopping better
              </AlertDialogDescription>
            </div>
          </div>
          
          <form onSubmit={handleCreateFolder} className="space-y-4 sm:space-y-6 overflow-x-hidden">
            {/* List Name */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="list-name" className="text-sm font-medium text-gray-900">
                List Name
              </Label>
              <Input
                id="list-name"
                value={newFolderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewFolderName(e.target.value)
                }
                className="bg-gray-50 h-10 sm:h-11 w-full"
                style={{
                  border: 0
                }}
              />
            </div>

            {/* Share with */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="share-with" className="text-sm font-medium text-gray-900">
                Share with
              </Label>
              <div className="flex items-center w-full rounded-lg bg-gray-50 overflow-hidden">
                <Input
                  id="share-with"
                  value={shareWithInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setShareWithInput(e.target.value)
                  }
                  placeholder="Name or email..."
                  className="flex-1 border-0 rounded-l-lg rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0 h-10 sm:h-11 bg-transparent text-gray-700 placeholder:text-gray-500"
                />
                <Select value={sharePermission} onValueChange={(value: "view" | "edit") => setSharePermission(value)}>
                  <SelectTrigger className="w-[100px] border border-gray-200 m-1 rounded-lg focus:ring-0 focus:ring-offset-0 h-8 sm:h-10 bg-white shadow-none text-gray-700 hover:bg-gray-50" customIcon={Icons.DropdownArrow}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">Can view</SelectItem>
                    <SelectItem value="edit">Can edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Select Icon */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-sm font-medium text-gray-900">Select Icon</Label>
              <Input
                placeholder="Search Icon..."
                value={iconSearchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setIconSearchQuery(e.target.value)
                }
                className="bg-gray-50 mb-2 sm:mb-3 h-10 sm:h-11 w-full"
                style={{
                  border: 0
                }}
              />
              <div className="w-full overflow-hidden" style={{ overflowX: 'hidden' }}>
                <div 
                  ref={iconScrollRef}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDragScroll(e, iconScrollRef as React.RefObject<HTMLDivElement | null>);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    handleDragScroll(e, iconScrollRef as React.RefObject<HTMLDivElement | null>);
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                  }}
                  className="flex gap-2 sm:gap-2 overflow-x-auto p-2 cursor-grab active:cursor-grabbing [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    width: '100%',
                    maxWidth: '100%',
                    touchAction: 'pan-x',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                  }}
                >
                  {filteredIcons.map((icon) => (
                    <button
                      key={icon.emoji}
                      type="button"
                      onClick={() => setSelectedIcon(icon.emoji)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        "w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all select-none",
                        selectedIcon === icon.emoji
                          ? "ring-2 ring-gray-900 ring-offset-1 sm:ring-offset-2"
                          : "hover:ring-2 hover:ring-gray-300"
                      )}
                      style={{
                        backgroundColor: ICON_COLORS.find(c => c.name === selectedColor)?.value || "#FCE7F3"
                      }}
                    >
                      <span className="text-xl sm:text-2xl pointer-events-none">{icon.emoji}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Icon Color */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-sm font-medium text-gray-900">Icon Color</Label>
              <div className="w-full overflow-hidden" style={{ overflowX: 'hidden' }}>
                <div 
                  ref={colorScrollRef}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDragScroll(e, colorScrollRef as React.RefObject<HTMLDivElement | null>);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    handleDragScroll(e, colorScrollRef as React.RefObject<HTMLDivElement | null>);
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                  }}
                  className="flex gap-2 sm:gap-3 overflow-x-auto p-2 cursor-grab active:cursor-grabbing [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    width: '100%',
                    maxWidth: '100%',
                    touchAction: 'pan-x',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                  }}
                >
                  {ICON_COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setSelectedColor(color.name)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0 transition-all select-none",
                        selectedColor === color.name
                          ? "ring-2 ring-gray-900 ring-offset-1 sm:ring-offset-2"
                          : "hover:ring-2 hover:ring-gray-300"
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            <AlertDialogFooter className="flex-col gap-2 sm:gap-2 pt-2 sm:pt-4">
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 sm:h-11 text-sm sm:text-base"
                disabled={!newFolderName.trim() || createFolderMutation.isPending}
              >
                Create New List
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-gray-300 h-10 sm:h-11 text-sm sm:text-base"
                onClick={() => {
                  setIsCreateListModalOpen(false);
                  setNewFolderName("");
                  setSelectedIcon("🎂");
                  setSelectedColor("pink");
                  setIconSearchQuery("");
                  setShareWithInput("");
                  setSharePermission("edit");
                }}
              >
                Cancel
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit List Modal */}
      <AlertDialog open={isEditListModalOpen} onOpenChange={setIsEditListModalOpen}>
        <AlertDialogContent className="!w-[90vw] !max-w-[90vw] sm:!w-full sm:!max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <div className="relative">
            {/* Centered Title and Subtitle */}
            <div className="text-center">
              <AlertDialogTitle className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                Edit List
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-gray-500">
                Update your shopping list
              </AlertDialogDescription>
            </div>
          </div>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            if (editingFolderId) {
              handleSaveFolder(editingFolderId);
            }
          }} className="space-y-4 sm:space-y-6 overflow-x-hidden">
            {/* List Name */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="edit-list-name" className="text-sm font-medium text-gray-900">
                List Name
              </Label>
              <Input
                id="edit-list-name"
                value={editFolderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditFolderName(e.target.value)
                }
                placeholder="Grocery"
                className="bg-gray-50 h-10 sm:h-11 w-full"
                style={{
                  border: 0
                }}
                autoFocus
              />
            </div>

            {/* Select Icon */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-sm font-medium text-gray-900">Select Icon</Label>
              <Input
                placeholder="Search Icon..."
                value={iconSearchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setIconSearchQuery(e.target.value)
                }
                className="bg-gray-50 mb-2 sm:mb-3 h-10 sm:h-11 w-full"
                style={{
                  border: 0
                }}
              />
              <div className="w-full overflow-hidden" style={{ overflowX: 'hidden' }}>
                <div 
                  ref={iconScrollRef}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDragScroll(e, iconScrollRef as React.RefObject<HTMLDivElement | null>);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    handleDragScroll(e, iconScrollRef as React.RefObject<HTMLDivElement | null>);
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                  }}
                  className="flex gap-2 sm:gap-2 overflow-x-auto p-2 cursor-grab active:cursor-grabbing [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    width: '100%',
                    maxWidth: '100%',
                    touchAction: 'pan-x',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                  }}
                >
                  {filteredIcons.map((icon) => (
                    <button
                      key={icon.emoji}
                      type="button"
                      onClick={() => setSelectedIcon(icon.emoji)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        "w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all select-none",
                        selectedIcon === icon.emoji
                          ? "ring-2 ring-gray-900 ring-offset-1 sm:ring-offset-2"
                          : "hover:ring-2 hover:ring-gray-300"
                      )}
                      style={{
                        backgroundColor: ICON_COLORS.find(c => c.name === selectedColor)?.value || "#FCE7F3"
                      }}
                    >
                      <span className="text-xl sm:text-2xl pointer-events-none">{icon.emoji}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Icon Color */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-sm font-medium text-gray-900">Icon Color</Label>
              <div className="w-full overflow-hidden" style={{ overflowX: 'hidden' }}>
                <div 
                  ref={colorScrollRef}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDragScroll(e, colorScrollRef as React.RefObject<HTMLDivElement | null>);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    handleDragScroll(e, colorScrollRef as React.RefObject<HTMLDivElement | null>);
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                  }}
                  className="flex gap-2 sm:gap-3 overflow-x-auto p-2 cursor-grab active:cursor-grabbing [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    width: '100%',
                    maxWidth: '100%',
                    touchAction: 'pan-x',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                  }}
                >
                  {ICON_COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setSelectedColor(color.name)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={cn(
                        "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0 transition-all select-none",
                        selectedColor === color.name
                          ? "ring-2 ring-gray-900 ring-offset-1 sm:ring-offset-2"
                          : "hover:ring-2 hover:ring-gray-300"
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            <AlertDialogFooter className="flex-col gap-2 sm:gap-2 pt-2 sm:pt-4">
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 sm:h-11 text-sm sm:text-base"
                disabled={!editFolderName.trim() || updateFolderMutation.isPending}
              >
                Update List
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-gray-300 h-10 sm:h-11 text-sm sm:text-base"
                onClick={() => {
                  setIsEditListModalOpen(false);
                  setEditingFolderId(null);
                  setEditFolderName("");
                  setSelectedIcon("🎂");
                  setSelectedColor("pink");
                  setIconSearchQuery("");
                  setShareWithInput("");
                  setSharePermission("edit");
                }}
              >
                Cancel
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Home, ChevronLeft, Plus, Search, Edit2, Trash2, Check, ShoppingCart, X, Share2, Users, Calendar, ArrowUp, ArrowDown, SortAsc, SortDesc } from "lucide-react";
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

export default function ShoppingListPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // State
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "completed">("open");
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

  // Share states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShareDetailsModalOpen, setIsShareDetailsModalOpen] = useState(false);
  const [shareResourceType, setShareResourceType] = useState<"task" | "task_folder">("task");
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [shareResourceName, setShareResourceName] = useState("");

  // Fetch shopping list items
  const { data: allItems = [], isLoading } = useQuery(
    trpc.shoppingList.list.queryOptions({})
  );

  // Fetch shares
  const { data: myShares = [] } = useQuery(
    trpc.taskSharing.getMyShares.queryOptions()
  );

  // Mutations
  const createItemMutation = useMutation(
    trpc.shoppingList.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });
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
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });
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
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });
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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.shoppingList.list.queryKey() });
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

  // Filter and search items
  const filteredItems = useMemo(() => {
    let items = allItems;

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
  }, [allItems, filterStatus, searchQuery, searchScope, sortBy, sortOrder]);

  // Calculate item counts for status badges (before search filtering)
  const itemCounts = useMemo(() => {
    const openCount = allItems.filter((item) => item.status === "open").length;
    const completedCount = allItems.filter((item) => item.status === "completed").length;
    const allCount = allItems.length;

    return { open: openCount, completed: completedCount, all: allCount };
  }, [allItems]);

  // Calculate deletable items (only completed items that user owns)
  const deletableItems = useMemo(() => {
    return filteredItems.filter((item) => item.status === "completed");
  }, [filteredItems]);

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    createItemMutation.mutate({
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

  // Share functions
  const openShareModal = (id: string, name: string) => {
    setShareResourceType("task");
    setShareResourceId(id);
    setShareResourceName(name);
    setIsShareModalOpen(true);
  };

  const openShareDetails = (id: string, name: string) => {
    setShareResourceType("task");
    setShareResourceId(id);
    setShareResourceName(name);
    setIsShareDetailsModalOpen(true);
  };

  // Get share count for an item
  const getShareCount = (itemId: string): number => {
    return myShares.filter(
      (share: any) => share.resourceType === "task" && share.resourceId === itemId
    ).length;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl">
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
          <span className="font-medium">Shopping List</span>
        </div>

        <Button
          onClick={() => setIsAddModalOpen(true)}
          variant="orange-primary"
          className="flex-shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-8 w-8 text-green-600" />
          <h1 className="text-3xl font-bold text-gray-900">Shopping List</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
            {itemCounts.open} open
          </span>
          {itemCounts.completed > 0 && (
            <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-semibold">
              {itemCounts.completed} completed
            </span>
          )}
        </div>
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
          filteredItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 p-4 bg-white border rounded-lg hover:shadow-md transition-all",
                item.status === "completed" && "opacity-60"
              )}
            >
              {/* Checkbox */}
              <button
                onClick={() => handleToggleItem(item.id)}
                className={cn(
                  "flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors",
                  item.status === "completed"
                    ? "bg-green-500 border-green-500 text-white"
                    : "border-gray-300 hover:border-green-500"
                )}
              >
                {item.status === "completed" && <Check className="h-4 w-4" />}
              </button>

              {/* Item Content */}
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "font-medium text-gray-900",
                    item.status === "completed" && "line-through text-gray-500"
                  )}
                >
                  {item.name}
                </div>
                {item.description && (
                  <div className="text-sm text-gray-500 mt-1">{item.description}</div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <ShareButton
                  onClick={() => {
                    const shareCount = getShareCount(item.id);
                    if (shareCount > 0) {
                      openShareDetails(item.id, item.name);
                    } else {
                      openShareModal(item.id, item.name);
                    }
                  }}
                  isShared={getShareCount(item.id) > 0}
                  shareCount={getShareCount(item.id)}
                  size="md"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEditItem(item)}
                  className="h-8 w-8"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteItem(item.id, item.name)}
                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
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
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewItemName("");
                  setNewItemDescription("");
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
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingItemId(null);
                  setEditItemName("");
                  setEditItemDescription("");
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
          resourceType={shareResourceType}
          resourceId={shareResourceId}
          resourceName={shareResourceName}
        />
      )}

      {/* Share Details Modal */}
      {shareResourceId && (
        <ShareDetailsModal
          isOpen={isShareDetailsModalOpen}
          onClose={() => setIsShareDetailsModalOpen(false)}
          resourceType={shareResourceType}
          resourceId={shareResourceId}
          resourceName={shareResourceName}
        />
      )}
    </div>
  );
}


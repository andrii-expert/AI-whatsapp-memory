"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Home, ChevronLeft, Plus, Search, Edit2, Trash2, Check, ShoppingCart, X, Share2, Users } from "lucide-react";
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
  const [searchQuery, setSearchQuery] = useState("");
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
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query))
      );
    }

    // Sort: completed items at bottom, then by creation date (newest first)
    return items.sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [allItems, filterStatus, searchQuery]);

  const openItems = useMemo(() => allItems.filter((item) => item.status === "open"), [allItems]);
  const completedItems = useMemo(() => allItems.filter((item) => item.status === "completed"), [allItems]);

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
            {openItems.length} open
          </span>
          {completedItems.length > 0 && (
            <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-semibold">
              {completedItems.length} completed
            </span>
          )}
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
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


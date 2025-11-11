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
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Share2,
  SortAsc,
  SortDesc,
  Calendar,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Textarea } from "@imaginecalendar/ui/textarea";
import { Card, CardContent } from "@imaginecalendar/ui/card";
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
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { usePlanLimits } from "@/hooks/use-plan-limits";

export default function NotesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { limits, isLoading: isLoadingLimits } = usePlanLimits();
  const hasNotesAccess = limits.hasNotes;

  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewAllNotes, setViewAllNotes] = useState(true); // Default to All Notes view
  const [sortBy, setSortBy] = useState<"date" | "alphabetical">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc"); // Newest first by default
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "title" | "content">("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [newSubfolderName, setNewSubfolderName] = useState("");
  const [addingSubfolderToId, setAddingSubfolderToId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Note modal states
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteModalMode, setNoteModalMode] = useState<"add" | "edit">("add");
  const [noteModalTitle, setNoteModalTitle] = useState("");
  const [noteModalContent, setNoteModalContent] = useState("");
  const [noteModalId, setNoteModalId] = useState<string | null>(null);

  // View note modal state
  const [isViewNoteModalOpen, setIsViewNoteModalOpen] = useState(false);
  const [viewNoteData, setViewNoteData] = useState<{ id: string; title: string; content: string | null; folderId: string | null; createdAt: Date } | null>(null);

  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: "folder" | "note"; id: string; name: string } | null>(null);

  // Fetch folders and notes - only if user has notes access
  const { data: folders = [] } = useQuery({
    ...trpc.notes.folders.list.queryOptions(),
    enabled: hasNotesAccess,
  });
  const { data: allNotes = [] } = useQuery({
    ...trpc.notes.list.queryOptions({}),
    enabled: hasNotesAccess,
  });

  // Helper function to flatten all folders including subfolders
  const flattenFolders = (folderList: any[]): any[] => {
    const result: any[] = [];
    const flatten = (folder: any) => {
      result.push(folder);
      if (folder.subfolders && folder.subfolders.length > 0) {
        folder.subfolders.forEach(flatten);
      }
    };
    folderList.forEach(flatten);
    return result;
  };

  const allFolders = useMemo(() => flattenFolders(folders), [folders]);

  // Get selected folder
  const selectedFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    return allFolders.find((f) => f.id === selectedFolderId) || null;
  }, [selectedFolderId, allFolders]);

  // Get folder path
  const getFolderPath = (folderId: string): string[] => {
    const path: string[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = allFolders.find((f) => f.id === currentId);
      if (folder) {
        path.unshift(folder.name);
        currentId = folder.parentId;
      } else {
        break;
      }
    }

    return path;
  };

  const folderPath = selectedFolder ? getFolderPath(selectedFolder.id) : [];

  // Get folder path for a note
  const getNoteFolderPath = (folderId: string | null): string => {
    if (!folderId) return "No folder";
    const folder = allFolders.find((f) => f.id === folderId);
    if (!folder) return "Unknown folder";
    return getFolderPath(folderId).join(" / ");
  };

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    let notes = allNotes;

    // Filter by folder
    if (!viewAllNotes && selectedFolderId) {
      notes = notes.filter((n) => n.folderId === selectedFolderId);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      notes = notes.filter((n) => {
        if (searchScope === "title") {
          return n.title.toLowerCase().includes(query);
        } else if (searchScope === "content") {
          return n.content?.toLowerCase().includes(query) || false;
        } else {
          // searchScope === "all"
          return (
            n.title.toLowerCase().includes(query) ||
            n.content?.toLowerCase().includes(query)
          );
        }
      });
    }

    // Sort notes
    if (sortBy === "alphabetical") {
      notes = [...notes].sort((a, b) => {
        const comparison = a.title.localeCompare(b.title);
        return sortOrder === "asc" ? comparison : -comparison;
      });
    } else if (sortBy === "date") {
      notes = [...notes].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        const comparison = dateA - dateB;
        return sortOrder === "asc" ? comparison : -comparison;
      });
    }

    return notes;
  }, [allNotes, selectedFolderId, viewAllNotes, searchQuery, searchScope, sortBy, sortOrder]);

  // Mutations
  const createFolderMutation = useMutation(
    trpc.notes.folders.create.mutationOptions({
      onSuccess: (newFolder) => {
        queryClient.invalidateQueries();
        setNewFolderName("");
        setNewSubfolderName("");
        setAddingSubfolderToId(null);
        if (newFolder) {
          setSelectedFolderId(newFolder.id);
          setViewAllNotes(false);
          if (newFolder.parentId) {
            setExpandedFolders((prev) => {
              const next = new Set(prev);
              next.add(newFolder.parentId as string);
              return next;
            });
          }
        }
        toast({
          title: "Success",
          description: "Folder created successfully",
        });
      },
      onError: (error) => {
        console.error("Folder creation error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to create folder",
          variant: "destructive",
        });
      },
    })
  );

  const updateFolderMutation = useMutation(
    trpc.notes.folders.update.mutationOptions({
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
        console.error("Folder update error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to update folder",
          variant: "destructive",
        });
      },
    })
  );

  const deleteFolderMutation = useMutation(
    trpc.notes.folders.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        if (selectedFolderId) setSelectedFolderId(null);
        toast({
          title: "Success",
          description: "Folder deleted successfully",
        });
      },
      onError: (error) => {
        console.error("Folder deletion error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to delete folder",
          variant: "destructive",
        });
      },
    })
  );

  const createNoteMutation = useMutation(
    trpc.notes.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setIsNoteModalOpen(false);
        setNoteModalTitle("");
        setNoteModalContent("");
        toast({
          title: "Success",
          description: "Note created successfully",
        });
      },
      onError: (error) => {
        console.error("Note creation error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to create note",
          variant: "destructive",
        });
      },
    })
  );

  const updateNoteMutation = useMutation(
    trpc.notes.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setIsNoteModalOpen(false);
        setNoteModalTitle("");
        setNoteModalContent("");
        setNoteModalId(null);
        toast({
          title: "Success",
          description: "Note updated successfully",
        });
      },
      onError: (error) => {
        console.error("Note update error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to update note",
          variant: "destructive",
        });
      },
    })
  );

  const deleteNoteMutation = useMutation(
    trpc.notes.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({
          title: "Success",
          description: "Note deleted successfully",
        });
      },
      onError: (error) => {
        console.error("Note deletion error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to delete note",
          variant: "destructive",
        });
      },
    })
  );

  // Handlers
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate({ name: newFolderName });
  };

  const handleCreateSubfolder = (e: React.FormEvent, parentId: string) => {
    e.preventDefault();
    if (!newSubfolderName.trim()) return;
    createFolderMutation.mutate({
      name: newSubfolderName,
      parentId,
    });
  };

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleFolderSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
    setViewAllNotes(false);
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllNotes = () => {
    setViewAllNotes(true);
    setSelectedFolderId(null);
    setIsMobileSidebarOpen(false);
  };

  const handleEditFolder = (folderId: string, folderName: string) => {
    setEditingFolderId(folderId);
    setEditFolderName(folderName);
  };

  const handleSaveFolder = (folderId: string) => {
    if (!editFolderName.trim()) return;
    updateFolderMutation.mutate({
      id: folderId,
      name: editFolderName,
    });
  };

  const openAddNoteModal = () => {
    setNoteModalMode("add");
    setNoteModalTitle("");
    setNoteModalContent("");
    setNoteModalId(null);
    setIsNoteModalOpen(true);
  };

  const openEditNoteModal = (noteId: string, noteTitle: string, noteContent: string | null) => {
    setNoteModalMode("edit");
    setNoteModalTitle(noteTitle);
    setNoteModalContent(noteContent || "");
    setNoteModalId(noteId);
    setIsNoteModalOpen(true);
  };

  const openViewNoteModal = (note: any) => {
    setViewNoteData({
      id: note.id,
      title: note.title,
      content: note.content,
      folderId: note.folderId,
      createdAt: note.createdAt,
    });
    setIsViewNoteModalOpen(true);
  };

  const editFromViewModal = () => {
    if (viewNoteData) {
      setIsViewNoteModalOpen(false);
      openEditNoteModal(viewNoteData.id, viewNoteData.title, viewNoteData.content);
    }
  };

  const deleteFromViewModal = () => {
    if (viewNoteData) {
      setIsViewNoteModalOpen(false);
      handleDeleteNote(viewNoteData.id, viewNoteData.title);
    }
  };

  const handleNoteModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteModalTitle.trim()) return;

    if (noteModalMode === "add") {
      createNoteMutation.mutate({
        title: noteModalTitle,
        content: noteModalContent,
        folderId: selectedFolderId || undefined,
      });
    } else if (noteModalMode === "edit" && noteModalId) {
      updateNoteMutation.mutate({
        id: noteModalId,
        title: noteModalTitle,
        content: noteModalContent,
      });
    }
  };

  const handleDeleteNote = (noteId: string, noteName: string) => {
    setItemToDelete({ type: "note", id: noteId, name: noteName });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    setItemToDelete({ type: "folder", id: folderId, name: folderName });
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      if (itemToDelete.type === "folder") {
        deleteFolderMutation.mutate({ id: itemToDelete.id });
      } else {
        deleteNoteMutation.mutate({ id: itemToDelete.id });
      }
    }
    setDeleteConfirmOpen(false);
    setItemToDelete(null);
  };

  // Get note count for a folder
  const getNoteCount = (folderId: string) => {
    return allNotes.filter((n) => n.folderId === folderId).length;
  };

  // Recursive folder rendering component
  const renderFolder = (folder: any, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id && !viewAllNotes;
    const hasSubfolders = folder.subfolders && folder.subfolders.length > 0;
    const isAddingSubfolder = addingSubfolderToId === folder.id;
    const isEditingFolder = editingFolderId === folder.id;
    const noteCount = getNoteCount(folder.id);

    return (
      <div key={folder.id}>
        <div
          className={cn(
            "flex items-center justify-between px-4 py-2 rounded-lg transition-colors group",
            isSelected ? "bg-blue-100 text-blue-900" : "hover:bg-gray-100 text-gray-700"
          )}
          style={{ paddingLeft: `${5 + level * 20}px` }}
        >
          {/* Left side: Expand button + Folder name */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {hasSubfolders ? (
              <button
                onClick={() => toggleFolderExpanded(folder.id)}
                className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <div className="w-5 flex-shrink-0" />
            )}

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
                <FolderClosed className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium truncate">{folder.name}</span>
              </button>
            )}
          </div>

          {/* Right side: Action buttons */}
          <div className="flex items-center gap-1 transition-opacity">
            {!isEditingFolder && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 hover:bg-indigo-100 hover:text-indigo-600"
                onClick={() => handleEditFolder(folder.id, folder.name)}
                title="Edit folder name"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {level === 0 && !isEditingFolder && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 hover:bg-blue-100 hover:text-blue-600"
                onClick={() => setAddingSubfolderToId(folder.id)}
                title="Add subfolder"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            {!isEditingFolder && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 hover:bg-red-100 hover:text-red-600"
                onClick={() => handleDeleteFolder(folder.id, folder.name)}
                title="Delete folder"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Subfolder input form */}
        {isAddingSubfolder && (
          <form
            onSubmit={(e) => handleCreateSubfolder(e, folder.id)}
            className="flex gap-2 mt-1 mb-2"
            style={{ paddingLeft: `${36 + level * 20}px` }}
          >
            <Input
              placeholder="Subfolder name"
              value={newSubfolderName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewSubfolderName(e.target.value)
              }
              className="flex-1 h-8 text-sm"
              autoFocus
            />
            <Button type="submit" size="sm" variant="blue-primary" className="h-8" disabled={createFolderMutation.isPending}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                setAddingSubfolderToId(null);
                setNewSubfolderName("");
              }}
            >
              Cancel
            </Button>
          </form>
        )}

        {/* Render subfolders recursively */}
        {isExpanded && hasSubfolders && (
          <div>
            {folder.subfolders.map((subfolder: any) => renderFolder(subfolder, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
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
        <span className="font-medium">Notes</span>
      </div>
        {/* Mobile - Folder Menu Button */}
        <div className="lg:hidden flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 h-auto hover:bg-gray-50 border-2 hover:border-blue-300 transition-all"
          >
            <Menu className="h-4 w-4" />
            <span className="font-medium">Folders</span>
          </Button>
        </div>
      </div>

      {/* Show upgrade prompt if notes feature is locked */}
      {!hasNotesAccess && (
        <UpgradePrompt 
          feature="Notes & Shared Notes" 
          requiredTier="gold" 
          variant="card"
        />
      )}

      {/* Only show notes functionality if user has access */}
      {hasNotesAccess && (
        <>
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden mt-0"
          style={{ margin: 0 }}
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto m-0",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ margin: 0 }}
      >
        <div className="p-4">
          {/* Close Button */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Folders</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
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
            {/* All Notes Button - Always show */}
            <button
              onClick={handleViewAllNotes}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                viewAllNotes
                  ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                  : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
              )}
            >
              <Folder className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">All Notes</span>
              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold">
                {allNotes.length}
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
                {/* Divider */}
                <div className="h-px bg-gray-200 my-2" />

                {/* Individual Folders */}
                {folders.map((folder) => renderFolder(folder, 0))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
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
              {/* All Notes Button - Always show */}
              <button
                onClick={handleViewAllNotes}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                  viewAllNotes
                    ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                    : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                )}
              >
                <Folder className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">All Notes</span>
                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold">
                  {allNotes.length}
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
                  {/* Divider */}
                  <div className="h-px bg-gray-200 my-2" />

                  {/* Individual Folders */}
                  {folders.map((folder) => renderFolder(folder, 0))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Notes */}
        <div className="space-y-4">
          <div>
              {/* Desktop - Folder breadcrumb and Add Note button */}
              <div className="flex items-center justify-between mb-4 gap-4">
                {viewAllNotes ? (
                  <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                    <Folder className="h-6 w-6 flex-shrink-0 text-blue-600" />
                    <span className="font-bold text-gray-900">All Notes</span>
                    <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full font-semibold">
                      {filteredNotes.length}
                    </span>
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

                {/* Add Note Button */}
                <Button
                  onClick={openAddNoteModal}
                  variant="blue-primary"
                  disabled={!selectedFolderId || viewAllNotes}
                  className="flex-shrink-0"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
              </div>

              {/* Search Bar */}
              <div className="mb-4 flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder={
                      searchScope === "all"
                        ? "Search notes..."
                        : searchScope === "title"
                        ? "Search by title..."
                        : "Search by content..."
                    }
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSearchQuery(e.target.value)
                    }
                    className="pr-10 h-11"
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
                <Select
                  value={searchScope}
                  onValueChange={(value: "all" | "title" | "content") =>
                    setSearchScope(value)
                  }
                >
                  <SelectTrigger className="w-full sm:w-[140px] h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fields</SelectItem>
                    <SelectItem value="title">Title Only</SelectItem>
                    <SelectItem value="content">Content Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort Controls */}
              <div className="flex justify-end gap-2 mb-4">
                {/* Date Sort */}
                <div className="flex gap-0 border rounded-lg overflow-hidden">
                  <Button
                    variant={sortBy === "date" && sortOrder === "desc" ? "blue-primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSortBy("date");
                      setSortOrder("desc");
                    }}
                    className="gap-1.5 rounded-none border-0 border-r"
                    title="Newest first"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={sortBy === "date" && sortOrder === "asc" ? "blue-primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSortBy("date");
                      setSortOrder("asc");
                    }}
                    className="gap-1.5 rounded-none border-0"
                    title="Oldest first"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                </div>

                {/* Alphabetical Sort */}
                <div className="flex gap-0 border rounded-lg overflow-hidden">
                  <Button
                    variant={sortBy === "alphabetical" && sortOrder === "asc" ? "blue-primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSortBy("alphabetical");
                      setSortOrder("asc");
                    }}
                    className="gap-1.5 rounded-none border-0 border-r"
                    title="A to Z"
                  >
                    <SortAsc className="h-3.5 w-3.5" />
                    A-Z
                  </Button>
                  <Button
                    variant={sortBy === "alphabetical" && sortOrder === "desc" ? "blue-primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSortBy("alphabetical");
                      setSortOrder("desc");
                    }}
                    className="gap-1.5 rounded-none border-0"
                    title="Z to A"
                  >
                    <SortDesc className="h-3.5 w-3.5" />
                    Z-A
                  </Button>
                </div>
              </div>

              {/* Notes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredNotes.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    No notes found. Click "Add Note" to create your first note!
                  </div>
                ) : (
                  filteredNotes.map((note) => (
                    <Card
                      key={note.id}
                      className="hover:shadow-lg transition-shadow cursor-pointer group relative"
                      onClick={() => openViewNoteModal(note)}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Note Header */}
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-semibold text-base break-all flex-1 line-clamp-1">
                            {note.title}
                          </h3>
                          <div className="flex gap-1 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                e.stopPropagation();
                                openEditNoteModal(note.id, note.title, note.content);
                              }}
                              title="Edit note"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:text-red-600"
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                e.stopPropagation();
                                handleDeleteNote(note.id, note.title);
                              }}
                              title="Delete note"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Note Content Preview */}
                        <p className="text-sm text-gray-600 line-clamp-4 break-all min-h-[5rem]">
                          {note.content || "No content"}
                        </p>

                        {/* Note Footer */}
                        <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t">
                          {viewAllNotes && note.folderId && (
                            <div className="flex items-center gap-1">
                              <FolderClosed className="h-3 w-3" />
                              <span className="truncate">{getNoteFolderPath(note.folderId)}</span>
                            </div>
                          )}
                          <span className="ml-auto">
                            {new Date(note.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
        </div>
      </div>
        </>
      )}

      {/* Add/Edit Note Modal - Only render if user has access */}
      {hasNotesAccess && (
        <>
      <AlertDialog open={isNoteModalOpen} onOpenChange={setIsNoteModalOpen}>
        <AlertDialogContent className="sm:max-w-[600px] h-full overflow-y-auto">
          <AlertDialogHeader className="space-y-3 pb-4 border-b">
            <AlertDialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  noteModalMode === "add" ? "bg-blue-100" : "bg-indigo-100"
                )}
              >
                {noteModalMode === "add" ? (
                  <Plus className="h-5 w-5 text-blue-600" />
                ) : (
                  <Edit2 className="h-5 w-5 text-indigo-600" />
                )}
              </div>
              {noteModalMode === "add" ? "Add New Note" : "Edit Note"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {noteModalMode === "add"
                ? "Create a new note to capture your ideas"
                : "Update your note"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form onSubmit={handleNoteModalSubmit} className="space-y-6 pt-2">
            {/* Folder Info (Add mode only) */}
            {noteModalMode === "add" && selectedFolder && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                    <FolderClosed className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 font-medium uppercase tracking-wide">
                      Adding to folder
                    </div>
                    <div className="font-bold text-gray-900">{selectedFolder.name}</div>
                    {folderPath.length > 1 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {folderPath.join(" / ")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Note Title */}
            <div className="space-y-2">
              <Label
                htmlFor="note-title"
                className="text-sm font-semibold text-gray-700 flex items-center gap-1"
              >
                Note Title
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="note-title"
                placeholder="e.g., Meeting notes, Project ideas..."
                value={noteModalTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNoteModalTitle(e.target.value)
                }
                className="w-full h-11 text-base"
                autoFocus
                required
              />
            </div>

            {/* Note Content */}
            <div className="space-y-2">
              <Label
                htmlFor="note-content"
                className="text-sm font-semibold text-gray-700"
              >
                Content
              </Label>
              <Textarea
                id="note-content"
                placeholder="Write your note here..."
                value={noteModalContent}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setNoteModalContent(e.target.value)
                }
                className="w-full min-h-[200px] text-base resize-y"
              />
              <p className="text-xs text-gray-500">
                Capture your thoughts, ideas, or important information
              </p>
            </div>

            <AlertDialogFooter className="gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNoteModalOpen(false)}
                className="flex-1 sm:flex-none h-11"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="blue-primary"
                disabled={
                  createNoteMutation.isPending ||
                  updateNoteMutation.isPending ||
                  !noteModalTitle.trim()
                }
                className="flex-1 sm:flex-none h-11 min-w-[140px]"
              >
                {createNoteMutation.isPending || updateNoteMutation.isPending ? (
                  <>
                    <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {noteModalMode === "add" ? "Adding..." : "Saving..."}
                  </>
                ) : noteModalMode === "add" ? (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Note
                  </>
                ) : (
                  <>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Note Modal */}
      <AlertDialog open={isViewNoteModalOpen} onOpenChange={setIsViewNoteModalOpen}>
        <AlertDialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
          <AlertDialogHeader className="space-y-3 pb-4 border-b flex-shrink-0">
            <AlertDialogTitle className="text-2xl font-bold break-all pr-8">
              {viewNoteData?.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                {viewNoteData?.folderId && (
                  <div className="flex items-center gap-1.5">
                    <FolderClosed className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">{getNoteFolderPath(viewNoteData.folderId)}</span>
                  </div>
                )}
                <span className="text-gray-500">
                  {viewNoteData?.createdAt && new Date(viewNoteData.createdAt).toLocaleString()}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Note Content - Scrollable */}
          <div className="flex-1 overflow-y-auto py-4">
            {viewNoteData?.content ? (
              <div className="prose prose-sm max-w-none">
                <p className="text-base text-gray-700 whitespace-pre-wrap break-all leading-relaxed">
                  {viewNoteData.content}
                </p>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">No content</p>
              </div>
            )}
          </div>

          <AlertDialogFooter className="gap-2 pt-4 border-t flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsViewNoteModalOpen(false)}
              className="flex-1 sm:flex-none h-11"
            >
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={editFromViewModal}
              className="flex-1 sm:flex-none h-11"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={deleteFromViewModal}
              className="flex-1 sm:flex-none h-11"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Modal */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              Delete {itemToDelete?.type === "folder" ? "Folder" : "Note"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-base pt-2">
              {itemToDelete?.type === "folder" ? (
                <>
                  <p className="text-gray-700">
                    Are you sure you want to delete the folder{" "}
                    <span className="font-bold text-gray-900 break-all">
                      "{itemToDelete.name}"
                    </span>
                    ?
                  </p>
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center">
                          <span className="text-white font-bold text-sm">!</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-red-900 mb-1">
                          Warning: Permanent Action
                        </p>
                        <p className="text-sm text-red-800">
                          This will permanently delete all subfolders and notes
                          within this folder. This action cannot be undone.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-700">
                    Are you sure you want to delete the note{" "}
                    <span className="font-bold text-gray-900 break-all">
                      "{itemToDelete?.name}"
                    </span>
                    ?
                  </p>
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-900 font-medium">
                      ⚠️ This action cannot be undone.
                    </p>
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 pt-4">
            <AlertDialogCancel
              onClick={() => setItemToDelete(null)}
              className="flex-1 sm:flex-none h-11"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 flex-1 sm:flex-none h-11 min-w-[140px]"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete {itemToDelete?.type === "folder" ? "Folder" : "Note"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}
    </div>
  );
}

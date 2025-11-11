"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Home, ChevronLeft, Folder, FolderClosed, Plus, Search, Edit2, Trash2, Check, ChevronDown, ChevronRight, Menu, X, ArrowUpDown, SortAsc, SortDesc, Calendar, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
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

export default function TasksPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewAllTasks, setViewAllTasks] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "completed">("all");
  const [sortBy, setSortBy] = useState<"date" | "alphabetical">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newSubfolderName, setNewSubfolderName] = useState("");
  const [addingSubfolderToId, setAddingSubfolderToId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: "folder" | "task"; id: string; name: string } | null>(null);
  
  // Task modal states
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState<"add" | "edit">("add");
  const [taskModalTitle, setTaskModalTitle] = useState("");
  const [taskModalDueDate, setTaskModalDueDate] = useState("");
  const [taskModalId, setTaskModalId] = useState<string | null>(null);

  // Fetch folders and tasks
  const { data: folders = [] } = useQuery(
    trpc.tasks.folders.list.queryOptions()
  );
  const { data: allTasks = [] } = useQuery(
    trpc.tasks.list.queryOptions({})
  );

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

  // Auto-select first folder when folders first load
  useEffect(() => {
    if (allFolders.length > 0 && selectedFolderId === null && allFolders[0]) {
      setSelectedFolderId(allFolders[0].id);
    }
  }, [allFolders, selectedFolderId]);

  // Auto-expand parent folders when a folder is selected
  useEffect(() => {
    if (selectedFolderId) {
      const selectedFolderData = allFolders.find((f) => f.id === selectedFolderId);
      if (selectedFolderData?.parentId) {
        // Find all parent folders and expand them
        const expandParents = (folderId: string) => {
          const folder = allFolders.find((f) => f.id === folderId);
          if (folder?.parentId) {
            setExpandedFolders((prev) => {
              const next = new Set(prev);
              next.add(folder.parentId);
              return next;
            });
            expandParents(folder.parentId);
          }
        };
        expandParents(selectedFolderId);
      }
    }
  }, [selectedFolderId, allFolders]);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileSidebarOpen) {
        setIsMobileSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMobileSidebarOpen]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobileSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileSidebarOpen]);

  // Get selected folder
  const selectedFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    return allFolders.find((f) => f.id === selectedFolderId) || null;
  }, [selectedFolderId, allFolders]);

  // Get folder path (breadcrumb trail)
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

  // Get folder path for a task
  const getTaskFolderPath = (folderId: string | null): string => {
    if (!folderId) return "No folder";
    const folder = allFolders.find((f) => f.id === folderId);
    if (!folder) return "Unknown folder";
    return getFolderPath(folderId).join(" / ");
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;

    // Filter by folder - if viewing all, show all tasks
    // If a folder is selected, show only tasks in that folder
    if (!viewAllTasks && selectedFolderId) {
      tasks = tasks.filter((t) => t.folderId === selectedFolderId);
    }

    // Filter by status
    if (filterStatus !== "all") {
      tasks = tasks.filter((t) => t.status === filterStatus);
    }

    // Filter by search
    if (searchQuery) {
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort tasks
    if (sortBy === "alphabetical") {
      tasks = [...tasks].sort((a, b) => {
        const comparison = a.title.localeCompare(b.title);
        return sortOrder === "asc" ? comparison : -comparison;
      });
    } else if (sortBy === "date") {
      tasks = [...tasks].sort((a, b) => {
        // Tasks without dates always go to the end
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;  // a goes to end
        if (!b.dueDate) return -1; // b goes to end
        
        // Compare dates normally
        const comparison = a.dueDate.localeCompare(b.dueDate);
        return sortOrder === "asc" ? comparison : -comparison;
      });
    }

    return tasks;
  }, [allTasks, selectedFolderId, filterStatus, searchQuery, sortBy, sortOrder]);

  // Group tasks - only by date when sorting by date, otherwise show all in one group
  const groupedTasks = useMemo(() => {
    if (sortBy === "alphabetical") {
      // When sorting alphabetically, show all tasks in one group
      return [["All Tasks", filteredTasks] as [string, typeof filteredTasks]];
    }

    // When sorting by date, group by due date
    const groups: Record<string, typeof filteredTasks> = {};

    filteredTasks.forEach((task) => {
      const dateKey = task.dueDate || "No due date";
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(task);
    });

    // Sort groups by date
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
      if (a === "No due date") return 1;
      if (b === "No due date") return -1;
      const comparison = a.localeCompare(b);
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sortedGroups;
  }, [filteredTasks, sortBy, sortOrder]);

  // Mutations
  const createFolderMutation = useMutation(
    trpc.tasks.folders.create.mutationOptions({
      onSuccess: (newFolder) => {
        queryClient.invalidateQueries();
        setNewFolderName("");
        setNewSubfolderName("");
        setAddingSubfolderToId(null);
        // Auto-select the newly created folder
        if (newFolder) {
          setSelectedFolderId(newFolder.id);
          // Auto-expand parent folder if it's a subfolder
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
    trpc.tasks.folders.update.mutationOptions({
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
    trpc.tasks.folders.delete.mutationOptions({
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

  const createTaskMutation = useMutation(
    trpc.tasks.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setNewTaskTitle("");
        setIsTaskModalOpen(false);
        setTaskModalTitle("");
        setTaskModalDueDate("");
        toast({
          title: "Success",
          description: "Task created successfully",
        });
      },
      onError: (error) => {
        console.error("Task creation error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to create task",
          variant: "destructive",
        });
      },
    })
  );

  const updateTaskMutation = useMutation(
    trpc.tasks.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditingTaskId(null);
        setIsTaskModalOpen(false);
        setTaskModalTitle("");
        setTaskModalDueDate("");
        setTaskModalId(null);
        toast({
          title: "Success",
          description: "Task updated successfully",
        });
      },
      onError: (error) => {
        console.error("Task update error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to update task",
          variant: "destructive",
        });
      },
    })
  );

  const deleteTaskMutation = useMutation(
    trpc.tasks.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({
          title: "Success",
          description: "Task deleted successfully",
        });
      },
      onError: (error) => {
        console.error("Task deletion error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to delete task",
          variant: "destructive",
        });
      },
    })
  );

  const toggleTaskMutation = useMutation(
    trpc.tasks.toggleStatus.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
      onError: (error) => {
        console.error("Task status toggle error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to update task status",
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
      parentId 
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
    setViewAllTasks(false);
    // Close mobile sidebar after selection
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllTasks = () => {
    setViewAllTasks(true);
    setSelectedFolderId(null);
    // Close mobile sidebar after selection
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

  const openAddTaskModal = () => {
    const today = new Date().toISOString().split("T")[0];
    setTaskModalMode("add");
    setTaskModalTitle("");
    setTaskModalDueDate(today ?? "");
    setTaskModalId(null);
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (taskId: string, taskTitle: string, taskDueDate: string | null | undefined) => {
    setTaskModalMode("edit");
    setTaskModalTitle(taskTitle);
    setTaskModalDueDate(taskDueDate ?? "");
    setTaskModalId(taskId);
    setIsTaskModalOpen(true);
  };

  const handleTaskModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskModalTitle.trim()) return;

    if (taskModalMode === "add") {
      createTaskMutation.mutate({
        title: taskModalTitle,
        folderId: selectedFolderId || undefined,
        dueDate: taskModalDueDate || undefined,
      });
    } else if (taskModalMode === "edit" && taskModalId) {
      updateTaskMutation.mutate({
        id: taskModalId,
        title: taskModalTitle,
        dueDate: taskModalDueDate || undefined,
      });
    }
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const today = new Date().toISOString().split("T")[0];

    createTaskMutation.mutate({
      title: newTaskTitle,
      folderId: selectedFolderId || undefined,
      dueDate: today,
    });
  };

  const handleUpdateTask = (taskId: string) => {
    if (!editTaskTitle.trim()) return;
    updateTaskMutation.mutate({
      id: taskId,
      title: editTaskTitle,
    });
  };

  const handleDeleteTask = (taskId: string, taskName: string) => {
    setItemToDelete({ type: "task", id: taskId, name: taskName });
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
        deleteTaskMutation.mutate({ id: itemToDelete.id });
      }
    }
    setDeleteConfirmOpen(false);
    setItemToDelete(null);
  };

  const handleToggleTask = (taskId: string) => {
    toggleTaskMutation.mutate({ id: taskId });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateOnly = dateStr;
    const todayStr = today.toISOString().split("T")[0];
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    if (dateOnly === todayStr) return "Today";
    if (dateOnly === tomorrowStr) return "Tomorrow";

    return date.toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Get task count for a folder
  const getTaskCount = (folderId: string) => {
    return allTasks.filter((t) => t.folderId === folderId).length;
  };

  // Get total task count including subfolders
  const getTotalTaskCount = (folder: any): number => {
    let count = getTaskCount(folder.id);
    if (folder.subfolders && folder.subfolders.length > 0) {
      folder.subfolders.forEach((subfolder: any) => {
        count += getTotalTaskCount(subfolder);
      });
    }
    return count;
  };

  // Recursive folder rendering component
  const renderFolder = (folder: any, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id && !viewAllTasks;
    const hasSubfolders = folder.subfolders && folder.subfolders.length > 0;
    const isAddingSubfolder = addingSubfolderToId === folder.id;
    const isEditingFolder = editingFolderId === folder.id;
    const taskCount = getTaskCount(folder.id);
    const totalTaskCount = getTotalTaskCount(folder);
    const subfolderCount = hasSubfolders ? folder.subfolders.length : 0;

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
            {/* Edit folder button */}
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
            {/* Add subfolder button - only show on top-level folders (depth 0) */}
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
            <Button
              type="submit"
              size="sm"
              variant="blue-primary"
              className="h-8" disabled={createFolderMutation.isPending}
            >
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
          <span className="font-medium">Tasks</span>
        </div>
        {/* Mobile - Folder Menu and Add Task Button */}
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
                  {/* All Tasks Button */}
                  <button
                    onClick={handleViewAllTasks}
                    className={cn(
                      "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                      viewAllTasks 
                        ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300" 
                        : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                    )}
                  >
                    <Folder className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 text-left">All Tasks</span>
                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold">
                      {allTasks.length}
                    </span>
                  </button>

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
                  {/* All Tasks Button */}
                  <button
                    onClick={handleViewAllTasks}
                    className={cn(
                      "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                      viewAllTasks 
                        ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300" 
                        : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                    )}
                  >
                    <Folder className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 text-left">All Tasks</span>
                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold">
                      {allTasks.length}
                    </span>
                  </button>

                  {/* Divider */}
                  <div className="h-px bg-gray-200 my-2" />

                  {/* Individual Folders */}
                  {folders.map((folder) => renderFolder(folder, 0))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Tasks */}
        <div className="space-y-4">
          {folders.length === 0 ? (
            <div>
              <div className="lg:hidden mb-4">
                <Button
                  variant="outline"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="w-full flex items-center justify-between px-4 py-2 h-auto hover:bg-gray-50 border-2 hover:border-blue-300 transition-all group"
                >
                  <Menu className="h-4 w-4" />
                  Folder Menu
                </Button>
              </div>
              <div className="flex items-center justify-center h-96">
                <div className="text-center text-gray-500">
                  <FolderClosed className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h2 className="text-2xl font-bold text-gray-700 mb-2">
                    No Folders Yet
                  </h2>
                  <p className="text-sm">
                    Create a folder on the left to start organizing your tasks.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Desktop - Folder breadcrumb and Add Task button */}
              <div className="flex items-center justify-between mb-4 gap-4">
                {viewAllTasks ? (
                  <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                    <Folder className="h-6 w-6 flex-shrink-0 text-blue-600" />
                    <span className="font-bold text-gray-900">All Tasks</span>
                    <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full font-semibold">
                      {filteredTasks.length}
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

                {/* Add Task Button */}
                <Button
                  onClick={openAddTaskModal}
                  variant="blue-primary"
                  disabled={!selectedFolderId || viewAllTasks}
                  className="flex-shrink-0"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </div>

              {(!selectedFolderId && !viewAllTasks) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-900">
                  <span className="font-medium">ℹ️ Select a folder</span> from
                  the left to add and manage tasks
                </div>
              )}

              {/* Search Bar */}
              <div className="mb-4">
                <div className="relative">
                  <Input
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSearchQuery(e.target.value)
                    }
                    className="pr-10 h-11"
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              {/* Filter and Sort Controls */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                {/* Filter Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={
                      filterStatus === "all" ? "blue-primary" : "outline"
                    }
                    size="sm"
                    onClick={() => setFilterStatus("all")}
                  >
                    All
                  </Button>
                  <Button
                    variant={
                      filterStatus === "open" ? "blue-primary" : "outline"
                    }
                    size="sm"
                    onClick={() => setFilterStatus("open")}
                  >
                    Open
                  </Button>
                  <Button
                    variant={
                      filterStatus === "completed" ? "blue-primary" : "outline"
                    }
                    size="sm"
                    onClick={() => setFilterStatus("completed")}
                  >
                    Completed
                  </Button>
                </div>

                {/* Sort Buttons */}
                <div className="flex gap-2 flex-wrap sm:ml-auto">
                  {/* Date Sort */}
                  <div className="flex gap-0 border rounded-lg overflow-hidden">
                    <Button
                      variant={sortBy === "date" && sortOrder === "asc" ? "blue-primary" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSortBy("date");
                        setSortOrder("asc");
                      }}
                      className="gap-1.5 rounded-none border-0 border-r"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant={sortBy === "date" && sortOrder === "desc" ? "blue-primary" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSortBy("date");
                        setSortOrder("desc");
                      }}
                      className="gap-1.5 rounded-none border-0"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      <ArrowDown className="h-3 w-3" />
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
                    >
                      <SortDesc className="h-3.5 w-3.5" />
                      Z-A
                    </Button>
                  </div>
                </div>
              </div>

              {/* Tasks List */}
              <div className="space-y-6">
                {groupedTasks.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No tasks found. Create your first task above!
                  </div>
                ) : (
                  groupedTasks.map(([dateKey, tasks]) => (
                    <div key={dateKey} className="space-y-3">
                      {/* Date Header - Only show when sorting by date */}
                      {sortBy === "date" && (
                        <h3 className="text-blue-600 font-semibold">
                          {dateKey === "No due date"
                            ? dateKey
                            : formatDate(dateKey)}
                        </h3>
                      )}

                      {/* Tasks for this date */}
                      <div className={cn(
                        "space-y-2",
                        sortBy === "alphabetical" && "mt-0"
                      )}>
                        {tasks.map((task) => (
                          <div
                            key={task.id}
                            className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 min-w-0"
                          >
                            {/* Desktop Layout - Single Row */}
                            <div className="hidden sm:flex items-center gap-3">
                              {/* Checkbox */}
                              <button
                                onClick={() => handleToggleTask(task.id)}
                                className={cn(
                                  "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                                  task.status === "completed"
                                    ? "bg-green-500 border-green-500 text-white"
                                    : "border-gray-300 hover:border-gray-400"
                                )}
                              >
                                {task.status === "completed" && (
                                  <Check className="h-4 w-4" />
                                )}
                              </button>

                            {/* Task Title and Folder Path */}
                            <div className="flex-1 min-w-0">
                              <span
                                className={cn(
                                  "text-base break-words leading-relaxed",
                                  task.status === "completed"
                                    ? "line-through text-gray-500"
                                    : "text-gray-900"
                                )}
                              >
                                {task.title}
                              </span>
                              {viewAllTasks && task.folderId && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <FolderClosed className="h-3 w-3 text-gray-400" />
                                  <span className="text-xs text-gray-500">
                                    {getTaskFolderPath(task.folderId)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Due Date */}
                            <span className="text-sm text-gray-500 flex-shrink-0 whitespace-nowrap">
                              {task.dueDate}
                            </span>

                              {/* Action Buttons */}
                              <div className="flex gap-2 flex-shrink-0">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    openEditTaskModal(
                                      task.id,
                                      task.title,
                                      task.dueDate
                                    )
                                  }
                                  title="Edit task"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 hover:text-red-600"
                                  onClick={() =>
                                    handleDeleteTask(task.id, task.title)
                                  }
                                  title="Delete task"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Mobile Layout - Two Rows */}
                            <div className="sm:hidden">
                              {/* First Row: Checkbox + Task Title */}
                              <div className="flex items-center gap-2 mb-2">
                                {/* Checkbox */}
                                <button
                                  onClick={() => handleToggleTask(task.id)}
                                  className={cn(
                                    "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mt-0.5",
                                    task.status === "completed"
                                      ? "bg-green-500 border-green-500 text-white"
                                      : "border-gray-300 hover:border-gray-400"
                                  )}
                                >
                                  {task.status === "completed" && (
                                    <Check className="h-4 w-4" />
                                  )}
                                </button>

                              {/* Task Title */}
                              <div className="flex-1 min-w-0">
                                <span
                                  className={cn(
                                    "text-sm break-words leading-relaxed",
                                    task.status === "completed"
                                      ? "line-through text-gray-500"
                                      : "text-gray-900"
                                  )}
                                >
                                  {task.title}
                                </span>
                                {viewAllTasks && task.folderId && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <FolderClosed className="h-3 w-3 text-gray-400" />
                                    <span className="text-xs text-gray-500">
                                      {getTaskFolderPath(task.folderId)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Second Row: Due Date + Action Buttons */}
                            <div className="flex items-center justify-between pl-7">
                                {/* Due Date */}
                                <span className="text-xs text-gray-500 font-medium">
                                  {task.dueDate}
                                </span>

                                {/* Action Buttons */}
                                <div className="flex gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() =>
                                      openEditTaskModal(
                                        task.id,
                                        task.title,
                                        task.dueDate
                                      )
                                    }
                                    title="Edit task"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 hover:text-red-600"
                                    onClick={() =>
                                      handleDeleteTask(task.id, task.title)
                                    }
                                    title="Delete task"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Task Modal */}
      <AlertDialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
        <AlertDialogContent className="sm:max-w-[550px]">
          <AlertDialogHeader className="space-y-3 pb-4 border-b">
            <AlertDialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  taskModalMode === "add" ? "bg-blue-100" : "bg-indigo-100"
                )}
              >
                {taskModalMode === "add" ? (
                  <Plus className="h-5 w-5 text-blue-600" />
                ) : (
                  <Edit2 className="h-5 w-5 text-indigo-600" />
                )}
              </div>
              {taskModalMode === "add" ? "Add New Task" : "Edit Task"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {taskModalMode === "add"
                ? "Create a new task and set when it needs to be completed"
                : "Update task details and deadline"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form onSubmit={handleTaskModalSubmit} className="space-y-6 pt-2">
            {/* Task Title */}
            <div className="space-y-2">
              <Label
                htmlFor="task-title"
                className="text-sm font-semibold text-gray-700 flex items-center gap-1"
              >
                Task Title
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="task-title"
                placeholder="e.g., Prepare presentation for Monday meeting"
                value={taskModalTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTaskModalTitle(e.target.value)
                }
                className="w-full h-11 text-base"
                autoFocus
                required
              />
              <p className="text-xs text-gray-500">
                Be specific about what needs to be done
              </p>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label
                htmlFor="task-due-date"
                className="text-sm font-semibold text-gray-700 flex items-center gap-2"
              >
                <span>Due Date</span>
                <span className="text-xs font-normal text-gray-500">
                  (Optional)
                </span>
              </Label>
              <Input
                id="task-due-date"
                type="date"
                value={taskModalDueDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTaskModalDueDate(e.target.value)
                }
                className="w-full h-11 text-base"
              />
              <p className="text-xs text-gray-500">
                Set a deadline to stay on track
              </p>
            </div>

            <AlertDialogFooter className="gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTaskModalOpen(false)}
                className="flex-1 sm:flex-none h-11"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="blue-primary"
                disabled={
                  createTaskMutation.isPending ||
                  updateTaskMutation.isPending ||
                  !taskModalTitle.trim()
                }
                className="flex-1 sm:flex-none h-11 min-w-[140px]"
              >
                {createTaskMutation.isPending ||
                updateTaskMutation.isPending ? (
                  <>
                    <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {taskModalMode === "add" ? "Adding..." : "Saving..."}
                  </>
                ) : taskModalMode === "add" ? (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Task
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </AlertDialogFooter>
          </form>
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
              Delete {itemToDelete?.type === "folder" ? "Folder" : "Task"}
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
                          <span className="text-white font-bold text-sm">
                            !
                          </span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-red-900 mb-1">
                          Warning: Permanent Action
                        </p>
                        <p className="text-sm text-red-800">
                          This will permanently delete all subfolders and tasks
                          within this folder. This action cannot be undone.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-700">
                    Are you sure you want to delete the task{" "}
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
              Delete {itemToDelete?.type === "folder" ? "Folder" : "Task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

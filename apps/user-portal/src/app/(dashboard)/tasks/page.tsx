"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { Home, ChevronLeft, Folder, FolderClosed, Plus, Search, Edit2, Trash2, Check, ChevronDown, ChevronRight, Menu, X, ArrowUpDown, SortAsc, SortDesc, Calendar, ArrowUp, ArrowDown, Users, Eye, Edit3, MoreVertical, Share2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@imaginecalendar/ui/dialog";
import { Label } from "@imaginecalendar/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";
import { ShareButton } from "@/components/share-button";
import { ShareModal } from "@/components/share-modal";
import { ShareDetailsModal } from "@/components/share-details-modal";

export default function TasksPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewAllTasks, setViewAllTasks] = useState(true); // Default to All Tasks view
  const [viewAllShared, setViewAllShared] = useState(false); // View all shared tasks
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "completed">("open");
  const [sortBy, setSortBy] = useState<"date" | "alphabetical">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "title" | "description">("all");
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
  const lastExpandedFolderRef = useRef<string | null>(null);
  const foldersRef = useRef<any[]>([]);
  
  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: "folder" | "task"; id: string; name: string } | null>(null);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  
  // Task modal states
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState<"add" | "edit">("add");
  const [taskModalTitle, setTaskModalTitle] = useState("");
  const [taskModalDueDate, setTaskModalDueDate] = useState("");
  const [taskModalId, setTaskModalId] = useState<string | null>(null);
  const [taskModalFolderId, setTaskModalFolderId] = useState<string | null>(null);
  
  // Move folder states
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [selectedMoveToFolderId, setSelectedMoveToFolderId] = useState<string | null>(null);
  const [expandedMoveDialogFolders, setExpandedMoveDialogFolders] = useState<Set<string>>(new Set());

  // Share states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShareDetailsModalOpen, setIsShareDetailsModalOpen] = useState(false);
  const [shareResourceType, setShareResourceType] = useState<"task" | "task_folder">("task");
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [shareResourceName, setShareResourceName] = useState("");

  // Fetch folders and tasks
  const { data: allFolders = [] } = useQuery(
    trpc.tasks.folders.list.queryOptions()
  );
  const { data: allTasks = [] } = useQuery(
    trpc.tasks.list.queryOptions({})
  );
  const { data: myShares = [] } = useQuery(
    trpc.taskSharing.getMyShares.queryOptions()
  );
  const { data: sharedResources } = useQuery(
    trpc.taskSharing.getSharedWithMe.queryOptions()
  );

  // Extract shared tasks and folders from sharedResources with proper permission metadata
  const sharedTasks = useMemo(() => {
    return (sharedResources?.tasks || []).map((task: any) => ({
      ...task,
      isSharedWithMe: true,
      sharePermission: task.shareInfo?.permission || "view",
      ownerId: task.shareInfo?.ownerId,
    }));
  }, [sharedResources]);

  const sharedFolders = useMemo(() => {
    return (sharedResources?.folders || []).map((folder: any) => {
      const folderPermission = folder.shareInfo?.permission || "view";
      return {
        ...folder,
        isSharedWithMe: true,
        sharePermission: folderPermission,
        ownerId: folder.shareInfo?.ownerId,
        // Add permission to all tasks in this folder
        tasks: (folder.tasks || []).map((task: any) => ({
          ...task,
          isSharedWithMe: true,
          sharePermission: folderPermission, // Tasks inherit folder permission
          sharedViaFolder: true,
        })),
      };
    });
  }, [sharedResources]);
  
  // Calculate total shared task count (deduplicated)
  const totalSharedTaskCount = useMemo(() => {
    // Combine all shared tasks
    const tasksFromSharedFolders = sharedFolders.flatMap((folder: any) => folder.tasks || []);
    const allSharedTasks = [...sharedTasks, ...tasksFromSharedFolders];
    
    // Deduplicate by task ID
    const uniqueTaskIds = new Set(allSharedTasks.map((task: any) => task.id));
    return uniqueTaskIds.size;
  }, [sharedTasks, sharedFolders]);
  
  // Filter out shared folders from main folder list - only show owned folders
  const folders = allFolders.filter((folder: any) => !folder.isSharedWithMe);

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

  const allOwnedFolders = useMemo(() => flattenFolders(folders), [folders]);

  // Sort folders to show "General" at the top
  const sortedFolders = useMemo(() => {
    const sortFoldersRecursive = (folderList: any[]): any[] => {
      return [...folderList]
        .sort((a, b) => {
          const aIsGeneral = a.name.toLowerCase() === "general";
          const bIsGeneral = b.name.toLowerCase() === "general";
          
          if (aIsGeneral && !bIsGeneral) return -1;
          if (!aIsGeneral && bIsGeneral) return 1;
          
          // If neither or both are "General", maintain original order
          return 0;
        })
        .map(folder => ({
          ...folder,
          subfolders: folder.subfolders ? sortFoldersRecursive(folder.subfolders) : []
        }));
    };
    
    return sortFoldersRecursive(folders);
  }, [folders]);

  // Update folders ref when allOwnedFolders changes
  useEffect(() => {
    foldersRef.current = allOwnedFolders;
  }, [allOwnedFolders]);

  // Auto-expand parent folders when a folder is selected
  useEffect(() => {
    if (!selectedFolderId) {
      lastExpandedFolderRef.current = null;
      return;
    }
    
    // Prevent re-expanding the same folder
    if (lastExpandedFolderRef.current === selectedFolderId) {
      return;
    }
    
    const selectedFolderData = foldersRef.current.find((f) => f.id === selectedFolderId);
    if (!selectedFolderData?.parentId) {
      lastExpandedFolderRef.current = selectedFolderId;
      return;
    }

    // Collect all parent folder IDs first
    const parentIds = new Set<string>();
    const collectParents = (folderId: string) => {
      const folder = foldersRef.current.find((f) => f.id === folderId);
      if (folder?.parentId) {
        parentIds.add(folder.parentId);
        collectParents(folder.parentId);
      }
    };
    collectParents(selectedFolderId);

    // Update state once with all parent IDs
    if (parentIds.size > 0) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        parentIds.forEach(id => next.add(id));
        // Only update if there are actually new folders to expand
        if (next.size === prev.size && Array.from(parentIds).every(id => prev.has(id))) {
          return prev; // Return same reference if no changes
        }
        return next;
      });
    }
    
    // Mark this folder as expanded
    lastExpandedFolderRef.current = selectedFolderId;
  }, [selectedFolderId]); // Only depend on selectedFolderId to prevent infinite loops

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

  // Get selected folder (check both owned and shared folders)
  const selectedFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    // First check owned folders, then shared folders
    return allOwnedFolders.find((f) => f.id === selectedFolderId) || 
           sharedFolders.find((f: any) => f.id === selectedFolderId) || 
           null;
  }, [selectedFolderId, allOwnedFolders, sharedFolders]);

  // Get folder path (breadcrumb trail)
  const getFolderPath = (folderId: string): string[] => {
    const path: string[] = [];
    let currentId: string | null = folderId;
    
    while (currentId) {
      // Check both owned and shared folders
      const folder = allOwnedFolders.find((f) => f.id === currentId) || 
                     sharedFolders.find((f: any) => f.id === currentId);
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

  // Check if a folder is accessible (either owned or shared with us)
  const isFolderAccessible = (folderId: string | null): boolean => {
    if (!folderId) return false;
    return !!(allOwnedFolders.find((f) => f.id === folderId) || 
              sharedFolders.find((f: any) => f.id === folderId));
  };

  // Get folder path for a task
  const getTaskFolderPath = (folderId: string | null): string => {
    if (!folderId) return "No folder";
    // Check both owned and shared folders
    const folder = allOwnedFolders.find((f) => f.id === folderId) || 
                   sharedFolders.find((f: any) => f.id === folderId);
    if (!folder) return "Unknown folder";
    return getFolderPath(folderId).join(" / ");
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;

    // If viewing all shared tasks, show both individual shared tasks AND tasks from shared folders
    if (viewAllShared && !selectedFolderId) {
      // Combine individual shared tasks with tasks from all shared folders
      const tasksFromSharedFolders = sharedFolders.flatMap((folder: any) => folder.tasks || []);
      const allSharedTasks = [...sharedTasks, ...tasksFromSharedFolders];
      
      // Deduplicate tasks by ID and keep the one with better permission (edit > view)
      const taskMap = new Map<string, any>();
      allSharedTasks.forEach((task: any) => {
        const existingTask = taskMap.get(task.id);
        if (!existingTask) {
          // First time seeing this task, add it
          taskMap.set(task.id, task);
        } else {
          // Task already exists, check if we should replace it with better permission
          const currentPermission = existingTask.sharePermission || "view";
          const newPermission = task.sharePermission || "view";
          
          // Replace if new permission is "edit" and current is "view"
          if (newPermission === "edit" && currentPermission === "view") {
            taskMap.set(task.id, task);
          }
        }
      });
      
      // Convert map back to array
      tasks = Array.from(taskMap.values());
    }
    // Filter by folder - if viewing all, show all tasks
    // If a folder is selected, show only tasks in that folder
    else if (!viewAllTasks && !viewAllShared && selectedFolderId) {
      // Check if it's a shared folder
      const isSharedFolder = sharedFolders.some((f: any) => f.id === selectedFolderId);
      if (isSharedFolder) {
        // Show tasks from the shared folder
        const sharedFolder = sharedFolders.find((f: any) => f.id === selectedFolderId);
        tasks = sharedFolder?.tasks || [];
      } else {
        // Regular owned folder - exclude shared tasks
        tasks = tasks.filter((t) => t.folderId === selectedFolderId && !t.isSharedWithMe);
      }
    }
    // When viewing "All Tasks", exclude shared tasks
    else if (viewAllTasks) {
      tasks = tasks.filter((t) => !t.isSharedWithMe);
    }

    // Filter by status
    if (filterStatus !== "all") {
      tasks = tasks.filter((t) => t.status === filterStatus);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter((t) => {
        if (searchScope === "title") {
          return t.title.toLowerCase().includes(query);
        } else if (searchScope === "description") {
          return t.description?.toLowerCase().includes(query) || false;
        } else {
          // searchScope === "all"
          return (
            t.title.toLowerCase().includes(query) ||
            t.description?.toLowerCase().includes(query)
          );
        }
      });
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
  }, [allTasks, selectedFolderId, filterStatus, searchQuery, searchScope, sortBy, sortOrder, viewAllShared, viewAllTasks, sharedTasks, sharedFolders]);

  // Calculate task counts for status badges (before status and search filtering)
  const taskCounts = useMemo(() => {
    let tasks = allTasks;

    // If viewing all shared tasks, show both individual shared tasks AND tasks from shared folders
    if (viewAllShared && !selectedFolderId) {
      // Combine individual shared tasks with tasks from all shared folders
      const tasksFromSharedFolders = sharedFolders.flatMap((folder: any) => folder.tasks || []);
      const allSharedTasks = [...sharedTasks, ...tasksFromSharedFolders];
      
      // Deduplicate tasks by ID and keep the one with better permission (edit > view)
      const taskMap = new Map<string, any>();
      allSharedTasks.forEach((task: any) => {
        const existingTask = taskMap.get(task.id);
        if (!existingTask) {
          taskMap.set(task.id, task);
        } else {
          const currentPermission = existingTask.sharePermission || "view";
          const newPermission = task.sharePermission || "view";
          if (newPermission === "edit" && currentPermission === "view") {
            taskMap.set(task.id, task);
          }
        }
      });
      tasks = Array.from(taskMap.values());
    }
    // Filter by folder
    else if (!viewAllTasks && !viewAllShared && selectedFolderId) {
      const isSharedFolder = sharedFolders.some((f: any) => f.id === selectedFolderId);
      if (isSharedFolder) {
        const sharedFolder = sharedFolders.find((f: any) => f.id === selectedFolderId);
        tasks = sharedFolder?.tasks || [];
      } else {
        tasks = tasks.filter((t) => t.folderId === selectedFolderId && !t.isSharedWithMe);
      }
    }
    // When viewing "All Tasks", exclude shared tasks
    else if (viewAllTasks) {
      tasks = tasks.filter((t) => !t.isSharedWithMe);
    }

    // Count tasks by status (before search filtering)
    const openCount = tasks.filter((t) => t.status === "open").length;
    const completedCount = tasks.filter((t) => t.status === "completed").length;
    const allCount = tasks.length;

    return { open: openCount, completed: completedCount, all: allCount };
  }, [allTasks, selectedFolderId, viewAllShared, viewAllTasks, sharedTasks, sharedFolders]);

  // Calculate deletable tasks (only tasks user can delete)
  const deletableTasks = useMemo(() => {
    return filteredTasks.filter((task) => {
      const isSharedTask = task.isSharedWithMe || false;
      const isTaskOwner = !isSharedTask;
      const canEditTask = !isSharedTask || task.sharePermission === "edit";
      // User can delete if they own the task OR if it's a shared task with edit permission via folder
      return isTaskOwner || (isSharedTask && canEditTask && task.sharedViaFolder);
    });
  }, [filteredTasks]);

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
        
        // If we were in All Tasks view, return to it
        if (viewAllTasks) {
          setSelectedFolderId(null);
        }
        
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
    setViewAllShared(false);
    // Close mobile sidebar after selection
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllTasks = () => {
    setViewAllTasks(true);
    setViewAllShared(false);
    setSelectedFolderId(null);
    // Close mobile sidebar after selection
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllShared = () => {
    setViewAllShared(true);
    setViewAllTasks(false);
    setSelectedFolderId(null);
    // Close mobile sidebar after selection
    setIsMobileSidebarOpen(false);
  };

  const handleSharedFolderSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
    setViewAllTasks(false);
    setViewAllShared(false);
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

  const openAddTaskModal = async () => {
    const today = new Date().toISOString().split("T")[0];
    setTaskModalMode("add");
    setTaskModalTitle("");
    setTaskModalDueDate(today ?? "");
    setTaskModalId(null);
    
    // If viewing All Tasks and no folder is selected, find or create General folder
    if (viewAllTasks && !selectedFolderId) {
      const generalFolder = folders.find(f => f.name.toLowerCase() === "general");
      if (generalFolder) {
        setSelectedFolderId(generalFolder.id);
      } else {
        // Create General folder
        try {
          const newFolder = await createFolderMutation.mutateAsync({
            name: "General",
            color: "#3B82F6", // Blue color
            icon: "folder",
          });
          if (newFolder) {
            setSelectedFolderId(newFolder.id);
            toast({
              title: "General folder created",
              description: "Your task will be saved in the General folder",
            });
          }
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to create General folder",
            variant: "destructive",
          });
          return;
        }
      }
    }
    
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (taskId: string, taskTitle: string, taskDueDate: string | null | undefined, taskFolderId: string | null | undefined) => {
    setTaskModalMode("edit");
    setTaskModalTitle(taskTitle);
    setTaskModalDueDate(taskDueDate ?? "");
    setTaskModalId(taskId);
    setTaskModalFolderId(taskFolderId ?? null);
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

  const openMoveDialog = () => {
    setSelectedMoveToFolderId(taskModalFolderId);
    setExpandedMoveDialogFolders(new Set()); // Reset expanded folders
    setIsMoveDialogOpen(true);
  };

  const toggleMoveDialogFolder = (folderId: string) => {
    setExpandedMoveDialogFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleMoveTask = () => {
    if (!taskModalId || !selectedMoveToFolderId) return;
    
    updateTaskMutation.mutate({
      id: taskModalId,
      folderId: selectedMoveToFolderId,
    });
    
    setIsMoveDialogOpen(false);
    setIsTaskModalOpen(false);
    toast({
      title: "Task moved",
      description: "Task has been moved to the selected folder",
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

  const handleDeleteAll = () => {
    if (deletableTasks.length === 0) return;
    setDeleteAllConfirmOpen(true);
  };

  const confirmDeleteAll = async () => {
    if (deletableTasks.length === 0) return;
    
    const taskIds = deletableTasks.map(task => task.id);
    const count = taskIds.length;
    
    try {
      // Delete all tasks in parallel
      await Promise.all(
        taskIds.map(taskId => deleteTaskMutation.mutateAsync({ id: taskId }))
      );
      
      setDeleteAllConfirmOpen(false);
      toast({
        title: "Success",
        description: `Deleted ${count} task${count !== 1 ? 's' : ''} successfully`,
      });
    } catch (error) {
      console.error("Error deleting tasks:", error);
      toast({
        title: "Error",
        description: "Some tasks could not be deleted. Please try again.",
        variant: "destructive",
      });
    }
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

  const formatDateTime = (dateTimeStr: string | Date | null | undefined) => {
    if (!dateTimeStr) return "";
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return "";
    
    // Format: "MM/DD/YYYY, HH:MM AM/PM"
    const dateStr = date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    
    return `${dateStr}, ${timeStr}`;
  };

  // Share handlers
  const openShareModal = (type: "task" | "task_folder", id: string, name: string) => {
    setShareResourceType(type);
    setShareResourceId(id);
    setShareResourceName(name);
    setIsShareModalOpen(true);
  };

  const openShareDetails = (type: "task" | "task_folder", id: string, name: string) => {
    setShareResourceType(type);
    setShareResourceId(id);
    setShareResourceName(name);
    setIsShareDetailsModalOpen(true);
  };

  // Get share count for a resource
  const getShareCount = (resourceType: "task" | "task_folder", resourceId: string): number => {
    return myShares.filter(
      (share: any) => share.resourceType === resourceType && share.resourceId === resourceId
    ).length;
  };

  // Get task count for a folder (excluding shared tasks)
  const getTaskCount = (folderId: string) => {
    return allTasks.filter((t) => t.folderId === folderId && !t.isSharedWithMe).length;
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
                {/* Shared indicator badge - clickable to view who shared this */}
                {isSharedFolder && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openShareDetails("task_folder", folder.id, folder.name);
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium flex-shrink-0 hover:bg-purple-200 transition-colors"
                    title="View who shared this folder with you"
                  >
                    <Users className="h-2.5 w-2.5" />
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
                {/* Share button - only show for owned folders */}
                {isOwner && (() => {
                  const shareCount = getShareCount("task_folder", folder.id);
                  const isShared = shareCount > 0;
                  return (
                    <DropdownMenuItem
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (isShared) {
                          openShareDetails("task_folder", folder.id, folder.name);
                        } else {
                          openShareModal("task_folder", folder.id, folder.name);
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
                {/* Edit folder button - only if can edit */}
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
                {/* Add subfolder button - only show on top-level folders (depth 0) and if can edit */}
                {level === 0 && canEdit && (
                  <DropdownMenuItem
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setAddingSubfolderToId(folder.id);
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add subfolder</span>
                  </DropdownMenuItem>
                )}
                {/* Delete button - only for owned folders (not shared) and not General */}
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
              {/* All Tasks Button - Always show */}
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
                <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                  {allTasks.filter((t) => !t.isSharedWithMe).length}
                </span>
              </button>

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
                  {/* Divider */}
                  <div className="h-px bg-gray-200 my-2" />

                  {/* Individual Folders */}
                  {sortedFolders.map((folder) => renderFolder(folder, 0))}
                </>
              )}

              {/* Shared Section */}
              {(sharedTasks.length > 0 || sharedFolders.length > 0) && (
                <>
                  {/* Divider */}
                  <div className="h-px bg-gray-200 my-2" />

                  {/* Shared Section Header */}
                  <div className="px-2 py-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      Shared with me
                    </h3>
                  </div>

                  {/* All Shared Tasks Button */}
                  {totalSharedTaskCount > 0 && (
                    <button
                      onClick={handleViewAllShared}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                        viewAllShared && !selectedFolderId
                          ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300" 
                          : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                      )}
                    >
                      <Folder className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 text-left">All Shared</span>
                      <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                        {totalSharedTaskCount}
                      </span>
                    </button>
                  )}

                  {/* Shared Folders */}
                  {sharedFolders.length > 0 && sharedFolders.map((folder: any) => (
                    <button
                      key={folder.id}
                      onClick={() => handleSharedFolderSelect(folder.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                        selectedFolderId === folder.id && !viewAllTasks && !viewAllShared
                          ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300" 
                          : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                      )}
                    >
                      <FolderClosed className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 text-left truncate">{folder.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openShareDetails("task_folder", folder.id, folder.name);
                        }}
                        className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium flex-shrink-0 hover:bg-purple-200 transition-colors"
                        title="View who shared this folder with you"
                      >
                        <Users className="h-2.5 w-2.5" />
                        <span className="hidden sm:inline">
                          {folder.sharePermission === "view" ? "View" : "Edit"}
                        </span>
                      </button>
                      {folder.tasks && folder.tasks.length > 0 && (
                        <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                          {folder.tasks.length}
                        </span>
                      )}
                    </button>
                  ))}
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
              {/* All Tasks Button - Always show */}
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
                <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                  {allTasks.filter((t) => !t.isSharedWithMe).length}
                </span>
              </button>

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
                  {/* Divider */}
                  <div className="h-px bg-gray-200 my-2" />

                  {/* Individual Folders */}
                  {sortedFolders.map((folder) => renderFolder(folder, 0))}
                </>
              )}

              {/* Shared Section */}
              {(sharedTasks.length > 0 || sharedFolders.length > 0) && (
                <>
                  {/* Divider */}
                  <div className="h-px bg-gray-200 my-2" />

                  {/* Shared Section Header */}
                  <div className="px-2 py-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      Shared with me
                    </h3>
                  </div>

                  {/* All Shared Tasks Button */}
                  {totalSharedTaskCount > 0 && (
                    <button
                      onClick={handleViewAllShared}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                        viewAllShared && !selectedFolderId
                          ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300" 
                          : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                      )}
                    >
                      <Folder className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 text-left">All Shared</span>
                      <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                        {totalSharedTaskCount}
                      </span>
                    </button>
                  )}

                  {/* Shared Folders */}
                  {sharedFolders.length > 0 && sharedFolders.map((folder: any) => (
                    <button
                      key={folder.id}
                      onClick={() => handleSharedFolderSelect(folder.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                        selectedFolderId === folder.id && !viewAllTasks && !viewAllShared
                          ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300" 
                          : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                      )}
                    >
                      <FolderClosed className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 text-left truncate">{folder.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openShareDetails("task_folder", folder.id, folder.name);
                        }}
                        className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium flex-shrink-0 hover:bg-purple-200 transition-colors"
                        title="View who shared this folder with you"
                      >
                        <Users className="h-2.5 w-2.5" />
                        <span className="hidden sm:inline">
                          {folder.sharePermission === "view" ? "View" : "Edit"}
                        </span>
                      </button>
                      {folder.tasks && folder.tasks.length > 0 && (
                        <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                          {folder.tasks.length}
                        </span>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Tasks */}
        <div className="space-y-4">
          <div>
              {/* Desktop - Folder breadcrumb and Add Task button */}
              <div className="flex items-center justify-between mb-4 gap-4">
                {viewAllTasks ? (
                  <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                    <Folder className="h-6 w-6 flex-shrink-0 text-blue-600" />
                    <span className="font-bold text-gray-900">All Tasks</span>
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
                ) : selectedFolderId && sharedFolders.find((f: any) => f.id === selectedFolderId) ? (
                  <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                    <FolderClosed className="h-6 w-6 flex-shrink-0 text-purple-600" />
                    <span className="font-bold text-gray-900">
                      {sharedFolders.find((f: any) => f.id === selectedFolderId)?.name}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                      <Users className="h-3 w-3" />
                      Shared
                    </span>
                    <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-1 rounded-full font-semibold">
                      {filteredTasks.length}
                    </span>
                  </div>
                ) : (
                  <div className="flex-1" />
                )}

                {/* Add Task Button - enabled for owned folders, all tasks, or shared folders with edit permission */}
                <Button
                  onClick={openAddTaskModal}
                  variant="orange-primary"
                  disabled={
                    viewAllShared || 
                    (!selectedFolderId && !viewAllTasks) ||
                    (selectedFolderId && sharedFolders.some((f: any) => f.id === selectedFolderId && f.sharePermission !== "edit"))
                  }
                  className="flex-shrink-0"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </div>

              {/* Search Bar */}
              <div className="mb-4 flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder={
                      searchScope === "all"
                        ? "Search tasks..."
                        : searchScope === "title"
                        ? "Search by title..."
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
                {/* <Select
                  value={searchScope}
                  onValueChange={(value: "all" | "title" | "description") =>
                    setSearchScope(value)
                  }
                >
                  <SelectTrigger className="w-full sm:w-[140px] h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fields</SelectItem>
                    <SelectItem value="title">Title Only</SelectItem>
                    <SelectItem value="description">Description Only</SelectItem>
                  </SelectContent>
                </Select> */}
              </div>

              {/* Filter and Sort Controls */}
              <div className="flex flex-row justify-between items-center gap-3 mb-4">
                {/* Filter Buttons and Delete All */}
                <div className="flex gap-2 flex-wrap items-center">
                  <Button
                    variant={
                      filterStatus === "open" ? "blue-primary" : "outline"
                    }
                    size="sm"
                    onClick={() => setFilterStatus("open")}
                    className="relative"
                  >
                    Open
                    {taskCounts.open > 0 && (
                      <span className="ml-2 text-xs bg-[hsl(var(--brand-orange))] text-white px-1.5 py-0.5 rounded-full font-semibold">
                        {taskCounts.open}
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
                    Closed
                    {taskCounts.completed > 0 && (
                      <span className="ml-2 text-xs bg-[hsl(var(--brand-orange))] text-white px-1.5 py-0.5 rounded-full font-semibold">
                        {taskCounts.completed}
                      </span>
                    )}
                  </Button>
                  <Button
                    variant={
                      filterStatus === "all" ? "blue-primary" : "outline"
                    }
                    size="sm"
                    onClick={() => setFilterStatus("all")}
                    className="relative"
                  >
                    All
                    {taskCounts.all > 0 && (
                      <span className="ml-2 text-xs bg-[hsl(var(--brand-orange))] text-white px-1.5 py-0.5 rounded-full font-semibold">
                        {taskCounts.all}
                      </span>
                    )}
                  </Button>
                  
                  {/* Delete All Button */}
                  {deletableTasks.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteAll}
                      className="bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete All
                      <span className="ml-1.5 px-1.5 py-0.5 bg-[hsl(var(--brand-orange))] text-white rounded-full text-xs font-semibold">
                        {deletableTasks.length}
                      </span>
                    </Button>
                  )}
                </div>

                {/* Sort Controls - Dropdown on mobile, buttons on desktop */}
                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                  {/* Mobile: Dropdown Menu */}
                  <div className="sm:hidden w-full">
                    <Select
                      value={`${sortBy}-${sortOrder}`}
                      onValueChange={(value) => {
                        const [by, order] = value.split("-") as ["date" | "alphabetical", "asc" | "desc"];
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
                                  <>
                                    <ArrowUp className="h-3 w-3" />
                                  </>
                                ) : (
                                  <>
                                    <ArrowDown className="h-3 w-3" />
                                  </>
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

                  {/* Desktop: Sort Buttons */}
                  <div className="hidden sm:flex gap-2 flex-wrap">
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
                        {tasks.map((task) => {
                          // Check task permissions
                          const isSharedTask = task.isSharedWithMe || false;
                          const canEditTask = !isSharedTask || task.sharePermission === "edit";
                          const isTaskOwner = !isSharedTask;

                          return (
                            <div
                              key={task.id}
                              className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 min-w-0"
                            >
                              {/* Desktop Layout - Single Row */}
                              <div className="hidden sm:flex items-center gap-3">
                                {/* Checkbox - only if can edit */}
                                {canEditTask ? (
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
                                ) : (
                                  <div
                                    className={cn(
                                      "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center",
                                      task.status === "completed"
                                        ? "bg-green-500 border-green-500 text-white"
                                        : "border-gray-300"
                                    )}
                                  >
                                    {task.status === "completed" && (
                                      <Check className="h-4 w-4" />
                                    )}
                                  </div>
                                )}

                              {/* Task Title and Folder Path */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={cn(
                                      "text-base break-all leading-relaxed",
                                      task.status === "completed"
                                        ? "line-through text-gray-500"
                                        : "text-gray-900"
                                    )}
                                  >
                                    {task.title}
                                  </span>
                                  {/* Shared indicator badge - clickable to view who shared this */}
                                  {isSharedTask && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openShareDetails("task", task.id, task.title);
                                      }}
                                      className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium flex-shrink-0 hover:bg-purple-200 transition-colors"
                                      title="View who shared this task with you"
                                    >
                                      <Users className="h-3 w-3" />
                                      <span>{task.sharePermission === "view" ? "View Only" : "Can Edit"}</span>
                                    </button>
                                  )}
                                </div>
                                {/* Show folder path for All Tasks or All Shared views - only if task has an accessible folder */}
                                <div className="flex items-center justify-between gap-1.5 mt-1">
                                {(viewAllTasks || viewAllShared) && task.folderId && isFolderAccessible(task.folderId) && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <FolderClosed className="h-3 w-3 text-gray-400" />
                                    <span className="text-xs text-gray-500">
                                      {getTaskFolderPath(task.folderId)}
                                    </span>
                                  </div>
                                )}
                                {/* Created Date & Time */}
                                {task.createdAt && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <Calendar className="h-3 w-3 text-gray-400" />
                                    <span className="text-xs text-gray-500">
                                      Created: {formatDateTime(task.createdAt)}
                                    </span>
                                  </div>
                                )}
                                </div>
                              </div>

                              {/* Due Date */}
                              <span className="text-sm text-gray-500 flex-shrink-0 whitespace-nowrap">
                                {task.dueDate}
                              </span>

                                {/* Action Buttons */}
                                <div className="flex gap-2 flex-shrink-0">
                                  {/* Share button - only for owned tasks */}
                                  {isTaskOwner && (
                                    <ShareButton
                                      onClick={() => {
                                        const shareCount = getShareCount("task", task.id);
                                        if (shareCount > 0) {
                                          openShareDetails("task", task.id, task.title);
                                        } else {
                                          openShareModal("task", task.id, task.title);
                                        }
                                      }}
                                      isShared={getShareCount("task", task.id) > 0}
                                      shareCount={getShareCount("task", task.id)}
                                      size="md"
                                    />
                                  )}
                                  {/* Edit button - only if can edit */}
                                  {canEditTask && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={() =>
                                        openEditTaskModal(
                                          task.id,
                                          task.title,
                                          task.dueDate,
                                          task.folderId
                                        )
                                      }
                                      title="Edit task"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {/* Delete button - for owned tasks or tasks in shared folders with edit permission */}
                                  {(isTaskOwner || (isSharedTask && canEditTask && task.sharedViaFolder)) && (
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
                                  )}
                                </div>
                              </div>

                            {/* Mobile Layout - Two Rows */}
                            <div className="sm:hidden">
                              {/* First Row: Checkbox + Task Title */}
                              <div className="flex items-center gap-2 mb-2">
                                {/* Checkbox - only if can edit */}
                                {canEditTask ? (
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
                                ) : (
                                  <div
                                    className={cn(
                                      "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5",
                                      task.status === "completed"
                                        ? "bg-green-500 border-green-500 text-white"
                                        : "border-gray-300"
                                    )}
                                  >
                                    {task.status === "completed" && (
                                      <Check className="h-4 w-4" />
                                    )}
                                  </div>
                                )}

                              {/* Task Title */}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col gap-1">
                                  <span
                                    className={cn(
                                      "text-sm break-all leading-relaxed",
                                      task.status === "completed"
                                        ? "line-through text-gray-500"
                                        : "text-gray-900"
                                    )}
                                  >
                                    {task.title}
                                  </span>
                                  {/* Shared indicator badge - clickable to view who shared this */}
                                  {isSharedTask && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openShareDetails("task", task.id, task.title);
                                      }}
                                      className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium w-fit hover:bg-purple-200 transition-colors"
                                      title="View who shared this task with you"
                                    >
                                      <Users className="h-2.5 w-2.5" />
                                      <span>{task.sharePermission === "view" ? "View" : "Edit"}</span>
                                    </button>
                                  )}
                                </div>
                                {/* Show folder path for All Tasks or All Shared views - only if task has an accessible folder */}
                                {(viewAllTasks || viewAllShared) && task.folderId && isFolderAccessible(task.folderId) && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <FolderClosed className="h-3 w-3 text-gray-400" />
                                    <span className="text-xs text-gray-500">
                                      {getTaskFolderPath(task.folderId)}
                                    </span>
                                  </div>
                                )}
                                {/* Created Date & Time */}
                                {task.createdAt && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <Calendar className="h-3 w-3 text-gray-400" />
                                    <span className="text-xs text-gray-500">
                                      Created: {formatDateTime(task.createdAt)}
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
                                  {/* Share button - only for owned tasks */}
                                  {isTaskOwner && (
                                    <ShareButton
                                      onClick={() => {
                                        const shareCount = getShareCount("task", task.id);
                                        if (shareCount > 0) {
                                          openShareDetails("task", task.id, task.title);
                                        } else {
                                          openShareModal("task", task.id, task.title);
                                        }
                                      }}
                                      isShared={getShareCount("task", task.id) > 0}
                                      shareCount={getShareCount("task", task.id)}
                                      size="sm"
                                    />
                                  )}
                                  {/* Edit button - only if can edit */}
                                  {canEditTask && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() =>
                                        openEditTaskModal(
                                          task.id,
                                          task.title,
                                          task.dueDate,
                                          task.folderId
                                        )
                                      }
                                      title="Edit task"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {/* Delete button - for owned tasks or tasks in shared folders with edit permission */}
                                  {(isTaskOwner || (isSharedTask && canEditTask && task.sharedViaFolder)) && (
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
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
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

            <AlertDialogFooter className="gap-3 pt-4 border-t flex-col sm:flex-row">
              {/* Move to Folder button - only show in edit mode */}
              {taskModalMode === "edit" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={openMoveDialog}
                  className="w-full sm:w-auto sm:mr-auto h-11"
                >
                  <Folder className="h-4 w-4 mr-2" />
                  Move to Folder
                </Button>
              )}
              
              <div className="flex gap-3 w-full sm:w-auto">
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
                  className="flex-1 sm:flex-none h-11 min-w-[160px]"
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
              </div>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move to Folder Dialog */}
      <AlertDialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <AlertDialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Folder className="h-5 w-5 text-blue-600" />
              </div>
              Move Task to Folder
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Select a folder to move this task to
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4 space-y-2 max-h-[400px] overflow-y-auto">
            {sortedFolders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderClosed className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No folders available</p>
              </div>
            ) : (
              (() => {
                const renderFolderOption = (folder: any, level: number = 0): React.ReactNode => {
                  const isCurrentFolder = folder.id === taskModalFolderId;
                  const isSelected = folder.id === selectedMoveToFolderId;
                  const hasSubfolders = folder.subfolders && folder.subfolders.length > 0;
                  const isExpanded = expandedMoveDialogFolders.has(folder.id);
                  const taskCount = getTaskCount(folder.id);
                  
                  return (
                    <div key={folder.id}>
                      <div
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-lg transition-colors group",
                          isSelected
                            ? "bg-blue-100 text-blue-900"
                            : "hover:bg-gray-100 text-gray-700",
                          isCurrentFolder && !isSelected && "bg-gray-50"
                        )}
                        style={{ paddingLeft: `${5 + level * 20}px` }}
                      >
                        {/* Left side: Expand button + Folder name */}
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          {hasSubfolders ? (
                            <button
                              type="button"
                              onClick={() => toggleMoveDialogFolder(folder.id)}
                              className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <div className="w-6" />
                          )}
                          
                          <button
                            type="button"
                            onClick={() => setSelectedMoveToFolderId(folder.id)}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                          >
                            <FolderClosed className="h-4 w-4 flex-shrink-0" />
                            <span className="font-medium truncate">{folder.name}</span>
                          </button>
                        </div>

                        {/* Right side: Badges and indicators */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isCurrentFolder && (
                            <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-semibold">
                              Current
                            </span>
                          )}
                          {taskCount > 0 && (
                            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-semibold">
                              {taskCount}
                            </span>
                          )}
                          {isSelected && (
                            <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                      
                      {/* Render subfolders */}
                      {isExpanded && hasSubfolders && (
                        <div className="mt-0.5">
                          {folder.subfolders.map((subfolder: any) => renderFolderOption(subfolder, level + 1))}
                        </div>
                      )}
                    </div>
                  );
                };
                
                return sortedFolders.map((folder) => renderFolderOption(folder, 0));
              })()
            )}
          </div>

          <AlertDialogFooter className="gap-3 pt-4 border-t flex-col-reverse sm:flex-row">
            <AlertDialogCancel
              onClick={() => {
                setIsMoveDialogOpen(false);
                setSelectedMoveToFolderId(null);
              }}
              className="w-full sm:w-auto sm:flex-1 sm:flex-none h-11"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMoveTask}
              disabled={!selectedMoveToFolderId || selectedMoveToFolderId === taskModalFolderId}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 focus:ring-blue-600 sm:flex-1 sm:flex-none h-11 sm:min-w-[140px]"
            >
              <Folder className="h-4 w-4 mr-2" />
              Move Task
            </AlertDialogAction>
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

      {/* Delete All Confirmation Modal */}
      <AlertDialog open={deleteAllConfirmOpen} onOpenChange={setDeleteAllConfirmOpen}>
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              Delete All Tasks
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-base pt-2">
              <p className="text-gray-700">
                Are you sure you want to delete{" "}
                <span className="font-bold text-gray-900">
                  {deletableTasks.length} task{deletableTasks.length !== 1 ? 's' : ''}
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
                      This will permanently delete all {deletableTasks.length} currently visible task{deletableTasks.length !== 1 ? 's' : ''}. 
                      This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 pt-4">
            <AlertDialogCancel
              onClick={() => setDeleteAllConfirmOpen(false)}
              className="flex-1 sm:flex-none h-11"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAll}
              disabled={deleteTaskMutation.isPending || deletableTasks.length === 0}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 flex-1 sm:flex-none h-11 min-w-[140px]"
            >
              {deleteTaskMutation.isPending ? (
                <>
                  <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete All ({deletableTasks.length})
                </>
              )}
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

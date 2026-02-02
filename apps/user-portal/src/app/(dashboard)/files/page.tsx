"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import {
  Home,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Edit2,
  Trash2,
  Check,
  X,
  Upload,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  Presentation,
  Eye,
  Download,
  MoreVertical,
  HardDrive,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  Calendar,
  Loader2,
  Folder,
  FolderClosed,
  Menu,
  ArrowUp,
  ArrowDown,
  Users,
  Share2,
  ArrowLeft,
  LogOut,
} from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Card, CardContent } from "@imaginecalendar/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";
import { Badge } from "@imaginecalendar/ui/badge";
import { Progress } from "@imaginecalendar/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { ShareButton } from "@/components/share-button";
import { ShareDetailsModal } from "@/components/share-details-modal";
import {
  uploadToCloudflare,
  deleteFromCloudflare,
  formatFileSize,
  getFileExtension,
  getFileTypeIcon,
  isAllowedFileType,
  MAX_FILE_SIZE,
} from "@/lib/cloudflare-upload";
import { usePlanLimits } from "@/hooks/use-plan-limits";
import { UpgradePrompt } from "@/components/upgrade-prompt";

type ViewMode = "grid" | "list";
type SortBy = "date" | "name" | "size";
type SortOrder = "asc" | "desc";

interface FileItem {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileExtension: string | null;
  folderId: string | null;
  cloudflareId: string;
  cloudflareKey: string | null;
  cloudflareUrl: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  isSharedWithMe?: boolean;
  sharePermission?: "view" | "edit";
  ownerId?: string;
  sharedViaFolder?: boolean;
}

function extractKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Expect /bucket-or-path/<key>
    // e.g. https://xxx.r2.cloudflarestorage.com/users/... or https://pub-xxx.r2.dev/users/...
    return parsed.pathname.startsWith("/") ? parsed.pathname.slice(1) : parsed.pathname;
  } catch {
    return null;
  }
}

function getFileIcon(fileType: string) {
  const iconType = getFileTypeIcon(fileType);
  const iconClass = "h-8 w-8";
  
  switch (iconType) {
    case 'image':
      return <FileImage className={cn(iconClass, "text-emerald-500")} />;
    case 'pdf':
      return <FileText className={cn(iconClass, "text-red-500")} />;
    case 'doc':
      return <FileText className={cn(iconClass, "text-blue-500")} />;
    case 'excel':
      return <FileSpreadsheet className={cn(iconClass, "text-green-600")} />;
    case 'ppt':
      return <Presentation className={cn(iconClass, "text-orange-500")} />;
    case 'video':
      return <FileVideo className={cn(iconClass, "text-purple-500")} />;
    case 'audio':
      return <FileAudio className={cn(iconClass, "text-pink-500")} />;
    case 'archive':
      return <FileArchive className={cn(iconClass, "text-amber-500")} />;
    default:
      return <File className={cn(iconClass, "text-gray-500")} />;
  }
}

export default function FilesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Form states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<FileItem | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleteFolderDialogOpen, setIsDeleteFolderDialogOpen] = useState(false);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [viewAllFiles, setViewAllFiles] = useState(false);
  const [viewAllShared, setViewAllShared] = useState(false);

  // Share states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShareDetailsModalOpen, setIsShareDetailsModalOpen] = useState(false);
  const [shareResourceType, setShareResourceType] = useState<"file" | "file_folder">("file");
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [shareResourceName, setShareResourceName] = useState("");

  // Fetch files
  const { data: files = [], isLoading } = useQuery(
    trpc.storage.list.queryOptions()
  );

  // Fetch folders
  const { data: allFolders = [], isLoading: isLoadingFolders } = useQuery(
    trpc.storage.folders.list.queryOptions()
  );

  // Plan limits for file uploads
  const { tier, isLoading: isLoadingLimits } = usePlanLimits();
  const isFreeUser = tier === 'free';
  const isProOrBeta = tier === 'silver' || tier === 'beta';
  
  // 2GB storage limit for Pro and Beta users
  const STORAGE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

  // Fetch sharing data
  const { data: myShares = [], isLoading: isLoadingShares } = useQuery(
    trpc.fileSharing.getMyShares.queryOptions()
  );
  const { data: sharedResources, isLoading: isLoadingSharedResources } = useQuery(
    trpc.fileSharing.getSharedWithMe.queryOptions()
  );
  // Get recipient shares from sharedResources
  const myRecipientShares = useMemo(() => {
    const shares: any[] = [];
    if (sharedResources?.folders) {
      sharedResources.folders.forEach((folder: any) => {
        if (folder.shareInfo) {
          shares.push({
            id: folder.shareInfo.shareId,
            resourceType: "file_folder",
            resourceId: folder.id,
            ...folder.shareInfo
          });
        }
      });
    }
    if (sharedResources?.files) {
      sharedResources.files.forEach((file: any) => {
        if (file.shareInfo) {
          shares.push({
            id: file.shareInfo.shareId,
            resourceType: "file",
            resourceId: file.id,
            ...file.shareInfo
          });
        }
      });
    }
    return shares;
  }, [sharedResources]);

  // Extract shared files and folders from sharedResources
  const sharedFiles = useMemo(() => {
    return (sharedResources?.files || []).map((file: any) => ({
      ...file,
      isSharedWithMe: true,
      sharePermission: file.shareInfo?.permission || "view",
      ownerId: file.shareInfo?.ownerId,
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
        // Add permission to all files in this folder and ensure folderId is set
        files: (folder.files || []).map((file: any) => ({
          ...file,
          folderId: folder.id, // Ensure folderId is set correctly
          isSharedWithMe: true,
          sharePermission: folderPermission,
          sharedViaFolder: true,
        })),
      };
    });
  }, [sharedResources]);

  // Calculate total shared file count (deduplicated)
  const totalSharedFileCount = useMemo(() => {
    const filesFromSharedFolders = sharedFolders.flatMap((folder: any) => folder.files || []);
    const allSharedFiles = [...sharedFiles, ...filesFromSharedFolders];
    const uniqueFileIds = new Set(allSharedFiles.map((file: any) => file.id));
    return uniqueFileIds.size;
  }, [sharedFiles, sharedFolders]);

  // Filter out shared folders from main folder list - only show owned folders
  const folders = allFolders.filter((folder: any) => !folder.isSharedWithMe);

  // Fetch storage stats
  const { data: stats } = useQuery(
    trpc.storage.stats.queryOptions()
  );

  // Mutations
  const createFileMutation = useMutation(
    trpc.storage.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.storage.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.storage.stats.queryKey() });
        toast({
          title: "File uploaded",
          description: "Your file has been uploaded successfully.",
          variant: "success",
        });
        resetUploadForm();
      },
      onError: (error) => {
        toast({
          title: "Upload failed",
          description: error.message || "Failed to upload file. Please try again.",
          variant: "error",
        });
      },
    })
  );

  const createFolderMutation = useMutation(
    trpc.storage.folders.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.storage.folders.list.queryKey() });
        toast({ title: "Folder created", variant: "success" });
        setNewFolderName("");
        setIsCreateFolderModalOpen(false);
      },
      onError: (error) => {
        toast({
          title: "Folder create failed",
          description: error.message || "Could not create folder",
          variant: "error",
        });
      },
    })
  );

  const updateFolderMutation = useMutation(
    trpc.storage.folders.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.storage.folders.list.queryKey() });
        toast({ title: "Folder updated", variant: "success" });
        setEditingFolderId(null);
        setEditFolderName("");
      },
      onError: (error) => {
        toast({
          title: "Folder update failed",
          description: error.message || "Could not update folder",
          variant: "error",
        });
      },
    })
  );

  const deleteFolderMutation = useMutation(
    trpc.storage.folders.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.storage.folders.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.storage.list.queryKey() });
        toast({ title: "Folder deleted", variant: "success" });
        setIsDeleteFolderDialogOpen(false);
        setFolderToDelete(null);
        if (selectedFolderId === folderToDelete?.id) {
          setSelectedFolderId(null);
          setViewAllFiles(true);
        }
      },
      onError: (error) => {
        toast({
          title: "Folder delete failed",
          description: error.message || "Could not delete folder",
          variant: "error",
        });
      },
    })
  );

  const exitSharedFolderMutation = useMutation(
    trpc.fileSharing.deleteShare.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.fileSharing.getSharedWithMe.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.fileSharing.getMyShares.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.storage.folders.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.storage.list.queryKey() });

        if (selectedFolderId) {
          setSelectedFolderId(null);
          setViewAllFiles(true);
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
          variant: "destructive",
        });
      },
    })
  );

  const updateFileMutation = useMutation(
    trpc.storage.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.storage.list.queryKey() });
        toast({
          title: "File updated",
          description: "File details have been updated.",
          variant: "success",
        });
        setIsEditModalOpen(false);
        setEditingFile(null);
      },
      onError: (error) => {
        toast({
          title: "Update failed",
          description: error.message || "Failed to update file. Please try again.",
          variant: "error",
        });
      },
    })
  );

  const deleteFileMutation = useMutation(
    trpc.storage.delete.mutationOptions({
      onSuccess: async (result) => {
        // Also delete from R2 storage
        if (result.cloudflareKey) {
          try {
            await deleteFromCloudflare(result.cloudflareKey);
          } catch (e) {
            console.warn("Failed to delete from R2:", e);
          }
        }
        
        queryClient.invalidateQueries({ queryKey: trpc.storage.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.storage.stats.queryKey() });
        toast({
          title: "File deleted",
          description: "The file has been deleted.",
          variant: "success",
        });
        setIsDeleteDialogOpen(false);
        setFileToDelete(null);
      },
      onError: (error) => {
        toast({
          title: "Delete failed",
          description: error.message || "Failed to delete file. Please try again.",
          variant: "error",
        });
      },
    })
  );

  const folderMap = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((f: any) => map.set(f.id, f.name));
    return map;
  }, [folders]);

  const folderOptions = useMemo(
    () => [
      { id: null, name: "Uncategorized" },
      ...folders.map((f: any) => ({ id: f.id as string, name: f.name as string })),
    ],
    [folders]
  );

  const getFolderName = (folderId: string | null) => {
    if (!folderId) return "Uncategorized";
    return folderMap.get(folderId) || "Uncategorized";
  };

  const handleOpenCreateFolderModal = () => {
    setNewFolderName("");
    setIsCreateFolderModalOpen(true);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate({ name: newFolderName.trim() }, {
      onSuccess: () => {
        setNewFolderName("");
        setIsCreateFolderModalOpen(false);
      }
    });
  };

  const handleEditFolder = (folderId: string, currentName: string) => {
    setEditingFolderId(folderId);
    setEditFolderName(currentName);
  };

  const handleSaveFolder = (folderId: string) => {
    if (!editFolderName.trim()) {
      setEditingFolderId(null);
      setEditFolderName("");
      return;
    }
    updateFolderMutation.mutate({ id: folderId, name: editFolderName.trim() });
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    setFolderToDelete({ id: folderId, name: folderName });
    setIsDeleteFolderDialogOpen(true);
  };

  const handleExitSharedFolder = (folderId: string, folderName: string) => {
    const userShare = myRecipientShares.find((share: any) =>
      share.resourceType === "file_folder" &&
      share.resourceId === folderId
    );

    if (userShare) {
      exitSharedFolderMutation.mutate({
        shareId: userShare.id
      });
    } else {
      toast({
        title: "Error",
        description: "Unable to find share information for this folder. Please refresh the page and try again.",
        variant: "destructive",
      });
    }
  };

  const confirmDeleteFolder = () => {
    if (folderToDelete) {
      deleteFolderMutation.mutate({ id: folderToDelete.id });
    }
  };

  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setUploadFolderId(folderId);
    setViewAllFiles(false);
  };

  const handleViewAllFiles = () => {
    setSelectedFolderId(null);
    setViewAllFiles(true);
    setViewAllShared(false);
  };

  const handleViewAllShared = () => {
    setSelectedFolderId(null);
    setViewAllFiles(false);
    setViewAllShared(true);
  };

  // Function to go back to files view (mobile only)
  const handleBackToFiles = () => {
    setSelectedFolderId(null);
    setViewAllFiles(false);
    setViewAllShared(false);
  };

  // Share handlers
  const openShareModal = (type: "file" | "file_folder", id: string, name: string) => {
    setShareResourceType(type);
    setShareResourceId(id);
    setShareResourceName(name);
    setIsShareModalOpen(true);
  };

  const openShareDetails = (type: "file" | "file_folder", id: string, name: string) => {
    setShareResourceType(type);
    setShareResourceId(id);
    setShareResourceName(name);
    setIsShareDetailsModalOpen(true);
  };

  // Get share count for a resource
  const getShareCount = (resourceType: "file" | "file_folder", resourceId: string): number => {
    return myShares.filter(
      (share: any) => share.resourceType === resourceType && share.resourceId === resourceId
    ).length;
  };

  // Reset upload form
  const resetUploadForm = () => {
    setSelectedFile(null);
    setUploadTitle("");
    setUploadFolderId(selectedFolderId);
    setIsUploadModalOpen(false);
    setUploadProgress(0);
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if user is on free plan
    if (isFreeUser) {
      toast({
        title: "Upgrade Required",
        description: "File uploads are only available for Pro and Gold plans. Please upgrade to upload files.",
        variant: "error",
      });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Check storage limit for Pro and Beta users (2GB)
    if (isProOrBeta && stats) {
      const currentStorage = stats.storageUsed || 0;
      if (currentStorage >= STORAGE_LIMIT_BYTES) {
        toast({
          title: "Storage Limit Reached",
          description: "You've reached limitation.",
          variant: "error",
        });
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      // Check if adding this file would exceed the limit
      if (currentStorage + file.size > STORAGE_LIMIT_BYTES) {
        toast({
          title: "Storage Limit Reached",
          description: "You've reached limitation.",
          variant: "error",
        });
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
    }

    if (!isAllowedFileType(file.type)) {
      toast({
        title: "Invalid file type",
        description: "This file type is not supported.",
        variant: "error",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: `Maximum file size is ${formatFileSize(MAX_FILE_SIZE)}.`,
        variant: "error",
      });
      return;
    }

    setSelectedFile(file);
    setUploadTitle(file.name.replace(/\.[^/.]+$/, "")); // Remove extension for title
    setUploadFolderId(selectedFolderId);
    setIsUploadModalOpen(true);
  };

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile || !uploadTitle.trim()) return;

    // Double-check storage limit before uploading (in case stats changed)
    if (isProOrBeta && stats) {
      const currentStorage = stats.storageUsed || 0;
      if (currentStorage >= STORAGE_LIMIT_BYTES) {
        toast({
          title: "Storage Limit Reached",
          description: "You've reached limitation.",
          variant: "error",
        });
        setIsUploadModalOpen(false);
        resetUploadForm();
        return;
      }
      
      if (currentStorage + selectedFile.size > STORAGE_LIMIT_BYTES) {
        toast({
          title: "Storage Limit Reached",
          description: "You've reached limitation.",
          variant: "error",
        });
        setIsUploadModalOpen(false);
        resetUploadForm();
        return;
      }
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 80));
      }, 200);

      // Upload to Cloudflare
      const result = await uploadToCloudflare(selectedFile, "user");

      clearInterval(progressInterval);

      if (!result.success) {
        throw new Error(result.error || "Upload failed");
      }

      setUploadProgress(90);

      // Create file record in database
      await createFileMutation.mutateAsync({
        title: uploadTitle.trim(),
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
        fileExtension: getFileExtension(selectedFile.name) || undefined,
        folderId: uploadFolderId || null,
        cloudflareId: result.id!,
        cloudflareKey: result.key, // R2 object key for deletion
        cloudflareUrl: result.url!,
        thumbnailUrl: result.thumbnailUrl,
      });

      setUploadProgress(100);
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file.",
        variant: "error",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle edit
  const openEditModal = (file: FileItem) => {
    setEditingFile(file);
    setEditTitle(file.title);
    setEditFolderId(file.folderId || null);
    setIsEditModalOpen(true);
  };

  const handleEdit = () => {
    if (!editingFile || !editTitle.trim()) return;

    updateFileMutation.mutate({
      id: editingFile.id,
      title: editTitle.trim(),
      folderId: editFolderId,
    });
  };

  // Handle view
  const openViewModal = (file: FileItem) => {
    setViewingFile(file);
    setIsViewModalOpen(true);
  };

  // Handle delete
  const openDeleteDialog = (file: FileItem) => {
    setFileToDelete(file);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (!fileToDelete) return;
    deleteFileMutation.mutate({ id: fileToDelete.id });
  };

  // Combine owned and shared files
  const allFiles = useMemo(() => {
    const ownedFiles = files.filter((f: FileItem) => !f.isSharedWithMe);
    const sharedFilesList = sharedFiles;
    const filesFromSharedFolders = sharedFolders.flatMap((folder: any) => folder.files || []);
    
    // Combine and deduplicate
    const allFilesMap = new Map<string, FileItem>();
    [...ownedFiles, ...sharedFilesList, ...filesFromSharedFolders].forEach((file: FileItem) => {
      allFilesMap.set(file.id, file);
    });
    
    return Array.from(allFilesMap.values());
  }, [files, sharedFiles, sharedFolders]);

  // Check if selected folder is a shared folder
  const isSelectedFolderShared = useMemo(() => {
    if (!selectedFolderId) return false;
    return sharedFolders.some((f: any) => f.id === selectedFolderId);
  }, [selectedFolderId, sharedFolders]);

  // Filter and sort files
  const folderFilteredFiles = allFiles.filter((file: FileItem) => {
    if (viewAllShared) {
      return file.isSharedWithMe || false;
    }
    if (viewAllFiles) {
      return !file.isSharedWithMe; // Only show owned files in "All Files"
    }
    if (!selectedFolderId) return !file.folderId && !file.isSharedWithMe; // Uncategorized owned files
    
    // If selected folder is shared, show all files in that folder (including shared ones)
    if (isSelectedFolderShared) {
      return file.folderId === selectedFolderId;
    }
    
    // If selected folder is owned, only show owned files
    return file.folderId === selectedFolderId && !file.isSharedWithMe;
  });

  const filteredFiles = folderFilteredFiles
    .filter((file: FileItem) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        file.title.toLowerCase().includes(query) ||
        file.fileName.toLowerCase().includes(query)
      );
    })
    .sort((a: FileItem, b: FileItem) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.title.localeCompare(b.title);
          break;
        case "size":
          comparison = a.fileSize - b.fileSize;
          break;
        case "date":
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

  // Download file
  const [resolvedViewUrl, setResolvedViewUrl] = useState<string | null>(null);
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [resolvedThumbs, setResolvedThumbs] = useState<Record<string, string>>({});

  const getResolvedUrl = async (file: FileItem) => {
    const key = file.cloudflareKey || extractKeyFromUrl(file.cloudflareUrl);
    if (key) {
      try {
        const res = await fetch(`/api/storage/download?key=${encodeURIComponent(key)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            return data.url as string;
          }
        } else {
          console.warn("Signed URL request failed", await res.text());
        }
      } catch (err) {
        console.warn("Failed to get signed URL, falling back to stored URL", err);
      }
    }
    return file.cloudflareUrl;
  };

  const getThumbnailKey = (file: FileItem) => {
    if (file.thumbnailUrl) {
      const thumbKey = extractKeyFromUrl(file.thumbnailUrl);
      if (thumbKey) return thumbKey;
    }
    const fallbackKey = file.cloudflareKey || extractKeyFromUrl(file.cloudflareUrl);
    return fallbackKey;
  };

  const getCardImageSrc = (file: FileItem) => {
    // Prefer signed thumbnail/download URL we fetched. For PDFs we rely solely on this.
    const signed = resolvedThumbs[file.id];
    if (signed) return signed;
    // Fallback: only allow stored thumbnail/data URLs for images; avoid raw R2 URLs for PDFs to prevent 400s
    if (file.fileType.startsWith("image/")) {
      return file.thumbnailUrl || file.cloudflareUrl;
    }
    return null;
  };

  // Resolve signed URLs for thumbnails so images render without 400s
  useEffect(() => {
    let active = true;
    const fetchThumbs = async () => {
      const entries: Array<[string, string]> = [];
      await Promise.all(
        allFiles.map(async (file: FileItem) => {
          const isPreviewable = file.fileType.startsWith("image/") || file.fileType === "application/pdf";
          if (!isPreviewable) return;
          const key = getThumbnailKey(file);
          if (!key) return;
          try {
            const res = await fetch(`/api/storage/download?key=${encodeURIComponent(key)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data?.url) {
              entries.push([file.id, data.url as string]);
            }
          } catch {
            // ignore and fall back
          }
        })
      );
      if (!active) return;
      setResolvedThumbs((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    };

    fetchThumbs();
    return () => {
      active = false;
    };
  }, [allFiles]);

  useEffect(() => {
    let active = true;
    if (!isViewModalOpen || !viewingFile) {
      setResolvedViewUrl(null);
      setIsResolvingUrl(false);
      return;
    }

    setIsResolvingUrl(true);
    getResolvedUrl(viewingFile)
      .then((url) => {
        if (active) setResolvedViewUrl(url);
      })
      .catch(() => {
        if (active) setResolvedViewUrl(viewingFile.cloudflareUrl);
      })
      .finally(() => {
        if (active) setIsResolvingUrl(false);
      });

    return () => {
      active = false;
    };
  }, [isViewModalOpen, viewingFile]);

  const downloadFile = async (file: FileItem) => {
    try {
      const key = file.cloudflareKey || extractKeyFromUrl(file.cloudflareUrl);
      if (!key) {
        toast({ title: "Download failed", description: "No file key available.", variant: "error" });
        return;
      }

      // Use the proxy endpoint to avoid CORS issues
      const downloadUrl = `/api/storage/download-file?key=${encodeURIComponent(key)}&fileName=${encodeURIComponent(file.fileName)}`;
      
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      toast({ title: "Download failed", description: "Could not download file.", variant: "error" });
    }
  };

  const selectedFolder = folders.find((f: any) => f.id === selectedFolderId) || 
    sharedFolders.find((f: any) => f.id === selectedFolderId);
  const getFileCount = (folderId: string | null) => {
    if (folderId === null) return files.filter((f: FileItem) => !f.folderId && !f.isSharedWithMe).length;
    return files.filter((f: FileItem) => f.folderId === folderId && !f.isSharedWithMe).length;
  };
  const allFilesCount = files.filter((f: FileItem) => !f.isSharedWithMe).length;

  // Helper functions for shared user display
  const getSharedUserDisplayName = (sharedUser: any) => {
    if (sharedUser.firstName && sharedUser.lastName) {
      return `${sharedUser.firstName} ${sharedUser.lastName}`;
    }
    return sharedUser.firstName || sharedUser.name || sharedUser.email || "User";
  };

  const getUserInitials = (user: any) => {
    if (!user) return "U";
    const displayName = getSharedUserDisplayName(user);
    const parts = displayName.split(" ");
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return displayName.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (userId: string) => {
    if (!userId) return "bg-gradient-to-br from-blue-500 to-blue-600";
    const colors = [
      "bg-gradient-to-br from-blue-500 to-blue-600",
      "bg-gradient-to-br from-purple-500 to-purple-600",
      "bg-gradient-to-br from-green-500 to-green-600",
      "bg-gradient-to-br from-orange-500 to-orange-600",
      "bg-gradient-to-br from-pink-500 to-pink-600",
      "bg-gradient-to-br from-indigo-500 to-indigo-600",
      "bg-gradient-to-br from-teal-500 to-teal-600",
    ];
    const hash = userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Check if a folder is accessible (either owned or shared with us)
  const isFolderAccessible = (folderId: string) => {
    return folders.some((f: any) => f.id === folderId) ||
      sharedFolders.some((f: any) => f.id === folderId);
  };

  return (
    <>
    <div className="min-h-screen bg-white">
      {/* Main Container */}
      <div className="mx-auto max-w-md md:max-w-4xl lg:max-w-7xl">

          {/* Main Content - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 w-full">
            {/* Mobile Folders View - Show when no folder is selected */}
            {!selectedFolderId && !viewAllFiles && !viewAllShared && (
              <div className="lg:hidden w-full">
                {/* Your Files Header */}
                <div className="shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)]">
                  <div className="px-4 pt-6 pb-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[20px] font-semibold leading-[130%] text-[#141718]">Your Files</h2>
                      <Button
                        onClick={handleOpenCreateFolderModal}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1.5"
                      >
                        <Plus className="h-4 w-4" />
                        Create Folder
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

                {/* Folders */}
                <div className="px-4 pb-20 pt-2">
                  <div className="space-y-2">
                    {/* All Files Card */}
                    <div
                      onClick={handleViewAllFiles}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer",
                        viewAllFiles
                          ? "bg-blue-50 border-blue-200"
                          : "bg-white border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#DBEAFE" }}>
                        <Folder className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 truncate">All Files</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                            {allFilesCount} files
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Folder Cards */}
                    {folders.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p>No folders yet.</p>
                        <p className="text-xs mt-1">Create a folder to get started.</p>
                      </div>
                    ) : (
                      folders.map((folder: any) => {
                        const isSelected = selectedFolderId === folder.id && !viewAllFiles;
                        const fileCount = getFileCount(folder.id);
                        
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
                            <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#DBEAFE" }}>
                              <FolderClosed className="h-6 w-6 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-gray-900 truncate flex items-center gap-2">
                                {folder.name}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {fileCount > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                    {fileCount} files
                                  </span>
                                )}
                                {/* Show avatars for shared folders */}
                                {(() => {
                                  const shareCount = getShareCount("file_folder", folder.id);
                                  if (shareCount > 0) {
                                    const shares = myShares.filter(
                                      (s: any) => s.resourceType === "file_folder" && s.resourceId === folder.id
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
                                  const shareCount = getShareCount("file_folder", folder.id);
                                  const isShared = shareCount > 0;
                                  return (
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        if (isShared) {
                                          openShareDetails("file_folder", folder.id, folder.name);
                                        } else {
                                          openShareModal("file_folder", folder.id, folder.name);
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
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Desktop Left Panel - Folders Sidebar */}
            <div className="hidden lg:block space-y-4">
              <div className="space-y-4">
                {/* Your Files Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Your Files</h2>
                  <Button
                    onClick={handleOpenCreateFolderModal}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Create Folder
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

                {/* Folders */}
                <div className="space-y-2">

                  {/* All Files Card */}
                  <div
                    onClick={handleViewAllFiles}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer",
                      viewAllFiles
                        ? "bg-blue-50 border-blue-200"
                        : "bg-white border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#DBEAFE" }}>
                      <Folder className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 truncate">All Files</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                          {allFilesCount} files
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Folder Cards */}
                  {folders.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      <FolderClosed className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p>No folders yet.</p>
                      <p className="text-xs mt-1">Create a folder to get started.</p>
                    </div>
                  ) : (
                    folders.map((folder: any) => {
                      const isSelected = selectedFolderId === folder.id && !viewAllFiles;
                      const fileCount = getFileCount(folder.id);
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
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#DBEAFE" }}>
                            <FolderClosed className="h-6 w-6 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 truncate flex items-center gap-2">
                              {folder.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {fileCount > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                  {fileCount} files
                                </span>
                              )}
                              {/* Show avatars for shared folders */}
                              {(() => {
                                const shareCount = getShareCount("file_folder", folder.id);
                                if (shareCount > 0) {
                                  const shares = myShares.filter(
                                    (s: any) => s.resourceType === "file_folder" && s.resourceId === folder.id
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
                                              "bg-gradient-to-br from-blue-500 to-blue-600"
                                            )}
                                            style={{ marginLeft: idx > 0 ? '-8px' : '0' }}
                                            title={user.firstName || user.name || user.email || "User"}
                                          >
                                            {(user.firstName?.[0] || user.name?.[0] || user.email?.[0] || "U").toUpperCase()}
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
                                const shareCount = getShareCount("file_folder", folder.id);
                                const isShared = shareCount > 0;
                                return (
                                  <DropdownMenuItem
                                    onClick={(e: React.MouseEvent) => {
                                      e.stopPropagation();
                                      if (isShared) {
                                        openShareDetails("file_folder", folder.id, folder.name);
                                      } else {
                                        openShareModal("file_folder", folder.id, folder.name);
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
                      {sharedFolders.map((folder: any) => {
                        const isSelected = selectedFolderId === folder.id && !viewAllFiles;
                        const fileCount = folder.files?.length || 0;
                        
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
                            <div className="w-12 h-12 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                              <FolderClosed className="h-6 w-6 text-pink-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                              <div className="flex items-center gap-2 mt-1">
                                {fileCount > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 font-medium">
                                    {fileCount} files
                                  </span>
                                )}
                                {/* Show avatars for shared folders */}
                                {(() => {
                                  const shares = myShares.filter(
                                    (s: any) => s.resourceType === "file_folder" && s.resourceId === folder.id
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
                                    openShareDetails("file_folder", folder.id, folder.name);
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

            {/* Right Panel - Files */}
            <div className={cn(
              "w-full min-w-0",
              (!selectedFolderId && !viewAllFiles && !viewAllShared) ? "hidden lg:block" : "block"
            )}>
              <div className="shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)] px-4 pt-4">
                {/* Header with folder name and shared info */}
                <div className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* Mobile Back Button */}
                      {(selectedFolder || viewAllFiles || viewAllShared) && (
                        <button
                          onClick={handleBackToFiles}
                          className="lg:hidden h-10 w-10 flex-shrink-0 bg-white rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
                        >
                          <ArrowLeft className="h-5 w-5 text-gray-800" />
                        </button>
                      )}
                      {viewAllFiles ? (
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: "#DBEAFE" }}
                          >
                            <Folder className="h-5 w-5 text-blue-600" />
                          </div>
                          <span className="font-bold text-gray-900 text-lg">All Files</span>
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
                            style={{ backgroundColor: "#DBEAFE" }}
                          >
                            <FolderClosed className="h-5 w-5 text-blue-600" />
                          </div>
                          <span className="font-bold text-gray-900 text-lg">{selectedFolder.name}</span>
                          <ChevronDown className="h-4 w-4 text-gray-400 hidden lg:block" />
                        </div>
                      ) : (
                        <div className="flex-1" />
                      )}
                    </div>
                    
                    {/* Shared button, avatars, and Upload button (desktop) */}
                    <div className="flex items-center gap-2">
                      {selectedFolder && (() => {
                        const shareCount = getShareCount("file_folder", selectedFolder.id);
                        const folderShares = myShares.filter(
                          (s: any) => s.resourceType === "file_folder" && s.resourceId === selectedFolder.id
                        );
                        if (shareCount > 0) {
                          return (
                            <button
                              onClick={() => openShareDetails("file_folder", selectedFolder.id, selectedFolder.name)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                              title="View who this folder is shared with"
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
                          );
                        }
                        return null;
                      })()}
                      {/* Desktop Upload Button */}
                      <Button
                        onClick={() => {
                          if (isFreeUser) {
                            toast({
                              title: "Upgrade Required",
                              description: "File uploads are only available for Pro and Gold plans. Please upgrade to upload files.",
                              variant: "error",
                            });
                            return;
                          }
                          // Check storage limit for Pro/Beta users
                          if (isProOrBeta && stats && stats.storageUsed >= STORAGE_LIMIT_BYTES) {
                            toast({
                              title: "Storage Limit Reached",
                              description: "You've reached limitation.",
                              variant: "error",
                            });
                            return;
                          }
                          fileInputRef.current?.click();
                        }}
                        disabled={isLoadingLimits || isFreeUser || (isProOrBeta && stats && stats.storageUsed >= STORAGE_LIMIT_BYTES)}
                        className="hidden lg:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-4 w-4" />
                        Upload File
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Upgrade Prompt for Free Users */}
                {!isLoadingLimits && isFreeUser && (
                  <div className="px-4 pb-4 lg:px-0">
                    <UpgradePrompt
                      feature="File Uploads"
                      requiredTier="pro"
                      variant="alert"
                      className="border-amber-200 bg-amber-50 text-amber-900"
                    />
                  </div>
                )}

                {/* Search and Sort Bar */}
                <div className="pb-4 lg:px-0 lg:pb-4 mb-4 w-full flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSearchQuery(e.target.value)
                      }
                      className="pr-10 h-10 sm:h-11 bg-white border border-gray-200 rounded-lg"
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  </div>
                  <Select
                    value={`${sortBy}-${sortOrder}`}
                    onValueChange={(value) => {
                      const [by, order] = value.split("-") as [
                        "date" | "name" | "size",
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
                      <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                      <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                      <SelectItem value="size-desc">Size (Largest)</SelectItem>
                      <SelectItem value="size-asc">Size (Smallest)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* View Toggle and Files List */}
              <div>
                {/* View Toggle */}
                <div className="flex gap-2 mb-4 px-4">
                  <div className="flex gap-0 border rounded-lg overflow-hidden">
                    <Button
                      variant={viewMode === "grid" ? "blue-primary" : "outline"}
                      size="sm"
                      onClick={() => setViewMode("grid")}
                      className="gap-1.5 rounded-none border-0 border-r"
                    >
                      <Grid3X3 className="h-3.5 w-3.5" />
                      Grid
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "blue-primary" : "outline"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className="gap-1.5 rounded-none border-0"
                    >
                      <List className="h-3.5 w-3.5" />
                      List
                    </Button>
                  </div>
                </div>

                {/* Files List */}
                <div className="px-4 pb-20 lg:px-0">
                  <div className="space-y-6">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      {searchQuery ? "No files match your search." : "No files yet. Upload your first file to get started!"}
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredFiles.map((file: FileItem) => (
                        <div
                          key={file.id}
                          className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 min-w-0 group hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
                          onClick={() => openViewModal(file)}
                        >
                          <div className="aspect-square bg-muted/50 flex items-center justify-center relative overflow-hidden">
                            {file.fileType.startsWith("image/") ? (
                              <img
                                src={getCardImageSrc(file) || ""}
                                alt={file.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = file.thumbnailUrl || file.cloudflareUrl;
                                }}
                              />
                            ) : file.fileType === "application/pdf" ? (
                              getCardImageSrc(file) ? (
                                <object
                                  data={`${getCardImageSrc(file)}#toolbar=0&navpanes=0&scrollbar=0`}
                                  type="application/pdf"
                                  className="w-full h-full"
                                >
                                  <div className="p-8 flex items-center justify-center">
                                    {getFileIcon(file.fileType)}
                                  </div>
                                </object>
                              ) : (
                                <div className="p-8 flex items-center justify-center">
                                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                              )
                            ) : (
                              <div className="p-8">
                                {getFileIcon(file.fileType)}
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openViewModal(file);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadFile(file);
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-start justify-between gap-2 mt-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium truncate text-gray-900">{file.title}</h3>
                                {/* Shared indicator badge */}
                                {file.isSharedWithMe && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openShareDetails(
                                        "file",
                                        file.id,
                                        file.title
                                      );
                                    }}
                                    className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium flex-shrink-0 hover:bg-purple-200 transition-colors"
                                    title="View who shared this file with you"
                                  >
                                    <Users className="h-3 w-3" />
                                    <span>
                                      {file.sharePermission === "view"
                                        ? "View Only"
                                        : "Can Edit"}
                                    </span>
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(file.fileSize)}
                              </p>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              {/* Share button - only for owned files */}
                              {!file.isSharedWithMe && (
                                <ShareButton
                                  onClick={() => {
                                    const shareCount = getShareCount("file", file.id);
                                    if (shareCount > 0) {
                                      openShareDetails("file", file.id, file.title);
                                    } else {
                                      openShareModal("file", file.id, file.title);
                                    }
                                  }}
                                  isShared={getShareCount("file", file.id) > 0}
                                  shareCount={getShareCount("file", file.id)}
                                  size="md"
                                />
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {(!file.isSharedWithMe || file.sharePermission === "edit") && (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditModal(file); }}>
                                      <Edit2 className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); downloadFile(file); }}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                  </DropdownMenuItem>
                                  {!file.isSharedWithMe && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={(e) => { e.stopPropagation(); openDeleteDialog(file); }}
                                        className="text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredFiles.map((file: FileItem) => (
                        <div
                          key={file.id}
                          className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 min-w-0 hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => openViewModal(file)}
                        >
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          {file.fileType.startsWith("image/") ? (
                            <img
                              src={getCardImageSrc(file) || ""}
                              alt={file.title}
                              className="w-12 h-12 object-cover rounded"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = file.thumbnailUrl || file.cloudflareUrl;
                              }}
                            />
                          ) : file.fileType === "application/pdf" ? (
                            getCardImageSrc(file) ? (
                              <object
                                data={`${getCardImageSrc(file)}#toolbar=0&navpanes=0&scrollbar=0`}
                                type="application/pdf"
                                className="w-12 h-12 rounded overflow-hidden"
                              >
                                <div className="w-12 h-12 flex items-center justify-center">
                                  {getFileIcon(file.fileType)}
                                </div>
                              </object>
                            ) : (
                              <div className="w-12 h-12 flex items-center justify-center">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            )
                          ) : (
                            getFileIcon(file.fileType)
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium truncate text-gray-900">{file.title}</h3>
                            {/* Shared indicator badge */}
                            {file.isSharedWithMe && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openShareDetails(
                                    "file",
                                    file.id,
                                    file.title
                                  );
                                }}
                                className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium w-fit hover:bg-purple-200 transition-colors"
                                title="View who shared this file with you"
                              >
                                <Users className="h-2.5 w-2.5" />
                                <span>
                                  {file.sharePermission === "view"
                                    ? "View"
                                    : "Edit"}
                                </span>
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 truncate">
                            {file.fileName}
                          </p>
                        </div>
                        <div className="text-right text-sm text-gray-500 hidden sm:block">
                          <p>{formatFileSize(file.fileSize)}</p>
                          <p>{new Date(file.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-1">
                          {/* Share button - only for owned files */}
                          {!file.isSharedWithMe && (
                            <ShareButton
                              onClick={() => {
                                const shareCount = getShareCount("file", file.id);
                                if (shareCount > 0) {
                                  openShareDetails("file", file.id, file.title);
                                } else {
                                  openShareModal("file", file.id, file.title);
                                }
                              }}
                              isShared={getShareCount("file", file.id) > 0}
                              shareCount={getShareCount("file", file.id)}
                              size="sm"
                            />
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {(!file.isSharedWithMe || file.sharePermission === "edit") && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditModal(file); }}>
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); downloadFile(file); }}>
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                              {!file.isSharedWithMe && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => { e.stopPropagation(); openDeleteDialog(file); }}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                      ))}
                    </div>
                  )}
                  </div>
                </div>

                {/* Floating Action Button - Mobile Only */}
                <button
                  onClick={() => {
                    if (isFreeUser) {
                      toast({
                        title: "Upgrade Required",
                        description: "File uploads are only available for Pro and Gold plans. Please upgrade to upload files.",
                        variant: "error",
                      });
                      return;
                    }
                    // Check storage limit for Pro/Beta users
                    if (isProOrBeta && stats && stats.storageUsed >= STORAGE_LIMIT_BYTES) {
                      toast({
                        title: "Storage Limit Reached",
                        description: "You've reached limitation.",
                        variant: "error",
                      });
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  disabled={isLoadingLimits || isFreeUser || (isProOrBeta && stats && stats.storageUsed >= STORAGE_LIMIT_BYTES)}
                  className="lg:hidden fixed bottom-20 left-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg flex items-center justify-center transition-all z-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Upload File"
                >
                  <Plus className="h-6 w-6" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <AlertDialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <AlertDialogContent className="sm:max-w-md w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Upload File</AlertDialogTitle>
            <AlertDialogDescription>
              Add a title for your file
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            {selectedFile && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                {getFileIcon(selectedFile.type)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium break-words">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Enter file title"
              />
            </div>
            <div className="space-y-2">
              <Label>Folder</Label>
              <Select
                value={uploadFolderId ?? "none"}
                onValueChange={(value) => setUploadFolderId(value === "none" ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  {folderOptions.map((folder) => (
                    <SelectItem key={folder.id ?? "none"} value={folder.id ?? "none"}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isUploading && (
              <div className="space-y-2">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-sm text-center text-muted-foreground">
                  Uploading... {uploadProgress}%
                </p>
              </div>
            )}
          </div>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3">
            <AlertDialogCancel
              className="w-full sm:w-auto"
              onClick={resetUploadForm}
              disabled={isUploading}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto"
              onClick={handleUpload}
              disabled={!uploadTitle.trim() || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Modal */}
      <AlertDialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Edit File</AlertDialogTitle>
            <AlertDialogDescription>
              Update the file title
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title *</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter file title"
              />
            </div>
            <div className="space-y-2">
              <Label>Folder</Label>
              <Select
                value={editFolderId ?? "none"}
                onValueChange={(value) => setEditFolderId(value === "none" ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  {folderOptions.map((folder) => (
                    <SelectItem key={folder.id ?? "none"} value={folder.id ?? "none"}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleEdit} disabled={!editTitle.trim()}>
              <Check className="h-4 w-4 mr-2" />
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Modal */}
      <AlertDialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <AlertDialogContent className="max-w-[90vw] max-h-[90vh] w-full overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>{viewingFile?.title}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {viewingFile && (
              <>
                <div className="bg-muted rounded-lg overflow-hidden flex-1 flex items-center justify-center min-h-0">
                  {isResolvingUrl ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : viewingFile.fileType.startsWith("image/") ? (
                    <img
                      src={resolvedViewUrl || viewingFile.cloudflareUrl}
                      alt={viewingFile.title}
                      className="w-full h-full max-h-[calc(90vh-250px)] object-contain"
                    />
                  ) : viewingFile.fileType === "application/pdf" ? (
                    isResolvingUrl && !resolvedViewUrl ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <object
                        key={resolvedViewUrl || viewingFile.cloudflareUrl}
                        data={`${(resolvedViewUrl || viewingFile.cloudflareUrl) ?? ""}#toolbar=1&navpanes=1&scrollbar=1`}
                        type="application/pdf"
                        className="w-full h-[90vh] rounded border"
                      >
                        <iframe
                          key={`iframe-${resolvedViewUrl || viewingFile.cloudflareUrl}`}
                          src={`${resolvedViewUrl || viewingFile.cloudflareUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                          className="w-full h-[90vh] rounded border"
                          title={viewingFile.title}
                        />
                        <p className="p-4 text-sm text-muted-foreground">
                          PDF preview unavailable.{" "}
                          <button
                            className="underline"
                            onClick={() => viewingFile && downloadFile(viewingFile)}
                          >
                            Download instead
                          </button>
                        </p>
                      </object>
                    )
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center">
                      {getFileIcon(viewingFile.fileType)}
                      <p className="mt-4 text-muted-foreground">
                        Preview not available for this file type
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Badge variant="secondary">{viewingFile.fileExtension?.toUpperCase() || "FILE"}</Badge>
                  <Badge variant="outline">{formatFileSize(viewingFile.fileSize)}</Badge>
                  <Badge variant="outline">
                    {new Date(viewingFile.createdAt).toLocaleDateString()}
                  </Badge>
                </div>
              </>
            )}
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => setIsViewModalOpen(false)}>
              Close
            </AlertDialogCancel>
            <Button variant="outline" onClick={() => { setIsViewModalOpen(false); openEditModal(viewingFile!); }}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button onClick={() => viewingFile && downloadFile(viewingFile)}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{fileToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Modal */}
      <ShareDetailsModal
        isOpen={isShareModalOpen || isShareDetailsModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          setIsShareDetailsModalOpen(false);
        }}
        resourceType={shareResourceType}
        resourceId={shareResourceId || ""}
        resourceName={shareResourceName}
      />

      {/* Delete Folder Dialog */}
      <AlertDialog open={isDeleteFolderDialogOpen} onOpenChange={setIsDeleteFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{folderToDelete?.name}"? All files in this folder will be moved to uncategorized. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteFolderDialogOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteFolder}
              disabled={deleteFolderMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteFolderMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Folder Modal */}
      <AlertDialog open={isCreateFolderModalOpen} onOpenChange={setIsCreateFolderModalOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Create Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a name for your new folder
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={handleCreateFolder}>
            <div className="space-y-4 mb-4">
              <div className="space-y-2">
                <Label htmlFor="folder-name">Folder Name *</Label>
                <Input
                  id="folder-name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name"
                  autoFocus
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setIsCreateFolderModalOpen(false);
                setNewFolderName("");
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={!newFolderName.trim()}>
                <Check className="h-4 w-4 mr-2" />
                Create Folder
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


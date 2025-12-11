"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import {
  Home,
  ChevronLeft,
  ChevronRight,
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
import { ShareModal } from "@/components/share-modal";
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

export default function DocumentPage() {
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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [viewAllDocuments, setViewAllDocuments] = useState(true);
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

  // Fetch sharing data
  const { data: myShares = [], isLoading: isLoadingShares } = useQuery(
    trpc.fileSharing.getMyShares.queryOptions()
  );
  const { data: sharedResources, isLoading: isLoadingSharedResources } = useQuery(
    trpc.fileSharing.getSharedWithMe.queryOptions()
  );

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
          setViewAllDocuments(true);
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

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate({ name: newFolderName.trim() }, {
      onSuccess: () => {
        setNewFolderName("");
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

  const confirmDeleteFolder = () => {
    if (folderToDelete) {
      deleteFolderMutation.mutate({ id: folderToDelete.id });
    }
  };

  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setUploadFolderId(folderId);
    setViewAllDocuments(false);
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllDocuments = () => {
    setSelectedFolderId(null);
    setViewAllDocuments(true);
    setViewAllShared(false);
    setIsMobileSidebarOpen(false);
  };

  const handleViewAllShared = () => {
    setSelectedFolderId(null);
    setViewAllDocuments(false);
    setViewAllShared(true);
    setIsMobileSidebarOpen(false);
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
    if (viewAllDocuments) {
      return !file.isSharedWithMe; // Only show owned files in "All Documents"
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
        files.map(async (file: FileItem) => {
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
  }, [files]);

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

  // Check if a folder is accessible (either owned or shared with us)
  const isFolderAccessible = (folderId: string) => {
    return folders.some((f: any) => f.id === folderId) ||
      sharedFolders.some((f: any) => f.id === folderId);
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
          <span className="font-medium">Documents</span>
        </div>

        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="orange-primary"
          className="flex-shrink-0 lg:hidden"
        >
          <Plus className="h-4 w-4 mr-2" />
          Upload File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        />
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
            {/* All Documents Button - Always show */}
            <button
              onClick={handleViewAllDocuments}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                viewAllDocuments
                  ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                  : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
              )}
            >
              <Folder className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">All Documents</span>
              <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                {allFilesCount}
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
                {folders.map((folder: any) => {
                  const isEditing = editingFolderId === folder.id;
                  const shareCount = getShareCount("file_folder", folder.id);
                  const isShared = shareCount > 0;
                  
                  return (
                    <div
                      key={folder.id}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium group",
                        selectedFolderId === folder.id && !viewAllDocuments && !viewAllShared
                          ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                          : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                      )}
                    >
                      {isEditing ? (
                        <Input
                          value={editFolderName}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setEditFolderName(e.target.value)
                          }
                          onBlur={() => handleSaveFolder(folder.id)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === "Enter") handleSaveFolder(folder.id);
                            if (e.key === "Escape") {
                              setEditingFolderId(null);
                              setEditFolderName("");
                            }
                          }}
                          autoFocus
                          className="flex-1 h-7 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <button
                            onClick={() => handleFolderSelect(folder.id)}
                            className="flex items-center gap-2 flex-1 text-left min-w-0"
                          >
                            <FolderClosed className="h-4 w-4 flex-shrink-0" />
                            <span className="flex-1 truncate">{folder.name}</span>
                          </button>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Share button */}
                            <ShareButton
                              onClick={() => {
                                if (isShared) {
                                  openShareDetails("file_folder", folder.id, folder.name);
                                } else {
                                  openShareModal("file_folder", folder.id, folder.name);
                                }
                              }}
                              isShared={isShared}
                              shareCount={shareCount}
                              size="sm"
                            />
                            {/* Dropdown menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Folder options"
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                  }}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                <DropdownMenuItem
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    if (isShared) {
                                      openShareDetails("file_folder", folder.id, folder.name);
                                    } else {
                                      openShareModal("file_folder", folder.id, folder.name);
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
                                      <Users className="h-4 w-4" />
                                      <span>Share</span>
                                    </>
                                  )}
                                </DropdownMenuItem>
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
                                <DropdownMenuSeparator />
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
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                            {getFileCount(folder.id)}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
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
              {/* All Documents Button - Always show */}
              <button
                onClick={handleViewAllDocuments}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                  viewAllDocuments
                    ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                    : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                )}
              >
                <Folder className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">All Documents</span>
                <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                  {allFilesCount}
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
                  {folders.map((folder: any) => {
                    const isEditing = editingFolderId === folder.id;
                    const shareCount = getShareCount("file_folder", folder.id);
                    const isShared = shareCount > 0;
                    
                    return (
                      <div
                        key={folder.id}
                        className={cn(
                          "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium group",
                          selectedFolderId === folder.id && !viewAllDocuments && !viewAllShared
                            ? "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-300"
                            : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                        )}
                      >
                        {isEditing ? (
                          <Input
                            value={editFolderName}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setEditFolderName(e.target.value)
                            }
                            onBlur={() => handleSaveFolder(folder.id)}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                              if (e.key === "Enter") handleSaveFolder(folder.id);
                              if (e.key === "Escape") {
                                setEditingFolderId(null);
                                setEditFolderName("");
                              }
                            }}
                            autoFocus
                            className="flex-1 h-7 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            <button
                              onClick={() => handleFolderSelect(folder.id)}
                              className="flex items-center gap-2 flex-1 text-left min-w-0"
                            >
                              <FolderClosed className="h-4 w-4 flex-shrink-0" />
                              <span className="flex-1 truncate">{folder.name}</span>
                            </button>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Share button */}
                              <ShareButton
                                onClick={() => {
                                  if (isShared) {
                                    openShareDetails("file_folder", folder.id, folder.name);
                                  } else {
                                    openShareModal("file_folder", folder.id, folder.name);
                                  }
                                }}
                                isShared={isShared}
                                shareCount={shareCount}
                                size="sm"
                              />
                              {/* Dropdown menu */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Folder options"
                                    onClick={(e: React.MouseEvent) => {
                                      e.stopPropagation();
                                    }}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                  <DropdownMenuItem
                                    onClick={(e: React.MouseEvent) => {
                                      e.stopPropagation();
                                      if (isShared) {
                                        openShareDetails("file_folder", folder.id, folder.name);
                                      } else {
                                        openShareModal("file_folder", folder.id, folder.name);
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
                                        <Users className="h-4 w-4" />
                                        <span>Share</span>
                                      </>
                                    )}
                                  </DropdownMenuItem>
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
                                  <DropdownMenuSeparator />
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
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                              {getFileCount(folder.id)}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Shared Section */}
              {(sharedFiles.length > 0 || sharedFolders.length > 0) && (
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

                  {/* All Shared Files Button */}
                  {totalSharedFileCount > 0 && (
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
                        {totalSharedFileCount}
                      </span>
                    </button>
                  )}

                  {/* Shared Folders */}
                  {sharedFolders.length > 0 &&
                    sharedFolders.map((folder: any) => (
                      <div
                        key={folder.id}
                        className={cn(
                          "w-full flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium group",
                          selectedFolderId === folder.id &&
                            !viewAllDocuments &&
                            !viewAllShared
                            ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300"
                            : "hover:bg-gray-100 text-gray-700 border-2 border-transparent"
                        )}
                      >
                        <button
                          onClick={() => handleFolderSelect(folder.id)}
                          className="flex items-center gap-2 flex-1 text-left min-w-0"
                        >
                          <FolderClosed className="h-4 w-4 flex-shrink-0" />
                          <span className="flex-1 text-left truncate">
                            {folder.name}
                          </span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openShareDetails(
                              "file_folder",
                              folder.id,
                              folder.name
                            );
                          }}
                          className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium flex-shrink-0 hover:bg-purple-200 transition-colors"
                          title="View who shared this folder with you"
                        >
                          <Users className="h-2.5 w-2.5" />
                          <span className="hidden sm:inline">
                            {folder.sharePermission === "view" ? "View" : "Edit"}
                          </span>
                        </button>
                        {folder.files && folder.files.length > 0 && (
                          <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-0.5 rounded-full font-semibold">
                            {folder.files.length}
                          </span>
                        )}
                      </div>
                    ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Files */}
        <div className="space-y-4">
          <div>
            {/* Desktop - Folder breadcrumb and Upload button */}
            <div className="flex items-center justify-between mb-4 gap-4">
              {viewAllDocuments ? (
                <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                  <Folder className="h-6 w-6 flex-shrink-0 text-blue-600" />
                  <span className="font-bold text-gray-900">All Documents</span>
                </div>
              ) : viewAllShared ? (
                <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                  <Users className="h-6 w-6 flex-shrink-0 text-purple-600" />
                  <span className="font-bold text-gray-900">All Shared</span>
                </div>
              ) : selectedFolder && sharedFolders.find((f: any) => f.id === selectedFolderId) ? (
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
                    {folderFilteredFiles.length}
                  </span>
                </div>
              ) : selectedFolder ? (
                <div className="flex items-center gap-2 text-md text-gray-600 flex-1 min-w-0">
                  <FolderClosed className="h-6 w-6 flex-shrink-0" />
                  <span className="font-bold text-gray-900">{selectedFolder.name}</span>
                  <span className="text-xs bg-[hsl(var(--brand-orange))] text-white px-2 py-1 rounded-full font-semibold">
                    {getFileCount(selectedFolder.id)}
                  </span>
                </div>
              ) : (
                <div className="flex-1" />
              )}

              {/* Upload Button - enabled for all folders */}
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="orange-primary"
                className="flex-shrink-0 hidden lg:flex"
              >
                <Plus className="h-4 w-4 mr-2" />
                Upload File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              />
              {/* Mobile - Folder Menu and Upload Button */}
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

            {/* Search Bar */}
            <div className="mb-4 w-full justify-between flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Search files..."
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
                      "date" | "name" | "size",
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
                        ) : sortBy === "name" ? (
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
                        ) : (
                          <>
                            <HardDrive className="h-4 w-4" />
                            {sortOrder === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
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
                    <SelectItem value="name-asc">
                      <div className="flex items-center gap-2">
                        <SortAsc className="h-4 w-4" />
                        <span>A-Z</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="name-desc">
                      <div className="flex items-center gap-2">
                        <SortDesc className="h-4 w-4" />
                        <span>Z-A</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="size-desc">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4" />
                        <ArrowDown className="h-3 w-3" />
                      </div>
                    </SelectItem>
                    <SelectItem value="size-asc">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4" />
                        <ArrowUp className="h-3 w-3" />
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Filter and Sort Controls */}
            <div className="flex flex-row w-full justify-between items-center sm:gap-3 mb-4">
              {/* View Toggle */}
              <div className="flex gap-2">
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

                  {/* Name Sort */}
                  <div className="flex gap-0 border rounded-lg overflow-hidden">
                    <Button
                      variant={
                        sortBy === "name" && sortOrder === "asc"
                          ? "blue-primary"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => {
                        setSortBy("name");
                        setSortOrder("asc");
                      }}
                      className="gap-1.5 rounded-none border-0 border-r"
                    >
                      <SortAsc className="h-3.5 w-3.5" />
                      A-Z
                    </Button>
                    <Button
                      variant={
                        sortBy === "name" && sortOrder === "desc"
                          ? "blue-primary"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => {
                        setSortBy("name");
                        setSortOrder("desc");
                      }}
                      className="gap-1.5 rounded-none border-0"
                    >
                      <SortDesc className="h-3.5 w-3.5" />
                      Z-A
                    </Button>
                  </div>

                  {/* Size Sort */}
                  <div className="flex gap-0 border rounded-lg overflow-hidden">
                    <Button
                      variant={
                        sortBy === "size" && sortOrder === "desc"
                          ? "blue-primary"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => {
                        setSortBy("size");
                        setSortOrder("desc");
                      }}
                      className="gap-1.5 rounded-none border-0 border-r"
                    >
                      <HardDrive className="h-3.5 w-3.5" />
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button
                      variant={
                        sortBy === "size" && sortOrder === "asc"
                          ? "blue-primary"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => {
                        setSortBy("size");
                        setSortOrder("asc");
                      }}
                      className="gap-1.5 rounded-none border-0"
                    >
                      <HardDrive className="h-3.5 w-3.5" />
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Files List */}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                        className="w-full h-full max-h-[calc(90vh-250px)] rounded border"
                      >
                        <iframe
                          key={`iframe-${resolvedViewUrl || viewingFile.cloudflareUrl}`}
                          src={`${resolvedViewUrl || viewingFile.cloudflareUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                          className="w-full h-full max-h-[calc(90vh-250px)] rounded border"
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
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        resourceType={shareResourceType}
        resourceId={shareResourceId || ""}
        resourceName={shareResourceName}
      />

      {/* Share Details Modal */}
      <ShareDetailsModal
        isOpen={isShareDetailsModalOpen}
        onClose={() => setIsShareDetailsModalOpen(false)}
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
    </div>
  );
}


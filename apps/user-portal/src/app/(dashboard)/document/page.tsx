"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import {
  Home,
  ChevronLeft,
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
} from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Textarea } from "@imaginecalendar/ui/textarea";
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
  description: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileExtension: string | null;
  cloudflareId: string;
  cloudflareKey: string | null;
  cloudflareUrl: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  const [uploadDescription, setUploadDescription] = useState("");
  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [viewingFile, setViewingFile] = useState<FileItem | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);

  // Fetch files
  const { data: files = [], isLoading } = useQuery(
    trpc.storage.list.queryOptions()
  );

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

  // Reset upload form
  const resetUploadForm = () => {
    setSelectedFile(null);
    setUploadTitle("");
    setUploadDescription("");
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
        description: uploadDescription.trim() || undefined,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
        fileExtension: getFileExtension(selectedFile.name) || undefined,
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
    setEditDescription(file.description || "");
    setIsEditModalOpen(true);
  };

  const handleEdit = () => {
    if (!editingFile || !editTitle.trim()) return;

    updateFileMutation.mutate({
      id: editingFile.id,
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
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

  // Filter and sort files
  const filteredFiles = files
    .filter((file: FileItem) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        file.title.toLowerCase().includes(query) ||
        file.fileName.toLowerCase().includes(query) ||
        file.description?.toLowerCase().includes(query)
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
      const href = await getResolvedUrl(file);
      if (!href) {
        toast({ title: "Download failed", description: "No download URL available.", variant: "error" });
        return;
      }
      const link = document.createElement("a");
      link.href = href;
      link.download = file.fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      toast({ title: "Download failed", description: "Could not fetch download URL.", variant: "error" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm">
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">My Files</h1>
          <p className="text-muted-foreground mt-1">
            Upload, organize, and manage your files
          </p>
        </div>
        <Button
          onClick={() => fileInputRef.current?.click()}
          className="bg-primary hover:bg-primary/90"
        >
          <Upload className="h-4 w-4 mr-2" />
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

      {/* Document Stats */}
      {stats && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <HardDrive className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Storage Used</p>
                <p className="text-2xl font-bold text-primary">
                  {stats.storageUsedMB} MB
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Files</p>
                <p className="text-2xl font-bold">{stats.filesCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {sortOrder === "asc" ? <SortAsc className="h-4 w-4 mr-2" /> : <SortDesc className="h-4 w-4 mr-2" />}
                {sortBy === "date" ? "Date" : sortBy === "name" ? "Name" : "Size"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy("date")}>
                <Calendar className="h-4 w-4 mr-2" />
                Date
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("name")}>
                <FileText className="h-4 w-4 mr-2" />
                Name
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("size")}>
                <HardDrive className="h-4 w-4 mr-2" />
                Size
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
                {sortOrder === "asc" ? "Descending" : "Ascending"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View Toggle */}
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Files Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredFiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No files yet</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? "No files match your search." : "Upload your first file to get started."}
            </p>
            {!searchQuery && (
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredFiles.map((file: FileItem) => (
            <Card
              key={file.id}
              className="group hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden"
              onClick={() => openViewModal(file)}
            >
              <div className="aspect-square bg-muted/50 flex items-center justify-center relative overflow-hidden">
                {file.fileType.startsWith("image/") && file.thumbnailUrl ? (
                  <img
                    src={file.thumbnailUrl}
                    alt={file.title}
                    className="w-full h-full object-cover"
                  />
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
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{file.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.fileSize)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditModal(file); }}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); downloadFile(file); }}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); openDeleteDialog(file); }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFiles.map((file: FileItem) => (
            <Card
              key={file.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openViewModal(file)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {file.fileType.startsWith("image/") && file.thumbnailUrl ? (
                      <img
                        src={file.thumbnailUrl}
                        alt={file.title}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      getFileIcon(file.fileType)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{file.title}</h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {file.description || file.fileName}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground hidden sm:block">
                    <p>{formatFileSize(file.fileSize)}</p>
                    <p>{new Date(file.createdAt).toLocaleDateString()}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditModal(file); }}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); downloadFile(file); }}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); openDeleteDialog(file); }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <AlertDialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Upload File</AlertDialogTitle>
            <AlertDialogDescription>
              Add a title and description for your file
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            {selectedFile && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                {getFileIcon(selectedFile.type)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedFile.name}</p>
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
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Enter file description (optional)"
                rows={3}
              />
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
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetUploadForm} disabled={isUploading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleUpload} disabled={!uploadTitle.trim() || isUploading}>
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
              Update the file title and description
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
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Enter file description (optional)"
                rows={3}
              />
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
        <AlertDialogContent className="sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{viewingFile?.title}</AlertDialogTitle>
            {viewingFile?.description && (
              <AlertDialogDescription>{viewingFile.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <div className="space-y-4">
            {viewingFile && (
              <>
                <div className="bg-muted rounded-lg overflow-hidden min-h-[200px] flex items-center justify-center">
                  {isResolvingUrl ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : viewingFile.fileType.startsWith("image/") ? (
                    <img
                      src={resolvedViewUrl || viewingFile.cloudflareUrl}
                      alt={viewingFile.title}
                      className="w-full max-h-96 object-contain"
                    />
                  ) : viewingFile.fileType === "application/pdf" ? (
                    <iframe
                      src={resolvedViewUrl || viewingFile.cloudflareUrl}
                      className="w-full h-96"
                      title={viewingFile.title}
                    />
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center">
                      {getFileIcon(viewingFile.fileType)}
                      <p className="mt-4 text-muted-foreground">
                        Preview not available for this file type
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
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
    </div>
  );
}


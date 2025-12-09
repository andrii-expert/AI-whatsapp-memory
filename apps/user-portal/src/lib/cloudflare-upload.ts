// File Upload Utility - Uses server-side API route for Cloudflare integration

interface UploadResult {
  success: boolean;
  id?: string;
  url?: string;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * Upload file via server-side API
 * The API route handles Cloudflare integration securely
 */
export async function uploadToCloudflare(file: File, _userId: string): Promise<UploadResult> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/storage/upload', {
      method: 'POST',
      body: formData,
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Upload failed');
    }
    
    return {
      success: true,
      id: result.id,
      url: result.url,
      thumbnailUrl: result.thumbnailUrl,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Delete file via server-side API
 */
export async function deleteFromCloudflare(cloudflareId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/storage/delete?id=${encodeURIComponent(cloudflareId)}`, {
      method: 'DELETE',
    });
    
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Delete error:', error);
    return false;
  }
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get file icon based on file type
 */
export function getFileTypeIcon(fileType: string): string {
  if (fileType.startsWith('image/')) return 'image';
  if (fileType === 'application/pdf') return 'pdf';
  if (fileType.includes('word') || fileType.includes('document')) return 'doc';
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'excel';
  if (fileType.includes('powerpoint') || fileType.includes('presentation')) return 'ppt';
  if (fileType.startsWith('video/')) return 'video';
  if (fileType.startsWith('audio/')) return 'audio';
  if (fileType.includes('zip') || fileType.includes('archive') || fileType.includes('compressed')) return 'archive';
  return 'file';
}

/**
 * Check if file type is allowed
 */
export function isAllowedFileType(fileType: string): boolean {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
  ];
  
  return allowedTypes.includes(fileType) || fileType.startsWith('image/');
}

/**
 * Maximum file size (10MB)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;


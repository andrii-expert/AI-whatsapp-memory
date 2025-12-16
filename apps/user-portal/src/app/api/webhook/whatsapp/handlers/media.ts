import type { Database } from '@imaginecalendar/database/client';
import {
  getVerifiedWhatsappNumberByPhone,
  logIncomingWhatsAppMessage,
  logOutgoingWhatsAppMessage,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, getWhatsAppConfig, getWhatsAppApiUrl } from '@imaginecalendar/whatsapp';
import type { WebhookProcessingSummary } from '../types';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createUserFile, getUserFileFolders, getRecentMessageHistory, getPrimaryCalendar } from '@imaginecalendar/database/queries';
import { WhatsappTextAnalysisService } from '@imaginecalendar/ai-services';
import { ActionExecutor } from './action-executor';
import { CalendarService } from './calendar-service';

// Cloudflare R2 configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "imaginecalendar";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || (R2_ACCOUNT_ID ? `https://pub-${R2_ACCOUNT_ID}.r2.dev` : undefined);

function getS3Client() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Analyze caption using AI to extract file name and folder
 */
async function analyzeCaption(
  caption: string,
  db: Database,
  userId: string
): Promise<{ fileName: string | null; folderName: string | null }> {
  if (!caption || !caption.trim()) {
    return { fileName: null, folderName: null };
  }

  try {
    // Get message history for context
    let messageHistory: Array<{ direction: 'incoming' | 'outgoing'; content: string }> = [];
    try {
      const history = await getRecentMessageHistory(db, userId, 10);
      messageHistory = history
        .filter(msg => msg.content && msg.content.trim().length > 0)
        .slice(0, 10)
        .map(msg => ({
          direction: msg.direction,
          content: msg.content,
        }));
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to retrieve message history for caption analysis');
    }

    // Get user's calendar timezone
    let userTimezone = 'Africa/Johannesburg';
    try {
      const calendarConnection = await getPrimaryCalendar(db, userId);
      if (calendarConnection) {
        const calendarService = new CalendarService(db);
        userTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get user timezone, using default');
    }

    // Analyze caption using AI
    const analyzer = new WhatsappTextAnalysisService();
    const currentDate = new Date();
    
    logger.info(
      {
        userId,
        caption: caption.substring(0, 100),
        historyCount: messageHistory.length,
      },
      'Analyzing caption with AI'
    );

    const aiResponse = (await analyzer.analyzeMessage(caption, {
      messageHistory,
      currentDate,
      timezone: userTimezone,
    })).trim();

    logger.debug(
      {
        responseLength: aiResponse.length,
        responsePreview: aiResponse.substring(0, 200),
        userId,
      },
      'Got AI response for caption'
    );

    // Parse AI response to extract file name and folder
    // Expected format: "Title: document\nCreate a file: {file_name} - on folder: {folder_route}"
    const titleMatch = aiResponse.match(/^Title:\s*(document|normal)/i);
    if (!titleMatch || titleMatch[1].toLowerCase() !== 'document') {
      logger.warn(
        {
          userId,
          caption,
          aiResponse: aiResponse.substring(0, 200),
        },
        'AI did not recognize caption as document operation'
      );
      return { fileName: null, folderName: null };
    }

    // Extract action template
    const actionLines = aiResponse
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('Title:'));
    
    const actionTemplate = actionLines.join('\n');

    // Parse "Create a file: {file_name} - on folder: {folder_route}"
    // Handle variations like:
    // - "Create a file: mobile - on folder: aaa"
    // - "Create a file: mobile_design"
    // - "Create a file: mobile - on folder: Uncategorized"
    const createFileMatch = actionTemplate.match(/Create\s+a\s+file:\s*(.+?)(?:\s+-\s+on\s+folder:\s*(.+))?$/i);
    if (createFileMatch) {
      let fileName = createFileMatch[1]?.trim() || null;
      let folderName = createFileMatch[2]?.trim() || null;
      
      // Clean up folder name (remove "folder" suffix if present)
      if (folderName) {
        folderName = folderName.replace(/\s+folder\s*$/i, '').trim();
      }
      
      // If folder is "Uncategorized", set to null
      if (folderName && folderName.toLowerCase() === 'uncategorized') {
        folderName = null;
      }
      
      logger.info(
        {
          userId,
          fileName,
          folderName,
          caption,
          actionTemplate,
        },
        'Parsed file name and folder from AI response'
      );

      return { fileName, folderName };
    }

    logger.warn(
      {
        userId,
        actionTemplate,
        caption,
      },
      'Could not parse file creation action from AI response'
    );

    return { fileName: null, folderName: null };
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        caption,
      },
      'Failed to analyze caption with AI'
    );
    return { fileName: null, folderName: null };
  }
}

/**
 * Resolve folder name to folder ID
 */
async function resolveFileFolderRoute(
  db: Database,
  userId: string,
  folderName: string
): Promise<string | null> {
  const folders = await getUserFileFolders(db, userId);
  const folderNameLower = folderName.toLowerCase();
  const folder = folders.find(f => f.name.toLowerCase() === folderNameLower);
  return folder ? folder.id : null;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string | undefined): string {
  if (!mimeType) return '';
  
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
  };

  return mimeToExt[mimeType] || '';
}

/**
 * Upload file buffer to Cloudflare R2
 */
async function uploadToR2(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  userId: string
): Promise<{ key: string; url: string; thumbnailUrl?: string }> {
  if (!R2_PUBLIC_URL) {
    throw new Error("Missing R2_PUBLIC_URL. Set it to your public R2 endpoint (e.g., https://pub-<ACCOUNT_ID>.r2.dev).");
  }

  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const fileKey = `users/${userId}/${timestamp}-${sanitizedFileName}`;

  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileKey,
    Body: buffer,
    ContentType: mimeType || "application/octet-stream",
    Metadata: {
      originalName: fileName,
      userId: userId,
      uploadedAt: new Date().toISOString(),
    },
  });

  await s3Client.send(command);

  const publicUrl = `${R2_PUBLIC_URL}/${fileKey}`;
  const isImage = mimeType.startsWith("image/");
  const thumbnailUrl = isImage ? publicUrl : undefined;

  return { key: fileKey, url: publicUrl, thumbnailUrl };
}

/**
 * Download media file from WhatsApp using media ID
 */
async function downloadMediaFromWhatsApp(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const config = getWhatsAppConfig();
  const apiUrl = getWhatsAppApiUrl();

  try {
    // Step 1: Get media URL from WhatsApp
    logger.info({ mediaId }, 'Fetching media URL from WhatsApp');
    const mediaUrlResponse = await fetch(`${apiUrl}/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!mediaUrlResponse.ok) {
      throw new Error(`WhatsApp API error: ${mediaUrlResponse.status} ${mediaUrlResponse.statusText}`);
    }

    const mediaUrlData = await mediaUrlResponse.json() as { url?: string; mime_type?: string };

    if (!mediaUrlData?.url) {
      throw new Error('No media URL in response');
    }

    const mediaUrl = mediaUrlData.url;
    const mimeType = mediaUrlData.mime_type || 'application/octet-stream';

    // Step 2: Download the actual media file
    logger.info({ mediaId, mediaUrl }, 'Downloading media file');
    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
      signal: AbortSignal.timeout(60000), // 60 second timeout for download
    });

    if (!mediaResponse.ok) {
      throw new Error(`Media download error: ${mediaResponse.status} ${mediaResponse.statusText}`);
    }

    const arrayBuffer = await mediaResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, mimeType };
  } catch (error) {
    if (error instanceof Error) {
      logger.error(
        {
          mediaId,
          error: error.message,
          errorStack: error.stack,
        },
        'Failed to download media from WhatsApp'
      );
      throw error;
    }
    throw new Error('Unknown error downloading media');
  }
}

export async function handleMediaMessage(
  message: any,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<void> {
  const mediaData = message.image ?? message.document;
  const mediaType = message.image ? 'image' : 'document';

  if (!mediaData) {
    logger.warn({ messageId: message.id, mediaType }, 'Media message missing media payload');
    return;
  }

  const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, message.from);

  if (!whatsappNumber || !whatsappNumber.isVerified) {
    logger.info(
      {
        senderPhone: message.from,
        found: !!whatsappNumber,
        verified: whatsappNumber?.isVerified,
      },
      'Ignoring media from unverified number'
    );
    return;
  }

  try {
    await logIncomingWhatsAppMessage(db, {
      whatsappNumberId: whatsappNumber.id,
      userId: whatsappNumber.userId,
      messageId: message.id,
      messageType: mediaType,
    });
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to log incoming media message'
    );
  }

  const whatsappService = new WhatsAppService();
  const caption = mediaData.caption || '';
  const originalFileName = mediaData.filename || '';
  const mimeType = mediaData.mime_type || (mediaType === 'image' ? 'image/jpeg' : 'application/octet-stream');

  try {
    logger.info(
      {
        messageId: message.id,
        mediaId: mediaData.id,
        userId: whatsappNumber.userId,
        caption,
        originalFileName,
        mimeType,
      },
      'Processing media message for file creation'
    );

    // Step 1: Download media file from WhatsApp
    const { buffer, mimeType: downloadedMimeType } = await downloadMediaFromWhatsApp(mediaData.id);
    
    logger.info(
      {
        messageId: message.id,
        fileSize: buffer.length,
        mimeType: downloadedMimeType,
      },
      'Media downloaded successfully'
    );

    // Step 2: Analyze caption using AI to extract file name and folder
    const { fileName: parsedFileName, folderName } = await analyzeCaption(caption, db, whatsappNumber.userId);
    let fileName = parsedFileName;
    
    if (!fileName) {
      // If no caption or couldn't parse, use original filename or generate one
      if (originalFileName) {
        fileName = originalFileName;
      } else {
        // Generate a name based on media type and timestamp
        const ext = getExtensionFromMimeType(downloadedMimeType);
        fileName = `whatsapp_${Date.now()}${ext ? '.' + ext : ''}`;
      }
    } else {
      // Ensure file name has extension if not present
      const ext = getExtensionFromMimeType(downloadedMimeType);
      if (ext && !fileName.toLowerCase().endsWith('.' + ext)) {
        fileName = `${fileName}.${ext}`;
      }
    }

    // Step 2.5: Resolve folder ID if folder name is specified
    let folderId: string | null = null;
    if (folderName) {
      folderId = await resolveFileFolderRoute(db, whatsappNumber.userId, folderName);
      if (!folderId) {
        logger.warn(
          {
            messageId: message.id,
            folderName,
            userId: whatsappNumber.userId,
          },
          'Specified folder not found, saving to uncategorized'
        );
      }
    }

    // Step 3: Upload to R2
    const uploadResult = await uploadToR2(
      buffer,
      fileName,
      downloadedMimeType,
      whatsappNumber.userId
    );

    logger.info(
      {
        messageId: message.id,
        fileKey: uploadResult.key,
        fileName,
      },
      'File uploaded to R2 successfully'
    );

    // Step 4: Create file record in database
    const fileId = `${whatsappNumber.userId}_${Date.now()}_${fileName}`;
    const fileExtension = getExtensionFromMimeType(downloadedMimeType);
    
    const file = await createUserFile(db, {
      userId: whatsappNumber.userId,
      title: fileName.replace(/\.[^/.]+$/, ''), // Remove extension for title
      folderId: folderId, // Use resolved folder ID or null for uncategorized
      fileName: fileName,
      fileType: downloadedMimeType,
      fileSize: buffer.length,
      fileExtension: fileExtension || undefined,
      cloudflareId: fileId,
      cloudflareKey: uploadResult.key,
      cloudflareUrl: uploadResult.url,
      thumbnailUrl: uploadResult.thumbnailUrl,
    });

    logger.info(
      {
        messageId: message.id,
        fileId: file.id,
        fileName,
      },
      'File record created successfully'
    );

    // Step 5: Send confirmation message
    const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
    const folderInfo = folderId && folderName ? `\n📁 *Folder:* ${folderName}` : '';
    await whatsappService.sendTextMessage(
      message.from,
      `✅️ *New File Added*\nFile: PDF\nName: ${file.title}`
    );

    await logOutgoingWhatsAppMessage(db, {
      whatsappNumberId: whatsappNumber.id,
      userId: whatsappNumber.userId,
      messageType: 'text',
      messageContent: `File saved: ${file.title}`,
    });

  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        messageId: message.id,
        senderPhone: message.from,
        mediaId: mediaData.id,
      },
      'Failed to process media message'
    );

    try {
      await whatsappService.sendTextMessage(
        message.from,
        "I'm sorry, I encountered an error saving your file. Please try again or upload it through the web interface."
      );
    } catch (sendError) {
      logger.error(
        {
          error: sendError,
          senderPhone: message.from,
        },
        'Failed to send error message to user'
      );
    }
  }
}


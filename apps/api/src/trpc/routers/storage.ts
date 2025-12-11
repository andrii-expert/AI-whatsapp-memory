import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserFiles,
  getUserFileById,
  createUserFile,
  updateUserFile,
  deleteUserFile,
  getUserFilesCount,
  getUserStorageUsed,
  getUserFileFolders,
  createUserFileFolder,
  updateUserFileFolder,
  deleteUserFileFolder,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// File schemas
const createFileSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  folderId: z.string().uuid().nullable().optional(),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().positive(),
  fileExtension: z.string().optional(),
  cloudflareId: z.string().min(1),
  cloudflareKey: z.string().optional(), // R2 object key
  cloudflareUrl: z.string().min(1), // Allow data URLs too
  thumbnailUrl: z.string().optional(),
});

const updateFileSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  folderId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().optional(),
});

const folderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(100),
});

const updateFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
});

export const storageRouter = createTRPCRouter({
  // Folders (single depth)
  folders: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
      return getUserFileFolders(db, session.user.id);
    }),

    create: protectedProcedure
      .input(folderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        logger.info({ userId: session.user.id, name: input.name }, "Creating storage folder");
        const folder = await createUserFileFolder(db, { userId: session.user.id, name: input.name });
        return folder;
      }),

    update: protectedProcedure
      .input(updateFolderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        const { id, ...data } = input;
        const folder = await updateUserFileFolder(db, id, session.user.id, data);
        if (!folder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
        }
        return folder;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx: { db, session }, input }) => {
        await deleteUserFileFolder(db, input.id, session.user.id);
        return { success: true };
      }),
  }),

  // Get all user files
  list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getUserFiles(db, session.user.id);
  }),

  // Get single file
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const file = await getUserFileById(db, input.id, session.user.id);
      
      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      return file;
    }),

  // Create file record (after Cloudflare upload)
  create: protectedProcedure
    .input(createFileSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, fileName: input.fileName }, "Creating file record");
      
      const file = await createUserFile(db, {
        userId: session.user.id,
        ...input,
      });

      logger.info({ userId: session.user.id, fileId: file.id }, "File record created");
      return file;
    }),

  // Update file metadata
  update: protectedProcedure
    .input(updateFileSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const { id, ...data } = input;
      
      logger.info({ userId: session.user.id, fileId: id }, "Updating file");
      
      const file = await updateUserFile(db, id, session.user.id, data);
      
      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      logger.info({ userId: session.user.id, fileId: id }, "File updated");
      return file;
    }),

  // Delete file
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, fileId: input.id }, "Deleting file");
      
      const file = await deleteUserFile(db, input.id, session.user.id);
      
      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }
      
      logger.info({ userId: session.user.id, fileId: input.id, cloudflareKey: file.cloudflareKey }, "File deleted");
      return { 
        success: true, 
        cloudflareId: file.cloudflareId,
        cloudflareKey: file.cloudflareKey,
      };
    }),

  // Get storage stats
  stats: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    const [filesCount, storageUsed] = await Promise.all([
      getUserFilesCount(db, session.user.id),
      getUserStorageUsed(db, session.user.id),
    ]);

    return {
      filesCount,
      storageUsed,
      storageUsedMB: Math.round(storageUsed / (1024 * 1024) * 100) / 100,
    };
  }),

  // Get upload URL (for direct Cloudflare upload)
  getUploadUrl: protectedProcedure
    .input(z.object({
      fileName: z.string().min(1),
      fileType: z.string().min(1),
    }))
    .mutation(async ({ ctx: { session }, input }) => {
      // Generate a unique file key
      const timestamp = Date.now();
      const sanitizedFileName = input.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileKey = `${session.user.id}/${timestamp}-${sanitizedFileName}`;
      
      // For Cloudflare Images API or R2, you would generate a signed upload URL here
      // For now, we'll return the file key and let the client upload directly
      
      return {
        fileKey,
        uploadUrl: null, // Would be a signed URL for direct upload
      };
    }),
});


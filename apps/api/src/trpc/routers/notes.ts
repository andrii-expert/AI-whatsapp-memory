import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserNoteFolders,
  getNoteFolderById,
  createNoteFolder,
  updateNoteFolder,
  deleteNoteFolder,
  getUserNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Folder schemas
const createNoteFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(100),
  parentId: z.string().uuid().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const updateNoteFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
  sharedWith: z.array(z.string()).optional(),
});

// Note schemas
const createNoteSchema = z.object({
  folderId: z.string().uuid().optional(),
  title: z.string().min(1, "Note title is required").max(500),
  content: z.string().optional(),
});

const updateNoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().optional(),
});

const getNotesSchema = z.object({
  folderId: z.string().uuid().optional(),
});

export const notesRouter = createTRPCRouter({
  // ============================================
  // Folder Endpoints
  // ============================================
  
  folders: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
      return getUserNoteFolders(db, session.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx: { db, session }, input }) => {
        const folder = await getNoteFolderById(db, input.id, session.user.id);
        
        if (!folder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Folder not found",
          });
        }

        return folder;
      }),

    create: protectedProcedure
      .input(createNoteFolderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        logger.info({ userId: session.user.id, folderName: input.name }, "Creating note folder");
        
        const folder = await createNoteFolder(db, {
          userId: session.user.id,
          ...input,
        });

        logger.info({ userId: session.user.id, folderId: folder.id }, "Note folder created");
        return folder;
      }),

    update: protectedProcedure
      .input(updateNoteFolderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        const { id, ...data } = input;
        
        logger.info({ userId: session.user.id, folderId: id }, "Updating note folder");
        
        const folder = await updateNoteFolder(db, id, session.user.id, data);
        
        if (!folder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Folder not found",
          });
        }

        logger.info({ userId: session.user.id, folderId: id }, "Note folder updated");
        return folder;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx: { db, session }, input }) => {
        logger.info({ userId: session.user.id, folderId: input.id }, "Deleting note folder");
        
        await deleteNoteFolder(db, input.id, session.user.id);
        
        logger.info({ userId: session.user.id, folderId: input.id }, "Note folder deleted");
        return { success: true };
      }),
  }),

  // ============================================
  // Note Endpoints
  // ============================================
  
  list: protectedProcedure
    .input(getNotesSchema.optional())
    .query(async ({ ctx: { db, session }, input }) => {
      return getUserNotes(db, session.user.id, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const note = await getNoteById(db, input.id, session.user.id);
      
      if (!note) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Note not found",
        });
      }

      return note;
    }),

  create: protectedProcedure
    .input(createNoteSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, noteTitle: input.title }, "Creating note");
      
      const note = await createNote(db, {
        userId: session.user.id,
        ...input,
      });

      logger.info({ userId: session.user.id, noteId: note.id }, "Note created");
      return note;
    }),

  update: protectedProcedure
    .input(updateNoteSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const { id, ...data } = input;
      
      logger.info({ userId: session.user.id, noteId: id }, "Updating note");
      
      const note = await updateNote(db, id, session.user.id, data);
      
      if (!note) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Note not found",
        });
      }

      logger.info({ userId: session.user.id, noteId: id }, "Note updated");
      return note;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, noteId: input.id }, "Deleting note");
      
      await deleteNote(db, input.id, session.user.id);
      
      logger.info({ userId: session.user.id, noteId: input.id }, "Note deleted");
      return { success: true };
    }),
});


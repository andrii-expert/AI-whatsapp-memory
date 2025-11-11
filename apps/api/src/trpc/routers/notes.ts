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
  getUserSubscription,
  getPlanById,
  getPlanLimits,
  getPlanTier,
  getUpgradeMessage,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Middleware to check if user has notes access
const notesAccessProcedure = protectedProcedure.use(async (opts) => {
  const { session, db } = opts.ctx;

  // Get user's subscription
  const subscription = await getUserSubscription(db, session.user.id);
  
  if (!subscription) {
    logger.warn(
      { userId: session.user.id },
      "User attempted to access notes without a subscription"
    );
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Notes feature requires an active subscription. Please upgrade to Gold plan.",
    });
  }

  // Get the plan details
  const plan = await getPlanById(db, subscription.plan);
  
  if (!plan) {
    logger.error(
      { userId: session.user.id, planId: subscription.plan },
      "Plan not found for user subscription"
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to verify subscription plan",
    });
  }

  // Check if the plan has notes access using the plan limits utility
  const planLimits = getPlanLimits(plan.metadata as Record<string, unknown> | null);
  const currentTier = getPlanTier(plan.metadata as Record<string, unknown> | null);
  
  if (!planLimits.hasNotes) {
    const upgradeMessage = getUpgradeMessage('notes', currentTier);
    logger.warn(
      { userId: session.user.id, plan: subscription.plan, tier: currentTier },
      "User attempted to access notes without proper plan"
    );
    throw new TRPCError({
      code: "FORBIDDEN",
      message: upgradeMessage,
    });
  }

  logger.info(
    { userId: session.user.id, plan: subscription.plan, tier: currentTier },
    "Notes access granted"
  );

  return opts.next({
    ctx: {
      session,
      db,
    },
  });
});

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
    list: notesAccessProcedure.query(async ({ ctx: { db, session } }) => {
      return getUserNoteFolders(db, session.user.id);
    }),

    get: notesAccessProcedure
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

    create: notesAccessProcedure
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

    update: notesAccessProcedure
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

    delete: notesAccessProcedure
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
  
  list: notesAccessProcedure
    .input(getNotesSchema.optional())
    .query(async ({ ctx: { db, session }, input }) => {
      return getUserNotes(db, session.user.id, input);
    }),

  get: notesAccessProcedure
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

  create: notesAccessProcedure
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

  update: notesAccessProcedure
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

  delete: notesAccessProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, noteId: input.id }, "Deleting note");
      
      await deleteNote(db, input.id, session.user.id);
      
      logger.info({ userId: session.user.id, noteId: input.id }, "Note deleted");
      return { success: true };
    }),
});


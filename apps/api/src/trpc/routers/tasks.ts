import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserFolders,
  getFolderById,
  createFolder,
  updateFolder,
  deleteFolder,
  getUserTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskStatus,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Folder schemas
const createFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(100),
  parentId: z.string().uuid().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const updateFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

// Task schemas
const createTaskSchema = z.object({
  folderId: z.string().uuid().optional(),
  title: z.string().min(1, "Task title is required").max(500),
  description: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
  status: z.enum(["open", "completed", "archived"]).optional(),
});

const updateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").nullable().optional(),
  status: z.enum(["open", "completed", "archived"]).optional(),
  sortOrder: z.number().optional(),
});

const getTasksSchema = z.object({
  folderId: z.string().uuid().optional(),
  status: z.enum(["open", "completed", "archived"]).optional(),
});

export const tasksRouter = createTRPCRouter({
  // ============================================
  // Folder Endpoints
  // ============================================
  
  folders: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
      return getUserFolders(db, session.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx: { db, session }, input }) => {
        const folder = await getFolderById(db, input.id, session.user.id);
        
        if (!folder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Folder not found",
          });
        }

        return folder;
      }),

    create: protectedProcedure
      .input(createFolderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        logger.info({ userId: session.user.id, folderName: input.name }, "Creating task folder");
        
        const folder = await createFolder(db, {
          userId: session.user.id,
          ...input,
        });

        logger.info({ userId: session.user.id, folderId: folder.id }, "Task folder created");
        return folder;
      }),

    update: protectedProcedure
      .input(updateFolderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        const { id, ...data } = input;
        
        logger.info({ userId: session.user.id, folderId: id }, "Updating task folder");
        
        const folder = await updateFolder(db, id, session.user.id, data);
        
        if (!folder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Folder not found",
          });
        }

        logger.info({ userId: session.user.id, folderId: id }, "Task folder updated");
        return folder;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx: { db, session }, input }) => {
        logger.info({ userId: session.user.id, folderId: input.id }, "Deleting task folder");
        
        await deleteFolder(db, input.id, session.user.id);
        
        logger.info({ userId: session.user.id, folderId: input.id }, "Task folder deleted");
        return { success: true };
      }),
  }),

  // ============================================
  // Task Endpoints
  // ============================================
  
  list: protectedProcedure
    .input(getTasksSchema.optional())
    .query(async ({ ctx: { db, session }, input }) => {
      return getUserTasks(db, session.user.id, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const task = await getTaskById(db, input.id, session.user.id);
      
      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found",
        });
      }

      return task;
    }),

  create: protectedProcedure
    .input(createTaskSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, taskTitle: input.title }, "Creating task");
      
      const task = await createTask(db, {
        userId: session.user.id,
        ...input,
      });

      logger.info({ userId: session.user.id, taskId: task.id }, "Task created");
      return task;
    }),

  update: protectedProcedure
    .input(updateTaskSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const { id, ...data } = input;
      
      logger.info({ userId: session.user.id, taskId: id }, "Updating task");
      
      const task = await updateTask(db, id, session.user.id, data);
      
      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found",
        });
      }

      logger.info({ userId: session.user.id, taskId: id }, "Task updated");
      return task;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, taskId: input.id }, "Deleting task");
      
      await deleteTask(db, input.id, session.user.id);
      
      logger.info({ userId: session.user.id, taskId: input.id }, "Task deleted");
      return { success: true };
    }),

  toggleStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, taskId: input.id }, "Toggling task status");
      
      const task = await toggleTaskStatus(db, input.id, session.user.id);
      
      logger.info({ 
        userId: session.user.id, 
        taskId: input.id, 
        newStatus: task.status 
      }, "Task status toggled");
      
      return task;
    }),
});


import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  createTaskShare,
  getResourceShares,
  getUserShares,
  getSharedWithMe,
  updateSharePermission,
  deleteTaskShare,
  checkTaskAccess,
  checkFolderAccess,
  getSharedResourcesForUser,
  searchUsersForSharing,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Schemas
const createShareSchema = z.object({
  resourceType: z.enum(["task", "task_folder"]),
  resourceId: z.string().uuid(),
  sharedWithUserId: z.string(),
  permission: z.enum(["view", "edit"]),
});

const getResourceSharesSchema = z.object({
  resourceType: z.enum(["task", "task_folder"]),
  resourceId: z.string().uuid(),
});

const updateSharePermissionSchema = z.object({
  shareId: z.string().uuid(),
  permission: z.enum(["view", "edit"]),
});

const deleteShareSchema = z.object({
  shareId: z.string().uuid(),
});

const checkAccessSchema = z.object({
  resourceType: z.enum(["task", "task_folder"]),
  resourceId: z.string().uuid(),
});

const searchUsersSchema = z.object({
  searchTerm: z.string().min(1),
});

export const taskSharingRouter = createTRPCRouter({
  /**
   * Create a new share
   */
  createShare: protectedProcedure
    .input(createShareSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info(
        { 
          userId: session.user.id, 
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          sharedWithUserId: input.sharedWithUserId 
        },
        "Creating task/folder share"
      );

      // Verify user owns the resource
      if (input.resourceType === "task") {
        const access = await checkTaskAccess(db, input.resourceId, session.user.id);
        if (!access.hasAccess || access.permission !== "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to share this task",
          });
        }
      } else {
        const access = await checkFolderAccess(db, input.resourceId, session.user.id);
        if (!access.hasAccess || access.permission !== "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to share this folder",
          });
        }
      }

      // Prevent sharing with self
      if (input.sharedWithUserId === session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot share with yourself",
        });
      }

      const share = await createTaskShare(db, {
        ownerId: session.user.id,
        ...input,
      });

      logger.info(
        { shareId: share.id, userId: session.user.id },
        "Task/folder share created"
      );

      return share;
    }),

  /**
   * Get all shares for a specific resource
   */
  getResourceShares: protectedProcedure
    .input(getResourceSharesSchema)
    .query(async ({ ctx: { db, session }, input }) => {
      // Verify user owns the resource
      if (input.resourceType === "task") {
        const access = await checkTaskAccess(db, input.resourceId, session.user.id);
        if (!access.hasAccess || access.permission !== "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to view shares for this task",
          });
        }
      } else {
        const access = await checkFolderAccess(db, input.resourceId, session.user.id);
        if (!access.hasAccess || access.permission !== "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to view shares for this folder",
          });
        }
      }

      return getResourceShares(
        db,
        input.resourceType,
        input.resourceId,
        session.user.id
      );
    }),

  /**
   * Get all shares created by the current user
   */
  getMyShares: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getUserShares(db, session.user.id);
  }),

  /**
   * Get all resources shared with the current user
   */
  getSharedWithMe: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getSharedResourcesForUser(db, session.user.id);
  }),

  /**
   * Update share permission
   */
  updatePermission: protectedProcedure
    .input(updateSharePermissionSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info(
        { shareId: input.shareId, userId: session.user.id, permission: input.permission },
        "Updating share permission"
      );

      const share = await updateSharePermission(
        db,
        input.shareId,
        session.user.id,
        input.permission
      );

      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Share not found or you don't have permission to update it",
        });
      }

      logger.info(
        { shareId: input.shareId, userId: session.user.id },
        "Share permission updated"
      );

      return share;
    }),

  /**
   * Delete a share
   */
  deleteShare: protectedProcedure
    .input(deleteShareSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info(
        { shareId: input.shareId, userId: session.user.id },
        "Deleting share"
      );

      await deleteTaskShare(db, input.shareId, session.user.id);

      logger.info(
        { shareId: input.shareId, userId: session.user.id },
        "Share deleted"
      );

      return { success: true };
    }),

  /**
   * Check if user has access to a resource
   */
  checkAccess: protectedProcedure
    .input(checkAccessSchema)
    .query(async ({ ctx: { db, session }, input }) => {
      if (input.resourceType === "task") {
        return checkTaskAccess(db, input.resourceId, session.user.id);
      } else {
        return checkFolderAccess(db, input.resourceId, session.user.id);
      }
    }),

  /**
   * Search users by email or phone number
   */
  searchUsers: protectedProcedure
    .input(searchUsersSchema)
    .query(async ({ ctx: { db, session }, input }) => {
      return searchUsersForSharing(db, input.searchTerm, session.user.id);
    }),
});


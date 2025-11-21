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
  getFolderById,
  getUserById,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendFolderShareEmail } from "@api/utils/email";
import { WhatsAppService } from "@imaginecalendar/whatsapp";

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

      // Send notifications (email and WhatsApp) for folder shares only
      if (input.resourceType === "task_folder") {
        try {
          // Get folder details
          const folder = await getFolderById(db, input.resourceId, session.user.id);
          if (!folder) {
            logger.warn({ folderId: input.resourceId }, "Folder not found for share notification");
          } else {
            // Get recipient and sharer user details
            const [recipientUser, sharerUser] = await Promise.all([
              getUserById(db, input.sharedWithUserId),
              getUserById(db, session.user.id),
            ]);

            if (recipientUser && sharerUser) {
              // Send email notification
              if (recipientUser.email && recipientUser.firstName && recipientUser.lastName && sharerUser.firstName && sharerUser.lastName && sharerUser.email) {
                sendFolderShareEmail({
                  to: recipientUser.email,
                  recipientFirstName: recipientUser.firstName,
                  recipientLastName: recipientUser.lastName,
                  sharerFirstName: sharerUser.firstName,
                  sharerLastName: sharerUser.lastName,
                  sharerEmail: sharerUser.email,
                  folderName: folder.name,
                  folderType: 'task',
                  permission: input.permission,
                }).catch(error => {
                  logger.error({ error, recipientUserId: input.sharedWithUserId }, "Failed to send folder share email");
                });
              }

              // Send WhatsApp notification if recipient has verified phone
              if (recipientUser.phone && recipientUser.phoneVerified) {
                try {
                  const whatsappService = new WhatsAppService();
                  const folderTypeLabel = 'Tasks';
                  const permissionLabel = input.permission === 'edit' ? 'edit' : 'view';
                  const message = `📁 *Folder Shared With You*\n\n${sharerUser.firstName || sharerUser.name || 'Someone'} has shared a ${folderTypeLabel} folder "${folder.name}" with you.\n\nYou have *${permissionLabel}* permission.\n\nView it here: ${process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.crackon.ai'}/tasks`;

                  await whatsappService.sendTextMessage(recipientUser.phone, message);
                  logger.info({ recipientUserId: input.sharedWithUserId, phone: recipientUser.phone }, "Folder share WhatsApp notification sent");
                } catch (whatsappError) {
                  logger.error({ error: whatsappError, recipientUserId: input.sharedWithUserId }, "Failed to send folder share WhatsApp notification");
                }
              }
            }
          }
        } catch (notificationError) {
          logger.error({ error: notificationError, shareId: share.id }, "Error sending folder share notifications - non-blocking");
        }
      }

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


import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  createNoteShare,
  getNoteResourceShares,
  getUserNoteShares,
  getSharedNotesForUser,
  updateNoteSharePermission,
  deleteNoteShare,
  checkNoteAccess,
  checkNoteFolderAccess,
  searchUsersForSharing,
  getUserById,
} from "@imaginecalendar/database/queries";
import { getNoteById, getNoteFolderById } from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendShareNotificationEmail } from "@api/utils/email";

// Schemas
const createShareSchema = z.object({
  resourceType: z.enum(["note", "note_folder"]),
  resourceId: z.string().uuid(),
  sharedWithUserId: z.string(),
  permission: z.enum(["view", "edit"]),
});

const getResourceSharesSchema = z.object({
  resourceType: z.enum(["note", "note_folder"]),
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
  resourceType: z.enum(["note", "note_folder"]),
  resourceId: z.string().uuid(),
});

const searchUsersSchema = z.object({
  searchTerm: z.string().min(1),
});

export const noteSharingRouter = createTRPCRouter({
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
        "Creating note/folder share"
      );

      // Verify user owns the resource
      if (input.resourceType === "note") {
        const access = await checkNoteAccess(db, input.resourceId, session.user.id);
        if (!access.hasAccess || access.permission !== "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to share this note",
          });
        }
      } else {
        const access = await checkNoteFolderAccess(db, input.resourceId, session.user.id);
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

      const share = await createNoteShare(db, {
        ownerId: session.user.id,
        ...input,
      });

      logger.info(
        { shareId: share.id, userId: session.user.id },
        "Note/folder share created"
      );

      // Send email notification to the shared user
      try {
        // Get recipient user details
        const recipientUser = await getUserById(db, input.sharedWithUserId);
        
        // Get owner user details
        const ownerUser = await getUserById(db, session.user.id);
        
        // Get resource name (note or folder)
        let resourceName = "Unknown";
        if (input.resourceType === "note") {
          const note = await getNoteById(db, input.resourceId, session.user.id);
          resourceName = note?.title || "Untitled Note";
        } else {
          const folder = await getNoteFolderById(db, input.resourceId, session.user.id);
          resourceName = folder?.name || "Untitled Folder";
        }

        // Send email if recipient has email and name
        if (
          recipientUser?.email &&
          recipientUser?.firstName &&
          recipientUser?.lastName &&
          ownerUser?.firstName &&
          ownerUser?.lastName
        ) {
          sendShareNotificationEmail({
            to: recipientUser.email,
            recipientFirstName: recipientUser.firstName,
            recipientLastName: recipientUser.lastName,
            ownerFirstName: ownerUser.firstName,
            ownerLastName: ownerUser.lastName,
            resourceType: input.resourceType,
            resourceName,
            permission: input.permission,
          })
            .then((result) => {
              if (result && result.id) {
                logger.info({
                  shareId: share.id,
                  recipientEmail: recipientUser.email,
                  emailId: result.id,
                  resourceType: input.resourceType,
                  resourceName,
                }, '[SHARE_NOTIFICATION_EMAIL] Share notification email sent successfully');
              } else {
                logger.warn({
                  shareId: share.id,
                  recipientEmail: recipientUser.email,
                  resourceType: input.resourceType,
                  resourceName,
                }, '[SHARE_NOTIFICATION_EMAIL] Share notification email returned null result');
              }
            })
            .catch((error) => {
              logger.error({
                error: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                shareId: share.id,
                recipientEmail: recipientUser.email,
                resourceType: input.resourceType,
                resourceName,
              }, '[SHARE_NOTIFICATION_EMAIL] Failed to send share notification email');
            });
        } else {
          logger.warn({
            shareId: share.id,
            hasRecipientEmail: !!recipientUser?.email,
            hasRecipientFirstName: !!recipientUser?.firstName,
            hasRecipientLastName: !!recipientUser?.lastName,
            hasOwnerFirstName: !!ownerUser?.firstName,
            hasOwnerLastName: !!ownerUser?.lastName,
          }, '[SHARE_NOTIFICATION_EMAIL] Skipping share notification email - missing user data');
        }
      } catch (emailError) {
        logger.error({
          error: emailError instanceof Error ? emailError.message : String(emailError),
          shareId: share.id,
          userId: session.user.id,
        }, '[SHARE_NOTIFICATION_EMAIL] Error attempting to send share notification email');
        // Don't fail the share creation if email fails
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
      if (input.resourceType === "note") {
        const access = await checkNoteAccess(db, input.resourceId, session.user.id);
        if (!access.hasAccess || access.permission !== "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to view shares for this note",
          });
        }
      } else {
        const access = await checkNoteFolderAccess(db, input.resourceId, session.user.id);
        if (!access.hasAccess || access.permission !== "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to view shares for this folder",
          });
        }
      }

      return getNoteResourceShares(
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
    return getUserNoteShares(db, session.user.id);
  }),

  /**
   * Get all resources shared with the current user
   */
  getSharedWithMe: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getSharedNotesForUser(db, session.user.id);
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

      const share = await updateNoteSharePermission(
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

      await deleteNoteShare(db, input.shareId, session.user.id);

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
      if (input.resourceType === "note") {
        return checkNoteAccess(db, input.resourceId, session.user.id);
      } else {
        return checkNoteFolderAccess(db, input.resourceId, session.user.id);
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


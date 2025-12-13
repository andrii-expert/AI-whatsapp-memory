import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  createAddressShare,
  getAddressResourceShares,
  getAddressSharesGiven,
  getAddressSharedWithMe,
  updateAddressSharePermission,
  deleteAddressShare,
  checkAddressAccess,
  checkAddressFolderAccess,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Schemas
const createShareSchema = z.object({
  resourceType: z.enum(["address", "address_folder"]),
  resourceId: z.string().uuid(),
  sharedWithUserId: z.string(),
  permission: z.enum(["view", "edit"]),
});

const getResourceSharesSchema = z.object({
  resourceType: z.enum(["address", "address_folder"]),
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
  resourceType: z.enum(["address", "address_folder"]),
  resourceId: z.string().uuid(),
});

export const addressSharingRouter = createTRPCRouter({
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
        "Creating address/folder share"
      );

      // Verify user owns the resource
      if (input.resourceType === "address") {
        const access = await checkAddressAccess(db, input.resourceId, session.user.id);
        if (!access.hasAccess || access.permission !== "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to share this address",
          });
        }
      } else {
        const access = await checkAddressFolderAccess(db, input.resourceId, session.user.id);
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

      const share = await createAddressShare(db, {
        ownerId: session.user.id,
        sharedWithUserId: input.sharedWithUserId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        permission: input.permission,
      });

      logger.info({ userId: session.user.id, shareId: share.id }, "Address/folder share created");
      return share;
    }),

  /**
   * Get all shares for a resource
   */
  getResourceShares: protectedProcedure
    .input(getResourceSharesSchema)
    .query(async ({ ctx: { db, session }, input }) => {
      return getAddressResourceShares(
        db,
        input.resourceType,
        input.resourceId,
        session.user.id
      );
    }),

  /**
   * Get all shares given by the user
   */
  getMyShares: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getAddressSharesGiven(db, session.user.id);
  }),

  /**
   * Get all addresses and folders shared with the user
   */
  getSharedWithMe: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getAddressSharedWithMe(db, session.user.id);
  }),

  /**
   * Update share permission
   */
  updateSharePermission: protectedProcedure
    .input(updateSharePermissionSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const share = await updateAddressSharePermission(
        db,
        input.shareId,
        session.user.id,
        input.permission
      );

      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Share not found",
        });
      }

      return share;
    }),

  /**
   * Delete a share
   */
  deleteShare: protectedProcedure
    .input(deleteShareSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const share = await deleteAddressShare(db, input.shareId, session.user.id);

      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Share not found",
        });
      }

      return { success: true };
    }),

  /**
   * Check access to a resource
   */
  checkAccess: protectedProcedure
    .input(checkAccessSchema)
    .query(async ({ ctx: { db, session }, input }) => {
      if (input.resourceType === "address") {
        return checkAddressAccess(db, input.resourceId, session.user.id);
      } else {
        return checkAddressFolderAccess(db, input.resourceId, session.user.id);
      }
    }),
});


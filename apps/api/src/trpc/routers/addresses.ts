import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
  getUserAddressFolders,
  createAddressFolder,
  updateAddressFolder,
  deleteAddressFolder,
  searchUsersByEmailOrPhone,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Helper to transform empty strings to null for optional UUID fields
// Handles: empty string -> null, valid UUID -> pass through, null/undefined -> pass through
const nullableUuidSchema = z.preprocess(
  (val) => {
    if (val === "" || val === undefined) return null;
    return val;
  },
  z.union([
    z.string().uuid(),
    z.null(),
  ]).optional()
);

// Helper to transform empty strings to null for optional string fields
// Handles: empty string -> null, valid string -> pass through, null/undefined -> pass through
const nullableStringSchema = z.preprocess(
  (val) => {
    if (val === "" || val === undefined) return null;
    return val;
  },
  z.union([
    z.string(),
    z.null(),
  ]).optional()
);

// Address schemas
const createAddressSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  folderId: nullableUuidSchema,
  connectedUserId: nullableStringSchema,
});

const updateAddressSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  folderId: nullableUuidSchema,
  connectedUserId: nullableStringSchema,
});

const folderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(100),
});

const updateFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
});

export const addressesRouter = createTRPCRouter({
  // Folders (single depth)
  folders: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
      return getUserAddressFolders(db, session.user.id);
    }),

    create: protectedProcedure
      .input(folderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        logger.info({ userId: session.user.id, name: input.name }, "Creating address folder");
        const folder = await createAddressFolder(db, { userId: session.user.id, name: input.name });
        return folder;
      }),

    update: protectedProcedure
      .input(updateFolderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        const { id, ...data } = input;
        const folder = await updateAddressFolder(db, id, session.user.id, data);
        if (!folder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
        }
        return folder;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx: { db, session }, input }) => {
        await deleteAddressFolder(db, input.id, session.user.id);
        return { success: true };
      }),
  }),

  // Get all user addresses
  list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getUserAddresses(db, session.user.id);
  }),

  // Get single address
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const address = await getAddressById(db, input.id, session.user.id);
      
      if (!address) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Address not found",
        });
      }

      return address;
    }),

  // Create address
  create: protectedProcedure
    .input(createAddressSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, name: input.name }, "Creating address");
      
      const address = await createAddress(db, {
        userId: session.user.id,
        ...input,
      });

      logger.info({ userId: session.user.id, addressId: address.id }, "Address created");
      return address;
    }),

  // Update address
  update: protectedProcedure
    .input(updateAddressSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const { id, ...data } = input;
      
      logger.info({ userId: session.user.id, addressId: id }, "Updating address");
      
      const address = await updateAddress(db, id, session.user.id, data);
      
      if (!address) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Address not found",
        });
      }

      logger.info({ userId: session.user.id, addressId: id }, "Address updated");
      return address;
    }),

  // Delete address
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, addressId: input.id }, "Deleting address");
      
      const address = await deleteAddress(db, input.id, session.user.id);
      
      if (!address) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Address not found",
        });
      }
      
      logger.info({ userId: session.user.id, addressId: input.id }, "Address deleted");
      return { success: true };
    }),

  // Search users by email or phone
  searchUsers: protectedProcedure
    .input(z.object({ searchTerm: z.string().min(1) }))
    .query(async ({ ctx: { db, session }, input }) => {
      return searchUsersByEmailOrPhone(db, input.searchTerm, session.user.id);
    }),
});


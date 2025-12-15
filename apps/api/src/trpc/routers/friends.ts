import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserFriends,
  getFriendById,
  createFriend,
  updateFriend,
  deleteFriend,
  getUserFriendFolders,
  createFriendFolder,
  updateFriendFolder,
  deleteFriendFolder,
  searchUsersByEmailOrPhoneForFriends,
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

// Friend schemas
const createFriendSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  folderId: nullableUuidSchema,
  connectedUserId: nullableStringSchema,
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  addressType: z.enum(["home", "office", "parents_house"]).optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const updateFriendSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  folderId: nullableUuidSchema,
  connectedUserId: nullableStringSchema,
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  addressType: z.enum(["home", "office", "parents_house"]).optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const folderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(100),
});

const updateFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
});

export const friendsRouter = createTRPCRouter({
  // Folders (single depth)
  folders: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
      return getUserFriendFolders(db, session.user.id);
    }),

    create: protectedProcedure
      .input(folderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        logger.info({ userId: session.user.id, name: input.name }, "Creating friend folder");
        const folder = await createFriendFolder(db, { userId: session.user.id, name: input.name });
        return folder;
      }),

    update: protectedProcedure
      .input(updateFolderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        const { id, ...data } = input;
        const folder = await updateFriendFolder(db, id, session.user.id, data);
        if (!folder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
        }
        return folder;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx: { db, session }, input }) => {
        await deleteFriendFolder(db, input.id, session.user.id);
        return { success: true };
      }),
  }),

  // Get all user friends
  list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getUserFriends(db, session.user.id);
  }),

  // Get single friend
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const friend = await getFriendById(db, input.id, session.user.id);
      
      if (!friend) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Friend not found",
        });
      }

      return friend;
    }),

  // Create friend
  create: protectedProcedure
    .input(createFriendSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, name: input.name }, "Creating friend");
      
      const friend = await createFriend(db, {
        userId: session.user.id,
        ...input,
      });

      logger.info({ userId: session.user.id, friendId: friend.id }, "Friend created");
      return friend;
    }),

  // Update friend
  update: protectedProcedure
    .input(updateFriendSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const { id, ...data } = input;
      
      logger.info({ userId: session.user.id, friendId: id }, "Updating friend");
      
      const friend = await updateFriend(db, id, session.user.id, data);
      
      if (!friend) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Friend not found",
        });
      }

      logger.info({ userId: session.user.id, friendId: id }, "Friend updated");
      return friend;
    }),

  // Delete friend
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, friendId: input.id }, "Deleting friend");
      
      const friend = await deleteFriend(db, input.id, session.user.id);
      
      if (!friend) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Friend not found",
        });
      }
      
      logger.info({ userId: session.user.id, friendId: input.id }, "Friend deleted");
      return { success: true };
    }),

  // Search users by email or phone
  searchUsers: protectedProcedure
    .input(z.object({ searchTerm: z.string().min(1) }))
    .query(async ({ ctx: { db, session }, input }) => {
      return searchUsersByEmailOrPhoneForFriends(db, input.searchTerm, session.user.id);
    }),
});

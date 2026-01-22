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
  linkPendingFriendsToUser,
  getUserFriendTags,
} from "@imaginecalendar/database/queries";
import { getUserByEmail, getUserById } from "@imaginecalendar/database/queries";
import { friends } from "@imaginecalendar/database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendInviteEmail } from "@api/utils/email";

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
  tags: z.array(z.string()).optional(),
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
  tags: z.array(z.string()).optional(),
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

  // Get all available tags
  getTags: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getUserFriendTags(db, session.user.id);
  }),

  // Invite friends
  invite: protectedProcedure
    .input(
      z.object({
        friends: z.array(
          z.object({
            name: z.string().min(1, "Name is required"),
            email: z.string().email("Invalid email format"),
          })
        ).min(1, "At least one friend is required"),
      })
    )
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, friendCount: input.friends.length }, "Inviting friends");

      // Get inviter's name
      const inviter = await getUserById(db, session.user.id);
      const inviterName = inviter?.firstName && inviter?.lastName
        ? `${inviter.firstName} ${inviter.lastName}`
        : inviter?.name || "Someone";

      // Check which emails are already registered
      const existingEmails: string[] = [];
      for (const friend of input.friends) {
        const existingUser = await getUserByEmail(db, friend.email.toLowerCase());
        if (existingUser) {
          existingEmails.push(friend.email);
        }
      }

      // If any emails are already registered, throw error
      if (existingEmails.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `The following email${existingEmails.length > 1 ? "s are" : " is"} already registered: ${existingEmails.join(", ")}. Please remove ${existingEmails.length > 1 ? "them" : "it"} from the list.`,
        });
      }

      // Create friend entries for all invited friends (pending status)
      const createdFriends = [];
      for (const friend of input.friends) {
        try {
          // Check if friend already exists with this email for this user
          const existingFriends = await db.query.friends.findMany({
            where: and(
              eq(friends.userId, session.user.id),
              eq(friends.email, friend.email.toLowerCase())
            ),
          });

          // Only create if doesn't exist
          if (existingFriends.length === 0) {
            const newFriend = await createFriend(db, {
              userId: session.user.id,
              name: friend.name,
              email: friend.email.toLowerCase(),
              connectedUserId: null, // Pending until they sign up
            });
            createdFriends.push(newFriend);
            logger.info(
              { userId: session.user.id, friendId: newFriend.id, email: friend.email },
              "Created pending friend entry"
            );
          } else {
            logger.info(
              { userId: session.user.id, email: friend.email },
              "Friend already exists, skipping creation"
            );
          }
        } catch (error) {
          logger.error(
            { userId: session.user.id, email: friend.email, error },
            "Failed to create friend entry"
          );
        }
      }

      // Send invite emails to all friends
      const emailResults = await Promise.allSettled(
        input.friends.map((friend) =>
          sendInviteEmail({
            to: friend.email.toLowerCase(),
            friendName: friend.name,
            inviterName,
          })
        )
      );

      // Log any failures
      emailResults.forEach((result, index) => {
        if (result.status === "rejected") {
          logger.error(
            {
              userId: session.user.id,
              email: input.friends[index]?.email,
              error: result.reason,
            },
            "Failed to send invite email"
          );
        }
      });

      // Check if all emails failed
      const failedCount = emailResults.filter((r) => r.status === "rejected").length;
      if (failedCount === input.friends.length) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send invite emails. Please try again later.",
        });
      }

      // If some succeeded, return success with warning
      if (failedCount > 0) {
        logger.warn(
          {
            userId: session.user.id,
            total: input.friends.length,
            failed: failedCount,
          },
          "Some invite emails failed to send"
        );
      }

      logger.info({ userId: session.user.id, sent: input.friends.length - failedCount, created: createdFriends.length }, "Invite emails sent and friends created");
      return {
        success: true,
        sent: input.friends.length - failedCount,
        total: input.friends.length,
        created: createdFriends.length,
      };
    }),
});

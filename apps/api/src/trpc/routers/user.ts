import { z } from "zod";
import { updateUserSchema } from "@api/schemas/users";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@api/trpc/init";
import {
  deleteUser,
  getUserById,
  updateUser,
} from "@imaginecalendar/database/queries";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getUserById(db, session.user.id);
  }),

  update: protectedProcedure
    .input(updateUserSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      // Only mark phone as unverified if the phone number actually changed
      let updateData = { ...input };
      
      if (input.phone) {
        // Get current user to compare phone numbers
        const currentUser = await getUserById(db, session.user.id);
        const currentPhone = currentUser?.phone;
        
        // Only set phoneVerified to false if the phone number actually changed
        if (currentPhone !== input.phone) {
          updateData = {
            ...updateData,
            phoneVerified: false,
          };
        }
        // If phone didn't change, don't modify phoneVerified - keep existing value
      }
      
      return updateUser(db, session.user.id, updateData);
    }),

  delete: protectedProcedure.mutation(async ({ ctx: { db, session } }) => {
    // Delete user from database and Clerk
    const [data] = await Promise.all([
      deleteUser(db, session.user.id),
      // TODO: Add Clerk user deletion here
      // clerkClient.users.deleteUser(session.user.id),
    ]);

    return data;
  }),

  // Detect timezone from IP address
  detectTimezone: publicProcedure.query(async () => {
    try {
      const response = await fetch("https://worldtimeapi.org/api/ip");
      if (!response.ok) {
        throw new Error("Failed to detect timezone");
      }
      const data = await response.json();
      return {
        timezone: data.timezone || null,
        utcOffset: data.utc_offset || null,
      };
    } catch (error) {
      console.error("Error detecting timezone:", error);
      return {
        timezone: null,
        utcOffset: null,
      };
    }
  }),

  // Get timezone details for a specific timezone
  getTimezoneDetails: publicProcedure
    .input(z.object({ timezone: z.string() }))
    .query(async ({ input }) => {
      try {
        const response = await fetch(`https://worldtimeapi.org/api/timezone/${input.timezone}`);
        if (!response.ok) {
          throw new Error("Failed to get timezone details");
        }
        const data = await response.json();
        return {
          timezone: data.timezone || null,
          utcOffset: data.utc_offset || null,
        };
      } catch (error) {
        console.error("Error getting timezone details:", error);
        return {
          timezone: null,
          utcOffset: null,
        };
      }
    }),
});
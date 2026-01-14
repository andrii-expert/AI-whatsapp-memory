import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { updateUserSchema } from "@api/schemas/users";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@api/trpc/init";
import {
  deleteUser,
  getUserById,
  updateUser,
} from "@imaginecalendar/database/queries";
import { whatsappNumbers } from "@imaginecalendar/database/schema";
import { eq, and, ne } from "drizzle-orm";
import { normalizePhoneNumber } from "@imaginecalendar/database/queries/whatsapp-verification";

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
        // Normalize the phone number
        const normalizedPhone = normalizePhoneNumber(input.phone);
        
        // Get current user to compare phone numbers
        const currentUser = await getUserById(db, session.user.id);
        const currentPhone = currentUser?.phone;
        
        // Check if phone number is actually changing
        if (currentPhone !== normalizedPhone) {
          // Check if this phone number is already in use by another user
          const existingWhatsAppNumber = await db.query.whatsappNumbers.findFirst({
            where: eq(whatsappNumbers.phoneNumber, normalizedPhone),
          });
          
          if (existingWhatsAppNumber && existingWhatsAppNumber.userId !== session.user.id) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'This phone number is already registered to another account. Please use a different number.',
            });
          }
          
          // Only set phoneVerified to false if the phone number actually changed
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
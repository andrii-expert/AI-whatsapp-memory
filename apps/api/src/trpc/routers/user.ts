import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { updateUserSchema } from "@api/schemas/users";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@api/trpc/init";
import {
  deleteUser,
  getUserById,
  updateUser,
  normalizePhoneNumber,
} from "@imaginecalendar/database/queries";
import { whatsappNumbers } from "@imaginecalendar/database/schema";
import { eq, and, ne } from "drizzle-orm";

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
        // Validate phone number is not empty
        const trimmedPhone = input.phone.trim();
        if (!trimmedPhone) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Phone number cannot be empty.',
          });
        }

        // Normalize the phone number
        const normalizedPhone = normalizePhoneNumber(trimmedPhone);
        
        // Validate normalized phone number is valid (at least 8 characters including +)
        if (!normalizedPhone || normalizedPhone === '+' || normalizedPhone.length < 8) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid phone number format. Please enter a valid phone number.',
          });
        }
        
        // Get current user to compare phone numbers
        const currentUser = await getUserById(db, session.user.id);
        if (!currentUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found.',
          });
        }
        
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
            phone: normalizedPhone,
            phoneVerified: false,
          };
        } else {
          // Phone didn't change, but ensure we use normalized version
          updateData = {
            ...updateData,
            phone: normalizedPhone,
          };
        }
        // If phone didn't change, don't modify phoneVerified - keep existing value
      }
      
      try {
        return await updateUser(db, session.user.id, updateData);
      } catch (error) {
        console.error('Error updating user:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update user. Please try again.',
        });
      }
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
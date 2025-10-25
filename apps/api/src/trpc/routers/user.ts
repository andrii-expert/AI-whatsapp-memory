import { updateUserSchema } from "@api/schemas/users";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
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
      // If phone is being updated, mark it as unverified
      const updateData = {
        ...input,
        ...(input.phone && { phoneVerified: false }),
      };
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
});
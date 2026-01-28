import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import { z } from "zod";
import { getAllUsers, deleteUserAndAllData } from "@imaginecalendar/database/queries";

export const devRouter = createTRPCRouter({
  // Delete all users except the current user (for development/testing only)
  deleteAllUsers: protectedProcedure
    .input(z.object({
      confirmPhrase: z.literal("DELETE ALL USERS"),
      keepCurrentUser: z.boolean().default(true),
    }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      console.log("deleteAllUsers - Starting deletion process");
      
      const currentUserId = session.user.id;
      const deletedUsers = [];
      const errors = [];
      
      try {
        // Get all users from database
        const allUsers = await getAllUsers(db);
        console.log(`Found ${allUsers.length} users in database`);
        
        for (const user of allUsers) {
          // Skip current user if requested
          if (input.keepCurrentUser && user.id === currentUserId) {
            console.log(`Keeping current user: ${user.id}`);
            continue;
          }
          
          try {
            // Delete user and all related data from database
            console.log(`Deleting user data from database: ${user.id}`);
            await deleteUserAndAllData(db, user.id);
            
            deletedUsers.push({
              id: user.id,
              email: user.email,
              name: user.name,
            });
            
            console.log(`Successfully deleted user: ${user.id}`);
          } catch (error) {
            console.error(`Failed to delete user ${user.id}:`, error);
            errors.push({
              userId: user.id,
              email: user.email,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
        
        return {
          success: true,
          deletedCount: deletedUsers.length,
          deletedUsers,
          errors,
          keptCurrentUser: input.keepCurrentUser,
        };
      } catch (error) {
        console.error("deleteAllUsers - Fatal error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete users",
        });
      }
    }),
  
  // Get statistics about users in the system
  getUserStats: protectedProcedure.query(async ({ ctx: { db } }) => {
    const dbUsers = await getAllUsers(db);
    
    return {
      databaseUserCount: dbUsers.length,
      users: dbUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt,
      })),
    };
  }),
});
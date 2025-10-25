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
    .mutation(async ({ ctx: { db, session, c }, input }) => {
      console.log("deleteAllUsers - Starting deletion process");
      
      const clerkClient = c.get('clerk');
      if (!clerkClient) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Clerk client not available",
        });
      }
      
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
            // Delete from Clerk first
            console.log(`Deleting user from Clerk: ${user.id}`);
            await clerkClient.users.deleteUser(user.id);
            
            // Delete related data from database
            console.log(`Deleting user data from database: ${user.id}`);
            
            // Delete user and all related data
            await deleteUserAndAllData(db, user.id);
            
            deletedUsers.push({
              id: user.id,
              email: user.email,
              name: user.name,
            });
            
            console.log(`Successfully deleted user: ${user.id}`);
          } catch (error) {
            console.error(`Failed to delete user ${user.id}:`, error);
            
            // If Clerk deletion failed, user might not exist there
            if (error instanceof Error && error.message.includes("not found")) {
              // Try to delete from database anyway
              try {
                await deleteUserAndAllData(db, user.id);
                
                deletedUsers.push({
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  note: "Deleted from DB only (not in Clerk)",
                });
              } catch (dbError) {
                errors.push({
                  userId: user.id,
                  email: user.email,
                  error: dbError instanceof Error ? dbError.message : "Unknown error",
                });
              }
            } else {
              errors.push({
                userId: user.id,
                email: user.email,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
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
  getUserStats: protectedProcedure.query(async ({ ctx: { db, c } }) => {
    const clerkClient = c.get('clerk');
    
    const dbUsers = await getAllUsers(db);
    let clerkUserCount = 0;
    
    if (clerkClient) {
      try {
        const clerkUsers = await clerkClient.users.getUserList({ limit: 100 });
        clerkUserCount = clerkUsers.totalCount;
      } catch (error) {
        console.error("Failed to get Clerk user count:", error);
      }
    }
    
    return {
      databaseUserCount: dbUsers.length,
      clerkUserCount,
      users: dbUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt,
      })),
    };
  }),
});
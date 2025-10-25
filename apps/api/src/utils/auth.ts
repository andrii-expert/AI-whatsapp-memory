import { getAuth } from "@hono/clerk-auth";
import type { Context } from "hono";

export type Session = {
  user: {
    id: string;
    email: string | null;
  };
};

export async function verifyAccessToken(c: Context): Promise<Session | null> {
  const auth = getAuth(c);
  
  if (!auth?.userId) {
    return null;
  }

  // Get the Clerk client from context if we need full user details
  const clerkClient = c.get('clerk');
  
  try {
    if (clerkClient && auth.userId) {
      console.log("verifyAccessToken - Fetching user with ID:", auth.userId);
      const user = await clerkClient.users.getUser(auth.userId);
      console.log("verifyAccessToken - User fetched successfully");
      return {
        user: {
          id: user.id,
          email: user.emailAddresses[0]?.emailAddress || null,
        }
      };
    }
  } catch (error) {
    console.error("verifyAccessToken - Error fetching user details:", error);
    if (error instanceof Error) {
      console.error("verifyAccessToken - Error message:", error.message);
      console.error("verifyAccessToken - Error stack:", error.stack);
    }
  }

  // Return basic session info if we can't get full details
  console.log("verifyAccessToken - Using fallback with userId:", auth.userId);
  return {
    user: {
      id: auth.userId,
      email: null,
    }
  };
}
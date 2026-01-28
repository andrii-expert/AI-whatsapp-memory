import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "./auth-helpers";
import { logger } from "@imaginecalendar/logger";
import { clerkClient } from "@clerk/backend";

export type Session = {
  user: {
    id: string;
    email: string | null;
  };
};

export async function verifyAccessToken(c: Context): Promise<Session | null> {
  // Get token from Authorization header or cookie
  const authHeader = c.req.header("Authorization");
  const tokenFromHeader = authHeader?.startsWith("Bearer ") 
    ? authHeader.substring(7) 
    : null;
  
  // Try to get cookie - getCookie from hono/cookie should work
  let tokenFromCookie: string | undefined;
  try {
    tokenFromCookie = getCookie(c, "auth-token");
  } catch (error) {
    // If getCookie fails, try reading from raw cookie header
    const cookieHeader = c.req.header("Cookie");
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split("=");
        if (key && value) acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      tokenFromCookie = cookies["auth-token"];
    }
  }
  
  const token = tokenFromHeader || tokenFromCookie;
  
  // Log for debugging (only in development or when token is missing)
  if (!token && process.env.NODE_ENV === "development") {
    const cookieHeader = c.req.header("Cookie");
    logger.debug({
      hasAuthHeader: !!authHeader,
      hasCookieHeader: !!cookieHeader,
      cookieHeaderLength: cookieHeader?.length || 0,
      cookieHeaderPreview: cookieHeader ? cookieHeader.substring(0, 100) : null,
    }, "No auth token found");
  }
  
  if (!token) {
    return null;
  }

  // First, try to verify as our own JWT token
  const payload = verifyToken(token);
  if (payload) {
    return {
      user: {
        id: payload.userId,
        email: payload.email,
      }
    };
  }

  // If not our JWT, try to verify as Clerk token
  // Only attempt Clerk verification if CLERK_SECRET_KEY is set
  if (process.env.CLERK_SECRET_KEY) {
    try {
      const clerk = clerkClient();
      const sessionToken = await clerk.verifyToken(token);
      
      if (sessionToken && sessionToken.sub) {
        // Get user info from Clerk
        const clerkUser = await clerk.users.getUser(sessionToken.sub);
        
        if (clerkUser) {
          return {
            user: {
              id: clerkUser.id, // Clerk user ID is used as the database user ID
              email: clerkUser.emailAddresses[0]?.emailAddress || null,
            }
          };
        }
      }
    } catch (error) {
      // Not a valid Clerk token, or Clerk verification failed
      // This is expected for non-Clerk tokens, so we don't log as error
      logger.debug({ error: error instanceof Error ? error.message : String(error) }, "Clerk token verification failed (expected for non-Clerk tokens)");
    }
  }

  return null;
}
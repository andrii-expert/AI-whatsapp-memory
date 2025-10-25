import { TRPCError, initTRPC } from "@trpc/server";
import type { Context } from "hono";
import superjson from "superjson";
import { getAuth } from "@hono/clerk-auth";
import type { Session } from "../utils/auth";
import { connectDb } from "@imaginecalendar/database/client";
import type { Database } from "@imaginecalendar/database/client";

type TRPCContext = {
  session: Session | null;
  db: Database;
  c: Context;
};

export const createTRPCContext = async (
  _: unknown,
  c: Context,
): Promise<TRPCContext> => {
  console.log("createTRPCContext - Starting context creation");
  
  const auth = getAuth(c);
  console.log("createTRPCContext - Auth from getAuth:", auth);
  console.log("createTRPCContext - Auth userId:", auth?.userId);
  console.log("createTRPCContext - Auth sessionId:", auth?.sessionId);
  
  const db = await connectDb();
  
  let session: Session | null = null;
  
  if (auth?.userId) {
    // Get the Clerk client to fetch user details
    const clerkClient = c.get('clerk');
    let email = auth.sessionClaims?.email as string || null;
    
    // If email not in session claims, fetch from Clerk user
    if (!email && clerkClient) {
      try {
        console.log("createTRPCContext - Fetching user from Clerk for email");
        const clerkUser = await clerkClient.users.getUser(auth.userId);
        email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
        console.log("createTRPCContext - Retrieved email from Clerk:", email);
      } catch (error) {
        console.error("createTRPCContext - Failed to fetch user from Clerk:", error);
      }
    }
    
    session = {
      user: {
        id: auth.userId,
        email: email,
      }
    };
    
    console.log("createTRPCContext - Session created with email:", email);
  }
  
  console.log("createTRPCContext - Final session:", session);
  console.log("createTRPCContext - Returning context with session:", !!session);
  
  return {
    session,
    db,
    c,
  };
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure
  .use(async (opts) => {
    console.log("protectedProcedure - Checking session");
    const { session } = opts.ctx;
    
    console.log("protectedProcedure - Session exists:", !!session);
    if (session) {
      console.log("protectedProcedure - Session user ID:", session.user?.id);
      console.log("protectedProcedure - Session user email:", session.user?.email);
    }

    if (!session) {
      console.log("protectedProcedure - No session found, throwing UNAUTHORIZED");
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    console.log("protectedProcedure - Session valid, proceeding");
    return opts.next({
      ctx: {
        session,
      },
    });
  });
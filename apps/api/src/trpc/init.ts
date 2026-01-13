import { TRPCError, initTRPC } from "@trpc/server";
import type { Context } from "hono";
import superjson from "superjson";
import type { Session } from "../utils/auth";
import { verifyAccessToken } from "../utils/auth";
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
  const db = await connectDb();
  
  // Verify JWT token from cookie or Authorization header
  const session = await verifyAccessToken(c);
  
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
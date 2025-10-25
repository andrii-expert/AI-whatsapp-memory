import { trpcServer } from "@hono/trpc-server";
import { clerkMiddleware } from "@hono/clerk-auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import type { Context } from "./types/context";
import { createTRPCContext } from "./trpc/init";
import { appRouter } from "./trpc/routers/_app";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { getAllVoiceQueues } from "./lib/queues";
import { logger } from "@imaginecalendar/logger";

const app = new Hono<Context>();

// Initialize Bull Board
const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath("/queues");

createBullBoard({
  queues: getAllVoiceQueues().map((queue) => new BullMQAdapter(queue)),
  serverAdapter,
});

logger.info({}, "Bull Board initialized at /queues");

app.use(secureHeaders());

// Bull Board UI - NO AUTH (for easy monitoring)
app.route("/queues", serverAdapter.registerPlugin());

// Apply Clerk authentication middleware (but NOT to /queues)
app.use("*", clerkMiddleware());

app.use(
  "*",
  cors({
    origin: process.env.ALLOWED_API_ORIGINS?.split(",") ?? [
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "accept-language",
      "x-trpc-source",
      "x-user-locale",
      "x-user-timezone",
      "x-user-country",
    ],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: createTRPCContext,
  }),
);

app.get("/health", async (c) => {
  // TODO: Add proper health checks (database connection, etc.)
  return c.json({ status: "ok" }, 200);
});

app.get("/", async (c) => {
  return c.json({
    name: "ImagineCalendar API",
    version: "0.0.1",
    status: "running",
    endpoints: {
      trpc: "/trpc/*",
      health: "/health",
      queues: "/queues (Bull Board UI)",
    },
  });
});

export default {
  port: process.env.PORT ? Number.parseInt(process.env.PORT) : 3002,
  fetch: app.fetch,
  host: "0.0.0.0", // Listen on all interfaces
};
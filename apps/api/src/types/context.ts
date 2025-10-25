import type { Session } from "@api/utils/auth";
import type { Database } from "@imaginecalendar/database/client";

export type Context = {
  Variables: {
    db: Database;
    session: Session;
    // clerk and clerkAuth are automatically added by @hono/clerk-auth module declaration
  };
};
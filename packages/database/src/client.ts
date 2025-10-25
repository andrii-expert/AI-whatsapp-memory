import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn = globalForDb.conn ?? postgres(process.env.DATABASE_URL!, {
  // Add connection logging
  onnotice: (notice) => {
    console.log('[DB NOTICE]:', notice);
  },
});
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { 
  schema,
  logger: true, // Enable query logging in Drizzle
});

export const connectDb = async () => {
  return db;
};

export type Database = typeof db;
import type { Context } from "hono";
import { verifyToken } from "./auth-helpers";

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
  
  const tokenFromCookie = c.req.cookie("auth-token");
  const token = tokenFromHeader || tokenFromCookie;
  
  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  return {
    user: {
      id: payload.userId,
      email: payload.email,
    }
  };
}
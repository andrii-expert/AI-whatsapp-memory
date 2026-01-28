import { cookies } from "next/headers";
import { verifyToken } from "@imaginecalendar/api/utils/auth-helpers";
import { connectDb } from "@imaginecalendar/database/client";
import { getUserById } from "@imaginecalendar/database/queries";

export type AuthUser = {
  id: string;
  email: string | null;
  isAdmin: boolean;
};

/**
 * Get the current authenticated user from JWT token
 * Returns null if not authenticated
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth-token")?.value;

    if (!token) {
      return null;
    }

    const payload = verifyToken(token);
    if (!payload) {
      return null;
    }

    // Get user from database
    const db = await connectDb();
    const user = await getUserById(db, payload.userId);

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin || false,
    };
  } catch (error) {
    console.error("Error getting auth user:", error);
    return null;
  }
}

/**
 * Get JWT token from cookies for API requests
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("auth-token")?.value || null;
  } catch (error) {
    console.error("Error getting auth token:", error);
    return null;
  }
}


import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { getUserByEmail, createUser } from "@imaginecalendar/database/queries";
import { generateToken } from "@api/utils/auth-helpers";
import { logger } from "@imaginecalendar/logger";
import { randomUUID } from "crypto";

const GOOGLE_CLIENT_ID = "360121159847-q96hapdstepeqdb87jt70vvn95jtc48u.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

export async function GET(request: NextRequest) {
  try {
    // Dynamic import to reduce bundle size
    const { google } = await import("googleapis");
    
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Check for OAuth errors
    if (error) {
      logger.error({ error }, "Google OAuth error");
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-in?error=${encodeURIComponent(error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-in?error=missing_code`
      );
    }

    // Verify state
    const storedState = request.cookies.get("google_oauth_state")?.value;
    if (!state || state !== storedState) {
      logger.error({ state, storedState }, "Invalid OAuth state");
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-in?error=invalid_state`
      );
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    if (!userInfo.data.email) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-in?error=no_email`
      );
    }

    const db = await connectDb();
    const email = userInfo.data.email;
    const firstName = userInfo.data.given_name || "";
    const lastName = userInfo.data.family_name || "";
    const name = userInfo.data.name || `${firstName} ${lastName}`.trim();
    const picture = userInfo.data.picture || null;

    // Check if user already exists
    let user = await getUserByEmail(db, email);
    let userId: string;

    if (user) {
      // User exists, log them in
      userId = user.id;
      logger.info({ userId, email }, "Google OAuth login - existing user");
    } else {
      // Create new user
      userId = randomUUID();
      await createUser(db, {
        id: userId,
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        name: name || undefined,
        avatarUrl: picture || undefined,
        emailVerified: true, // Google emails are verified
      });
      logger.info({ userId, email }, "Google OAuth signup - new user created");
    }

    // Generate JWT token
    const token = generateToken({
      userId,
      email,
    });

    // Redirect to dashboard with token in cookie
    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`
    );

    // Set auth token
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    // Clear OAuth state cookie
    response.cookies.delete("google_oauth_state");

    return response;
  } catch (error: any) {
    logger.error({ error }, "Google OAuth callback error");
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-in?error=${encodeURIComponent(error.message || "oauth_error")}`
    );
  }
}


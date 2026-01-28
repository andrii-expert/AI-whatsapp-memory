import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { getUserByEmail, createUser } from "@imaginecalendar/database/queries";
import { generateToken } from "@imaginecalendar/api/utils/auth-helpers";
import { logger } from "@imaginecalendar/logger";
import { randomUUID } from "crypto";

// Force dynamic rendering to avoid bundling googleapis at build time
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GOOGLE_CLIENT_ID = "557470476714-su2iqb4cnmoq2d64trf3d19ddhkqh50m.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

export async function GET(request: NextRequest) {
  try {
    // Dynamic import to avoid bundling at build time
    const { google } = await import("googleapis");
    
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    // Check for OAuth errors
    if (error) {
      logger.error({ error }, "Google OAuth error");
      return NextResponse.redirect(
        `${adminUrl}/sign-in?error=${encodeURIComponent(error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${adminUrl}/sign-in?error=missing_code`
      );
    }

    // Verify state
    const storedState = request.cookies.get("google_oauth_state")?.value;
    if (!state || state !== storedState) {
      logger.error({ state, storedState }, "Invalid OAuth state");
      return NextResponse.redirect(
        `${adminUrl}/sign-in?error=invalid_state`
      );
    }

    const redirectUri = `${adminUrl}/api/auth/google/callback`;

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
        `${adminUrl}/sign-in?error=no_email`
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
    let isNewUser = false;

    if (user) {
      // User exists, check if they are admin
      if (!user.isAdmin) {
        logger.warn({ email }, "Non-admin user attempted to sign in to admin portal");
        return NextResponse.redirect(
          `${adminUrl}/sign-in?error=access_denied`
        );
      }
      userId = user.id;
      logger.info({ userId, email }, "Google OAuth login - existing admin user");
    } else {
      // Create new user (but they won't be admin by default)
      // For admin portal, we should redirect to unauthorized
      userId = randomUUID();
      await createUser(db, {
        id: userId,
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        name: name || undefined,
        avatarUrl: picture || undefined,
        emailVerified: true, // Google emails are verified
        isAdmin: false, // New users are not admins by default
      });
      isNewUser = true;
      logger.info({ userId, email }, "Google OAuth signup - new user created (not admin)");
      
      // Redirect to unauthorized since new users aren't admins
      const token = generateToken({
        userId,
        email,
      });
      
      const response = NextResponse.redirect(`${adminUrl}/unauthorized`);
      response.cookies.set("auth-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
        domain: process.env.NODE_ENV === "production" ? ".crackon.ai" : undefined,
      });
      response.cookies.delete("google_oauth_state");
      return response;
    }
    
    // Generate JWT token
    const token = generateToken({
      userId,
      email,
    });

    // Redirect to dashboard for admin users
    const response = NextResponse.redirect(`${adminUrl}/dashboard`);

    // Set auth token
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
      domain: process.env.NODE_ENV === "production" ? ".crackon.ai" : undefined, // Allow subdomain sharing
    });

    // Clear OAuth state cookie
    response.cookies.delete("google_oauth_state");

    return response;
  } catch (error: any) {
    logger.error({ error }, "Google OAuth callback error");
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    return NextResponse.redirect(
      `${adminUrl}/sign-in?error=${encodeURIComponent(error.message || "oauth_error")}`
    );
  }
}


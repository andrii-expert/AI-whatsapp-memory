import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { getUserByEmail, createUser, updateUserLastLogin } from "@imaginecalendar/database/queries";
import { generateToken } from "@imaginecalendar/api/utils/auth-helpers";
import { logger } from "@imaginecalendar/logger";
import { randomUUID } from "crypto";

// Force dynamic rendering to avoid bundling heavy OAuth clients at build time
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "557470476714-su2iqb4cnmoq2d64trf3d19ddhkqh50m.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "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";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    const adminUrl =
      process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.crackon.ai";

    // Check for OAuth errors
    if (error) {
      logger.error({ error }, "Google OAuth error");
      return NextResponse.redirect(
        `${adminUrl}/sign-in?error=${encodeURIComponent(error)}`,
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${adminUrl}/sign-in?error=missing_code`,
      );
    }

    // Verify state
    const storedState = request.cookies.get("google_oauth_state")?.value;
    const redirectCookie =
      request.cookies.get("google_oauth_redirect")?.value || "/dashboard";
    if (!state || state !== storedState) {
      logger.error({ state, storedState }, "Invalid OAuth state");
      return NextResponse.redirect(
        `${adminUrl}/sign-in?error=invalid_state`,
      );
    }

    const redirectUri = `${adminUrl}/api/auth/google/callback`;

    // Exchange authorization code for tokens via Google's OAuth 2.0 endpoint
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok) {
      logger.error(
        { tokenError: tokenJson },
        "Failed to exchange code for tokens",
      );
      return NextResponse.redirect(
        `${adminUrl}/sign-in?error=oauth_token_error`,
      );
    }

    const accessToken = tokenJson.access_token as string | undefined;

    if (!accessToken) {
      logger.error({ tokenJson }, "No access token returned from Google");
      return NextResponse.redirect(
        `${adminUrl}/sign-in?error=no_access_token`,
      );
    }

    // Fetch user info from Google
    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const userInfo = await userInfoRes.json();

    if (!userInfoRes.ok || !userInfo.email) {
      logger.error(
        { userInfo },
        "Failed to fetch Google user info or missing email",
      );
      return NextResponse.redirect(
        `${adminUrl}/sign-in?error=no_email`,
      );
    }

    const db = await connectDb();
    const email = userInfo.email as string;
    const firstName = (userInfo.given_name as string) || "";
    const lastName = (userInfo.family_name as string) || "";
    const name =
      (userInfo.name as string) || `${firstName} ${lastName}`.trim();
    const picture = (userInfo.picture as string) || null;

    // Check if user already exists
    let user = await getUserByEmail(db, email);
    let userId: string;

    if (user) {
      // User exists, check if they are admin
      if (!user.isAdmin) {
        logger.warn(
          { email },
          "Non-admin user attempted to sign in to admin portal",
        );
        return NextResponse.redirect(
          `${adminUrl}/sign-in?error=access_denied`,
        );
      }
      userId = user.id;
      // Update last login time
      await updateUserLastLogin(db, userId);
      logger.info({ userId, email }, "Google OAuth login - existing admin");
    } else {
      // Create new user (not admin by default)
      userId = randomUUID();
      await createUser(db, {
        id: userId,
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        name: name || undefined,
        avatarUrl: picture || undefined,
        emailVerified: true,
      });
      logger.info({ userId, email }, "Google OAuth signup - new user created");

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
        domain:
          process.env.NODE_ENV === "production" ? ".crackon.ai" : undefined,
      });
      response.cookies.delete("google_oauth_state");
      response.cookies.delete("google_oauth_redirect");
      return response;
    }

    // Generate JWT token for existing admin user
    const token = generateToken({
      userId,
      email,
    });

    // Use the original redirect target if present, otherwise send to dashboard
    const finalRedirect =
      redirectCookie && redirectCookie.startsWith("/")
        ? `${adminUrl}${redirectCookie}`
        : `${adminUrl}/dashboard`;

    logger.info(
      { userId, email, finalRedirect, redirectCookie },
      "Google OAuth callback - redirecting admin user",
    );

    const response = NextResponse.redirect(finalRedirect);

    // Set auth cookie with proper domain for subdomain sharing
    const cookieDomain =
      process.env.NODE_ENV === "production" ? ".crackon.ai" : undefined;

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
      domain: cookieDomain,
    });

    // Clear OAuth state cookies
    response.cookies.delete("google_oauth_state");
    response.cookies.delete("google_oauth_redirect");

    logger.info(
      { userId, email, cookieDomain, finalRedirect },
      "Auth cookie set, redirecting to dashboard",
    );

    return response;
  } catch (error: any) {
    const adminUrl =
      process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.crackon.ai";
    logger.error(
      { error: error?.message || String(error) },
      "Google OAuth callback error",
    );
    return NextResponse.redirect(
      `${adminUrl}/sign-in?error=${encodeURIComponent(
        error.message || "oauth_error",
      )}`,
    );
  }
}


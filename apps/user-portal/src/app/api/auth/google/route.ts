import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

const GOOGLE_CLIENT_ID = "360121159847-q96hapdstepeqdb87jt70vvn95jtc48u.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

// Generate OAuth authorization URL for Google sign-in
export async function GET(request: NextRequest) {
  try {
    // Dynamic import to reduce bundle size
    const { google } = await import("googleapis");
    
    const { searchParams } = new URL(request.url);
    const redirectUri = searchParams.get("redirect_uri") || 
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;

    // Generate state for CSRF protection
    const state = randomBytes(32).toString("hex");

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const scopes = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      state: state,
      prompt: "consent",
    });

    // Store state in cookie for verification
    const response = NextResponse.json({ authUrl, state });
    response.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10, // 10 minutes
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("Failed to generate Google OAuth URL:", error);
    return NextResponse.json(
      { error: "Failed to generate authorization URL" },
      { status: 500 }
    );
  }
}


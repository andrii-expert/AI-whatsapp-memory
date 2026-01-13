import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { google } from "googleapis";

const GOOGLE_CLIENT_ID = "360121159847-q96hapdstepeqdb87jt70vvn95jtc48u.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

// Generate OAuth authorization URL for Google sign-in
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const redirectUri = url.searchParams.get("redirect_uri") || 
      `${process.env.NEXT_PUBLIC_APP_URL || "https://dashboard.crackon.ai"}/api/auth/google/callback`;

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      { 
        error: "Failed to generate authorization URL",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
        stack: process.env.NODE_ENV === "development" ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}


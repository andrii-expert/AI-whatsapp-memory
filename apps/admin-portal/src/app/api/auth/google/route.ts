import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

// Force dynamic rendering to avoid bundling googleapis at build time
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "557470476714-su2iqb4cnmoq2d64trf3d19ddhkqh50m.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "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";

// Generate OAuth authorization URL for Google sign-in
export async function GET(request: NextRequest) {
  try {
    // Dynamic import to avoid bundling at build time
    const { google } = await import("googleapis");
    
    const url = new URL(request.url);
    // Use explicit admin URL if configured, otherwise fallback to production URL
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.crackon.ai";
    const redirectUri =
      url.searchParams.get("redirect_uri") ||
      `${adminUrl}/api/auth/google/callback`;

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("Failed to generate Google OAuth URL:", {
      error: errorMessage,
      stack: errorStack,
      adminUrl: process.env.NEXT_PUBLIC_ADMIN_URL,
    });
    
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


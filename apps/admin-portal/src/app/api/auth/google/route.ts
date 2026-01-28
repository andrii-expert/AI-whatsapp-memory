import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

// Force dynamic rendering to avoid bundling heavy OAuth clients at build time
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "557470476714-su2iqb4cnmoq2d64trf3d19ddhkqh50m.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "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";

// Generate OAuth authorization URL for Google sign-in using direct HTTP parameters (no googleapis dependency)
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const adminUrl =
      process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.crackon.ai";
    const redirectPath = url.searchParams.get("redirect") || "/dashboard";
    const redirectUri =
      url.searchParams.get("redirect_uri") ||
      `${adminUrl}/api/auth/google/callback`;

    // Generate state for CSRF protection
    const state = randomBytes(32).toString("hex");

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    const response = NextResponse.json({ authUrl, state });
    response.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10, // 10 minutes
      path: "/",
    });
    // Remember where to send the user after successful Google sign-in
    response.cookies.set("google_oauth_redirect", redirectPath, {
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
      errorStack,
    });

    return NextResponse.json(
      {
        error: "Failed to generate authorization URL",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
        stack: process.env.NODE_ENV === "development" ? errorStack : undefined,
      },
      { status: 500 },
    );
  }
}


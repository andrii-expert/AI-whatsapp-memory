import { NextRequest, NextResponse } from "next/server";
import { createCalendarProvider } from "@imaginecalendar/calendar-integrations";
import { logger } from "@imaginecalendar/logger";

// Generate OAuth authorization URL
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") as "google" | "microsoft";
    const state = searchParams.get("state");

    if (!provider || !["google", "microsoft"].includes(provider)) {
      return NextResponse.json(
        { error: "Invalid or missing provider parameter" },
        { status: 400 }
      );
    }

    // Use the configured redirect URI from environment variables
    const redirectUri = provider === "google"
      ? process.env.GOOGLE_REDIRECT_URI
      : process.env.MICROSOFT_REDIRECT_URI;

    if (!redirectUri) {
      logger.error({ provider }, "Redirect URI not configured");
      return NextResponse.json(
        { error: `${provider.toUpperCase()}_REDIRECT_URI not configured` },
        { status: 500 }
      );
    }

    logger.info({
      provider,
      redirectUri
    }, "Generating OAuth authorization URL");

    const calendarProvider = createCalendarProvider(provider);
    const authUrl = calendarProvider.getAuthUrl(redirectUri, state || undefined);

    logger.info({ 
      provider,
      authUrlPreview: authUrl.substring(0, 100) + "..." 
    }, "OAuth authorization URL generated");

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    logger.error({ 
      error: error.message 
    }, "Failed to generate OAuth authorization URL");

    return NextResponse.json(
      { error: "Failed to generate authorization URL" },
      { status: 500 }
    );
  }
}
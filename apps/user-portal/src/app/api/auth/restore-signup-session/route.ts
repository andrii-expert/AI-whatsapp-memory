import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { getTemporaryCredentialsByDevice, getUserById } from "@imaginecalendar/database/queries";
import { generateToken } from "@api/utils/auth-helpers";
import { getDeviceFingerprintFromRequest } from "@api/utils/device-fingerprint";
import { logger } from "@imaginecalendar/logger";
import { z } from "zod";

const restoreSessionSchema = z.object({
  deviceFingerprint: z.string().optional(), // Optional - will fallback to server-side generation
});

/**
 * Check if there's a temporary signup session for this device
 * and restore it by auto-logging in the user
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const validated = restoreSessionSchema.parse(body);
    
    // Use client-provided fingerprint or generate from request
    const deviceFingerprint = validated.deviceFingerprint || getDeviceFingerprintFromRequest(req);
    const db = await connectDb();

    // Get temporary credentials by device fingerprint
    const credentials = await getTemporaryCredentialsByDevice(db, deviceFingerprint);

    if (!credentials) {
      return NextResponse.json(
        { hasSession: false },
        { status: 200 }
      );
    }

    // Verify user still exists
    const user = await getUserById(db, credentials.userId);
    if (!user) {
      return NextResponse.json(
        { hasSession: false },
        { status: 200 }
      );
    }

    // Generate token for auto-login
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // Determine redirect URL based on current step
    let redirectUrl = "/verify-email";
    if (credentials.currentStep === "whatsapp") {
      redirectUrl = "/onboarding/whatsapp";
    } else if (credentials.currentStep === "calendar") {
      redirectUrl = "/onboarding/calendar";
    } else if (credentials.currentStep === "billing") {
      redirectUrl = "/onboarding/billing";
    } else if (credentials.currentStep === "verify-email") {
      redirectUrl = "/verify-email";
    }

    // Set cookie
    const response = NextResponse.json(
      {
        hasSession: true,
        userId: user.id,
        email: user.email,
        currentStep: credentials.currentStep,
        redirectUrl,
      },
      { status: 200 }
    );

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
      domain: process.env.NODE_ENV === "production" ? ".crackon.ai" : undefined,
    });

    logger.info(
      { userId: user.id, deviceFingerprint, currentStep: credentials.currentStep },
      "Signup session restored via device fingerprint"
    );

    return response;
  } catch (error) {
    logger.error({ error }, "Error restoring signup session");
    return NextResponse.json(
      { error: "Failed to restore session" },
      { status: 500 }
    );
  }
}


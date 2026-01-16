import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { getTemporaryCredentialsByDevice, getTemporaryCredentialsByUserId, getUserById } from "@imaginecalendar/database/queries";
import { generateToken } from "@api/utils/auth-helpers";
import { getDeviceFingerprintFromRequest, getIpAddressFromRequest } from "@api/utils/device-fingerprint";
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
    const currentIpAddress = getIpAddressFromRequest(req);

    // First, try to get credentials by device fingerprint (exact match)
    let credentials = await getTemporaryCredentialsByDevice(db, deviceFingerprint);

    // If no exact match and we have an IP address, try to find credentials by IP
    // This allows auto-login from different browsers on the same network/device
    if (!credentials && currentIpAddress) {
      // Query all credentials and filter by IP address and expiration
      const allCredentials = await db.query.temporarySignupCredentials.findMany({
        orderBy: (credentials, { desc }) => [desc(credentials.createdAt)],
        limit: 50, // Limit to recent credentials
      });

      // Filter for matching IP, non-expired, and user still in onboarding
      for (const cred of allCredentials) {
        // Skip if expired
        if (cred.expiresAt && cred.expiresAt <= new Date()) {
          continue;
        }

        // Check if IP matches (exact match)
        if (cred.ipAddress && cred.ipAddress === currentIpAddress) {
          const user = await getUserById(db, cred.userId);
          if (user && user.setupStep < 4) {
            // User is still in onboarding, allow auto-login from same IP
            credentials = cred;
            
            // Create/update credentials for this new device fingerprint for faster future lookups
            try {
              const { createTemporarySignupCredentials } = await import("@imaginecalendar/database/queries");
              const userAgent = req.headers.get("user-agent") || undefined;
              
              await createTemporarySignupCredentials(db, {
                userId: cred.userId,
                email: cred.email,
                passwordHash: cred.passwordHash || undefined,
                deviceFingerprint,
                userAgent,
                ipAddress: currentIpAddress,
                currentStep: cred.currentStep,
                stepData: cred.stepData as Record<string, any> | undefined,
              });
              
              logger.info(
                { userId: cred.userId, deviceFingerprint, reason: "Created credentials for new browser" },
                "Temporary credentials created for new browser/device"
              );
            } catch (createError) {
              // Log but don't fail - we already have credentials to use
              logger.error(
                { error: createError, userId: cred.userId },
                "Failed to create credentials for new browser"
              );
            }
            
            logger.info(
              { userId: cred.userId, ipAddress: currentIpAddress, reason: "IP match for user in onboarding" },
              "Signup session found by IP address for user in onboarding"
            );
            break;
          }
        }
      }
    }

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


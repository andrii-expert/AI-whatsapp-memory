import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { updateTemporaryCredentials, getTemporaryCredentialsByUserId, createTemporarySignupCredentials, getUserById } from "@imaginecalendar/database/queries";
import { verifyToken } from "@api/utils/auth-helpers";
import { getDeviceFingerprintFromRequest, getIpAddressFromRequest } from "@api/utils/device-fingerprint";
import { logger } from "@imaginecalendar/logger";
import { z } from "zod";

const updateStepSchema = z.object({
  currentStep: z.string(),
  stepData: z.record(z.any()).optional(),
});

/**
 * Update the current step in temporary signup credentials
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validated = updateStepSchema.parse(body);

    const db = await connectDb();

    // Check if temporary credentials exist for this user
    let existing = await getTemporaryCredentialsByUserId(db, decoded.userId);
    
    // If no temporary credentials exist, create them (user might be in onboarding)
    if (!existing) {
      // Get user to check if they're still in onboarding
      const user = await getUserById(db, decoded.userId);
      if (!user || user.setupStep >= 4) {
        // User completed onboarding, no need for temporary credentials
        return NextResponse.json({ success: true });
      }

      // Create temporary credentials for users still in onboarding
      const deviceFingerprint = getDeviceFingerprintFromRequest(req);
      const userAgent = req.headers.get("user-agent") || undefined;
      const ipAddress = getIpAddressFromRequest(req);

      try {
        await createTemporarySignupCredentials(db, {
          userId: decoded.userId,
          email: user.email,
          // No passwordHash for OAuth users or if not available
          deviceFingerprint,
          userAgent,
          ipAddress,
          currentStep: validated.currentStep,
          stepData: validated.stepData,
        });

        logger.info(
          { userId: decoded.userId, currentStep: validated.currentStep },
          "Temporary signup credentials created during step update"
        );

        return NextResponse.json({ success: true });
      } catch (createError) {
        logger.error(
          { error: createError, userId: decoded.userId },
          "Failed to create temporary credentials during step update"
        );
        // Continue to try updating if creation fails
      }
    }

    // Update the step if credentials exist
    if (existing) {
      await updateTemporaryCredentials(db, decoded.userId, {
        currentStep: validated.currentStep,
        stepData: validated.stepData,
      });
    }

    logger.info(
      { userId: decoded.userId, currentStep: validated.currentStep },
      "Temporary signup credentials step updated"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error updating signup step");
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Validation error" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update step" },
      { status: 500 }
    );
  }
}


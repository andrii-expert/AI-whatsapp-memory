import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { updateTemporaryCredentials, getTemporaryCredentialsByUserId } from "@imaginecalendar/database/queries";
import { verifyToken } from "@api/utils/auth-helpers";
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
    const existing = await getTemporaryCredentialsByUserId(db, decoded.userId);
    if (!existing) {
      // No temporary credentials, that's okay (maybe user already completed signup)
      return NextResponse.json({ success: true });
    }

    // Update the step
    await updateTemporaryCredentials(db, decoded.userId, {
      currentStep: validated.currentStep,
      stepData: validated.stepData,
    });

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


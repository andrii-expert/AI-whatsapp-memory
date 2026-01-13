import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { verifyEmailCode } from "@imaginecalendar/database/queries/email-verification";
import { verifyToken } from "@api/utils/auth-helpers";
import { logger } from "@imaginecalendar/logger";
import { z } from "zod";

const verifySchema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
});

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
    const validated = verifySchema.parse(body);

    const db = await connectDb();
    await verifyEmailCode(db, decoded.userId, validated.code);

    logger.info({ userId: decoded.userId }, "Email verified successfully");

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Email verification error");
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Validation error" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 400 }
    );
  }
}


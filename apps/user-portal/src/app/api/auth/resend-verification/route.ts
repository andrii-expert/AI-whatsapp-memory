import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { resendEmailVerificationCode } from "@imaginecalendar/database/queries";
import { sendEmailVerificationCode } from "@api/utils/email";
import { verifyToken } from "@api/utils/auth-helpers";
import { logger } from "@imaginecalendar/logger";
import { getUserById } from "@imaginecalendar/database/queries";

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

    const db = await connectDb();
    const user = await getUserById(db, decoded.userId);
    
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { error: "Email already verified" },
        { status: 400 }
      );
    }

    const { code } = await resendEmailVerificationCode(db, decoded.userId);

    await sendEmailVerificationCode({
      to: user.email,
      code,
      firstName: user.firstName || undefined,
    });

    logger.info({ userId: decoded.userId }, "Verification code resent");

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Resend verification error");

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resend code" },
      { status: 500 }
    );
  }
}


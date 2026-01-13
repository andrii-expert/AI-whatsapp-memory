import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { getUserByEmail } from "@imaginecalendar/database/queries";
import { verifyPassword, generateToken } from "@api/utils/auth-helpers";
import { z } from "zod";
import { logger } from "@imaginecalendar/logger";

const signinSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = signinSchema.parse(body);

    const db = await connectDb();

    // Get user by email
    const user = await getUserByEmail(db, validated.email);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Check if user has a password (migrated from Clerk)
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "Please reset your password to continue" },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(validated.password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // Set cookie
    const response = NextResponse.json(
      { success: true, userId: user.id },
      { status: 200 }
    );

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    logger.info({ userId: user.id, email: user.email }, "User signed in successfully");

    return response;
  } catch (error) {
    logger.error({ error }, "Signin error");
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Validation error" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


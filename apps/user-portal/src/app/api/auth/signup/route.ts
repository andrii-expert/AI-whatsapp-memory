import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@imaginecalendar/database/client";
import { getUserByEmail, createUser, generateEmailVerificationCode } from "@imaginecalendar/database/queries";
import { sendEmailVerificationCode } from "@api/utils/email";
import { hashPassword, generateToken } from "@api/utils/auth-helpers";
import { z } from "zod";
import { logger } from "@imaginecalendar/logger";
import { randomUUID } from "crypto";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = signupSchema.parse(body);

    const db = await connectDb();

    // Check if user already exists
    const existingUser = await getUserByEmail(db, validated.email);
    if (existingUser) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(validated.password);

    // Create user with setupStep = 1 (WhatsApp setup required)
    const userId = randomUUID();
    await createUser(db, {
      id: userId,
      email: validated.email,
      firstName: validated.firstName,
      lastName: validated.lastName,
      passwordHash: passwordHash,
      emailVerified: false,
      setupStep: 1, // After signup, user must complete WhatsApp setup
    });

    // Generate email verification code
    let code: string | undefined;
    try {
      const result = await generateEmailVerificationCode(db, userId, validated.email);
      code = result.code;

      // Send verification code email
      await sendEmailVerificationCode({
        to: validated.email,
        code,
        firstName: validated.firstName,
      });
    } catch (emailError) {
      // Log but don't fail signup if email verification fails
      logger.error({ error: emailError, userId, email: validated.email }, "Failed to generate/send email verification code");
      // Continue with signup even if email verification fails
    }

    // Generate token
    const token = generateToken({
      userId,
      email: validated.email,
    });

    // Set cookie
    const response = NextResponse.json(
      { success: true, userId, requiresVerification: true },
      { status: 201 }
    );

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
      domain: process.env.NODE_ENV === "production" ? ".crackon.ai" : undefined, // Allow subdomain sharing
    });

    logger.info({ userId, email: validated.email }, "User signed up successfully, verification code sent");

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error({ 
      error: errorMessage,
      errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    }, "Signup error");
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Validation error" },
        { status: 400 }
      );
    }

    // Return more detailed error in development
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}


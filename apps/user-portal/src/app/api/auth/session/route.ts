import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@api/utils/auth-helpers";
import { connectDb } from "@imaginecalendar/database/client";
import { getUserById } from "@imaginecalendar/database/queries";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("auth-token")?.value;
    
    if (!token) {
      return NextResponse.json(
        { isAuthenticated: false, user: null },
        { status: 200 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { isAuthenticated: false, user: null },
        { status: 200 }
      );
    }

    // Get user from database
    const db = await connectDb();
    const user = await getUserById(db, payload.userId);

    if (!user) {
      return NextResponse.json(
        { isAuthenticated: false, user: null },
        { status: 200 }
      );
    }

    return NextResponse.json({
      isAuthenticated: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        setupStep: user.setupStep ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { isAuthenticated: false, user: null },
      { status: 200 }
    );
  }
}


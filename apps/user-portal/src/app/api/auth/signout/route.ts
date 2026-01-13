import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  // Clear auth cookie by setting it to expire immediately
  response.cookies.set("auth-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0, // Expire immediately
    path: "/",
    domain: process.env.NODE_ENV === "production" ? ".crackon.ai" : undefined,
  });
  
  return response;
}


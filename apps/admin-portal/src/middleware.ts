import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@api/utils/auth-helpers";

// Define public routes that don't require authentication
const publicRoutes = [
  "/",
  "/sign-in",
  "/unauthorized",
];

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(route => pathname === route || pathname.startsWith(route + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for auth token in cookie
  const token = req.cookies.get("auth-token")?.value;

  if (!token) {
    // No token, redirect to sign-in
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Verify token
  const payload = verifyToken(token);
  if (!payload) {
    // Invalid token, redirect to sign-in
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Token is valid, allow request to proceed
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
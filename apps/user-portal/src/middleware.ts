import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// Define public routes that don't require authentication
const publicRoutes = [
  "/",
  "/sign-in",
  "/sign-up",
  "/api/auth",
  "/api/webhooks/clerk",
  "/api/webhook/payfast",
  "/api/webhook/whatsapp",
  "/api/cron/reminders",
  "/api/cron/calendar-events",
  "/api/calendars/callback",
  "/api/payment/billing-cancel",
  "/api/payment/billing-success",
];

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some((route) => {
    if (route.endsWith("(.*)")) {
      const baseRoute = route.replace("(.*)", "");
      return pathname.startsWith(baseRoute);
    }
    return pathname === route || pathname.startsWith(route + "/");
  });
}

// Get the correct host URL
function getHost(req: NextRequest): string {
  // In production, use the environment variable
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // In development, use the request headers
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
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
    // Redirect to sign-in if not authenticated
    const host = getHost(req);
    const signInUrl = new URL("/sign-in", host);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Verify token
  const payload = verifyToken(token);
  if (!payload) {
    // Invalid token, redirect to sign-in
    const host = getHost(req);
    const signInUrl = new URL("/sign-in", host);
    signInUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(signInUrl);
    response.cookies.delete("auth-token");
    return response;
  }

  // Token is valid, allow request
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
  runtime: "nodejs", // Use Node.js runtime for jsonwebtoken compatibility
};

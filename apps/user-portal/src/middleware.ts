import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
  "/api/webhook/payfast(.*)",  // PayFast ITN webhook - no auth needed
  "/api/webhook/whatsapp(.*)",  // WhatsApp webhook - no auth needed
  "/api/calendars/callback",  // OAuth providers redirect here, no session cookie
  "/api/payment/billing-cancel",  // PayFast redirects here after cancellation
  "/api/payment/billing-success",  // PayFast redirects here after success
]);

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

export default clerkMiddleware(async (auth, req) => {
  const { userId, redirectToSignIn } = await auth();

  // If the user isn't signed in and the route is private, redirect to sign-in
  if (!userId && !isPublicRoute(req)) {
    // Build the correct return URL using the actual host
    const host = getHost(req);
    const returnBackUrl = `${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
    return redirectToSignIn({ returnBackUrl });
  }

  // Let all authenticated requests through
  // Onboarding checks will be handled by individual pages using Server Components
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
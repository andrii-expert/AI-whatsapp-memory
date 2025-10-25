import { NextRequest, NextResponse } from "next/server";
import { createCalendarProvider } from "@imaginecalendar/calendar-integrations";
import { logger } from "@imaginecalendar/logger";

// Get the correct host URL for redirects
function getHostUrl(request: NextRequest): string {
  // In production, use the environment variable
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // In development, use the request headers
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
}

// Handle OAuth callback
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Get the correct host URL for redirects
    const hostUrl = getHostUrl(request);

    // Log ALL headers for debugging
    const allHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      // Mask sensitive data but keep structure
      if (key.toLowerCase() === 'cookie') {
        allHeaders[key] = value.length > 0 ? `[${value.length} chars]` : 'empty';
      } else if (key.toLowerCase() === 'authorization') {
        allHeaders[key] = '[REDACTED]';
      } else {
        allHeaders[key] = value;
      }
    });

    logger.info({
      callbackReceived: true,
      hasCode: !!code,
      hasState: !!state,
      state: state,
      hasError: !!error,
      error: error,
      errorDescription: errorDescription,
      hostUrl: hostUrl,
      fullUrl: request.url,
      provider: state?.split(":")[0],
      allHeaders: allHeaders,
      specificHeaders: {
        host: request.headers.get("host"),
        xForwardedProto: request.headers.get("x-forwarded-proto"),
        referer: request.headers.get("referer"),
        userAgent: request.headers.get("user-agent"),
        accept: request.headers.get("accept"),
        acceptEncoding: request.headers.get("accept-encoding"),
        cookie: request.headers.get("cookie") ? "present" : "missing"
      }
    }, "[OAUTH_CALLBACK_DEBUG] OAuth callback received with full headers");

    // Extract provider early to determine response type
    const provider = state?.split(":")[0] as "google" | "microsoft";

    // Handle OAuth errors
    if (error) {
      logger.warn({
        error,
        errorDescription,
        provider
      }, "OAuth callback received error");

      const isMicrosoft = provider === "microsoft";

      if (isMicrosoft) {
        // Use client-side redirect for Microsoft errors too
        const errorData = JSON.stringify({ error, error_description: errorDescription });
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Calendar connection error</title>
            <meta charset="utf-8">
          </head>
          <body>
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, -apple-system, sans-serif;">
              <div style="text-align: center;">
                <h2>Connection error</h2>
                <p>Redirecting back to settings...</p>
              </div>
            </div>
            <script>
              document.cookie = "oauth_error=${encodeURIComponent(errorData)}; path=/; max-age=60; samesite=lax${process.env.NODE_ENV === 'production' ? '; secure' : ''}";
              setTimeout(() => {
                window.location.href = "${hostUrl}/settings/calendars";
              }, 100);
            </script>
          </body>
          </html>
        `;
        return new NextResponse(html, {
          headers: { 'Content-Type': 'text/html' }
        });
      } else {
        const response = NextResponse.redirect(`${hostUrl}/settings/calendars`);
        response.cookies.set('oauth_error', JSON.stringify({
          error: error,
          error_description: errorDescription
        }), {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60,
          path: '/'
        });
        return response;
      }
    }

    if (!code) {
      logger.warn({ provider }, "OAuth callback missing authorization code");

      const isMicrosoft = provider === "microsoft";

      if (isMicrosoft) {
        const errorData = JSON.stringify({ error: 'missing_code' });
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Calendar connection error</title>
            <meta charset="utf-8">
          </head>
          <body>
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, -apple-system, sans-serif;">
              <div style="text-align: center;">
                <h2>Missing authorization code</h2>
                <p>Redirecting back to settings...</p>
              </div>
            </div>
            <script>
              document.cookie = "oauth_error=${encodeURIComponent(errorData)}; path=/; max-age=60; samesite=lax${process.env.NODE_ENV === 'production' ? '; secure' : ''}";
              setTimeout(() => {
                window.location.href = "${hostUrl}/settings/calendars";
              }, 100);
            </script>
          </body>
          </html>
        `;
        return new NextResponse(html, {
          headers: { 'Content-Type': 'text/html' }
        });
      } else {
        const response = NextResponse.redirect(`${hostUrl}/settings/calendars`);
        response.cookies.set('oauth_error', JSON.stringify({
          error: 'missing_code'
        }), {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60,
          path: '/'
        });
        return response;
      }
    }

    // Provider already extracted above
    if (!provider || !["google", "microsoft"].includes(provider)) {
      logger.warn({
        state,
        provider
      }, "OAuth callback with invalid provider in state");

      const response = NextResponse.redirect(`${hostUrl}/settings/calendars`);
      response.cookies.set('oauth_error', JSON.stringify({
        error: 'invalid_provider'
      }), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60,
        path: '/'
      });

      return response;
    }

    logger.info({
      provider,
      codeLength: code.length
    }, "Processing OAuth callback");

    // For Microsoft, use client-side redirect to preserve Clerk session
    const isMicrosoft = provider === "microsoft";

    // Create appropriate response based on provider
    let response: NextResponse;
    if (isMicrosoft) {
      // Return HTML that sets cookie and redirects client-side
      const cookieData = JSON.stringify({ provider, code, state });
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Completing calendar connection...</title>
          <meta charset="utf-8">
        </head>
        <body>
          <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, -apple-system, sans-serif;">
            <div style="text-align: center;">
              <h2>Completing calendar connection...</h2>
              <p>Please wait while we redirect you.</p>
            </div>
          </div>
          <script>
            // Set the OAuth callback cookie
            document.cookie = "oauth_callback=${encodeURIComponent(cookieData)}; path=/; max-age=60; samesite=lax${process.env.NODE_ENV === 'production' ? '; secure' : ''}";
            // Redirect to settings page
            setTimeout(() => {
              window.location.href = "${hostUrl}/settings/calendars";
            }, 100);
          </script>
        </body>
        </html>
      `;
      response = new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html',
        },
      });
    } else {
      // For Google and others, use standard redirect
      response = NextResponse.redirect(`${hostUrl}/settings/calendars`);

      // Store the OAuth data in a cookie
      response.cookies.set('oauth_callback', JSON.stringify({
        provider,
        code,
        state
      }), {
        httpOnly: false, // Must be accessible to client-side JavaScript
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60, // Expire after 1 minute
        path: '/'
      });
    }

    // Log response details for debugging
    logger.info({
      provider,
      redirectingTo: `${hostUrl}/settings/calendars`,
      dataStoredInCookie: true,
      usingClientSideRedirect: isMicrosoft,
      responseType: isMicrosoft ? 'html' : 'redirect'
    }, "[OAUTH_CALLBACK_DEBUG] Sending response");

    return response;
  } catch (error: any) {
    logger.error({
      error: error.message
    }, "OAuth callback processing failed");

    const hostUrl = getHostUrl(request);
    const response = NextResponse.redirect(`${hostUrl}/settings/calendars`);

    response.cookies.set('oauth_error', JSON.stringify({
      error: 'callback_failed'
    }), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60,
      path: '/'
    });

    return response;
  }
}
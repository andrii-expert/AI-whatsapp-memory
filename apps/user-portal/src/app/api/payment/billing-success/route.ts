import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@imaginecalendar/logger';
import { verifyToken } from '@api/utils/auth-helpers';

export async function GET(req: NextRequest) {
  try {
    // Try to get userId but don't require it since PayFast redirects here
    const token = req.cookies.get('auth-token')?.value;
    const userId = token ? verifyToken(token)?.userId : null;

    if (userId) {
      logger.info({ userId }, 'Billing payment success redirect - authenticated user');
    } else {
      logger.info('Billing payment success redirect - no authenticated session (PayFast redirect)');
    }

    // Redirect to billing page with success status
    const searchParams = new URLSearchParams({
      status: 'success',
      message: 'Payment successful! Your subscription has been updated.',
    });

    // Check if user is in onboarding flow (check setupStep from database)
    // For now, we'll check the referer or use a cookie/session to determine
    // If coming from onboarding, redirect to onboarding/billing
    const referer = req.headers.get('referer') || '';
    const isOnboardingFlow = referer.includes('/onboarding/billing') || 
                             req.nextUrl.searchParams.get('onboarding') === 'true';

    // If user is not authenticated, redirect to home page with message
    let redirectPath = userId ? '/billing' : '/';
    if (isOnboardingFlow && userId) {
      redirectPath = '/onboarding/billing';
    }

    // Use the app URL from environment variable for production
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;

    return NextResponse.redirect(
      new URL(`${redirectPath}?${searchParams}`, appUrl)
    );
  } catch (error) {
    logger.error({ error }, 'Error handling billing payment success');
    // Use the app URL from environment variable for production
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
    return NextResponse.redirect(new URL('/', appUrl));
  }
}
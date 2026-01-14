import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@imaginecalendar/logger';
import { verifyToken } from '@api/utils/auth-helpers';

export async function GET(req: NextRequest) {
  try {
    // Try to get userId but don't require it since PayFast redirects here
    const token = req.cookies.get('auth-token')?.value;
    const userId = token ? verifyToken(token)?.userId : null;

    if (userId) {
      logger.info({ userId }, 'Billing payment cancelled by authenticated user');
    } else {
      logger.info('Billing payment cancelled - no authenticated session (PayFast redirect)');
    }

    // Redirect to billing page with cancelled status
    const searchParams = new URLSearchParams({
      status: 'cancelled',
      message: 'Payment was cancelled. You can try again or continue with your current plan.',
    });

    // Check if user is in onboarding flow
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
    logger.error({ error }, 'Error handling billing payment cancel');
    // Use the app URL from environment variable for production
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
    return NextResponse.redirect(new URL('/', appUrl));
  }
}
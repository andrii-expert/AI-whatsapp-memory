import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@imaginecalendar/logger';
import { verifyToken } from '@api/utils/auth-helpers';
import { connectDb } from '@imaginecalendar/database/client';
import { getUserById } from '@imaginecalendar/database/queries';

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
    let isOnboardingFlow = false;
    if (userId) {
      const db = await connectDb();
      const user = await getUserById(db, userId);
      // User is in onboarding if setupStep < 4
      isOnboardingFlow = user ? (user.setupStep ?? 1) < 4 : false;
      
      // If user just completed payment and is in onboarding, redirect with success status
      // The client-side will handle completing onboarding
      if (isOnboardingFlow) {
        logger.info({ userId }, 'Payment success in onboarding flow - redirecting with status');
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
        return NextResponse.redirect(
          new URL(`/onboarding/billing?status=success&message=Payment successful! Your subscription has been updated.`, appUrl)
        );
      }
    }

    // Fallback: check referer as well
    const referer = req.headers.get('referer') || '';
    if (!isOnboardingFlow) {
      isOnboardingFlow = referer.includes('/onboarding/billing') || 
                         req.nextUrl.searchParams.get('onboarding') === 'true';
    }

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
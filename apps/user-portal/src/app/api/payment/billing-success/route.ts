import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { logger } from '@imaginecalendar/logger';

export async function GET(req: NextRequest) {
  try {
    // Try to get userId but don't require it since PayFast redirects here
    const { userId } = await auth();

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

    // If user is not authenticated, redirect to home page with message
    const redirectPath = userId ? '/billing' : '/';

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
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { logger } from '@imaginecalendar/logger';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    // Use the app URL from environment variable for production
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;

    if (!userId) {
      logger.warn('Payment cancel accessed without authentication');
      return NextResponse.redirect(new URL('/sign-in', appUrl));
    }

    logger.info({ userId }, 'Payment cancelled by user');

    // Redirect to cancel page with query params
    const searchParams = new URLSearchParams({
      status: 'cancelled',
      message: 'Payment was cancelled. You can try again or continue with the free trial.',
    });

    return NextResponse.redirect(
      new URL(`/payment/status?${searchParams}`, appUrl)
    );
  } catch (error) {
    logger.error({ error }, 'Error handling payment cancel');
    // Use the app URL from environment variable for production
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
    return NextResponse.redirect(new URL('/billing', appUrl));
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { PayFastService } from '@imaginecalendar/payments';
import { logger } from '@imaginecalendar/logger';
import { connectDb } from '@imaginecalendar/database/client';
import { getPlanById } from '@imaginecalendar/database/queries';

export async function POST(req: NextRequest) {
  logger.info('Payment redirect endpoint called');
  
  try {
    const { userId } = await auth();
    logger.info({ userId }, 'Auth check completed');
    
    if (!userId) {
      logger.warn('Payment redirect accessed without authentication');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    logger.info({ userId }, 'Parsing request body');
    
    // Check content type to determine how to parse
    const contentType = req.headers.get('content-type') || '';
    logger.info({ userId, contentType }, 'Request content type');
    
    let planId: string;
    let isBillingFlow = false;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Parse form data (from HTML form submission)
      const formData = await req.formData();
      planId = String(formData.get('plan') || '').trim();
      isBillingFlow = formData.get('isBillingFlow') === 'true';
      logger.info({ userId, planId, isBillingFlow, source: 'formData' }, 'Plan and flow type extracted from form');
    } else {
      // Parse JSON data
      const body = await req.json();
      planId = typeof body.plan === 'string' ? body.plan.trim() : '';
      isBillingFlow = body.isBillingFlow === true;
      logger.info({ userId, planId, isBillingFlow, source: 'json' }, 'Plan and flow type extracted from JSON');
    }

    if (!planId) {
      logger.error({ userId, planId }, 'Invalid plan provided');
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      );
    }

    const normalizedPlanId = planId.toLowerCase();

    const db = await connectDb();
    const planRecord = await getPlanById(db, normalizedPlanId);

    if (!planRecord || planRecord.status !== 'active') {
      logger.error({ userId, planId: normalizedPlanId }, 'Requested plan not available');
      return NextResponse.json(
        { error: 'Selected plan is not available' },
        { status: 400 }
      );
    }

    // Get user details from Clerk
    logger.info({ userId }, 'Fetching user from Clerk');
    const clerkUser = await currentUser();
    
    if (!clerkUser) {
      logger.error({ userId }, 'Could not fetch user from Clerk');
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    const userEmail = clerkUser.emailAddresses[0]?.emailAddress;
    
    logger.info({ 
      userId, 
      userEmail,
      hasEmail: !!userEmail
    }, 'User email extracted for payment');

    if (!userEmail) {
      logger.error({ userId }, 'User has no email address');
      return NextResponse.json(
        { error: 'User email required for payment' },
        { status: 400 }
      );
    }

    logger.info({ userId, plan: planRecord.id }, 'Creating PayFast payment request');

    // Generate PayFast form data server-side
    logger.info({ userId }, 'Initializing PayFast service');
    const payfast = new PayFastService();
    
    logger.info({ 
      userId, 
      plan: planRecord.id, 
      userEmail
    }, 'Calling PayFast createPaymentRequest');
    
    const paymentData = await payfast.createPaymentRequest({
      userId,
      plan: {
        id: planRecord.id,
        name: planRecord.name,
        description: planRecord.description,
        amountCents: planRecord.amountCents,
        payfastConfig: planRecord.payfastConfig,
      },
      userEmail,
      userName: userEmail || 'Customer', // Use email as name or fallback to 'Customer'
      isBillingFlow, // Pass billing flow flag to use correct return/cancel URLs
    });
    
    logger.info({ 
      userId, 
      paymentId: paymentData.fields.m_payment_id,
      paymentAction: paymentData.action,
      fieldsCount: Object.keys(paymentData.fields).length
    }, 'PayFast payment data created successfully');

    logger.info({ 
      userId, 
      plan: planRecord.id,
      paymentId: paymentData.fields.m_payment_id 
    }, 'PayFast payment form generated');

    // Return HTML form that auto-submits to PayFast
    const formHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Redirecting to PayFast...</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              text-align: center;
              background: white;
              padding: 3rem;
              border-radius: 12px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            .spinner {
              border: 3px solid #f3f3f3;
              border-top: 3px solid #667eea;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 0 auto 1.5rem;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            h2 {
              color: #333;
              margin: 0 0 0.5rem;
            }
            p {
              color: #666;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <h2>Redirecting to PayFast</h2>
            <p>Please wait while we connect you to our payment provider...</p>
          </div>
          <form id="payfast-form" action="${paymentData.action}" method="POST" style="display: none;">
            ${Object.entries(paymentData.fields)
              .map(([key, value]) => 
                `<input type="hidden" name="${key}" value="${value}" />`
              ).join('\n')}
          </form>
          <script>
            setTimeout(function() {
              document.getElementById('payfast-form').submit();
            }, 1000);
          </script>
        </body>
      </html>
    `;

    return new Response(formHtml, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    // Comprehensive error logging
    logger.error({ 
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
        cause: error instanceof Error ? error.cause : undefined,
        code: (error as any)?.code,
        detail: (error as any)?.detail,
        hint: (error as any)?.hint,
        severity: (error as any)?.severity,
      },
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
      fullError: JSON.stringify(error, null, 2)
    }, 'Error creating payment session - detailed error info');
    
    // Also log the error directly for comparison
    console.error('Raw error object:', error);
    
    return NextResponse.json(
      { error: 'Failed to create payment session' },
      { status: 500 }
    );
  }
}
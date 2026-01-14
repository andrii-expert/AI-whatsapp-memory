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
      logger.error({ userId, planId, contentType, hasFormData: contentType.includes('form') }, 'Invalid plan provided - planId is empty');
      return NextResponse.json(
        { error: 'Invalid plan: Plan ID is required' },
        { status: 400 }
      );
    }

    logger.info({ userId, planId, normalizedPlanId: planId.toLowerCase() }, 'Processing payment redirect for plan');

    // Try both normalized and original plan ID (case-sensitive database)
    const normalizedPlanId = planId.toLowerCase();

    let db;
    try {
      db = await connectDb();
      logger.info({ userId }, 'Database connection established');
    } catch (dbError) {
      logger.error({ 
        error: dbError instanceof Error ? dbError.message : String(dbError),
        stack: dbError instanceof Error ? dbError.stack : undefined,
        userId 
      }, 'Database connection failed');
      return NextResponse.json(
        { error: 'Database connection error. Please try again later.' },
        { status: 500 }
      );
    }

    let planRecord;
    try {
      planRecord = await getPlanById(db, normalizedPlanId);
    
      // If not found with lowercase, try original case
      if (!planRecord) {
        logger.info({ userId, planId, normalizedPlanId }, 'Plan not found with normalized ID, trying original case');
        planRecord = await getPlanById(db, planId);
      }
    } catch (queryError) {
      logger.error({ 
        error: queryError instanceof Error ? queryError.message : String(queryError),
        stack: queryError instanceof Error ? queryError.stack : undefined,
        userId,
        planId,
        normalizedPlanId
      }, 'Error querying plan from database');
      return NextResponse.json(
        { error: 'Error retrieving plan information. Please try again.' },
        { status: 500 }
      );
    }

    if (!planRecord) {
      logger.error({ userId, planId, normalizedPlanId }, 'Plan not found in database');
      return NextResponse.json(
        { error: `Plan "${planId}" not found. Please contact support.` },
        { status: 404 }
      );
    }

    if (planRecord.status !== 'active') {
      logger.error({ userId, planId: planRecord.id, status: planRecord.status }, 'Requested plan is not active');
      return NextResponse.json(
        { error: 'Selected plan is not currently available' },
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
    
    // Validate plan has required payment configuration
    if (!planRecord.payfastConfig) {
      logger.error({ userId, planId: planRecord.id }, 'Plan missing PayFast configuration');
      return NextResponse.json(
        { error: 'Plan configuration error. Please contact support.' },
        { status: 500 }
      );
    }

    if (planRecord.amountCents <= 0 && !planRecord.payfastConfig.recurring) {
      logger.error({ userId, planId: planRecord.id, amountCents: planRecord.amountCents }, 'Plan has invalid amount for payment');
      return NextResponse.json(
        { error: 'This plan does not require payment. Please select a paid plan.' },
        { status: 400 }
      );
    }

    let payfast: PayFastService;
    try {
      payfast = new PayFastService();
    } catch (configError) {
      logger.error({ 
        error: configError instanceof Error ? configError.message : String(configError),
        stack: configError instanceof Error ? configError.stack : undefined,
        userId,
        planId: planRecord.id
      }, 'PayFast configuration error');
      
      return NextResponse.json(
        { 
          error: 'Payment service configuration error',
          details: configError instanceof Error ? configError.message : 'Invalid PayFast credentials. Please contact support.'
        },
        { status: 500 }
      );
    }
    
    logger.info({ 
      userId, 
      plan: planRecord.id,
      planName: planRecord.name,
      amountCents: planRecord.amountCents,
      recurring: planRecord.payfastConfig.recurring,
      frequency: planRecord.payfastConfig.frequency,
      userEmail
    }, 'Calling PayFast createPaymentRequest');
    
    let paymentData;
    try {
      paymentData = await payfast.createPaymentRequest({
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
    } catch (payfastError) {
      logger.error({ 
        error: payfastError instanceof Error ? payfastError.message : String(payfastError),
        stack: payfastError instanceof Error ? payfastError.stack : undefined,
        userId,
        plan: planRecord.id
      }, 'Error creating PayFast payment request');
      
      return NextResponse.json(
        { 
          error: 'Failed to create payment request',
          details: payfastError instanceof Error ? payfastError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
    
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
    // Escape HTML to prevent XSS
    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const formFields = Object.entries(paymentData.fields)
      .map(([key, value]) => 
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value))}" />`
      ).join('\n            ');

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
          <form id="payfast-form" action="${escapeHtml(paymentData.action)}" method="POST" style="display: none;">
            ${formFields}
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error({ 
      error: {
        message: errorMessage,
        stack: errorStack,
        name: error instanceof Error ? error.name : undefined,
        cause: error instanceof Error ? error.cause : undefined,
        code: (error as any)?.code,
        detail: (error as any)?.detail,
        hint: (error as any)?.hint,
        severity: (error as any)?.severity,
      },
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
    }, 'Error creating payment session - detailed error info');
    
    // Also log the error directly for comparison
    console.error('Payment redirect error:', error);
    
    // Return more specific error message for debugging
    return NextResponse.json(
      { 
        error: 'Failed to create payment session',
        message: errorMessage,
        // Only include details in development
        ...(process.env.NODE_ENV === 'development' && {
          details: errorStack?.split('\n').slice(0, 5).join('\n')
        })
      },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { PayFastService } from '@imaginecalendar/payments';
import { connectDb } from '@imaginecalendar/database/client';
import { 
  createPayment, 
  updatePaymentStatus,
  getUserSubscription,
  updateSubscription,
  createSubscription,
  getPaymentByMPaymentId,
  getPlanById,
} from '@imaginecalendar/database/queries';
import type { PlanRecord } from '@imaginecalendar/database/queries';
import { z } from 'zod';
import { logger } from '@imaginecalendar/logger';

function computeSubscriptionPeriods(plan: PlanRecord) {
  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date(currentPeriodStart);

  if (plan.payfastConfig.recurring && plan.payfastConfig.frequency) {
    switch (plan.payfastConfig.frequency) {
      case 1:
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 1);
        break;
      case 2:
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 7);
        break;
      case 3:
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
        break;
      case 4:
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 3);
        break;
      case 5:
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 6);
        break;
      case 6:
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
        break;
      default:
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }
  } else if (plan.trialDays > 0) {
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + plan.trialDays);
  } else {
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
  }

  const trialEndsAt = plan.trialDays > 0 ? new Date(currentPeriodStart.getTime() + plan.trialDays * 24 * 60 * 60 * 1000) : null;

  return {
    currentPeriodStart,
    currentPeriodEnd,
    trialEndsAt,
  };
}

function isTrialPlan(plan: PlanRecord) {
  return !plan.payfastConfig.recurring && plan.trialDays > 0;
}

const itnSchema = z.object({
  m_payment_id: z.string(),
  pf_payment_id: z.string(),
  payment_status: z.enum(['COMPLETE', 'FAILED', 'CANCELLED']),
  item_name: z.string(),
  amount_gross: z.string(),
  amount_fee: z.string().optional(),
  amount_net: z.string().optional(),
  custom_str1: z.string(), // userId
  custom_str2: z.string(), // plan
  token: z.string().optional(), // Subscription token for recurring payments
  signature: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    // Parse form data from PayFast
    const formData = await req.formData();
    const payload: Record<string, any> = {};
    formData.forEach((value, key) => {
      payload[key] = value.toString();
    });

    // Get remote IP for validation - check all possible headers
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const cfConnectingIp = req.headers.get('cf-connecting-ip');

    // Log all IP-related headers for debugging
    const allHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      if (key.toLowerCase().includes('ip') ||
          key.toLowerCase().includes('forward') ||
          key.toLowerCase().includes('remote') ||
          key.toLowerCase().includes('cf-')) {
        allHeaders[key] = value;
      }
    });

    const remoteIp =
      (forwardedFor ? forwardedFor.split(',')[0]?.trim() || '' : '') ||
      realIp ||
      cfConnectingIp ||
      '';

    logger.info({
      remoteIp,
      ipHeaders: {
        'x-forwarded-for': forwardedFor,
        'x-real-ip': realIp,
        'cf-connecting-ip': cfConnectingIp,
        allIpRelatedHeaders: allHeaders
      },
      paymentId: payload.m_payment_id,
      status: payload.payment_status
    }, 'Received PayFast ITN with IP details');

    // Parse and validate ITN data
    const result = itnSchema.safeParse(payload);
    if (!result.success) {
      logger.error({
        errors: result.error.issues,
        payload
      }, 'Invalid PayFast ITN payload');
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    const payfast = new PayFastService();

    // Get plan to check expected amount
    const { custom_str2: planId } = result.data;
    const normalizedPlanId = planId.trim().toLowerCase();

    // Get database connection and plan
    const db = await connectDb();
    const planRecord = await getPlanById(db, normalizedPlanId);

    if (!planRecord) {
      logger.error({ planId: normalizedPlanId }, 'Invalid plan ID in PayFast ITN');
      return new Response('OK', { status: 200 });
    }

    const expectedAmount = planRecord.amountCents / 100;

    // Validate ITN with all 4 PayFast security checks
    const isValid = await payfast.validateITN(payload, remoteIp, expectedAmount);
    if (!isValid) {
      logger.error({ 
        remoteIp,
        paymentId: payload.m_payment_id 
      }, 'PayFast ITN validation failed');
      return NextResponse.json(
        { error: 'Invalid signature or source' },
        { status: 403 }
      );
    }

    const { 
      payment_status, 
      custom_str1: userId, 
      pf_payment_id,
      amount_gross,
      token 
    } = result.data;

    // Check if this payment has already been processed (idempotency)
    const existingPayment = await getPaymentByMPaymentId(db, result.data.m_payment_id);
    if (existingPayment) {
      logger.info({ 
        mPaymentId: result.data.m_payment_id,
        existingPaymentId: existingPayment.id,
        status: existingPayment.status 
      }, 'Payment already processed, returning success');
      return new Response('OK', { status: 200 });
    }

    // Process payment based on status
    switch (payment_status) {
      case 'COMPLETE': {
        logger.info({ 
          userId, 
          plan: planRecord.id, 
          amount: amount_gross,
          payfastPaymentId: pf_payment_id 
        }, 'Processing successful payment');

        // Verify amount matches expected
        const isAmountValid = await payfast.validateAmount(
          pf_payment_id, 
          expectedAmount, 
          amount_gross
        );
        if (!isAmountValid) {
          logger.error({ 
            expected: expectedAmount, 
            actual: amount_gross 
          }, 'PayFast amount mismatch');
          return new Response('OK', { status: 200 });
        }

        // Get or create subscription
        let subscription = await getUserSubscription(db, userId);
        
        if (!subscription) {
          // Create new subscription
          const { currentPeriodStart, currentPeriodEnd, trialEndsAt } = computeSubscriptionPeriods(planRecord);

          subscription = await createSubscription(db, {
            userId,
            plan: planRecord.id,
            status: 'active',
            currentPeriodStart,
            currentPeriodEnd,
            payfastSubscriptionId: pf_payment_id,
            payfastToken: token,
            trialEndsAt: trialEndsAt ?? undefined,
          });

          if (!subscription) {
            logger.error({ userId }, 'Failed to create subscription');
            return new Response('OK', { status: 200 });
          }
        } else {
          // Update existing subscription
          const { currentPeriodStart, currentPeriodEnd } = computeSubscriptionPeriods(planRecord);

          await updateSubscription(db, subscription.id, {
            status: 'active',
            payfastSubscriptionId: pf_payment_id,
            payfastToken: token,
            plan: planRecord.id,
            currentPeriodStart,
            currentPeriodEnd,
            // Clear trial end date if upgrading from trial
            trialEndsAt: null,
          });
        }

        // Create payment record with auto-generated invoice
        const payment = await createPayment(db, {
          userId,
          subscriptionId: subscription.id,
          amount: Math.round(parseFloat(amount_gross) * 100), // Convert to cents
          currency: 'ZAR',
          status: 'completed',
          description: `${planRecord.name} subscription payment`,
          billingPeriodStart: subscription.currentPeriodStart,
          billingPeriodEnd: subscription.currentPeriodEnd,
          payfastPaymentId: pf_payment_id,
          payfastPaymentUuid: token,
          payfastMPaymentId: result.data.m_payment_id,
        });

        if (!payment) {
          logger.error({ userId }, 'Failed to create payment record');
          return new Response('OK', { status: 200 });
        }

        await updatePaymentStatus(db, payment.id, 'completed', {
          paidAt: new Date(),
        });

        logger.info({ 
          userId, 
          paymentId: payment.id,
          subscriptionId: subscription.id 
        }, 'Payment processed successfully');
        break;
      }
        
      case 'FAILED': {
        logger.info({ 
          userId,
          payfastPaymentId: pf_payment_id 
        }, 'Processing failed payment');

        // Update subscription status if it was pending
        const subscription = await getUserSubscription(db, userId);
        if (subscription && subscription.status === 'active') {
          await updateSubscription(db, subscription.id, {
            status: 'past_due',
          });
        }
        break;
      }
        
      case 'CANCELLED': {
        logger.info({ 
          userId,
          token 
        }, 'Processing subscription cancellation');

        if (token) {
          // Find subscription by token and cancel it
          const subscription = await getUserSubscription(db, userId);
          if (subscription && subscription.payfastToken === token) {
            await updateSubscription(db, subscription.id, {
              status: 'cancelled',
              cancelledAt: new Date(),
            });
          }
        }
        break;
      }
    }

    // PayFast expects 200 OK response
    return new Response('OK', { status: 200 });
  } catch (error) {
    logger.error({ error }, 'Error processing PayFast ITN');
    // Still return 200 to prevent retries for server errors
    return new Response('OK', { status: 200 });
  }
}
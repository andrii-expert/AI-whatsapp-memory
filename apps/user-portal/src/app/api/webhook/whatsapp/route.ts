import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@imaginecalendar/logger';
import { connectDb } from '@imaginecalendar/database/client';
import { whatsappWebhookSchema } from '@api/schemas/whatsapp-webhook';
import { parseWebhookForVerification } from '@imaginecalendar/whatsapp';
import type { WhatsAppParsedMessage } from '@imaginecalendar/whatsapp';
import type { WebhookProcessingSummary } from './types';
import { handleAudioMessage } from './handlers/audio';
import { handleTextMessage } from './handlers/text';
import { handleInteractiveMessage } from './handlers/interactive';
import { handleVerificationMessage } from './verification';

// WhatsApp webhook verification for development
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // WhatsApp sends these parameters for webhook verification
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    logger.info({
      mode,
      token: token ? '[REDACTED]' : null,
      challenge: challenge ? '[REDACTED]' : null
    }, 'WhatsApp webhook verification request');

    // Verify the webhook - replace with your actual verify token
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'your_verify_token_here';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      logger.info({}, 'WhatsApp webhook verified successfully');
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    } else {
      logger.warn({
        mode,
        tokenMatch: token === VERIFY_TOKEN
      }, 'WhatsApp webhook verification failed');
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }
  } catch (error) {
    logger.error({ error }, 'Error in WhatsApp webhook verification');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// WhatsApp webhook for receiving messages
export async function POST(req: NextRequest) {
  try {
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const cfConnectingIp = req.headers.get('cf-connecting-ip');

    const remoteIp =
      (forwardedFor ? forwardedFor.split(',')[0]?.trim() || '' : '') ||
      realIp ||
      cfConnectingIp ||
      'unknown';

    const payload = await req.json();

    logger.info({
      remoteIp,
      webhookType: 'whatsapp_message',
      hasEntry: Array.isArray(payload.entry),
      entryCount: Array.isArray(payload.entry) ? payload.entry.length : 0,
    }, 'Received WhatsApp webhook');

    logger.debug({
      payload: JSON.stringify(payload, null, 2),
    }, 'WhatsApp webhook payload');

    const result = whatsappWebhookSchema.safeParse(payload);
    if (!result.success) {
      logger.error({
        errors: result.error.issues,
        payload,
      }, 'Invalid WhatsApp webhook payload');
      return NextResponse.json(
        { status: 'invalid_payload' },
        { status: 200 },
      );
    }

    const db = await connectDb();

    const verificationCandidates = parseWebhookForVerification(result.data);
    const verificationLookup = new Map<string, WhatsAppParsedMessage>();
    for (const candidate of verificationCandidates) {
      verificationLookup.set(candidate.messageId, candidate);
    }
    const handledVerificationIds = new Set<string>();

    const summary: WebhookProcessingSummary = {
      voiceJobIds: [],
      textJobIds: [],
      verificationSuccess: [],
      verificationFailures: [],
      flowResponses: [],
      pendingIntentUpdates: [],
      processIntentRequeues: [],
    };

    for (const entry of result.data.entry) {
      for (const change of entry.changes) {
        const messages = change.value.messages || [];

        for (const message of messages) {
          const senderPhone = message.from;
          if (!senderPhone) {
            continue;
          }

          if (message.type === 'text') {
            const candidate = verificationLookup.get(message.id);
            if (candidate) {
              const handled = await handleVerificationMessage(candidate, db, summary);
              if (handled) {
                handledVerificationIds.add(candidate.messageId);
                continue;
              }
            }
          }

          switch (message.type) {
            case 'audio':
            case 'voice':
              await handleAudioMessage(message, db, summary);
              break;
            case 'text':
              await handleTextMessage(message, db, summary);
              break;
            case 'interactive':
              await handleInteractiveMessage(message, db, summary);
              break;
            default:
              logger.warn({
                messageId: message.id,
                messageType: message.type,
              }, 'Unsupported WhatsApp message type');
          }
        }
      }
    }

    for (const candidate of verificationCandidates) {
      if (handledVerificationIds.has(candidate.messageId)) {
        continue;
      }

      const handled = await handleVerificationMessage(candidate, db, summary);
      if (handled) {
        handledVerificationIds.add(candidate.messageId);
      }
    }

    const processed =
      summary.voiceJobIds.length > 0 ||
      summary.textJobIds.length > 0 ||
      summary.flowResponses.length > 0 ||
      summary.pendingIntentUpdates.length > 0 ||
      summary.processIntentRequeues.length > 0 ||
      summary.verificationSuccess.length > 0 ||
      summary.verificationFailures.length > 0;

    if (!processed) {
      logger.info({}, 'No actionable messages found in webhook payload');
      return NextResponse.json(
        { status: 'no_messages' },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        status: 'processed',
        voiceJobsCreated: summary.voiceJobIds,
        textJobsCreated: summary.textJobIds,
        flowResponsesHandled: summary.flowResponses,
        pendingIntentUpdates: summary.pendingIntentUpdates,
        processIntentRequeues: summary.processIntentRequeues,
        verificationCodeSuccess: summary.verificationSuccess,
        verificationCodeFailures: summary.verificationFailures,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error({ error }, 'Error processing WhatsApp webhook');

    return NextResponse.json(
      { status: 'error' },
      { status: 200 },
    );
  }
}


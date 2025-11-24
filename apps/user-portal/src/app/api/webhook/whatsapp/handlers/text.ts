import { randomUUID } from 'crypto';
import type { Database } from '@imaginecalendar/database/client';
import {
  createVoiceMessageJob,
  getVerifiedWhatsappNumberByPhone,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobTranscription,
  recordVoiceJobTiming,
  logIncomingWhatsAppMessage,
} from '@imaginecalendar/database/queries';
import { getQueue, QUEUE_NAMES } from '@/lib/queues';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import type { WebhookProcessingSummary } from '../types';
import { processTextClarification } from '../clarifications';
import { VOICE_STAGE_SEQUENCE } from '@imaginecalendar/database/constants/voice-timing';

const verificationCodePattern = /\b\d{6}\b/;

export async function handleTextMessage(
  message: any,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<void> {
  const messageText = message.text?.body?.trim();

  if (!messageText) {
    return;
  }

  if (verificationCodePattern.test(messageText)) {
    logger.info(
      {
        messageId: message.id,
        senderPhone: message.from,
      },
      'Skipped verification text from intent pipeline'
    );
    return;
  }

  const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, message.from);

  if (!whatsappNumber || !whatsappNumber.isVerified) {
    logger.info(
      {
        senderPhone: message.from,
        found: !!whatsappNumber,
        verified: whatsappNumber?.isVerified,
      },
      'Ignoring text from unverified number'
    );
    return;
  }

  try {
    await logIncomingWhatsAppMessage(db, {
      whatsappNumberId: whatsappNumber.id,
      userId: whatsappNumber.userId,
      messageId: message.id,
      messageType: 'text',
    });
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to log incoming text message'
    );
  }

  if (message.id && message.from) {
    try {
      const whatsappService = new WhatsAppService();
      await whatsappService.sendTypingIndicator(message.from, message.id);
    } catch (error) {
      logger.warn(
        {
          error,
          messageId: message.id,
          senderPhone: message.from,
        },
        'Failed to send typing indicator for text message'
      );
    }
  }

  // Handle "Hello" greeting (case-insensitive, with optional punctuation)
  const normalizedMessage = messageText.toLowerCase().trim();
  const cleanMessage = normalizedMessage.replace(/[.,!?;:]+$/, '').trim();

  logger.info(
    {
      messageId: message.id,
      senderPhone: message.from,
      originalMessage: messageText,
      normalizedMessage,
      cleanMessage,
      isHello: cleanMessage === 'hello',
    },
    'Checking for "Hello" greeting'
  );

  if (cleanMessage === 'hello') {
    try {
      const response = await sendWhatsAppTextMessage(message.from, 'Hi, Nice to meet you');

      logger.info(
        {
          messageId: message.id,
          senderPhone: message.from,
          userId: whatsappNumber.userId,
          responseMessageId: response.messages?.[0]?.id,
        },
        'Sent greeting response for "Hello" message'
      );

      return; // Exit early, don't process as intent
    } catch (error) {
      const errorDetails = error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : error;

      logger.error(
        {
          error: errorDetails,
          messageId: message.id,
          senderPhone: message.from,
          userId: whatsappNumber.userId,
          errorType: error?.constructor?.name,
        },
        'Failed to send greeting response for "Hello" message'
      );
      // Continue with normal processing if greeting fails
    }
  }

  const clarificationHandled = await processTextClarification({
    db,
    message,
    messageText,
    whatsappNumberId: whatsappNumber.id,
    summary,
  });

  if (clarificationHandled) {
    return;
  }

  const intentJobId = randomUUID();

  try {
    const voiceJob = await createVoiceMessageJob(db, {
      userId: whatsappNumber.userId,
      whatsappNumberId: whatsappNumber.id,
      messageId: message.id,
      mediaId: `text-${message.id}`,
      senderPhone: message.from,
      isTestJob: false,
      testConfiguration: {
        source: 'webhook',
      },
      intentJobId,
    });

    if (!voiceJob) {
      throw new Error('Failed to create voice job - no job returned');
    }

    await recordWebhookTiming(db, voiceJob.id, message.timestamp, {
      messageType: 'text',
      textLength: messageText.length,
    });

    await updateVoiceMessageJobTranscription(db, voiceJob.id, {
      transcribedText: messageText,
      transcriptionLanguage: 'en',
      sttProvider: 'text-message',
    });

    await updateVoiceMessageJobStatus(db, voiceJob.id, 'transcribed');

    try {
      const processQueue = getQueue(QUEUE_NAMES.PROCESS_INTENT);
      await processQueue.add(
        'process-intent',
        {
          voiceJobId: voiceJob.id,
          jobId: voiceJob.id,
          intentJobId,
          userId: whatsappNumber.userId,
          whatsappNumberId: whatsappNumber.id,
          transcribedText: messageText,
          senderPhone: message.from,
        },
        {
          jobId: `process-${voiceJob.id}`,
        }
      );

      logger.info(
        {
          voiceJobId: voiceJob.id,
          intentJobId,
          userId: whatsappNumber.userId,
          senderPhone: message.from,
          timezone: 'GMT+2',
          textLength: messageText.length,
        },
        'Enqueued text intent for processing'
      );
    } catch (queueError) {
      logger.error(
        {
          error: queueError,
          voiceJobId: voiceJob.id,
          intentJobId,
        },
        'Failed to enqueue process intent job'
      );
    }

    summary.textJobIds.push(voiceJob.id);
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to create voice job from text message'
    );
  }
}

interface WhatsAppMessageResponsePayload {
  messages?: Array<{ id: string }>;
  [key: string]: unknown;
}

async function sendWhatsAppTextMessage(to: string, body: string): Promise<WhatsAppMessageResponsePayload> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v23.0';

  if (!accessToken || !phoneNumberId) {
    throw new Error('Missing WhatsApp credentials. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }

  const sanitizedTo = to.replace(/\D/g, '');

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: sanitizedTo,
      type: 'text',
      text: {
        body,
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as WhatsAppMessageResponsePayload;

  if (!response.ok) {
    throw new Error(
      `WhatsApp API error (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

async function recordWebhookTiming(
  db: Database,
  jobId: string,
  timestamp: unknown,
  metadata: Record<string, unknown>
) {
  const sequence = VOICE_STAGE_SEQUENCE.webhook_received ?? 5;
  const startedAt = parseWhatsAppTimestamp(timestamp);

  try {
    await recordVoiceJobTiming(db, {
      jobId,
      stage: 'webhook_received',
      startedAt,
      completedAt: new Date(),
      sequence,
      metadata,
    });
  } catch (error) {
    logger.warn({ error, jobId }, 'Failed to record webhook timing');
  }
}

function parseWhatsAppTimestamp(value: unknown): Date {
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== '') {
      return new Date(numeric * 1000);
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000);
  }

  return new Date();
}

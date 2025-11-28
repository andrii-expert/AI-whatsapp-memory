import { randomUUID } from 'crypto';
import type { Database } from '@imaginecalendar/database/client';
import {
  createVoiceMessageJob,
  getVerifiedWhatsappNumberByPhone,
  recordVoiceJobTiming,
  logIncomingWhatsAppMessage,
} from '@imaginecalendar/database/queries';
import { getQueue, QUEUE_NAMES } from '@/lib/queues';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import type { WebhookProcessingSummary } from '../types';
import { VOICE_STAGE_SEQUENCE } from '@imaginecalendar/database/constants/voice-timing';

export async function handleAudioMessage(
  message: any,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<void> {
  const audioData = message.audio ?? message.voice;

  if (!audioData) {
    logger.warn({ messageId: message.id }, 'Audio message missing media payload');
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
      'Ignoring audio from unverified number'
    );
    return;
  }

  try {
    await logIncomingWhatsAppMessage(db, {
      whatsappNumberId: whatsappNumber.id,
      userId: whatsappNumber.userId,
      messageId: message.id,
      messageType: 'voice',
    });
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to log incoming audio message'
    );
  }

  if (message.id && message.from) {
    try {
      const whatsappService = new WhatsAppService();
      await whatsappService.sendTypingIndicator(message.from, message.id, 'audio');
    } catch (error) {
      logger.warn(
        {
          error,
          messageId: message.id,
          senderPhone: message.from,
        },
        'Failed to send typing indicator for audio message'
      );
    }
  }

  const intentJobId = randomUUID();

  try {
    const voiceJob = await createVoiceMessageJob(db, {
      userId: whatsappNumber.userId,
      whatsappNumberId: whatsappNumber.id,
      messageId: message.id,
      mediaId: audioData.id,
      senderPhone: message.from,
      mimeType: audioData.mime_type,
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
      messageType: 'audio',
      mediaId: audioData.id,
    });

    logger.info(
      {
        voiceJobId: voiceJob.id,
        intentJobId,
        userId: whatsappNumber.userId,
        messageId: message.id,
      },
      'Created voice message job for audio intent'
    );

    try {
      const queue = getQueue(QUEUE_NAMES.DOWNLOAD_AUDIO);
      await queue.add(
        'download-audio',
        {
          voiceJobId: voiceJob.id,
          mediaId: audioData.id,
          mimeType: audioData.mime_type,
        },
        {
          jobId: `download-${voiceJob.id}`,
        }
      );

      logger.info(
        {
          voiceJobId: voiceJob.id,
          intentJobId,
        },
        'Enqueued download audio job'
      );
    } catch (queueError) {
      logger.error(
        {
          error: queueError,
          voiceJobId: voiceJob.id,
          intentJobId,
        },
        'Failed to enqueue download audio job'
      );
    }

    summary.voiceJobIds.push(voiceJob.id);
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to create voice job for audio message'
    );
  }
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

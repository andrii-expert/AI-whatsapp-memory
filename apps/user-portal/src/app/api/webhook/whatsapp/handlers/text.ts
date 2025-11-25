import { randomUUID } from 'crypto';
import type { Database } from '@imaginecalendar/database/client';
import {
  createVoiceMessageJob,
  getVerifiedWhatsappNumberByPhone,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobTranscription,
  recordVoiceJobTiming,
  logIncomingWhatsAppMessage,
  getUserFolders,
  getUserTasks,
} from '@imaginecalendar/database/queries';
import { getQueue, QUEUE_NAMES } from '@/lib/queues';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { isVerificationMessage } from '@imaginecalendar/whatsapp';
import { TaskIntentAnalysisService } from '@imaginecalendar/ai-services';
import { processTaskIntent } from '../processors/task-processor';
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

  // Check if this is a verification message (full format or just code)
  if (isVerificationMessage(messageText) || verificationCodePattern.test(messageText)) {
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

  // Handle "Hello" greeting
  const normalizedMessage = messageText.toLowerCase().trim();
  const cleanMessage = normalizedMessage.replace(/[.,!?;:]+$/, '').trim();
  
  if (cleanMessage === 'hello' || cleanMessage === 'hi' || cleanMessage === 'hey') {
    try {
      const whatsappService = new WhatsAppService();
      const response = await whatsappService.sendTextMessage(message.from, 'Hi! 👋 How can I help you today?');
      
      logger.info(
        {
          messageId: message.id,
          senderPhone: message.from,
          userId: whatsappNumber.userId,
          responseMessageId: response.messages?.[0]?.id,
        },
        'Sent greeting response'
      );
      
      return; // Exit early, don't process as intent
    } catch (error) {
      logger.error(
        {
          error,
          messageId: message.id,
          senderPhone: message.from,
        },
        'Failed to send greeting response'
      );
      // Continue with normal processing if greeting fails
    }
  }

  // Check for pending clarifications first
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

  // Analyze intent using task intent service
  try {
    // Get user context for intent analysis
    const [folders, tasks] = await Promise.all([
      getUserFolders(db, whatsappNumber.userId).catch(() => []),
      getUserTasks(db, whatsappNumber.userId, { status: 'open' }).catch(() => []),
    ]);

    const taskIntentService = new TaskIntentAnalysisService();
    const intent = await taskIntentService.analyzeTaskIntent(messageText, {
      timezone: 'Africa/Johannesburg',
      currentTime: new Date(),
      userFolders: folders.map(f => ({
        name: f.name,
        id: f.id,
        parentId: f.parentId,
      })),
      recentTasks: tasks.slice(0, 10).map(t => ({
        title: t.title,
        folderName: t.folder?.name || null,
        status: t.status,
      })),
    });

    logger.info(
      {
        messageId: message.id,
        intentType: intent.intentType,
        action: intent.action,
        confidence: intent.confidence,
        userId: whatsappNumber.userId,
      },
      'Task intent analyzed'
    );

    // Handle based on intent type
    if (intent.intentType === 'task' && intent.confidence >= 0.5) {
      // Process task intent
      const result = await processTaskIntent(
        intent,
        db,
        whatsappNumber.userId,
        whatsappNumber.id,
        message.from
      );

      if (result.success) {
        logger.info(
          {
            messageId: message.id,
            action: intent.action,
            userId: whatsappNumber.userId,
          },
          'Task intent processed successfully'
        );
        return; // Exit early, task handled
      } else {
        // If task processing failed, send error message
        const whatsappService = new WhatsAppService();
        await whatsappService.sendTextMessage(message.from, result.message || 'Sorry, I couldn\'t process that request.');
        return;
      }
    } else if (intent.intentType === 'calendar' || intent.intentType === 'reminder' || intent.intentType === 'note') {
      // Route to calendar intent pipeline (existing system)
      await routeToCalendarIntent(message, messageText, db, whatsappNumber, summary);
      return;
    } else if (intent.intentType === 'unknown' || intent.confidence < 0.5) {
      // Return user message or route to calendar intent as fallback
      logger.info(
        {
          messageId: message.id,
          intentType: intent.intentType,
          confidence: intent.confidence,
        },
        'Intent unclear, routing to calendar intent as fallback'
      );
      await routeToCalendarIntent(message, messageText, db, whatsappNumber, summary);
      return;
    } else {
      // Unknown intent type, route to calendar intent
      await routeToCalendarIntent(message, messageText, db, whatsappNumber, summary);
      return;
    }
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
        userId: whatsappNumber.userId,
      },
      'Error analyzing task intent, falling back to calendar intent'
    );
    
    // Fallback to calendar intent processing
    await routeToCalendarIntent(message, messageText, db, whatsappNumber, summary);
  }
}

async function routeToCalendarIntent(
  message: any,
  messageText: string,
  db: Database,
  whatsappNumber: { id: string; userId: string },
  summary: WebhookProcessingSummary
): Promise<void> {
  // Create voice job for calendar intent processing (existing system)
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
          textLength: messageText.length,
        },
        'Enqueued text intent for calendar processing'
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

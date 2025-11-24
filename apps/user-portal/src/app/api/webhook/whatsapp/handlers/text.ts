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
  createFolder,
  createTask,
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

  // Handle "Create a task: [task name]" pattern
  const createTaskMatch = messageText.match(/^create\s+a\s+task\s*:\s*(.+)$/i);
  if (createTaskMatch) {
    const taskName = createTaskMatch[1].trim();
    
    if (taskName) {
      try {
        // Get or create "General" folder
        const folders = await getUserFolders(db, whatsappNumber.userId);
        let generalFolder = folders.find(f => f.name.toLowerCase() === 'general');
        
        if (!generalFolder) {
          // Create General folder if it doesn't exist
          logger.info(
            {
              userId: whatsappNumber.userId,
              senderPhone: message.from,
            },
            'Creating "General" folder for task creation'
          );
          generalFolder = await createFolder(db, {
            userId: whatsappNumber.userId,
            name: 'General',
            color: '#3B82F6', // Blue color
            icon: 'folder',
          });
        }
        
        // Create the task
        const task = await createTask(db, {
          userId: whatsappNumber.userId,
          folderId: generalFolder.id,
          title: taskName,
          status: 'open',
        });
        
        if (!task) {
          throw new Error('Failed to create task - no task returned');
        }
        
        logger.info(
          {
            taskId: task.id,
            taskName,
            folderId: generalFolder.id,
            userId: whatsappNumber.userId,
            senderPhone: message.from,
          },
          'Task created via WhatsApp message'
        );
        
        // Send confirmation message
        const whatsappService = new WhatsAppService();
        await whatsappService.sendTextMessage(
          message.from,
          `✅ Task created: "${taskName}"\n\nAdded to your General folder.`
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
            taskName,
            errorType: error?.constructor?.name,
          },
          'Failed to create task from WhatsApp message'
        );
        
        // Try to send error message to user
        try {
          const whatsappService = new WhatsAppService();
          await whatsappService.sendTextMessage(
            message.from,
            '❌ Sorry, I couldn\'t create that task. Please try again.'
          );
        } catch (sendError) {
          logger.error(
            { error: sendError, senderPhone: message.from },
            'Failed to send error message for task creation'
          );
        }
        
        // Continue with normal processing if task creation fails
      }
    }
  }

  // Handle "Hello" greeting (case-insensitive, with optional punctuation)
  const normalizedMessage = messageText.toLowerCase().trim();
  // Remove common punctuation at the end (., !, ?, etc.)
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
      // Check WhatsApp configuration before attempting to send
      const hasAccessToken = !!process.env.WHATSAPP_ACCESS_TOKEN;
      const hasPhoneNumberId = !!process.env.WHATSAPP_PHONE_NUMBER_ID;
      
      if (!hasAccessToken || !hasPhoneNumberId) {
        logger.error(
          {
            messageId: message.id,
            senderPhone: message.from,
            userId: whatsappNumber.userId,
            hasAccessToken,
            hasPhoneNumberId,
            missingVars: {
              WHATSAPP_ACCESS_TOKEN: !hasAccessToken,
              WHATSAPP_PHONE_NUMBER_ID: !hasPhoneNumberId,
            },
          },
          'WhatsApp environment variables missing - cannot send greeting response'
        );
        // Continue with normal processing if config is missing
      } else {
        const whatsappService = new WhatsAppService();
        const response = await whatsappService.sendTextMessage(message.from, 'Hi, Nice to meet you');
        
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
      }
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

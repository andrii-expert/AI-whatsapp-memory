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
import { WhatsAppService, matchesVerificationPhrase } from '@imaginecalendar/whatsapp';
import { WhatsappIntentRouterService, WhatsappTextAnalysisService } from '@imaginecalendar/ai-services';
import type { WebhookProcessingSummary } from '../types';
import { processTextClarification } from '../clarifications';
import { VOICE_STAGE_SEQUENCE } from '@imaginecalendar/database/constants/voice-timing';

export async function handleTextMessage(
  message: any,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<void> {
  const messageText = message.text?.body?.trim();

  if (!messageText) {
    return;
  }

  if (matchesVerificationPhrase(messageText)) {
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

  const router = new WhatsappIntentRouterService();
  let routedIntents: QuickIntent[] = [];
  try {
    routedIntents = await router.detectIntents(messageText);
  } catch (error) {
    logger.error(
      {
        error,
        senderPhone: message.from,
        userId: whatsappNumber.userId,
      },
      'Failed to route WhatsApp text intents'
    );
  }

  const keywordIntents = detectKeywordIntents(messageText);
  const combinedIntents = dedupeIntents([...routedIntents, ...keywordIntents]);

  if (combinedIntents.length > 0) {
    const analyzer = new WhatsappTextAnalysisService();
    const responses: string[] = [];

    for (const intent of combinedIntents) {
      try {
        let structuredResponse: string | null = null;
        switch (intent) {
          case 'task':
            structuredResponse = await analyzer.analyzeTask(messageText);
            break;
          case 'reminder':
            structuredResponse = await analyzer.analyzeReminder(messageText);
            break;
          case 'note':
            structuredResponse = await analyzer.analyzeNote(messageText);
            break;
          case 'event':
            structuredResponse = await analyzer.analyzeEvent(messageText);
            break;
          default:
            structuredResponse = null;
        }

        if (structuredResponse) {
          responses.push(structuredResponse);
        }
      } catch (intentError) {
        logger.error(
          {
            error: intentError,
            senderPhone: message.from,
            userId: whatsappNumber.userId,
            quickIntent: intent,
          },
          'Failed to analyze structured WhatsApp text intent'
        );
      }
    }

    if (responses.length > 0) {
      try {
        const whatsappService = new WhatsAppService();
        await whatsappService.sendTextMessage(message.from, responses.join('\n\n'));
        logger.info(
          {
            senderPhone: message.from,
            userId: whatsappNumber.userId,
            intentTypes: combinedIntents,
          },
          'Responded with structured WhatsApp text intent'
        );
        return;
      } catch (sendError) {
        logger.error(
          {
            error: sendError,
            senderPhone: message.from,
            userId: whatsappNumber.userId,
          },
          'Failed to send structured WhatsApp text response'
        );
      }
    } else {
      try {
        const whatsappService = new WhatsAppService();
        await whatsappService.sendTextMessage(message.from, "I'm sorry, I didn't understand. Could you rephrase?");
      } catch (fallbackError) {
        logger.error(
          {
            error: fallbackError,
            senderPhone: message.from,
            userId: whatsappNumber.userId,
          },
          'Failed to send fallback WhatsApp text response'
        );
      }
      return;
    }
  }

  // If no quick intent matched, acknowledge and exit to avoid silent failures
  try {
    const whatsappService = new WhatsAppService();
    await whatsappService.sendTextMessage(
      message.from,
      "I'm sorry, I didn't understand. Could you rephrase?"
    );
  } catch (error) {
    logger.error(
      {
        error,
        senderPhone: message.from,
        userId: whatsappNumber.userId,
      },
      'Failed to send fallback response when no intents detected'
    );
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

type QuickIntent = 'task' | 'reminder' | 'note' | 'event';

function dedupeIntents(intents: QuickIntent[]): QuickIntent[] {
  const seen = new Set<QuickIntent>();
  const ordered: QuickIntent[] = [];
  for (const intent of intents) {
    if (!seen.has(intent)) {
      seen.add(intent);
      ordered.push(intent);
    }
  }
  return ordered;
}

const QUICK_INTENT_KEYWORDS: Record<QuickIntent, string[]> = {
  task: ['task', 'tasks', 'todo', 'to-do', 'action item', 'follow up', 'follow-up'],
  reminder: ['reminder', 'remind', 'alarm', 'ping me', 'alert me', 'remind me'],
  note: ['note', 'notes', 'notebook', 'jot down', 'write this down', 'write a note'],
  event: ['event', 'events', 'meeting', 'meet', 'calendar', 'schedule', 'appointment'],
};

function detectKeywordIntents(text: string): QuickIntent[] {
  const normalized = text.toLowerCase();
  const detected: QuickIntent[] = [];

  if (containsKeyword(normalized, QUICK_INTENT_KEYWORDS.task)) {
    detected.push('task');
  }
  if (containsKeyword(normalized, QUICK_INTENT_KEYWORDS.reminder)) {
    detected.push('reminder');
  }
  if (containsKeyword(normalized, QUICK_INTENT_KEYWORDS.note)) {
    detected.push('note');
  }
  if (containsKeyword(normalized, QUICK_INTENT_KEYWORDS.event)) {
    detected.push('event');
  }

  return detected;
}

function containsKeyword(source: string, keywords: string[]): boolean {
  return keywords.some((keyword) => {
    const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(source);
  });
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

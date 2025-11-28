import { randomUUID } from 'crypto';
import type { Database } from '@imaginecalendar/database/client';
import {
  createVoiceMessageJob,
  getVerifiedWhatsappNumberByPhone,
  recordVoiceJobTiming,
  logIncomingWhatsAppMessage,
  updateVoiceMessageJobTranscription,
  updateVoiceMessageJobStatus,
} from '@imaginecalendar/database/queries';
import { getQueue, QUEUE_NAMES } from '@/lib/queues';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { TranscriptionService } from '@imaginecalendar/ai-services';
import type { WebhookProcessingSummary } from '../types';
import { VOICE_STAGE_SEQUENCE } from '@imaginecalendar/database/constants/voice-timing';
import { getWhatsAppConfig, getWhatsAppApiUrl } from '@imaginecalendar/whatsapp';

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
      
      // Send immediate acknowledgment
      try {
        await whatsappService.sendTextMessage(
          message.from,
          "🎤 I received your voice message! I'm processing it now and will send you the transcription shortly..."
        );
        logger.info({ messageId: message.id, senderPhone: message.from }, 'Sent acknowledgment message for voice');
      } catch (ackError) {
        logger.warn(
          { error: ackError, messageId: message.id, senderPhone: message.from },
          'Failed to send acknowledgment message, but continuing with processing'
        );
      }
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

    // Process directly in background (works even if worker is down)
    // This runs asynchronously and doesn't block the webhook response
    setImmediate(async () => {
      try {
        await processVoiceMessageDirectly(voiceJob.id, audioData.id, message.from, db);
        logger.info({ voiceJobId: voiceJob.id }, 'Direct processing completed successfully');
      } catch (directError) {
        logger.warn(
          { error: directError, voiceJobId: voiceJob.id },
          'Direct processing failed, falling back to queue'
        );
        
        // Fallback to queue processing
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
          logger.info({ voiceJobId: voiceJob.id }, 'Enqueued download audio job as fallback');
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
      }
    });

    summary.voiceJobIds.push(voiceJob.id);
    
    // Set up a fallback check to ensure user gets a response
    // This will check after 30 seconds if transcription completed and send response if worker failed
    setTimeout(async () => {
      try {
        const { getVoiceMessageJob } = await import('@imaginecalendar/database/queries');
        const checkJob = await getVoiceMessageJob(db, voiceJob.id);
        
        if (checkJob && checkJob.transcribedText && checkJob.status !== 'completed') {
          // Transcription exists but wasn't sent - send it now
          logger.warn(
            { voiceJobId: voiceJob.id, status: checkJob.status },
            'Transcription exists but job not completed - sending fallback response'
          );
          
          const whatsappService = new WhatsAppService();
          try {
            await whatsappService.sendTextMessage(
              message.from,
              checkJob.transcribedText
            );
            logger.info({ voiceJobId: voiceJob.id }, 'Sent fallback transcription response');
          } catch (sendError) {
            logger.error(
              { error: sendError, voiceJobId: voiceJob.id },
              'Failed to send fallback transcription response'
            );
          }
        } else if (checkJob && checkJob.status === 'failed' && !checkJob.transcribedText) {
          // Job failed without transcription - send error message
          logger.warn(
            { voiceJobId: voiceJob.id },
            'Voice job failed - sending fallback error message'
          );
          
          const whatsappService = new WhatsAppService();
          try {
            await whatsappService.sendTextMessage(
              message.from,
              "I'm sorry, I encountered an error processing your voice message. Please try again or send a text message instead."
            );
            logger.info({ voiceJobId: voiceJob.id }, 'Sent fallback error response');
          } catch (sendError) {
            logger.error(
              { error: sendError, voiceJobId: voiceJob.id },
              'Failed to send fallback error response'
            );
          }
        }
      } catch (fallbackError) {
        logger.error(
          { error: fallbackError, voiceJobId: voiceJob.id },
          'Fallback check failed'
        );
      }
    }, 30000); // Check after 30 seconds
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to create voice job for audio message'
    );
    
    // Try to send error message even if job creation failed
    try {
      const whatsappService = new WhatsAppService();
      await whatsappService.sendTextMessage(
        message.from,
        "I'm sorry, I encountered an error processing your voice message. Please try again."
      );
    } catch (sendError) {
      logger.error({ error: sendError, senderPhone: message.from }, 'Failed to send error message');
    }
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

/**
 * Process voice message directly without queue (fallback if worker is down)
 */
async function processVoiceMessageDirectly(
  voiceJobId: string,
  mediaId: string,
  senderPhone: string,
  db: Database
): Promise<void> {
  try {
    logger.info({ voiceJobId, mediaId, senderPhone }, 'Starting direct voice message processing');
    
    // Step 1: Download audio
    const config = getWhatsAppConfig();
    const apiUrl = getWhatsAppApiUrl();
    
    // Get media URL
    const mediaUrlResponse = await fetch(
      `${apiUrl}/${config.phoneNumberId}/media/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      }
    );
    
    if (!mediaUrlResponse.ok) {
      throw new Error(`Failed to get media URL: ${mediaUrlResponse.status} ${mediaUrlResponse.statusText}`);
    }
    
    const mediaUrlData = await mediaUrlResponse.json() as { url?: string };
    const mediaUrl = mediaUrlData.url;
    if (!mediaUrl) {
      throw new Error('Media URL not found in response');
    }
    
    // Download audio file with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    let audioResponse: Response;
    try {
      audioResponse = await fetch(mediaUrl, {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    
    const arrayBuffer = await audioResponse.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    logger.info({ voiceJobId, audioSize: audioBuffer.length }, 'Audio downloaded');
    
    // Step 2: Transcribe
    await updateVoiceMessageJobStatus(db, voiceJobId, 'transcribing');
    
    const transcriptionService = new TranscriptionService();
    const transcription = await transcriptionService.transcribe(audioBuffer, {
      language: 'en',
      enableFallback: true,
      enableTimestamps: false,
    });
    
    logger.info(
      { voiceJobId, textLength: transcription.text.length },
      'Transcription completed'
    );
    
    // Save transcription to database
    await updateVoiceMessageJobTranscription(db, voiceJobId, {
      transcribedText: transcription.text,
      transcriptionLanguage: transcription.language,
      sttProvider: transcription.provider,
    });
    
    // Step 3: Send transcribed text to user
    if (transcription.text && transcription.text.trim().length > 0) {
      const whatsappService = new WhatsAppService();
      
      try {
        // Try regular message first
        await whatsappService.sendTextMessage(senderPhone, transcription.text);
        logger.info({ voiceJobId, senderPhone }, 'Sent transcribed text via direct processing');
      } catch (regularError) {
        // Try template message as fallback
        logger.warn({ error: regularError, voiceJobId }, 'Regular message failed, trying template');
        try {
          await whatsappService.sendMessage(senderPhone, transcription.text, 'cc_me');
          logger.info({ voiceJobId, senderPhone }, 'Sent transcribed text via template');
        } catch (templateError) {
          logger.error({ error: templateError, voiceJobId }, 'Both message types failed');
          throw regularError;
        }
      }
      
      await updateVoiceMessageJobStatus(db, voiceJobId, 'completed');
    } else {
      // Empty transcription
      const whatsappService = new WhatsAppService();
      await whatsappService.sendTextMessage(
        senderPhone,
        "I received your voice message, but I couldn't transcribe any text from it. Please try speaking more clearly or send a text message instead."
      );
      await updateVoiceMessageJobStatus(db, voiceJobId, 'failed');
    }
    
    logger.info({ voiceJobId, senderPhone }, 'Direct voice message processing completed');
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        voiceJobId,
        senderPhone,
      },
      'Direct voice message processing failed'
    );
    
    // Try to send error message
    try {
      const whatsappService = new WhatsAppService();
      await whatsappService.sendTextMessage(
        senderPhone,
        "I'm sorry, I encountered an error processing your voice message. Please try again or send a text message instead."
      );
    } catch (sendError) {
      logger.error({ error: sendError, voiceJobId, senderPhone }, 'Failed to send error message');
    }
    
    // Re-throw so fallback to queue can happen
    throw error;
  }
}

// Transcribe audio processor

import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import {
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobTranscription,
  updateVoiceMessageJobError,
  updateVoiceMessageJobPause,
  updateVoiceMessageJobSnapshot,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { readFile } from 'node:fs/promises';
import { TranscriptionService } from '@imaginecalendar/ai-services';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { FileManager } from '../utils/file-manager';
import { ErrorHandler } from '../utils/error-handler';
import type { QueueManager } from '../utils/queue-manager';
import type { TranscribeAudioJobData } from '../config/queues';
import { withStageTiming } from '../utils/timing';

export async function processTranscribeAudio(
  job: Job<TranscribeAudioJobData>,
  db: Database,
  queueManager: QueueManager
): Promise<void> {
  const { voiceJobId, audioFilePath, mimeType } = job.data;

  logger.info(
    { 
      voiceJobId, 
      audioFilePath, 
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      timestamp: new Date().toISOString()
    }, 
    '=== PROCESSING TRANSCRIBE AUDIO JOB ==='
  );

  try {
    logger.info({ voiceJobId, audioFilePath }, 'Starting audio transcription');

    // Check if job is paused (for testing)
    const voiceJob = await getVoiceMessageJob(db, voiceJobId);
    if (voiceJob?.pausedAtStage) {
      logger.info({ voiceJobId, pausedAtStage: voiceJob.pausedAtStage }, 'Job is paused, re-queuing');
      await job.moveToDelayed(Date.now() + 5000, job.token);
      return;
    }

    // Update status
    await updateVoiceMessageJobStatus(db, voiceJobId, 'transcribing');

    const transcription = await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'transcription',
      metadata: ({ result }) => ({
        provider: result?.provider,
        fallbackUsed: result?.fallbackUsed ?? false,
        language: result?.language,
        textLength: result?.text?.length ?? 0,
      }),
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
        audioFilePath,
      }),
    }, async () => {
      const audioBuffer = await readFile(audioFilePath);
      const transcriptionService = new TranscriptionService();
      const result = await transcriptionService.transcribe(audioBuffer, {
        language: 'en',
        enableFallback: true,
        enableTimestamps: false,
      });

      await updateVoiceMessageJobTranscription(db, voiceJobId, {
        transcribedText: result.text,
        transcriptionLanguage: result.language,
        sttProvider: result.provider,
        ...(result.fallbackUsed && {
          sttProviderFallback: result.provider,
        }),
      });

      return result;
    });

    logger.info(
      {
        voiceJobId,
        textLength: transcription.text.length,
        provider: transcription.provider,
      },
      'Transcription completed'
    );

    // Get userId for next step
    const updatedVoiceJob = await getVoiceMessageJob(db, voiceJobId);

    if (!updatedVoiceJob) {
      throw new Error('Voice job not found');
    }

    // Check if we should pause after this stage (for testing)
    const testConfig = updatedVoiceJob.testConfiguration as { pauseAfterStage?: string } | null;
    const shouldPause = updatedVoiceJob.isTestJob && testConfig?.pauseAfterStage === 'transcribe';

    if (shouldPause) {
      logger.info({ voiceJobId }, 'Pausing after transcribe stage for testing');
      await updateVoiceMessageJobStatus(db, voiceJobId, 'paused_after_transcribe');
      await updateVoiceMessageJobPause(db, voiceJobId, 'transcribe');
      return;
    }

    // Cleanup audio file (unless it's a test job - keep for inspection)
    if (!updatedVoiceJob.isTestJob) {
      const fileManager = new FileManager();
      await fileManager.cleanup(audioFilePath);
    }

    // Update status
    await updateVoiceMessageJobStatus(db, voiceJobId, 'transcribed');

    // Send transcribed text directly back to user via WhatsApp
    const whatsappService = new WhatsAppService();
    const senderPhone = updatedVoiceJob.senderPhone;
    
    logger.info(
      { 
        voiceJobId, 
        senderPhone, 
        hasTranscription: !!transcription.text,
        transcriptionLength: transcription.text?.length || 0
      },
      'Preparing to send transcribed text to user'
    );
    
    if (!senderPhone) {
      logger.error({ voiceJobId }, 'Sender phone number is missing, cannot send response');
      throw new Error('Sender phone number is missing');
    }
    
    if (transcription.text && transcription.text.trim().length > 0) {
      try {
        logger.info(
          { voiceJobId, senderPhone, textLength: transcription.text.length, textPreview: transcription.text.substring(0, 50) },
          'Sending transcribed text to user'
        );
        
        let response;
        try {
          // Try sending as regular text message first (within 24-hour window)
          response = await whatsappService.sendTextMessage(
            senderPhone,
            transcription.text
          );
          
          logger.info(
            { voiceJobId, senderPhone, messageId: response?.messages?.[0]?.id },
            'Transcribed text sent to user successfully via regular message'
          );
        } catch (regularMessageError) {
          // If regular message fails (e.g., outside 24-hour window), try template message
          logger.warn(
            { 
              error: regularMessageError instanceof Error ? regularMessageError.message : String(regularMessageError),
              voiceJobId, 
              senderPhone 
            },
            'Regular message failed, trying template message as fallback'
          );
          
          try {
            // Use template message as fallback (works outside 24-hour window)
            response = await whatsappService.sendMessage(
              senderPhone,
              transcription.text,
              'cc_me' // Template name
            );
            
            logger.info(
              { voiceJobId, senderPhone, messageId: response?.messages?.[0]?.id },
              'Transcribed text sent to user successfully via template message'
            );
          } catch (templateError) {
            // If template also fails, throw the original error
            logger.error(
              { 
                error: templateError instanceof Error ? templateError.message : String(templateError),
                voiceJobId, 
                senderPhone 
              },
              'Both regular and template message failed'
            );
            throw regularMessageError; // Throw original error
          }
        }
        
        // Mark as completed
        await updateVoiceMessageJobStatus(db, voiceJobId, 'completed');
        
        // Send notification
        await queueManager.enqueueSendNotification({
          voiceJobId,
          senderPhone,
          success: true,
        });
      } catch (sendError) {
        const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
        logger.error(
          { 
            error: errorMessage,
            errorStack: sendError instanceof Error ? sendError.stack : undefined,
            voiceJobId, 
            senderPhone,
            transcribedText: transcription.text.substring(0, 100)
          },
          'Failed to send transcribed text to user - attempting to send error message'
        );
        
        // Try to send an error message to the user
        try {
          await whatsappService.sendTextMessage(
            senderPhone,
            `I transcribed your voice message, but encountered an error sending it back. Here's what I heard: "${transcription.text.substring(0, 200)}${transcription.text.length > 200 ? '...' : ''}"`
          );
          logger.info({ voiceJobId, senderPhone }, 'Sent error message with transcribed text to user');
        } catch (errorMessageError) {
          logger.error(
            { 
              error: errorMessageError instanceof Error ? errorMessageError.message : String(errorMessageError),
              voiceJobId, 
              senderPhone 
            },
            'Failed to send error message to user'
          );
        }
        
        // Mark as failed
        await updateVoiceMessageJobStatus(db, voiceJobId, 'failed');
        
        await queueManager.enqueueSendNotification({
          voiceJobId,
          senderPhone,
          success: false,
          errorMessage: `Failed to send transcribed text: ${errorMessage}`,
        });
      }
    } else {
      logger.warn({ voiceJobId, senderPhone }, 'Transcribed text is empty, sending message to user');
      
      // Still try to send a message to the user
      try {
        await whatsappService.sendTextMessage(
          senderPhone,
          "I received your voice message, but I couldn't transcribe any text from it. Please try speaking more clearly or send a text message instead."
        );
        logger.info({ voiceJobId, senderPhone }, 'Sent empty transcription message to user');
      } catch (sendError) {
        logger.error(
          { 
            error: sendError instanceof Error ? sendError.message : String(sendError),
            voiceJobId, 
            senderPhone 
          },
          'Failed to send empty transcription message to user'
        );
      }
      
      await updateVoiceMessageJobStatus(db, voiceJobId, 'failed');
      
      await queueManager.enqueueSendNotification({
        voiceJobId,
        senderPhone,
        success: false,
        errorMessage: 'No text was transcribed from the voice message',
      });
    }
  } catch (error) {
    const classifiedError = ErrorHandler.classify(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    ErrorHandler.log(classifiedError, { voiceJobId, audioFilePath, errorMessage });

    // Try to get voice job to send error message
    const voiceJob = await getVoiceMessageJob(db, voiceJobId);
    const senderPhone = voiceJob?.senderPhone;

    // Try to send error message to user
    if (senderPhone) {
      try {
        const whatsappService = new WhatsAppService();
        const userMessage = ErrorHandler.getUserMessage(classifiedError) || 
          "I'm sorry, I encountered an error processing your voice message. Please try again or send a text message.";
        await whatsappService.sendTextMessage(senderPhone, userMessage);
        logger.info({ voiceJobId, senderPhone }, 'Sent error message to user');
      } catch (sendError) {
        logger.error(
          { 
            error: sendError instanceof Error ? sendError.message : String(sendError),
            voiceJobId, 
            senderPhone 
          },
          'Failed to send error message to user'
        );
      }
    } else {
      logger.error({ voiceJobId }, 'Cannot send error message - sender phone number is missing');
    }

    // Update database with error
    await updateVoiceMessageJobError(db, voiceJobId, {
      errorMessage: classifiedError.message,
      errorStage: 'transcribing',
      retryCount: job.attemptsMade,
    });

    // Update status to failed
    await updateVoiceMessageJobStatus(db, voiceJobId, 'failed');

    // Cleanup audio file
    const fileManager = new FileManager();
    await fileManager.cleanup(audioFilePath).catch(() => {});

    // Rethrow if retryable
    if (classifiedError.isRetryable) {
      throw classifiedError.originalError;
    }

    // Otherwise, skip to notification
    if (voiceJob && senderPhone) {
      await queueManager.enqueueSendNotification({
        voiceJobId,
        senderPhone,
        success: false,
        errorMessage: ErrorHandler.getUserMessage(classifiedError),
      });
    }
  }
}

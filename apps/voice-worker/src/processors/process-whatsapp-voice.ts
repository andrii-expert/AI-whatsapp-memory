// Process WhatsApp voice message - uses same analysis as text messages

import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import {
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobError,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsappTextAnalysisService, WhatsappIntentRouterService } from '@imaginecalendar/ai-services';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { ErrorHandler } from '../utils/error-handler';
import type { QueueManager } from '../utils/queue-manager';
import type { ProcessWhatsAppVoiceJobData } from '../config/queues';
import { withStageTiming } from '../utils/timing';

// Helper functions from text handler
function isErrorOrFallbackResponse(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return (
    normalized.includes("i'm sorry") ||
    normalized.includes("i didn't understand") ||
    normalized.includes("couldn't interpret") ||
    normalized.includes("could you rephrase") ||
    normalized.includes("please rephrase") ||
    normalized.length === 0
  );
}

function isValidTemplateResponse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isErrorOrFallbackResponse(trimmed)) {
    return false;
  }
  
  const templatePatterns = [
    /^Create a task:/i,
    /^Edit a task:/i,
    /^Delete a task:/i,
    /^Complete a task:/i,
    /^Move a task:/i,
    /^Share a task:/i,
    /^Create a task folder:/i,
    /^Edit a task folder:/i,
    /^Delete a task folder:/i,
    /^Share a task folder:/i,
    /^Create a task sub-folder:/i,
    /^Create a reminder:/i,
    /^Update a reminder:/i,
    /^Delete a reminder:/i,
    /^Pause a reminder:/i,
    /^Resume a reminder:/i,
    /^Create a note:/i,
    /^Update a note:/i,
    /^Delete a note:/i,
    /^Move a note:/i,
    /^Share a note:/i,
    /^Create a note folder:/i,
    /^Create a note sub-folder:/i,
    /^Edit a note folder:/i,
    /^Delete a note folder:/i,
    /^Share a note folder:/i,
  ];
  
  return templatePatterns.some(pattern => pattern.test(trimmed));
}

export async function processWhatsAppVoice(
  job: Job<ProcessWhatsAppVoiceJobData>,
  db: Database,
  queueManager: QueueManager
): Promise<void> {
  const { voiceJobId, userId, whatsappNumberId, transcribedText, senderPhone } = job.data;

  try {
    logger.info(
      { voiceJobId, userId, textLength: transcribedText.length },
      'Starting WhatsApp voice message processing'
    );

    // Check if job is paused (for testing)
    const voiceJob = await getVoiceMessageJob(db, voiceJobId);
    if (voiceJob?.pausedAtStage) {
      logger.info({ voiceJobId, pausedAtStage: voiceJob.pausedAtStage }, 'Job is paused, re-queuing');
      await job.moveToDelayed(Date.now() + 5000, job.token);
      return;
    }

    // Update status
    await updateVoiceMessageJobStatus(db, voiceJobId, 'processing_whatsapp');

    // Use the same analysis flow as text messages
    const router = new WhatsappIntentRouterService();
    const analyzer = new WhatsappTextAnalysisService();
    const whatsappService = new WhatsAppService();

    // Step 1: Detect which intent(s) are present in the message
    logger.debug({ textLength: transcribedText.length, userId }, 'Detecting intent with router');
    const detectedIntents = await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'whatsapp_intent_detection',
      metadata: ({ result }) => ({
        detectedIntents: result?.detectedIntents,
        primaryIntent: result?.primaryIntent,
      }),
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    }, async () => {
      const intents = await router.detectIntents(transcribedText);
      const primaryIntent = router.getPrimaryIntent(intents);
      return { detectedIntents: intents, primaryIntent };
    });

    const primaryIntent = detectedIntents.primaryIntent;

    logger.info(
      {
        detectedIntents: detectedIntents.detectedIntents,
        primaryIntent,
        userId,
        messageText: transcribedText.substring(0, 100),
      },
      'Intent detection completed'
    );

    // Step 2: Only analyze with the primary intent (priority: task > note > reminder > event)
    if (!primaryIntent) {
      logger.warn(
        {
          senderPhone,
          userId,
          messageText: transcribedText,
          detectedIntents: detectedIntents.detectedIntents,
        },
        'No intent detected, sending fallback message'
      );
      
      const fallbackMessage = "I'm sorry, I couldn't interpret that request. Could you rephrase with more detail?";
      await whatsappService.sendTextMessage(senderPhone, fallbackMessage);
      
      await updateVoiceMessageJobStatus(db, voiceJobId, 'completed');
      await queueManager.enqueueSendNotification({
        voiceJobId,
        senderPhone,
        success: true,
      });
      return;
    }

    // Step 3: Analyze only the primary intent
    let aiResponse: string;
    try {
      logger.info(
        {
          intent: primaryIntent,
          userId,
          messageText: transcribedText.substring(0, 100),
        },
        `Analyzing message with ${primaryIntent} intent only`
      );

      aiResponse = await withStageTiming(db, {
        jobId: voiceJobId,
        stage: 'whatsapp_ai_analysis',
        metadata: ({ result }) => ({
          intent: primaryIntent,
          responseLength: result?.length ?? 0,
        }),
        errorMetadata: (error) => ({
          error: error instanceof Error ? error.message : String(error),
          intent: primaryIntent,
        }),
      }, async () => {
        switch (primaryIntent) {
          case 'task':
            return (await analyzer.analyzeTask(transcribedText)).trim();
          case 'note':
            return (await analyzer.analyzeNote(transcribedText)).trim();
          case 'reminder':
            return (await analyzer.analyzeReminder(transcribedText)).trim();
          case 'event':
            return (await analyzer.analyzeEvent(transcribedText)).trim();
          default:
            throw new Error(`Unknown intent: ${primaryIntent}`);
        }
      });

      logger.debug(
        {
          intent: primaryIntent,
          responseLength: aiResponse.length,
          responsePreview: aiResponse.substring(0, 200),
          userId,
        },
        'Got response from AI analyzer'
      );

      // Step 4: Parse and execute the action (only for task operations for now)
      if (primaryIntent === 'task' && isValidTemplateResponse(aiResponse)) {
        const { ActionExecutor } = await import('@imaginecalendar/whatsapp');
        const executor = new ActionExecutor(db, userId, whatsappService, senderPhone);
        const parsed = executor.parseAction(aiResponse);
        
        if (parsed) {
          logger.info(
            {
              action: parsed.action,
              resourceType: parsed.resourceType,
              userId,
            },
            'Executing parsed action'
          );

          const result = await executor.executeAction(parsed);
          await whatsappService.sendTextMessage(senderPhone, result.message);
          
          logger.info(
            {
              success: result.success,
              action: parsed.action,
              userId,
            },
            'Action execution completed'
          );
        } else {
          // AI returned an error/fallback response
          await whatsappService.sendTextMessage(senderPhone, aiResponse);
        }
      } else if (isValidTemplateResponse(aiResponse)) {
        // For non-task intents, just send the AI response for now
        await whatsappService.sendTextMessage(senderPhone, aiResponse);
        logger.info(
          {
            senderPhone,
            userId,
            intent: primaryIntent,
            responseLength: aiResponse.length,
          },
          'Sent AI response to user (not executed yet)'
        );
      } else {
        logger.warn(
          {
            senderPhone,
            userId,
            intent: primaryIntent,
            response: aiResponse,
            isError: isErrorOrFallbackResponse(aiResponse),
          },
          'AI response was invalid or fallback'
        );
        
        const fallbackMessage = "I'm sorry, I couldn't interpret that request. Could you rephrase with more detail?";
        await whatsappService.sendTextMessage(senderPhone, fallbackMessage);
      }

      // Mark as completed
      await updateVoiceMessageJobStatus(db, voiceJobId, 'completed');
      await queueManager.enqueueSendNotification({
        voiceJobId,
        senderPhone,
        success: true,
      });
    } catch (error) {
      logger.error(
        {
          error,
          intent: primaryIntent,
          userId,
          messageText: transcribedText,
        },
        'AI analysis or action execution failed'
      );
      
      try {
        await whatsappService.sendTextMessage(
          senderPhone,
          "I'm sorry, I encountered an error processing your message. Please try again."
        );
      } catch (sendError) {
        logger.error({ error: sendError, senderPhone }, 'Failed to send error response');
      }

      throw error; // Re-throw to trigger error handling below
    }
  } catch (error) {
    const classifiedError = ErrorHandler.classify(error);
    ErrorHandler.log(classifiedError, { voiceJobId, userId });

    // Update database with error
    await updateVoiceMessageJobError(db, voiceJobId, {
      errorMessage: classifiedError.message,
      errorStage: 'processing_whatsapp',
      retryCount: job.attemptsMade,
    });

    // Rethrow if retryable
    if (classifiedError.isRetryable) {
      throw classifiedError.originalError;
    }

    // Otherwise, skip to notification
    const voiceJob = await getVoiceMessageJob(db, voiceJobId);

    if (voiceJob) {
      await queueManager.enqueueSendNotification({
        voiceJobId,
        senderPhone: voiceJob.senderPhone,
        success: false,
        errorMessage: ErrorHandler.getUserMessage(classifiedError),
      });
    }
  }
}


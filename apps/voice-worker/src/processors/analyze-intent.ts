// Analyze intent processor

import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import {
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobIntent,
  updateVoiceMessageJobError,
  updateVoiceMessageJobPause,
  updateVoiceMessageJobSnapshot,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { IntentAnalysisService } from '@imaginecalendar/ai-services';
import { ErrorHandler } from '../utils/error-handler';
import type { QueueManager } from '../utils/queue-manager';
import type { AnalyzeIntentJobData } from '../config/queues';
import { withStageTiming } from '../utils/timing';

export async function processAnalyzeIntent(
  job: Job<AnalyzeIntentJobData>,
  db: Database,
  queueManager: QueueManager
): Promise<void> {
  const { voiceJobId, userId } = job.data;
  let { transcribedText } = job.data;

  try {
    // If transcribedText is missing, fetch from database
    if (!transcribedText) {
      const voiceJob = await getVoiceMessageJob(db, voiceJobId);
      if (!voiceJob?.transcribedText) {
        throw new Error('No transcribed text available for analysis');
      }
      transcribedText = voiceJob.transcribedText;
    }

    logger.info({ voiceJobId, userId, textLength: transcribedText.length }, 'Starting intent analysis');

    // Check if job is paused (for testing)
    const voiceJob = await getVoiceMessageJob(db, voiceJobId);
    if (voiceJob?.pausedAtStage) {
      logger.info({ voiceJobId, pausedAtStage: voiceJob.pausedAtStage }, 'Job is paused, re-queuing');
      await job.moveToDelayed(Date.now() + 5000, job.token);
      return;
    }

    // Update status
    await updateVoiceMessageJobStatus(db, voiceJobId, 'analyzing');

    // Analyze intent with AI SDK
    const intentService = new IntentAnalysisService();
    const intent = await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'intent_analysis',
      metadata: ({ result }) => ({
        action: result?.action,
        confidence: result?.confidence,
        missingFields: result?.missingFields?.length ?? 0,
      }),
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    }, () =>
      intentService.analyzeCalendarIntent(transcribedText, {
        userId,
        currentDate: new Date(),
        // TODO: Get timezone from user preferences
      })
    );

    // Update database with intent
    await updateVoiceMessageJobIntent(db, voiceJobId, {
      intentAnalysis: intent,
      intentProvider: 'openai-gpt4o-mini',
    });

    logger.info(
      {
        voiceJobId,
        action: intent.action,
        confidence: intent.confidence,
        hasMissingFields: (intent.missingFields?.length || 0) > 0,
      },
      'Intent analysis completed'
    );

    // Check if we should pause after this stage (for testing)
    const updatedVoiceJob = await getVoiceMessageJob(db, voiceJobId);

    if (!updatedVoiceJob) {
      throw new Error('Voice job not found after analysis');
    }

    const testConfig = updatedVoiceJob.testConfiguration as { pauseAfterStage?: string } | null;
    const shouldPause = updatedVoiceJob.isTestJob && testConfig?.pauseAfterStage === 'analyze';

    if (shouldPause) {
      logger.info({ voiceJobId }, 'Pausing after analyze stage for testing');
      await updateVoiceMessageJobStatus(db, voiceJobId, 'paused_after_analyze');
      await updateVoiceMessageJobPause(db, voiceJobId, 'analyze');
      return;
    }

    const intentJobId = updatedVoiceJob.intentJobId ?? voiceJob?.intentJobId ?? randomUUID();

    if (!updatedVoiceJob.intentJobId) {
      await updateVoiceMessageJobSnapshot(db, voiceJobId, {
        intentJobId,
      });
    }

    await queueManager.enqueueProcessIntent({
      jobId: voiceJobId,
      voiceJobId,
      intentJobId,
      userId,
      whatsappNumberId: updatedVoiceJob.whatsappNumberId,
      transcribedText,
      senderPhone: updatedVoiceJob.senderPhone,
    });
  } catch (error) {
    const classifiedError = ErrorHandler.classify(error);
    ErrorHandler.log(classifiedError, { voiceJobId, userId });

    // Update database with error
    await updateVoiceMessageJobError(db, voiceJobId, {
      errorMessage: classifiedError.message,
      errorStage: 'analyzing',
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

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

    // Enqueue next job: analyze intent
    await updateVoiceMessageJobStatus(db, voiceJobId, 'transcribed');

    const intentJobId = updatedVoiceJob.intentJobId ?? randomUUID();

    if (!updatedVoiceJob.intentJobId) {
      await updateVoiceMessageJobSnapshot(db, voiceJobId, {
        intentJobId,
      });
    }

    await queueManager.enqueueProcessIntent({
      jobId: voiceJobId,
      voiceJobId,
      intentJobId,
      userId: updatedVoiceJob.userId,
      whatsappNumberId: updatedVoiceJob.whatsappNumberId,
      transcribedText: transcription.text,
      senderPhone: updatedVoiceJob.senderPhone,
    });
  } catch (error) {
    const classifiedError = ErrorHandler.classify(error);
    ErrorHandler.log(classifiedError, { voiceJobId, audioFilePath });

    // Update database with error
    await updateVoiceMessageJobError(db, voiceJobId, {
      errorMessage: classifiedError.message,
      errorStage: 'transcribing',
      retryCount: job.attemptsMade,
    });

    // Cleanup audio file
    const fileManager = new FileManager();
    await fileManager.cleanup(audioFilePath).catch(() => {});

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

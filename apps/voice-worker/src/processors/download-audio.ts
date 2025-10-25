// Download audio processor

import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import {
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobAudio,
  updateVoiceMessageJobError,
  updateVoiceMessageJobPause,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { AudioDownloader } from '../services/audio-downloader';
import { FileManager } from '../utils/file-manager';
import { ErrorHandler } from '../utils/error-handler';
import type { QueueManager } from '../utils/queue-manager';
import type { DownloadAudioJobData } from '../config/queues';
import { withStageTiming } from '../utils/timing';

export async function processDownloadAudio(
  job: Job<DownloadAudioJobData>,
  db: Database,
  queueManager: QueueManager
): Promise<void> {
  const { voiceJobId, mediaId, mimeType } = job.data;

  try {
    logger.info({ voiceJobId, mediaId }, 'Starting audio download');

    // Check if job is paused (for testing)
    const voiceJob = await getVoiceMessageJob(db, voiceJobId);
    if (voiceJob?.pausedAtStage) {
      logger.info({ voiceJobId, pausedAtStage: voiceJob.pausedAtStage }, 'Job is paused, re-queuing');
      // Re-queue after a delay to check again
      await job.moveToDelayed(Date.now() + 5000, job.token);
      return;
    }

    // Update status
    await updateVoiceMessageJobStatus(db, voiceJobId, 'downloading');

    const downloadResult = await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'audio_download',
      metadata: ({ result }) => ({
        sizeBytes: result?.size,
        durationSeconds: result?.duration,
        mimeType: result?.mimeType,
      }),
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
        mediaId,
      }),
    }, async () => {
      const audioDownloader = new AudioDownloader();
      const audioData = await audioDownloader.download(mediaId);

      const fileManager = new FileManager();
      const audioFilePath = await fileManager.saveTemp(audioData.buffer, audioData.mimeType);

      await updateVoiceMessageJobAudio(db, voiceJobId, {
        audioFilePath,
        audioFileSizeBytes: audioData.size,
        audioDurationSeconds: audioData.duration,
        mimeType: audioData.mimeType,
      });

      return {
        audioFilePath,
        size: audioData.size,
        duration: audioData.duration,
        mimeType: audioData.mimeType,
      };
    });

    const audioFilePath = downloadResult?.audioFilePath;
    const size = downloadResult?.size;

    logger.info(
      { voiceJobId, audioFilePath, size },
      'Audio download completed'
    );

    // Check if we should pause after this stage (for testing)
    const updatedVoiceJob = await getVoiceMessageJob(db, voiceJobId);
    const testConfig = updatedVoiceJob?.testConfiguration as { pauseAfterStage?: string } | null;
    const shouldPause = updatedVoiceJob?.isTestJob && testConfig?.pauseAfterStage === 'download';

    if (shouldPause) {
      logger.info({ voiceJobId }, 'Pausing after download stage for testing');
      await updateVoiceMessageJobStatus(db, voiceJobId, 'paused_after_download');
      await updateVoiceMessageJobPause(db, voiceJobId, 'download');
      return;
    }

    if (!downloadResult?.audioFilePath) {
      throw new Error('Audio file path missing after download stage');
    }

    // Enqueue next job: transcribe
    await queueManager.enqueueTranscribeAudio({
      voiceJobId,
      audioFilePath: downloadResult.audioFilePath,
      mimeType: downloadResult?.mimeType ?? mimeType,
    });
  } catch (error) {
    const classifiedError = ErrorHandler.classify(error);
    ErrorHandler.log(classifiedError, { voiceJobId, mediaId });

    // Update database with error
    await updateVoiceMessageJobError(db, voiceJobId, {
      errorMessage: classifiedError.message,
      errorStage: 'downloading',
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

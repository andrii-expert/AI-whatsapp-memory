// Send notification processor - final step

import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import type { IntentSnapshot } from '@imaginecalendar/ai-services';
import {
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { NotificationService } from '../services/notification';
import type { SendNotificationJobData } from '../config/queues';
import { withStageTiming } from '../utils/timing';

export async function processSendNotification(
  job: Job<SendNotificationJobData>,
  db: Database
): Promise<void> {
  const { voiceJobId, senderPhone, success, eventId, errorMessage } = job.data;

  try {
    logger.info({ voiceJobId, success, eventId }, 'Sending notification');

    // Check if job is paused (for testing)
    const initialVoiceJob = await getVoiceMessageJob(db, voiceJobId);
    if (initialVoiceJob?.pausedAtStage) {
      logger.info({ voiceJobId, pausedAtStage: initialVoiceJob.pausedAtStage }, 'Job is paused, re-queuing');
      // Re-queue after a delay to check again
      throw new Error('Job paused - will retry');
    }

    const notificationService = new NotificationService();

    await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'notification_send',
      metadata: ({ result }) => result,
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    }, async () => {
      if (success && eventId) {
        const latestVoiceJob = await getVoiceMessageJob(db, voiceJobId);

        if (!latestVoiceJob || !latestVoiceJob.transcribedText) {
          throw new Error('Voice job data not found for success notification');
        }

        let intent: any;
        if (latestVoiceJob.intentAnalysis) {
          intent = latestVoiceJob.intentAnalysis;
        } else if (latestVoiceJob.intentSnapshot) {
          const snapshot = latestVoiceJob.intentSnapshot as IntentSnapshot;
          const { iso } = snapshot.datetime ?? {};
          const startDate = iso ? iso.slice(0, 10) : undefined;
          const timeSegment = iso ? iso.split('T')[1] : undefined;
          const startTime = timeSegment ? timeSegment.slice(0, 5) : undefined;

          intent = {
            action: snapshot.action,
            title: snapshot.title,
            startDate,
            startTime,
            duration: snapshot.durationMinutes,
            location: snapshot.location?.value,
            attendees: snapshot.attendees?.map(a => a.name).filter(Boolean),
          };
        } else {
          throw new Error('Neither intentAnalysis nor intentSnapshot found');
        }

        const startDateTime = intent.startTime
          ? new Date(`${intent.startDate}T${intent.startTime}:00+02:00`)
          : new Date(intent.startDate);

        let endDateTime: Date;
        if (intent.endDate && intent.endTime) {
          endDateTime = new Date(`${intent.endDate}T${intent.endTime}:00+02:00`);
        } else if (intent.duration) {
          endDateTime = new Date(startDateTime);
          endDateTime.setMinutes(endDateTime.getMinutes() + intent.duration);
        } else if (intent.endDate) {
          endDateTime = new Date(intent.endDate);
        } else {
          endDateTime = new Date(startDateTime);
          endDateTime.setHours(endDateTime.getHours() + 1);
        }

        const event = {
          id: eventId,
          title: intent.title || 'Event',
          start: startDateTime,
          end: endDateTime,
          provider: (latestVoiceJob.calendarProvider as 'google' | 'microsoft') || 'google',
        };

        await notificationService.sendSuccess(
          senderPhone,
          event,
          intent,
          latestVoiceJob.transcribedText,
          {
            db,
            whatsappNumberId: latestVoiceJob.whatsappNumberId,
            userId: latestVoiceJob.userId,
          }
        );

        await updateVoiceMessageJobStatus(db, voiceJobId, 'completed', new Date());

        logger.info({ voiceJobId, eventId }, 'Success notification sent, job completed');

        return {
          success: true,
          eventId,
          channel: 'whatsapp',
        };
      }

      const errorVoiceJob = initialVoiceJob ?? await getVoiceMessageJob(db, voiceJobId);
      await notificationService.sendError(
        senderPhone,
        errorMessage,
        errorVoiceJob
          ? {
              db,
              whatsappNumberId: errorVoiceJob.whatsappNumberId,
              userId: errorVoiceJob.userId,
            }
          : undefined
      );
      logger.info({ voiceJobId }, 'Error notification sent');

      return {
        success: false,
        channel: 'whatsapp',
      };
    });
  } catch (error) {
    // Notification failures should not fail the job
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        voiceJobId,
        senderPhone,
      },
      'Failed to send notification (non-critical)'
    );

    // Still mark as completed if the event was created successfully
    if (success) {
      await updateVoiceMessageJobStatus(db, voiceJobId, 'completed', new Date());
    }
  }
}

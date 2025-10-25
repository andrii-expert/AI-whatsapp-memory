import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import {
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobError,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import {
  calendarIntentSchema,
  type CalendarIntent,
  type IntentSnapshot,
} from '@imaginecalendar/ai-services';
import { CalendarService } from '../services/calendar-service';
import { NotificationService } from '../services/notification';
import { ErrorHandler } from '../utils/error-handler';
import type { QueueManager } from '../utils/queue-manager';
import type { DeleteEventJobData } from '../config/queues';
import { withStageTiming } from '../utils/timing';

export async function processDeleteEvent(
  job: Job<DeleteEventJobData>,
  db: Database,
  _queueManager: QueueManager
): Promise<void> {
  const { voiceJobId, userId } = job.data;

  try {
    logger.info({ voiceJobId, userId }, 'Starting calendar event deletion');

    const voiceJob = await getVoiceMessageJob(db, voiceJobId);

    if (!voiceJob) {
      throw new Error('Voice job not found');
    }

    const intent = extractCalendarIntent(voiceJob, 'DELETE');

    if (!intent) {
      throw new Error('No resolved DELETE intent found for this job');
    }

    await updateVoiceMessageJobStatus(db, voiceJobId, 'deleting_event');

    const deletionResult = await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'event_delete',
      metadata: ({ result }) => ({
        provider: result?.event?.provider,
        eventId: result?.event?.id,
      }),
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    }, async () => {
      const calendarService = new CalendarService(db);
      const result = await calendarService.delete(userId, intent);

      if (!result.success || !result.event) {
        throw new Error(result.message || 'Failed to delete calendar event');
      }

      return result;
    });

    const deletedEvent = deletionResult.event;
    if (!deletedEvent) {
      throw new Error('Calendar service did not return event details after deletion');
    }

    await updateVoiceMessageJobStatus(db, voiceJobId, 'completed', new Date());

    const notificationService = new NotificationService();
    await notificationService.sendDeleteSuccess(
      voiceJob.senderPhone,
      deletedEvent,
      intent,
      {
        db,
        whatsappNumberId: voiceJob.whatsappNumberId,
        userId: voiceJob.userId,
      }
    );
  } catch (error) {
    const classifiedError = ErrorHandler.classify(error);
    ErrorHandler.log(classifiedError, { voiceJobId, userId });

    await updateVoiceMessageJobError(db, voiceJobId, {
      errorMessage: classifiedError.message,
      errorStage: 'deleting_event',
      retryCount: job.attemptsMade,
    });

    if (classifiedError.isRetryable) {
      throw classifiedError.originalError;
    }

    const voiceJob = await getVoiceMessageJob(db, voiceJobId);
    if (voiceJob?.senderPhone) {
      const notificationService = new NotificationService();
      await notificationService.sendError(
        voiceJob.senderPhone,
        ErrorHandler.getUserMessage(classifiedError),
        {
          db,
          whatsappNumberId: voiceJob.whatsappNumberId,
          userId: voiceJob.userId,
        }
      );
    }
  }
}

function extractCalendarIntent(
  voiceJob: any,
  expectedAction: 'DELETE'
): CalendarIntent | null {
  if (voiceJob.intentAnalysis?.action === expectedAction) {
    return voiceJob.intentAnalysis as CalendarIntent;
  }

  if (!voiceJob.intentSnapshot) {
    return null;
  }

  try {
    const snapshot = voiceJob.intentSnapshot as IntentSnapshot;

    if (snapshot.action !== expectedAction) {
      return null;
    }

    const { iso } = snapshot.datetime ?? {};
    const startDate = iso ? iso.slice(0, 10) : undefined;
    const timeSegment = iso ? iso.split('T')[1] : undefined;
    const startTime = timeSegment ? timeSegment.slice(0, 5) : undefined;

    const payload: Record<string, unknown> = {
      action: snapshot.action,
      title: snapshot.title ?? undefined,
      startDate,
      startTime,
      duration: snapshot.durationMinutes ?? undefined,
      targetEventTitle: snapshot.conflict?.summary ?? snapshot.title ?? undefined,
      targetEventDate: startDate,
      targetEventTime: startTime,
      confidence: snapshot.confidence,
      missingFields: [] as string[],
    };

    if (snapshot.datetime?.precision === 'date') {
      payload.isAllDay = true;
    }

    return calendarIntentSchema.parse(payload);
  } catch (error) {
    logger.error({ error, voiceJobId: voiceJob.id }, 'Failed to convert intent snapshot for delete');
    return null;
  }
}

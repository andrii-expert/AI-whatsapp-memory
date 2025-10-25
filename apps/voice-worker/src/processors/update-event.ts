import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import {
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobCalendarEvent,
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
import type { UpdateEventJobData } from '../config/queues';
import { withStageTiming } from '../utils/timing';

export async function processUpdateEvent(
  job: Job<UpdateEventJobData>,
  db: Database,
  _queueManager: QueueManager
): Promise<void> {
  const { voiceJobId, userId } = job.data;

  try {
    logger.info({ voiceJobId, userId }, 'Starting calendar event update');

    const voiceJob = await getVoiceMessageJob(db, voiceJobId);

    if (!voiceJob) {
      throw new Error('Voice job not found');
    }

    const intent = extractCalendarIntent(voiceJob, 'UPDATE');

    if (!intent) {
      throw new Error('No resolved UPDATE intent found for this job');
    }

    await updateVoiceMessageJobStatus(db, voiceJobId, 'updating_event');

    const updateResult = await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'event_update',
      metadata: ({ result }) => ({
        provider: result?.event?.provider,
        eventId: result?.event?.id,
      }),
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    }, async () => {
      const calendarService = new CalendarService(db);
      const result = await calendarService.update(userId, intent);

      if (!result.success || !result.event) {
        throw new Error(result.message || 'Failed to update calendar event');
      }

      return result;
    });

    const updatedEvent = updateResult.event;
    if (!updatedEvent) {
      throw new Error('Calendar service did not return event after update');
    }

    await updateVoiceMessageJobCalendarEvent(db, voiceJobId, {
      calendarEventId: updatedEvent.id,
      calendarProvider: updatedEvent.provider,
    });

    await updateVoiceMessageJobStatus(db, voiceJobId, 'completed', new Date());

    const notificationService = new NotificationService();
    await notificationService.sendUpdateSuccess(
      voiceJob.senderPhone,
      updatedEvent,
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
      errorStage: 'updating_event',
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
  expectedAction: 'UPDATE'
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

    // Filter attendees: only include those with valid email addresses
    // This prevents "myself", "me", etc. from being added as attendees
    const attendees = snapshot.attendees
      .filter((attendee) => attendee.email && attendee.email.trim().length > 0)
      .map((attendee) => attendee.name?.trim())
      .filter((name): name is string => Boolean(name && name.length > 0));

    const payload: Record<string, unknown> = {
      action: snapshot.action,
      title: snapshot.title ?? undefined,
      startDate,
      startTime,
      duration: snapshot.durationMinutes ?? undefined,
      location: snapshot.location?.value ?? undefined,
      attendees: attendees.length ? attendees : undefined,
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
    logger.error({ error, voiceJobId: voiceJob.id }, 'Failed to convert intent snapshot for update');
    return null;
  }
}

// Create calendar event processor

import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import {
  calendarIntentSchema,
  type CalendarIntent,
  type IntentSnapshot,
} from '@imaginecalendar/ai-services';
import {
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobCalendarEvent,
  updateVoiceMessageJobError,
  updateVoiceMessageJobPause,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { CalendarService } from '../services/calendar-service';
import { NotificationService } from '../services/notification';
import { ErrorHandler } from '../utils/error-handler';
import type { QueueManager } from '../utils/queue-manager';
import type { CreateEventJobData } from '../config/queues';
import { withStageTiming } from '../utils/timing';

export async function processCreateEvent(
  job: Job<CreateEventJobData>,
  db: Database,
  queueManager: QueueManager
): Promise<void> {
  const { voiceJobId, userId } = job.data;

  try {
    logger.info({ voiceJobId, userId }, 'Starting calendar event creation');

    // Get voice job with intent
    const voiceJob = await getVoiceMessageJob(db, voiceJobId);

    // Check if job is paused (for testing)
    if (voiceJob?.pausedAtStage) {
      logger.info({ voiceJobId, pausedAtStage: voiceJob.pausedAtStage }, 'Job is paused, re-queuing');
      await job.moveToDelayed(Date.now() + 5000, job.token);
      return;
    }

    if (!voiceJob) {
      throw new Error('Voice job not found');
    }

    const intent = extractCalendarIntent(voiceJob, 'CREATE');

    if (!intent) {
      throw new Error('Intent analysis not found or invalid for CREATE action');
    }

    // Update status
    await updateVoiceMessageJobStatus(db, voiceJobId, 'creating_event');

    const creationResult = await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'event_create',
      metadata: ({ result }) => ({
        provider: result?.event?.provider,
        eventId: result?.event?.id,
      }),
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    }, async () => {
      const calendarService = new CalendarService(db);
      const result = await calendarService.create(userId, intent);

      if (!result.success || !result.event) {
        throw new Error(result.message || 'Failed to create calendar event');
      }

      return result;
    });

    const event = creationResult.event;
    if (!event) {
      throw new Error('Calendar service did not return event details after successful creation');
    }

    // Update database with event info
    await updateVoiceMessageJobCalendarEvent(db, voiceJobId, {
      calendarEventId: event.id,
      calendarProvider: event.provider,
    });

    logger.info({ voiceJobId, eventId: event.id, provider: event.provider }, 'Calendar event created');

    // Check if we should pause after this stage (for testing)
    const updatedVoiceJob = await getVoiceMessageJob(db, voiceJobId);
    const testConfig = updatedVoiceJob?.testConfiguration as { pauseAfterStage?: string } | null;
    const shouldPause = updatedVoiceJob?.isTestJob && testConfig?.pauseAfterStage === 'create';

    if (shouldPause) {
      logger.info({ voiceJobId }, 'Pausing after create stage for testing');
      await updateVoiceMessageJobStatus(db, voiceJobId, 'paused_after_create');
      await updateVoiceMessageJobPause(db, voiceJobId, 'create');
      return;
    }

    // Enqueue success notification
    await queueManager.enqueueSendNotification({
      voiceJobId,
      senderPhone: voiceJob.senderPhone,
      success: true,
      eventId: event.id,
    });
  } catch (error) {
    const classifiedError = ErrorHandler.classify(error);
    ErrorHandler.log(classifiedError, { voiceJobId, userId });

    // Update database with error
    await updateVoiceMessageJobError(db, voiceJobId, {
      errorMessage: classifiedError.message,
      errorStage: 'creating_event',
      retryCount: job.attemptsMade,
    });

    // Rethrow if retryable
    if (classifiedError.isRetryable) {
      throw classifiedError.originalError;
    }

    // Otherwise, send error notification
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

function extractCalendarIntent(
  voiceJob: any,
  expectedAction: 'CREATE'
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
      ?.filter((attendee) => attendee.email && attendee.email.trim().length > 0)
      .map((attendee) => attendee.name?.trim())
      .filter((name): name is string => Boolean(name && name.length > 0));

    const payload: Record<string, unknown> = {
      action: snapshot.action,
      title: snapshot.title ?? undefined,
      startDate,
      startTime,
      duration: snapshot.durationMinutes ?? undefined,
      location: snapshot.location?.value ?? undefined,
      attendees: attendees && attendees.length ? attendees : undefined,
      confidence: snapshot.confidence,
      missingFields: [] as string[],
    };

    if (snapshot.datetime?.precision === 'date') {
      payload.isAllDay = true;
    }

    return calendarIntentSchema.parse(payload);
  } catch (error) {
    logger.error({ error, voiceJobId: voiceJob.id }, 'Failed to convert intent snapshot for create');
    return null;
  }
}

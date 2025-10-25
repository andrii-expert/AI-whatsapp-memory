import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import {
  getActivePendingIntents,
  updatePendingIntent,
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import type { QueueManager } from '../utils/queue-manager';
import type { ClarificationWatchdogJobData } from '../config/queues';
import { NotificationService } from '../services/notification';

interface ClarificationPlanShape {
  pendingFields?: string[];
  prompts?: unknown[];
  responses?: Record<string, unknown>;
  reminderSentAt?: string;
  expiredAt?: string;
  [key: string]: unknown;
}

export async function processClarificationWatchdog(
  _job: Job<ClarificationWatchdogJobData>,
  db: Database,
  _queueManager: QueueManager
): Promise<void> {
  const now = new Date();
  const notificationService = new NotificationService();

  const pendingIntents = await getActivePendingIntents(db, 200);

  if (!pendingIntents.length) {
    return;
  }

  for (const pendingIntent of pendingIntents) {
    if (!pendingIntent.expiresAt) {
      continue;
    }

    const expiresAt = new Date(pendingIntent.expiresAt);
    const msUntilExpiry = expiresAt.getTime() - now.getTime();

    const plan = normalizePlan(pendingIntent.clarificationPlan);
    const pendingFields = Array.isArray(plan.pendingFields) ? plan.pendingFields : [];

    // Skip if all clarifications are complete OR if it's awaiting processing
    // pendingFields includes everything: clarifications, conflicts, move time, etc.
    if (pendingFields.length === 0 || pendingIntent.status === 'awaiting_processing') {
      logger.info(
        { 
          pendingIntentId: pendingIntent.id, 
          voiceJobId: pendingIntent.jobId,
          status: pendingIntent.status,
          pendingFieldsCount: pendingFields.length
        }, 
        'Skipping watchdog - all items resolved or awaiting processing'
      );
      continue;
    }

    const voiceJob = await getVoiceMessageJob(db, pendingIntent.jobId);
    const senderPhone = voiceJob?.senderPhone;

    if (!voiceJob || !senderPhone) {
      continue;
    }

    if (msUntilExpiry <= 0) {
      if (pendingIntent.status !== 'expired') {
        await notificationService.sendClarificationTimeout(senderPhone, pendingFields);

        plan.expiredAt = now.toISOString();

        await updatePendingIntent(db, pendingIntent.id, {
          clarificationPlan: plan,
          status: 'expired',
        });

        await updateVoiceMessageJobStatus(db, pendingIntent.jobId, 'clarification_timeout');

        logger.info({ pendingIntentId: pendingIntent.id, voiceJobId: pendingIntent.jobId }, 'Clarification expired');
      }
      continue;
    }

    const reminderThresholdMs = 2 * 60 * 1000; // 2 minutes remaining (≈3 minutes elapsed)
    const reminderSent = plan.reminderSentAt ? new Date(plan.reminderSentAt) : null;

    if (msUntilExpiry <= reminderThresholdMs && !reminderSent) {
      await notificationService.sendClarificationReminder(senderPhone, pendingFields);

      plan.reminderSentAt = now.toISOString();

      await updatePendingIntent(db, pendingIntent.id, {
        clarificationPlan: plan,
      });

      logger.info({ pendingIntentId: pendingIntent.id, voiceJobId: pendingIntent.jobId }, 'Clarification reminder sent');
    }
  }
}

function normalizePlan(raw: unknown): ClarificationPlanShape {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const plan = raw as ClarificationPlanShape;

  if (!Array.isArray(plan.pendingFields)) {
    plan.pendingFields = [];
  }

  if (!Array.isArray(plan.prompts)) {
    plan.prompts = [];
  }

  if (!plan.responses || typeof plan.responses !== 'object') {
    plan.responses = {};
  }

  return { ...plan };
}

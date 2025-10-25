import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import {
  getVoiceMessageJob,
  updateVoiceMessageJobStatus,
  updateVoiceMessageJobError,
  updateVoiceMessageJobSnapshot,
  getPendingIntentByJobId,
  createPendingIntent,
  updatePendingIntent,
  deletePendingIntent,
  createInteractivePrompt,
  recordIntentPipelinePayload,
} from '@imaginecalendar/database/queries';
import type { PendingIntentRecord } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import {
  runIntentPipeline,
  type IntentPipelineResult,
  type IntentPromptContext,
} from '@imaginecalendar/ai-services';
import { CalendarService } from '../services/calendar-service';
import { NotificationService } from '../services/notification';
import type { QueueManager } from '../utils/queue-manager';
import type { ProcessIntentJobData } from '../config/queues';
import { ErrorHandler } from '../utils/error-handler';
import { metrics } from '../utils/metrics';
import { withStageTiming } from '../utils/timing';

const TIMEZONE = 'Africa/Johannesburg';
const CLARIFICATION_EXPIRY_MS = 5 * 60 * 1000;

type ClarificationPlan = {
  pendingFields: string[];
  prompts: ClarificationPrompt[];
  responses: Record<string, ClarificationResponse>;
};

type ClarificationPrompt = {
  field: string;
  channel: 'text' | 'buttons' | 'list';
  question: string;
  options: Array<{ id: string; label: string; value: string }>;
  whatsappMessageId?: string | null;
  createdAt: string;
};

type ClarificationResponse = {
  value: string;
  label?: string;
  source: 'text' | 'interactive' | 'flow';
  respondedAt: string;
};

type IntentFollowUpEntry = IntentPipelineResult['snapshot']['followUp'][number];

const CONFLICT_FIELD = 'conflict';
const MOVE_NEW_EVENT_FIELD = 'time';

function parseClarificationPlan(plan: unknown): ClarificationPlan {
  if (!plan || typeof plan !== 'object') {
    return {
      pendingFields: [],
      prompts: [],
      responses: {},
    };
  }

  const parsed = plan as ClarificationPlan & {
    reminderSentAt?: string;
    expiredAt?: string;
  };

  return {
    pendingFields: Array.isArray(parsed.pendingFields) ? [...parsed.pendingFields] : [],
    prompts: Array.isArray(parsed.prompts) ? [...parsed.prompts] : [],
    responses: parsed.responses && typeof parsed.responses === 'object' ? { ...parsed.responses } : {},
  };
}

function getClarificationResponse(plan: ClarificationPlan | null, field: string): ClarificationResponse | null {
  if (!plan || !plan.responses) {
    return null;
  }

  const response = plan.responses[field];
  if (!response || typeof response !== 'object') {
    return null;
  }

  return response as ClarificationResponse;
}

function buildConflictQuestion(conflict: IntentPipelineResult['snapshot']['conflict']): string {
  const title = conflict?.summary ? `"${conflict.summary}"` : 'another event';
  return `Heads up: you already have ${title} at that time. What should I do?`;
}

export async function processProcessIntent(
  job: Job<ProcessIntentJobData>,
  db: Database,
  queueManager: QueueManager
): Promise<void> {
  const { voiceJobId, intentJobId, userId, whatsappNumberId, senderPhone } = job.data;

  const logContext = {
    voiceJobId,
    intentJobId,
    userId,
    whatsappNumberId,
  };

  const messageLogContext = {
    db,
    whatsappNumberId,
    userId,
  };

  try {
    const voiceJob = await getVoiceMessageJob(db, voiceJobId);

    if (!voiceJob) {
      throw new Error(`Voice job ${voiceJobId} not found`);
    }

    const transcribedText = job.data.transcribedText ?? voiceJob.transcribedText;

    if (!transcribedText) {
      throw new Error('No transcribed text available for intent processing');
    }

    await updateVoiceMessageJobStatus(db, voiceJobId, 'processing_intent');

    const existingPendingIntent = await getPendingIntentByJobId(db, voiceJobId);
    const existingPlan = existingPendingIntent
      ? parseClarificationPlan(existingPendingIntent.clarificationPlan)
      : null;
    const conflictResponse = getClarificationResponse(existingPlan, CONFLICT_FIELD);
    const moveTimeResponse = getClarificationResponse(existingPlan, MOVE_NEW_EVENT_FIELD);

    const { contactRoster, recentEvents } = await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'intent_build_context',
      metadata: ({ result }) => ({
        contactCount: result?.contactRoster.length ?? 0,
        recentEventCount: result?.recentEvents.length ?? 0,
      }),
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    }, async () => {
      const calendarService = new CalendarService(db);
      const [contacts, events] = await Promise.all([
        calendarService.getContacts(userId).catch((error) => {
          logger.warn({ userId, error: error.message }, 'Failed to fetch contacts for intent analysis');
          return [];
        }),
        calendarService.getRecentEvents(userId).catch((error) => {
          logger.warn({ userId, error: error.message }, 'Failed to fetch recent events for conflict detection');
          return [];
        }),
      ]);

      return {
        contactRoster: contacts,
        recentEvents: events,
      };
    });

    logger.info({
      userId,
      voiceJobId,
      contactCount: contactRoster.length,
      recentEventCount: recentEvents.length,
    }, 'Fetched calendar context for intent analysis');

    const promptContext: IntentPromptContext = {
      timezone: TIMEZONE,
      currentTime: new Date(),
      contactRoster: contactRoster.slice(0, 20).map((contact) => ({
        name: contact.name,
        email: contact.email,
        relationship: contact.source,
      })),
      recentEvents: recentEvents.slice(0, 25).map((event) => ({
        title: event.title,
        start: event.start.toISOString(),
        end: event.end ? event.end.toISOString() : null,
        attendees: [],
      })),
      clarifications: buildClarificationSummary(existingPendingIntent),
    };

    const clarificationAnswers = collectClarificationAnswers(existingPendingIntent, promptContext.clarifications);

    let payloadSequence = 0;
    const recordPayload = async (entry: {
      type: 'prompt' | 'response' | 'context';
      payload: any;
      metadata?: Record<string, any>;
    }) => {
      try {
        const payloadValue = typeof entry.payload === 'string'
          ? { text: entry.payload }
          : entry.payload ?? null;

        await recordIntentPipelinePayload(db, {
          jobId: voiceJobId,
          sequence: payloadSequence,
          payloadType: entry.type,
          provider: entry.metadata?.provider ?? null,
          metadata: entry.metadata ? { ...entry.metadata } : null,
          payload: payloadValue,
        });
      } catch (error) {
        logger.warn({ error, voiceJobId, stage: 'intent_pipeline' }, 'Failed to persist intent pipeline payload');
      } finally {
        payloadSequence += 1;
      }
    };

    const pipelineResult = await withStageTiming(db, {
      jobId: voiceJobId,
      stage: 'intent_request',
      metadata: ({ result }) => ({
        action: result?.snapshot?.action,
        followUpCount: result?.snapshot?.followUp?.length ?? 0,
        confidence: result?.snapshot?.confidence,
      }),
      errorMetadata: (error) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    }, async () =>
      runIntentPipeline({
        text: transcribedText,
        promptContext,
        now: new Date(),
        onPayload: recordPayload,
      })
    );

    const snapshotWithClarifications = applyClarificationAnswers(pipelineResult.snapshot, clarificationAnswers);

    let followUps = [...(snapshotWithClarifications.followUp ?? [])];
    const conflictInfo = snapshotWithClarifications.conflict;

    if (conflictInfo && !conflictResponse) {
      followUps.push({
        field: CONFLICT_FIELD,
        reason: 'calendar_conflict',
        question: buildConflictQuestion(conflictInfo),
        options: ['Keep both', 'Move new event', 'Cancel'],
      });
    }

    if (conflictResponse) {
      followUps = followUps.filter((item) => item.field !== CONFLICT_FIELD);

      if (conflictResponse.value === 'cancel') {
        await handleConflictCancellation({
          db,
          existingPendingIntent,
          voiceJobId,
          userId,
          whatsappNumberId,
          senderPhone,
        });
        return;
      }

      if (conflictResponse.value === 'keep') {
        // no additional clarifications needed
      } else if (conflictResponse.value === 'move') {
        if (!moveTimeResponse) {
          followUps.push({
            field: MOVE_NEW_EVENT_FIELD,
            reason: 'conflict_move_time',
            question: 'Sure — what time would you like to move this meeting to?',
            options: [],
          });
        }
      }
    }

    const snapshotWithOverrides: IntentPipelineResult['snapshot'] = {
      ...snapshotWithClarifications,
      followUp: followUps,
    };

    const pipelineState: IntentPipelineResult = {
      ...pipelineResult,
      snapshot: snapshotWithOverrides,
    };

    metrics.increment('intent.processed', {
      action: pipelineState.snapshot.action,
      status: pipelineState.snapshot.followUp.length ? 'awaiting_clarification' : 'complete',
    });

    await updateVoiceMessageJobSnapshot(db, voiceJobId, {
      intentSnapshot: pipelineState.snapshot,
      clarificationStatus: pipelineState.snapshot.followUp.length ? 'awaiting_clarification' : 'complete',
      intentJobId,
    });

    if (pipelineState.snapshot.followUp.length === 0) {
      await handleCompleteIntent({
        db,
        queueManager,
        voiceJobId,
        userId,
        whatsappNumberId,
        senderPhone,
        pipelineResult: pipelineState,
        existingPendingIntent,
      });
      return;
    }

    await handleClarifications({
      db,
      queueManager,
      voiceJobId,
      whatsappNumberId,
      userId,
      senderPhone,
      pipelineResult: pipelineState,
      followUps: pipelineState.snapshot.followUp,
      existingPendingIntent,
    });
  } catch (error) {
    const classified = ErrorHandler.classify(error);
    ErrorHandler.log(classified, logContext);

    metrics.increment('intent.failed', {
      stage: 'process_intent',
      retryable: classified.isRetryable,
    });

    await updateVoiceMessageJobError(db, voiceJobId, {
      errorMessage: classified.message,
      errorStage: 'processing_intent',
      retryCount: job.attemptsMade,
    });

    if (!classified.isRetryable) {
      if (senderPhone) {
        const notificationService = new NotificationService();
        await notificationService.sendError(
          senderPhone,
          ErrorHandler.getUserMessage(classified),
          messageLogContext
        );
      }
    }

    if (classified.isRetryable) {
      throw classified.originalError;
    }
  }
}

async function handleCompleteIntent(options: {
  db: Database;
  queueManager: QueueManager;
  voiceJobId: string;
  userId: string;
  whatsappNumberId: string;
  senderPhone: string;
  pipelineResult: IntentPipelineResult;
  existingPendingIntent: PendingIntentRecord | null;
}): Promise<void> {
  const { db, queueManager, voiceJobId, userId, whatsappNumberId, senderPhone, pipelineResult, existingPendingIntent } = options;

  const messageLogContext = {
    db,
    whatsappNumberId,
    userId,
  };

  if (existingPendingIntent) {
    await deletePendingIntent(db, existingPendingIntent.id);
  }

  await updateVoiceMessageJobStatus(db, voiceJobId, 'intent_ready');

  logger.info(
    {
      voiceJobId,
      action: pipelineResult.snapshot.action,
      confidence: pipelineResult.snapshot.confidence,
    },
    'Intent fully resolved, enqueuing calendar action'
  );

  switch (pipelineResult.snapshot.action) {
    case 'CREATE':
      await queueManager.enqueueCreateEvent({
        voiceJobId,
        userId,
      });
      break;
    case 'UPDATE':
      await queueManager.enqueueUpdateEvent({
        voiceJobId,
        userId,
      });
      break;
    case 'DELETE':
      await queueManager.enqueueDeleteEvent({
        voiceJobId,
        userId,
      });
      break;
    case 'QUERY':
      logger.warn({ voiceJobId, action: pipelineResult.snapshot.action }, 'Intent action QUERY not supported yet');
      if (senderPhone) {
        const notificationService = new NotificationService();
        await notificationService.sendError(
          senderPhone,
          "I'm still learning how to check your calendar. Please open your calendar app to review events.",
          messageLogContext
        );
      }
      await updateVoiceMessageJobStatus(db, voiceJobId, 'completed');
      break;
    default:
      throw new Error(`Unsupported intent action: ${pipelineResult.snapshot.action}`);
  }
}

async function handleClarifications(options: {
  db: Database;
  queueManager: QueueManager;
  voiceJobId: string;
  whatsappNumberId: string;
  userId: string;
  senderPhone: string;
  pipelineResult: IntentPipelineResult;
  existingPendingIntent: PendingIntentRecord | null;
  followUps: IntentFollowUpEntry[];
}): Promise<void> {
  const { db, queueManager, voiceJobId, whatsappNumberId, userId, senderPhone, pipelineResult, existingPendingIntent, followUps } = options;

  const plan = mergeClarificationPlan(
    existingPendingIntent?.clarificationPlan,
    followUps
  );

  // If all clarifications are already answered, proceed to create event
  if (plan.pendingFields.length === 0) {
    logger.info(
      {
        voiceJobId,
        pendingIntentId: existingPendingIntent?.id,
      },
      'All clarifications already answered, proceeding to event creation'
    );

    await handleCompleteIntent({
      db,
      queueManager,
      voiceJobId,
      userId,
      whatsappNumberId,
      senderPhone,
      pipelineResult,
      existingPendingIntent,
    });
    return;
  }

  const expiry = new Date(Date.now() + CLARIFICATION_EXPIRY_MS);

  let pendingIntent = existingPendingIntent;

  if (pendingIntent) {
    pendingIntent = await updatePendingIntent(db, pendingIntent.id, {
      intentSnapshot: pipelineResult.snapshot,
      clarificationPlan: plan,
      status: 'awaiting_clarification',
      expiresAt: expiry,
    });
  } else {
    pendingIntent = await createPendingIntent(db, {
      jobId: voiceJobId,
      userId,
      whatsappNumberId,
      intentSnapshot: pipelineResult.snapshot,
      clarificationPlan: plan,
      status: 'awaiting_clarification',
      expiresAt: expiry,
    });
  }

  if (!pendingIntent) {
    throw new Error('Failed to persist pending intent for clarifications');
  }

  await updateVoiceMessageJobStatus(db, voiceJobId, 'awaiting_clarification');

  await dispatchClarificationPrompts({
    db,
    whatsappNumberId,
    senderPhone,
    pendingIntent,
    plan,
    voiceJobId,
  });

  metrics.increment('clarification.awaiting', {
    pending_fields: plan.pendingFields.length,
  });

  logger.info(
    {
      voiceJobId,
      pendingIntentId: pendingIntent.id,
      pendingFields: plan.pendingFields,
    },
    'Clarifications dispatched for pending intent'
  );
}

async function handleConflictCancellation(options: {
  db: Database;
  existingPendingIntent: PendingIntentRecord | null;
  voiceJobId: string;
  userId: string;
  whatsappNumberId: string;
  senderPhone: string;
}): Promise<void> {
  const { db, existingPendingIntent, voiceJobId, userId, whatsappNumberId, senderPhone } = options;

  if (existingPendingIntent) {
    await deletePendingIntent(db, existingPendingIntent.id);
  }

  await updateVoiceMessageJobStatus(db, voiceJobId, 'completed', new Date());

  if (senderPhone) {
    const notificationService = new NotificationService();
    await notificationService.sendError(
      senderPhone,
      "Got it — I won't schedule that event. Let me know if you need anything else.",
      {
        db,
        whatsappNumberId,
        userId,
      }
    );
  }

  logger.info({ voiceJobId, userId }, 'Intent cancelled due to conflict response');
}

type ClarificationAnswer = {
  value: unknown;
  label?: string;
  source?: string;
  respondedAt?: string | Date | null;
};

function collectClarificationAnswers(
  pendingIntent: PendingIntentRecord | null,
  promptClarifications?: IntentPromptContext['clarifications']
): Record<string, ClarificationAnswer> {
  const answers: Record<string, ClarificationAnswer> = {};

  if (pendingIntent?.clarificationPlan) {
    const plan = parseClarificationPlan(pendingIntent.clarificationPlan);
    if (plan?.responses) {
      Object.entries(plan.responses).forEach(([field, response]) => {
        if (response) {
          answers[field] = response;
        }
      });
    }
  }

  if (promptClarifications) {
    promptClarifications.forEach((entry) => {
      if (!answers[entry.field]) {
        answers[entry.field] = {
          value: entry.value,
          source: entry.source,
        };
      }
    });
  }

  return answers;
}

function applyClarificationAnswers(
  snapshot: IntentPipelineResult['snapshot'],
  answers: Record<string, ClarificationAnswer>
): IntentPipelineResult['snapshot'] {
  if (!answers || Object.keys(answers).length === 0) {
    return snapshot;
  }

  const updated: IntentPipelineResult['snapshot'] = {
    ...snapshot,
    followUp: snapshot.followUp ? [...snapshot.followUp] : [],
  };

  const titleAnswer = answers['title'];
  if (titleAnswer) {
    const title = coerceClarificationString(titleAnswer.value) ?? coerceClarificationString(titleAnswer.label);
    if (title) {
      updated.title = title;
    }
  }

  const locationAnswer = answers['location'];
  if (locationAnswer) {
    const raw = coerceClarificationString(locationAnswer.value) ?? coerceClarificationString(locationAnswer.label);
    const normalized = raw?.toLowerCase();
    const locationType: 'physical' | 'virtual' | 'unknown' = normalized === 'virtual'
      ? 'virtual'
      : normalized === 'physical'
        ? 'physical'
        : updated.location?.type ?? 'unknown';

    const locationValue = normalized === 'virtual' || normalized === 'physical'
      ? updated.location?.value ?? null
      : raw ?? updated.location?.value ?? null;

    updated.location = {
      type: locationType,
      value: locationValue,
    };
  }

  const durationAnswer = answers['duration'] ?? answers['durationMinutes'];
  if (durationAnswer) {
    const raw = coerceClarificationString(durationAnswer.value) ?? coerceClarificationString(durationAnswer.label);
    const durationMinutes = raw ? parseDurationMinutes(raw) : null;
    if (durationMinutes !== null) {
      updated.durationMinutes = durationMinutes;
    }
  }

  if (updated.followUp) {
    updated.followUp = updated.followUp.filter((item) => !answers[item.field]);
  }

  return updated;
}

function coerceClarificationString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function parseDurationMinutes(raw: string): number | null {
  const normalized = raw.toLowerCase();
  const numberMatch = normalized.match(/\d+(?:\.\d+)?/);
  if (!numberMatch) {
    return null;
  }

  const numericValue = Number(numberMatch[0]);
  if (Number.isNaN(numericValue)) {
    return null;
  }

  if (normalized.includes('hour')) {
    return Math.round(numericValue * 60);
  }
  if (normalized.includes('min')) {
    return Math.round(numericValue);
  }

  return null;
}

function mergeClarificationPlan(
  existingPlan: unknown,
  followUps: IntentPipelineResult['snapshot']['followUp']
): ClarificationPlan {
  const base: ClarificationPlan = {
    pendingFields: [],
    prompts: [],
    responses: {},
  };

  if (existingPlan && typeof existingPlan === 'object') {
    const parsed = existingPlan as ClarificationPlan & {
      reminderSentAt?: string;
      expiredAt?: string;
    };
    base.pendingFields = Array.isArray(parsed.pendingFields) ? [...parsed.pendingFields] : [];
    base.prompts = Array.isArray(parsed.prompts) ? [...parsed.prompts] : [];
    base.responses = parsed.responses && typeof parsed.responses === 'object' ? { ...parsed.responses } : {};

    if (parsed.reminderSentAt) {
      (base as Record<string, unknown>).reminderSentAt = parsed.reminderSentAt;
    }

    if (parsed.expiredAt) {
      (base as Record<string, unknown>).expiredAt = parsed.expiredAt;
    }
  }

  const newFields = new Set<string>(followUps.map((item: IntentFollowUpEntry) => item.field));
  const existingResponses = new Set(Object.keys(base.responses));

  const pendingFields = Array.from(newFields).filter((field) => !existingResponses.has(field));
  base.pendingFields = pendingFields;
  return base;
}

async function dispatchClarificationPrompts(options: {
  db: Database;
  whatsappNumberId: string;
  senderPhone: string;
  pendingIntent: PendingIntentRecord;
  plan: ClarificationPlan;
  voiceJobId: string;
}): Promise<void> {
  const { db, senderPhone, pendingIntent, plan, voiceJobId, whatsappNumberId } = options;

  const notificationService = new NotificationService();

  const messageLogContext = {
    db,
    whatsappNumberId: pendingIntent.whatsappNumberId ?? whatsappNumberId,
    userId: pendingIntent.userId,
  };

  const snapshot = (pendingIntent.intentSnapshot ?? {}) as IntentPipelineResult['snapshot'];
  const followUps = Array.isArray(snapshot.followUp) ? snapshot.followUp : [];

  const nextField = plan.pendingFields.find(
    (field) => !plan.prompts.some((prompt) => prompt.field === field)
  );

  if (!nextField) {
    return;
  }

  const questionEntry = findFollowUpByField(nextField, followUps);
  if (!questionEntry) {
    return;
  }

  if (!senderPhone) {
    logger.warn({ pendingIntentId: pendingIntent.id, field: nextField }, 'Cannot send clarification without sender phone');
    return;
  }

  const prompt = await withStageTiming(db, {
    jobId: voiceJobId,
    stage: 'clarification_dispatch',
    metadata: ({ result }) => ({
      field: result?.field,
      channel: result?.channel,
      optionCount: result?.options?.length ?? 0,
    }),
    errorMetadata: (error) => ({
      error: error instanceof Error ? error.message : String(error),
      field: nextField,
    }),
  }, () =>
    sendClarificationPrompt(notificationService, {
      phone: senderPhone,
      pendingIntentId: pendingIntent.id,
      field: nextField,
      question: questionEntry.question,
      options: questionEntry.options ?? [],
    }, messageLogContext)
  );

  plan.prompts.push(prompt);

  if (prompt.channel === 'buttons' || prompt.channel === 'list') {
    await createInteractivePrompt(db, {
      pendingIntentId: pendingIntent.id,
      fieldKey: nextField,
      whatsappMessageId: prompt.whatsappMessageId ?? null,
      options: prompt.options,
      expiresAt: new Date(Date.now() + CLARIFICATION_EXPIRY_MS),
    });
  }

  await updatePendingIntent(db, pendingIntent.id, {
    clarificationPlan: plan,
  });
}

function findFollowUpByField(
  field: string,
  followUps: IntentPipelineResult['snapshot']['followUp']
): IntentFollowUpEntry | undefined {
  return followUps.find((item: IntentFollowUpEntry) => item.field === field);
}

async function sendClarificationPrompt(
  notificationService: NotificationService,
  options: {
    phone: string;
    pendingIntentId: string;
    field: string;
    question: string;
    options: string[];
  },
  logContext: { db: Database; whatsappNumberId: string; userId: string }
): Promise<ClarificationPrompt> {
  if (options.options.length === 0) {
    const response = await notificationService.sendClarificationPrompt(options.phone, {
      type: 'text',
      question: options.question,
    }, logContext);

    return {
      field: options.field,
      channel: 'text',
      question: options.question,
      options: [],
      whatsappMessageId: response.messageId ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  if (options.options.length <= 3) {
    const enrichedOptions = options.options.map((value, index) => ({
      id: buildInteractiveOptionId(options.pendingIntentId, options.field, value, index),
      label: value,
      value,
    }));

    const response = await notificationService.sendClarificationPrompt(options.phone, {
      type: 'buttons',
      question: options.question,
      options: enrichedOptions,
    }, logContext);

    return {
      field: options.field,
      channel: 'buttons',
      question: options.question,
      options: enrichedOptions,
      whatsappMessageId: response.messageId ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  const enrichedOptions = options.options.map((value, index) => ({
    id: buildInteractiveOptionId(options.pendingIntentId, options.field, value, index),
    label: value,
    value,
  }));

  const response = await notificationService.sendClarificationPrompt(options.phone, {
    type: 'list',
    question: options.question,
    options: enrichedOptions,
  }, logContext);

  return {
    field: options.field,
    channel: 'list',
    question: options.question,
    options: enrichedOptions,
    whatsappMessageId: response.messageId ?? null,
    createdAt: new Date().toISOString(),
  };
}

function buildInteractiveOptionId(
  pendingIntentId: string,
  field: string,
  value: string,
  index: number
): string {
  const encoded = Buffer.from(value, 'utf8').toString('hex');
  return `evt_${pendingIntentId}_${field}_${index}_${encoded}`;
}

function buildClarificationSummary(pendingIntent: PendingIntentRecord | null) {
  if (!pendingIntent) {
    return [];
  }

  const plan = pendingIntent.clarificationPlan as ClarificationPlan | null;

  if (!plan || !plan.responses) {
    return [];
  }

  return Object.entries(plan.responses).map(([field, response]) => ({
    field,
    value: response.label ?? response.value,
    source: response.source,
  }));
}

import { randomUUID } from 'crypto';
import type { Database } from '@imaginecalendar/database/client';
import type { PendingIntentRecord } from '@imaginecalendar/database/queries';
import {
  getActivePendingIntentByWhatsappNumber,
  getPendingIntentById,
  getFlowSessionByToken,
  markFlowSessionResponse,
  markInteractivePromptResponse,
  updatePendingIntent,
  recordVoiceJobTiming,
} from '@imaginecalendar/database/queries';
import { getQueue, QUEUE_NAMES } from '@/lib/queues';
import { logger } from '@imaginecalendar/logger';
import type { WebhookProcessingSummary, InteractiveSelectionContext } from './types';
import { getVoiceMessageJob } from '@imaginecalendar/database/queries';
import { VOICE_STAGE_SEQUENCE } from '@imaginecalendar/database/constants/voice-timing';

interface EnqueueContext {
  messageId?: string;
  senderPhone?: string;
}

export async function processTextClarification(options: {
  db: Database;
  message: any;
  messageText: string;
  whatsappNumberId: string;
  summary: WebhookProcessingSummary;
}): Promise<boolean> {
  const { db, message, messageText, whatsappNumberId, summary } = options;

  const pendingIntent = await getActivePendingIntentByWhatsappNumber(db, whatsappNumberId);

  if (!pendingIntent) {
    return false;
  }

  const plan = pendingIntent.clarificationPlan as Record<string, unknown> | null;
  const pendingFields = Array.isArray(plan?.pendingFields)
    ? (plan!.pendingFields as string[])
    : [];
  const prompts = Array.isArray(plan?.prompts)
    ? (plan!.prompts as Array<Record<string, unknown>>)
    : [];
  const textPrompt = prompts.find(
    (prompt) =>
      typeof prompt === 'object' &&
      prompt !== null &&
      (prompt as any).channel === 'text' &&
      pendingFields.includes((prompt as any).field)
  ) as { field?: string } | undefined;

  const targetField = textPrompt?.field ?? pendingFields[0];

  if (!targetField) {
    return false;
  }

  const responses = {
    [targetField]: {
      value: messageText,
      label: messageText,
    },
  } satisfies Record<string, { value: unknown; label?: string }>;

  const updatedPlan = mergeClarificationPlan(plan, responses, 'text');

  await updatePendingIntent(db, pendingIntent.id, {
    clarificationPlan: updatedPlan,
    status: 'awaiting_processing',
  });

  await safeRecordClarificationTiming({
    db,
    jobId: pendingIntent.jobId,
    field: targetField,
    source: 'text',
    value: messageText,
    timestamp: message.timestamp,
  });

  summary.pendingIntentUpdates.push(pendingIntent.id);

  await enqueuePendingIntentReprocess(db, pendingIntent, summary, {
    messageId: message.id,
    senderPhone: message.from,
  });

  return true;
}

export async function processFlowSubmission(
  message: any,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<boolean> {
  const interactive = message?.interactive;
  const nfmReply = interactive?.nfm_reply;

  if (!nfmReply) {
    return false;
  }

  const responseJson = nfmReply.response_json;

  if (!responseJson || typeof responseJson !== 'object') {
    logger.warn({ messageId: message?.id }, 'Flow response missing response_json payload');
    return false;
  }

  const flowToken =
    typeof responseJson.flow_token === 'string'
      ? responseJson.flow_token
      : typeof nfmReply.flow_token === 'string'
        ? nfmReply.flow_token
        : null;

  if (!flowToken) {
    logger.warn({ messageId: message?.id }, 'Flow response missing flow token');
    return false;
  }

  const flowSession = await getFlowSessionByToken(db, flowToken);

  if (!flowSession) {
    logger.warn({ messageId: message?.id, flowToken }, 'No flow session found for flow response');
    return false;
  }

  await markFlowSessionResponse(db, flowToken, responseJson as Record<string, unknown>);

  const pendingIntent = await getPendingIntentById(db, flowSession.pendingIntentId);

  if (!pendingIntent) {
    logger.warn({ messageId: message?.id, flowToken }, 'Pending intent not found for flow session');
    return false;
  }

  const sanitizedResponses = sanitizeFlowResponses(responseJson as Record<string, unknown>);

  const structuredResponses = Object.fromEntries(
    Object.entries(sanitizedResponses).map(([field, value]) => [
      field,
      {
        value,
        label: typeof value === 'string' ? value : undefined,
      },
    ])
  ) as Record<string, { value: unknown; label?: string }>;

  const updatedPlan = mergeClarificationPlan(
    pendingIntent.clarificationPlan,
    structuredResponses,
    'flow'
  );

  await updatePendingIntent(db, pendingIntent.id, {
    clarificationPlan: updatedPlan,
    status: 'awaiting_processing',
  });

  for (const [field, data] of Object.entries(structuredResponses)) {
    await safeRecordClarificationTiming({
      db,
      jobId: pendingIntent.jobId,
      field,
      source: 'flow',
      value: data.value,
      timestamp: message.timestamp,
    });
  }

  summary.pendingIntentUpdates.push(pendingIntent.id);
  summary.flowResponses.push(message.id);

  await enqueuePendingIntentReprocess(db, pendingIntent, summary, {
    messageId: message.id,
    senderPhone: message.from,
  });

  logger.info(
    {
      messageId: message.id,
      flowToken,
      pendingIntentId: pendingIntent.id,
    },
    'Recorded flow response for pending intent'
  );

  return true;
}

export async function processInteractiveSelection(
  context: InteractiveSelectionContext
): Promise<boolean> {
  const { selectionId, interactive, selectedText, message, whatsappNumberId, db, summary } = context;

  const identifier = selectionId || interactive?.button_reply?.id || interactive?.list_reply?.id;

  if (!identifier || !identifier.startsWith('evt_')) {
    if (selectedText) {
      const handled = await processTextClarification({
        db,
        message,
        messageText: selectedText,
        whatsappNumberId,
        summary,
      });

      if (handled) {
        return true;
      }
    }

    return false;
  }

  const parsed = extractPendingIntentIdentifier(identifier);

  if (!parsed) {
    logger.warn({ identifier }, 'Unable to parse pending intent identifier from interactive selection');
    return false;
  }

  const pendingIntent = await getPendingIntentById(db, parsed.pendingIntentId);

  if (!pendingIntent) {
    logger.warn({ pendingIntentId: parsed.pendingIntentId }, 'Pending intent not found for interactive selection');
    return false;
  }

  const plan = pendingIntent.clarificationPlan as Record<string, unknown> | null;
  const prompts = Array.isArray(plan?.prompts)
    ? (plan!.prompts as Array<Record<string, any>>)
    : [];
  const promptEntry = prompts.find((prompt) => prompt && prompt.field === parsed.fieldKey);

  const options = Array.isArray((promptEntry as any)?.options)
    ? ((promptEntry as any).options as Array<{ id?: string; value?: string; label?: string }>)
    : [];

  const matchedOption = options.find((option) => option.id === identifier) ?? null;

  const resolvedValue = matchedOption?.value ?? parsed.value ?? selectedText;
  const resolvedLabel = matchedOption?.label ?? selectedText;

  await markInteractivePromptResponse(db, pendingIntent.id, parsed.fieldKey, {
    whatsappMessageId: message.id,
    selectedValue: resolvedValue,
  });

  const responses = {
    [parsed.fieldKey]: {
      value: resolvedValue,
      label: resolvedLabel,
    },
  } satisfies Record<string, { value: unknown; label?: string }>;

  const updatedPlan = mergeClarificationPlan(
    pendingIntent.clarificationPlan,
    responses,
    'interactive'
  );

  await updatePendingIntent(db, pendingIntent.id, {
    clarificationPlan: updatedPlan,
    status: 'awaiting_processing',
  });

  await safeRecordClarificationTiming({
    db,
    jobId: pendingIntent.jobId,
    field: parsed.fieldKey,
    source: 'interactive',
    value: resolvedValue,
    timestamp: message.timestamp,
  });

  summary.pendingIntentUpdates.push(pendingIntent.id);

  await enqueuePendingIntentReprocess(db, pendingIntent, summary, {
    messageId: message.id,
    senderPhone: message.from,
  });

  logger.info(
    {
      messageId: message.id,
      pendingIntentId: pendingIntent.id,
      fieldKey: parsed.fieldKey,
      selection: resolvedLabel,
    },
    'Recorded interactive response for pending intent'
  );

  return true;
}

async function enqueuePendingIntentReprocess(
  db: Database,
  pendingIntent: PendingIntentRecord,
  summary: WebhookProcessingSummary,
  context: EnqueueContext
): Promise<void> {
  try {
    const voiceJob = await getVoiceMessageJob(db, pendingIntent.jobId);

    if (!voiceJob) {
      logger.warn(
        { pendingIntentId: pendingIntent.id, voiceJobId: pendingIntent.jobId },
        'Voice job not found for pending intent reprocess'
      );
      return;
    }

    const processQueue = getQueue(QUEUE_NAMES.PROCESS_INTENT);
    const intentJobId = voiceJob.intentJobId ?? randomUUID();
    const senderPhone = context.senderPhone ?? voiceJob.senderPhone ?? '';

    await processQueue.add(
      'process-intent',
      {
        voiceJobId: pendingIntent.jobId,
        jobId: pendingIntent.jobId,
        intentJobId,
        userId: pendingIntent.userId,
        whatsappNumberId: pendingIntent.whatsappNumberId,
        transcribedText: voiceJob.transcribedText ?? '',
        senderPhone,
      },
      {
        jobId: `process-${pendingIntent.jobId}-${Date.now()}`,
      }
    );

    summary.processIntentRequeues.push(pendingIntent.jobId);

    logger.info(
      {
        pendingIntentId: pendingIntent.id,
        voiceJobId: pendingIntent.jobId,
        intentJobId,
        messageId: context.messageId,
        timezone: 'GMT+2',
      },
      'Re-enqueued process-intent job after clarification'
    );
  } catch (error) {
    logger.error(
      {
        error,
        pendingIntentId: pendingIntent.id,
        voiceJobId: pendingIntent.jobId,
      },
      'Failed to re-enqueue process-intent job'
    );
  }
}

function sanitizeFlowResponses(response: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(response)) {
    if (key === 'flow_token') {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

const CLARIFICATION_SEQUENCE = VOICE_STAGE_SEQUENCE.clarification_response ?? 55;

async function safeRecordClarificationTiming(options: {
  db: Database;
  jobId: string;
  field: string;
  source: 'flow' | 'interactive' | 'text';
  value: unknown;
  timestamp?: unknown;
}) {
  const { db, jobId, field, source, value, timestamp } = options;

  const startedAt = parseWhatsAppTimestamp(timestamp);
  const completedAt = new Date();

  try {
    await recordVoiceJobTiming(db, {
      jobId,
      stage: 'clarification_response',
      startedAt,
      completedAt,
      sequence: CLARIFICATION_SEQUENCE,
      metadata: {
        field,
        source,
        length: typeof value === 'string' ? value.length : undefined,
      },
    });
  } catch (error) {
    logger.warn({ error, jobId, field }, 'Failed to record clarification timing');
  }
}

function parseWhatsAppTimestamp(value: unknown): Date {
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== '') {
      // WhatsApp timestamps are in seconds
      return new Date(numeric * 1000);
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000);
  }

  return new Date();
}

function mergeClarificationPlan(
  plan: unknown,
  responses: Record<string, { value: unknown; label?: string }>,
  source: 'flow' | 'interactive' | 'text'
): Record<string, unknown> {
  const base =
    plan && typeof plan === 'object' && !Array.isArray(plan)
      ? { ...(plan as Record<string, unknown>) }
      : {};

  const existingResponses =
    base.responses && typeof base.responses === 'object' && !Array.isArray(base.responses)
      ? { ...(base.responses as Record<string, unknown>) }
      : {};

  const existingPending = Array.isArray((base as any).pendingFields)
    ? [...((base as any).pendingFields as string[])]
    : [];

  const timestamp = new Date().toISOString();

  for (const [field, data] of Object.entries(responses)) {
    existingResponses[field] = {
      value: data.value,
      label: data.label,
      source,
      respondedAt: timestamp,
    };
  }

  const updatedPending = existingPending.filter((field) => !Object.prototype.hasOwnProperty.call(responses, field));

  return {
    ...base,
    responses: existingResponses,
    pendingFields: updatedPending,
  };
}

function extractPendingIntentIdentifier(identifier: string):
  | {
      pendingIntentId: string;
      fieldKey: string;
      value?: string;
      optionIndex?: number;
      rawValue?: string;
    }
  | null {
  const parts = identifier.split('_');

  if (parts.length < 3) {
    return null;
  }

  const [, pendingIntentId, fieldKey, ...rest] = parts;
  let optionIndex: number | undefined;
  let rawValue: string | undefined;

  if (rest.length > 0) {
    const potentialIndex = Number(rest[0]);
    if (!Number.isNaN(potentialIndex)) {
      optionIndex = potentialIndex;
      rawValue = rest.slice(1).join('_');
    } else {
      rawValue = rest.join('_');
    }
  }

  let value: string | undefined;
  if (rawValue) {
    try {
      value = Buffer.from(rawValue, 'hex').toString('utf8');
    } catch {
      value = rawValue;
    }
  }

  if (!pendingIntentId || !fieldKey) {
    return null;
  }

  return { pendingIntentId, fieldKey, value, optionIndex, rawValue };
}

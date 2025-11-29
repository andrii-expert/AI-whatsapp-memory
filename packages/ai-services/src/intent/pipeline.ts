import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import * as chrono from 'chrono-node';
import { z } from 'zod';
import { calendarIntentPrompt, type IntentPromptContext } from './prompts';
import { formatDateToLocalIso, formatDateToLocalLabel } from '../utils/timezone';

const DEFAULT_TIMEZONE = 'Africa/Johannesburg';

const intentFollowUpSchema = z.object({
  field: z.enum([
    'title',
    'datetime',
    'time',
    'date',
    'attendee',
    'location',
    'duration',
    'confirmation',
    'conflict',
    'deleteConfirmation',
  ]),
  reason: z.string(),
  question: z.string(),
  options: z.array(z.string()).default([]),
});

const intentSnapshotSchema = z.object({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'QUERY']),
  title: z.string().trim().nullable(),
  datetime: z
    .object({
      iso: z.string().datetime(),
      precision: z.enum(['exact', 'date', 'range', 'unknown']),
    })
    .nullable(),
  attendees: z
    .array(
      z.object({
        name: z.string(),
        email: z.string().email().nullable(),
      })
    )
    .default([]),
  location: z
    .object({
      type: z.enum(['physical', 'virtual', 'unknown']),
      value: z.string().nullable(),
    })
    .nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  followUp: intentFollowUpSchema.array().default([]),
  confidence: z.number().min(0).max(1),
  conflict: z
    .object({
      summary: z.string(),
      existingEventId: z.string(),
    })
    .nullable(),
});

export type IntentSnapshot = z.infer<typeof intentSnapshotSchema>;
export type IntentFollowUp = z.infer<typeof intentFollowUpSchema>;

export interface NormalizedIntentSnapshot {
  action: IntentSnapshot['action'];
  title: string | null;
  datetime: {
    iso: string | null;
    date: Date | null;
    timezone: string | null;
    precision: 'exact' | 'date' | 'range' | 'unknown';
  } | null;
  attendees: IntentSnapshot['attendees'];
  location: IntentSnapshot['location'];
  durationMinutes: number | null;
  followUp: IntentFollowUp[];
  confidence: number;
  conflict: IntentSnapshot['conflict'];
}

export interface IntentPipelineResult {
  snapshot: IntentSnapshot;
  normalized: NormalizedIntentSnapshot;
}

export interface IntentPipelineOptions {
  text: string;
  promptContext?: IntentPromptContext;
  model?: ReturnType<typeof openai>;
  now?: Date;
  onPayload?: (entry: {
    type: 'prompt' | 'response' | 'context';
    payload: any;
    metadata?: Record<string, any>;
  }) => Promise<void> | void;
}

export async function runIntentPipeline(
  options: IntentPipelineOptions
): Promise<IntentPipelineResult> {
  const model = options.model ?? openai('gpt-4o-mini');
  const now = options.now ?? new Date();

  // Pre-normalize timestamps to local time for context logging
  const normalizedContext: IntentPromptContext = {
    timezone: DEFAULT_TIMEZONE,
    currentTime: now,
    ...options.promptContext,
  };

  if (normalizedContext.recentEvents) {
    normalizedContext.recentEvents = normalizedContext.recentEvents.map((event) => ({
      ...event,
      start: formatDateToLocalLabel(event.start, DEFAULT_TIMEZONE),
      end: event.end ? formatDateToLocalLabel(event.end, DEFAULT_TIMEZONE) : null,
    }));
  }

  const prompt = calendarIntentPrompt(options.text, normalizedContext);

  await options.onPayload?.({
    type: 'context',
    payload: normalizedContext,
    metadata: {
      timezone: DEFAULT_TIMEZONE,
      capturedAt: formatDateToLocalIso(now, DEFAULT_TIMEZONE),
    },
  });

  await options.onPayload?.({
    type: 'prompt',
    payload: prompt,
    metadata: {
      provider: 'openai',
      model: options.model ? 'custom' : 'gpt-4o-mini',
    },
  });

  const result = await generateObject({
    model,
    schema: intentSnapshotSchema as any,
    prompt,
  });

  await options.onPayload?.({
    type: 'response',
    payload: result.object,
    metadata: {
      provider: 'openai',
      model: options.model ? 'custom' : 'gpt-4o-mini',
      usage: 'usage' in result ? (result as any).usage : undefined,
    },
  });

  const snapshot = intentSnapshotSchema.parse(result.object);
  const normalized = normalizeIntentSnapshot(snapshot, now);

  return {
    snapshot,
    normalized,
  };
}

function normalizeIntentSnapshot(
  snapshot: IntentSnapshot,
  referenceDate: Date
): NormalizedIntentSnapshot {
  const iso = snapshot.datetime?.iso ?? null;
  const parsedDate = iso
    ? chrono.parseDate(iso, referenceDate, {
        forwardDate: true,
      })
    : null;

  return {
    action: snapshot.action,
    title: snapshot.title ?? null,
    datetime: snapshot.datetime
      ? {
          iso,
          date: parsedDate ?? null,
          timezone: DEFAULT_TIMEZONE,
          precision: snapshot.datetime.precision,
        }
      : null,
    attendees: snapshot.attendees,
    location: snapshot.location,
    durationMinutes: snapshot.durationMinutes ?? null,
    followUp: snapshot.followUp ?? [],
    confidence: snapshot.confidence,
    conflict: snapshot.conflict ?? null,
  };
}

export type { IntentPromptContext } from './prompts';

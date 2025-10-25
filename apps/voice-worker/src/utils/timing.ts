import type { Database } from '@imaginecalendar/database/client';
import { VOICE_STAGE_SEQUENCE } from '@imaginecalendar/database/constants/voice-timing';
import { recordVoiceJobTiming } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';

type JsonLike = Record<string, any> | Array<any> | null;

export const STAGE_SEQUENCE = VOICE_STAGE_SEQUENCE;

type MetadataInput<T = unknown> = JsonLike | ((context: { result?: T; error?: unknown }) => JsonLike);

async function safeRecordTiming(
  db: Database,
  data: {
    jobId: string;
    stage: string;
    startedAt: Date;
    completedAt?: Date;
    durationMs?: number;
    sequence?: number;
    stageGroup?: string | null;
    metadata?: JsonLike;
  }
) {
  try {
    await recordVoiceJobTiming(db, {
      jobId: data.jobId,
      stage: data.stage,
      startedAt: data.startedAt,
      completedAt: data.completedAt ?? null,
      durationMs: data.durationMs ?? null,
      sequence: data.sequence ?? STAGE_SEQUENCE[data.stage] ?? 0,
      stageGroup: data.stageGroup ?? null,
      metadata: data.metadata ?? null,
    });
  } catch (error) {
    logger.warn({ error, jobId: data.jobId, stage: data.stage }, 'Failed to record stage timing');
  }
}

export async function withStageTiming<T>(
  db: Database,
  params: {
    jobId: string;
    stage: string;
    stageGroup?: string | null;
    sequence?: number;
    metadata?: MetadataInput<T>;
    errorMetadata?: (error: unknown) => JsonLike;
  },
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = new Date();

  try {
    const result = await operation();
    const completedAt = new Date();
    const metadata = params.metadata
      ? typeof params.metadata === 'function'
        ? params.metadata({ result })
        : params.metadata
      : null;
    await safeRecordTiming(db, {
      jobId: params.jobId,
      stage: params.stage,
      stageGroup: params.stageGroup,
      sequence: params.sequence,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      metadata,
    });
    return result;
  } catch (error) {
    const completedAt = new Date();
    const metadata = params.errorMetadata ? params.errorMetadata(error) : params.metadata
      ? typeof params.metadata === 'function'
        ? params.metadata({ error })
        : params.metadata
      : { error: error instanceof Error ? error.message : String(error) };
    await safeRecordTiming(db, {
      jobId: params.jobId,
      stage: params.stage,
      stageGroup: params.stageGroup,
      sequence: params.sequence,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      metadata,
    });
    throw error;
  }
}

export async function recordStageTiming(
  db: Database,
  data: {
    jobId: string;
    stage: string;
    startedAt: Date;
    completedAt?: Date;
    durationMs?: number;
    stageGroup?: string | null;
    sequence?: number;
    metadata?: JsonLike;
  }
) {
  await safeRecordTiming(db, data);
}

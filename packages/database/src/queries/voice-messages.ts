import { eq, and, desc, asc } from "drizzle-orm";
import type { Database } from "../client";
import { intentPipelinePayloads, voiceJobTimings, voiceMessageJobs } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

type JsonLike = Record<string, any> | Array<any> | null;

export async function recordVoiceJobTiming(
  db: Database,
  data: {
    jobId: string;
    stage: string;
    startedAt: Date;
    completedAt?: Date | null;
    durationMs?: number | null;
    sequence?: number;
    stageGroup?: string | null;
    metadata?: JsonLike;
  }
) {
  return withMutationLogging(
    "recordVoiceJobTiming",
    { jobId: data.jobId, stage: data.stage },
    async () => {
      const [timing] = await db
        .insert(voiceJobTimings)
        .values({
          jobId: data.jobId,
          stage: data.stage,
          startedAt: data.startedAt,
          completedAt: data.completedAt ?? null,
          durationMs: data.durationMs ?? null,
          sequence: data.sequence ?? 0,
          stageGroup: data.stageGroup ?? null,
          metadata: data.metadata ?? null,
        })
        .returning();

      return timing;
    }
  );
}

export async function recordIntentPipelinePayload(
  db: Database,
  data: {
    jobId: string;
    sequence: number;
    payloadType: "prompt" | "response" | "context" | string;
    provider?: string | null;
    metadata?: JsonLike;
    payload: JsonLike;
  }
) {
  return withMutationLogging(
    "recordIntentPipelinePayload",
    { jobId: data.jobId, payloadType: data.payloadType, sequence: data.sequence },
    async () => {
      const [payloadRecord] = await db
        .insert(intentPipelinePayloads)
        .values({
          jobId: data.jobId,
          sequence: data.sequence,
          payloadType: data.payloadType,
          provider: data.provider ?? null,
          metadata: data.metadata ?? null,
          payload: data.payload ?? null,
        })
        .returning();

      return payloadRecord;
    }
  );
}

export async function getVoiceJobTimings(db: Database, jobId: string) {
  return withQueryLogging(
    "getVoiceJobTimings",
    { jobId },
    () =>
      db.query.voiceJobTimings.findMany({
        where: eq(voiceJobTimings.jobId, jobId),
        orderBy: [asc(voiceJobTimings.sequence), asc(voiceJobTimings.startedAt)],
      })
  );
}

export async function getIntentPipelinePayloadsByJobId(db: Database, jobId: string) {
  return withQueryLogging(
    "getIntentPipelinePayloadsByJobId",
    { jobId },
    () =>
      db.query.intentPipelinePayloads.findMany({
        where: eq(intentPipelinePayloads.jobId, jobId),
        orderBy: [asc(intentPipelinePayloads.sequence), asc(intentPipelinePayloads.createdAt)],
      })
  );
}

export async function createVoiceMessageJob(
  db: Database,
  data: {
    messageId: string;
    mediaId: string;
    senderPhone: string;
    userId: string;
    whatsappNumberId: string;
    mimeType?: string;
    isTestJob?: boolean;
    testConfiguration?: any;
    testNotes?: string;
    intentJobId?: string;
  }
) {
  return withMutationLogging(
    'createVoiceMessageJob',
    { userId: data.userId, messageId: data.messageId, isTestJob: data.isTestJob },
    async () => {
      const [job] = await db
        .insert(voiceMessageJobs)
        .values({
          ...data,
          status: 'pending',
          startedAt: new Date(),
        })
        .returning();

      return job;
    }
  );
}

export async function getVoiceMessageJob(db: Database, id: string) {
  return withQueryLogging(
    'getVoiceMessageJob',
    { voiceJobId: id },
    () => db.query.voiceMessageJobs.findFirst({
      where: eq(voiceMessageJobs.id, id),
    })
  );
}

export async function updateVoiceMessageJobStatus(
  db: Database,
  id: string,
  status: string,
  completedAt?: Date
) {
  return withMutationLogging(
    'updateVoiceMessageJobStatus',
    { voiceJobId: id, status },
    async () => {
      const [updated] = await db
        .update(voiceMessageJobs)
        .set({
          status,
          ...(completedAt && { completedAt }),
          updatedAt: new Date(),
        })
        .where(eq(voiceMessageJobs.id, id))
        .returning();

      return updated;
    }
  );
}

export async function updateVoiceMessageJobAudio(
  db: Database,
  id: string,
  data: {
    audioFilePath: string;
    audioFileSizeBytes: number;
    audioDurationSeconds?: number;
    mimeType: string;
  }
) {
  return withMutationLogging(
    'updateVoiceMessageJobAudio',
    { voiceJobId: id },
    async () => {
      const [updated] = await db
        .update(voiceMessageJobs)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(voiceMessageJobs.id, id))
        .returning();

      return updated;
    }
  );
}

export async function updateVoiceMessageJobTranscription(
  db: Database,
  id: string,
  data: {
    transcribedText: string;
    transcriptionLanguage?: string;
    sttProvider: string;
    sttProviderFallback?: string;
  }
) {
  return withMutationLogging(
    'updateVoiceMessageJobTranscription',
    { voiceJobId: id, provider: data.sttProvider },
    async () => {
      const [updated] = await db
        .update(voiceMessageJobs)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(voiceMessageJobs.id, id))
        .returning();

      return updated;
    }
  );
}

export async function updateVoiceMessageJobIntent(
  db: Database,
  id: string,
  data: {
    intentAnalysis: any; // JSONB
    intentProvider: string;
  }
) {
  return withMutationLogging(
    'updateVoiceMessageJobIntent',
    { voiceJobId: id },
    async () => {
      const [updated] = await db
        .update(voiceMessageJobs)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(voiceMessageJobs.id, id))
        .returning();

      return updated;
    }
  );
}

export async function updateVoiceMessageJobSnapshot(
  db: Database,
  id: string,
  data: {
    intentSnapshot?: any;
    clarificationStatus?: string | null;
    intentJobId?: string | null;
  }
) {
  return withMutationLogging(
    'updateVoiceMessageJobSnapshot',
    { voiceJobId: id, fields: Object.keys(data) },
    async () => {
      const [updated] = await db
        .update(voiceMessageJobs)
        .set({
          ...(data.intentSnapshot !== undefined && { intentSnapshot: data.intentSnapshot }),
          ...(data.clarificationStatus !== undefined && { clarificationStatus: data.clarificationStatus }),
          ...(data.intentJobId !== undefined && { intentJobId: data.intentJobId }),
          updatedAt: new Date(),
        })
        .where(eq(voiceMessageJobs.id, id))
        .returning();

      return updated;
    }
  );
}

export async function updateVoiceMessageJobCalendarEvent(
  db: Database,
  id: string,
  data: {
    calendarEventId: string;
    calendarProvider: string;
  }
) {
  return withMutationLogging(
    'updateVoiceMessageJobCalendarEvent',
    { voiceJobId: id, eventId: data.calendarEventId },
    async () => {
      const [updated] = await db
        .update(voiceMessageJobs)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(voiceMessageJobs.id, id))
        .returning();

      return updated;
    }
  );
}

export async function updateVoiceMessageJobError(
  db: Database,
  id: string,
  data: {
    errorMessage: string;
    errorStage: string;
    retryCount: number;
  }
) {
  return withMutationLogging(
    'updateVoiceMessageJobError',
    { voiceJobId: id, errorStage: data.errorStage },
    async () => {
      const [updated] = await db
        .update(voiceMessageJobs)
        .set({
          status: 'failed',
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(voiceMessageJobs.id, id))
        .returning();

      return updated;
    }
  );
}

export async function getUserVoiceMessageJobs(
  db: Database,
  userId: string,
  limit = 50
) {
  return withQueryLogging(
    'getUserVoiceMessageJobs',
    { userId, limit },
    () => db.query.voiceMessageJobs.findMany({
      where: eq(voiceMessageJobs.userId, userId),
      orderBy: [desc(voiceMessageJobs.createdAt)],
      limit,
    })
  );
}

export async function getTestVoiceMessageJobs(
  db: Database,
  userId: string,
  limit = 20
) {
  return withQueryLogging(
    'getTestVoiceMessageJobs',
    { userId, limit },
    () => db.query.voiceMessageJobs.findMany({
      where: and(
        eq(voiceMessageJobs.userId, userId),
        eq(voiceMessageJobs.isTestJob, true)
      ),
      orderBy: [desc(voiceMessageJobs.createdAt)],
      limit,
    })
  );
}

export async function updateVoiceMessageJobPause(
  db: Database,
  id: string,
  pausedAtStage: string | null,
  testConfiguration?: any
) {
  return withMutationLogging(
    'updateVoiceMessageJobPause',
    { voiceJobId: id, pausedAtStage },
    async () => {
      const [updated] = await db
        .update(voiceMessageJobs)
        .set({
          pausedAtStage,
          ...(testConfiguration !== undefined && { testConfiguration }),
          updatedAt: new Date(),
        })
        .where(eq(voiceMessageJobs.id, id))
        .returning();

      return updated;
    }
  );
}

export async function deleteTestVoiceMessageJobs(
  db: Database,
  userId: string
) {
  return withMutationLogging(
    'deleteTestVoiceMessageJobs',
    { userId },
    async () => {
      const result = await db
        .delete(voiceMessageJobs)
        .where(
          and(
            eq(voiceMessageJobs.userId, userId),
            eq(voiceMessageJobs.isTestJob, true)
          )
        )
        .returning();

      return result;
    }
  );
}

export async function deleteAllUserVoiceMessageJobs(
  db: Database,
  userId: string
) {
  return withMutationLogging(
    'deleteAllUserVoiceMessageJobs',
    { userId },
    async () => {
      const result = await db
        .delete(voiceMessageJobs)
        .where(eq(voiceMessageJobs.userId, userId))
        .returning();

      return result;
    }
  );
}

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import { TRPCError } from "@trpc/server";
import {
  createVoiceMessageJob,
  getVoiceMessageJob,
  getTestVoiceMessageJobs,
  getUserVoiceMessageJobs,
  deleteTestVoiceMessageJobs,
  deleteAllUserVoiceMessageJobs,
  updateVoiceMessageJobPause,
  getPendingIntentByJobId,
  getPrimaryWhatsAppNumber,
  getConversationStateByJobId,
  getInteractivePromptsByPendingIntentId,
  getFlowSessionsByPendingIntentId,
  updateConversationStateResolvedData,
  getVoiceJobTimings,
  getIntentPipelinePayloadsByJobId,
} from "@imaginecalendar/database/queries";
import { getQueue, QUEUE_NAMES } from "@api/lib/queues";

export const voiceTestingRouter = createTRPCRouter({
  // Create a test voice job
  createTestJob: protectedProcedure
    .input(z.object({
      mode: z.enum(['full', 'fromStage']),
      startStage: z.enum(['download', 'transcribe', 'analyze', 'process', 'resolve', 'create', 'notify']).optional(),
      mockData: z.object({
        audioUrl: z.string().optional(),
        transcription: z.string().optional(),
        intent: z.any().optional(),
      }).optional(),
      pauseAfterStage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, session } = ctx;
      const userId = session.user.id;

      // Get user's WhatsApp number
      const whatsappNumber = await getPrimaryWhatsAppNumber(db, userId);

      if (!whatsappNumber) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No WhatsApp number configured'
        });
      }

      // Create test job
      const job = await createVoiceMessageJob(db, {
        userId,
        whatsappNumberId: whatsappNumber.id,
        messageId: `test-${Date.now()}`,
        mediaId: input.mockData?.audioUrl || 'test-media',
        senderPhone: whatsappNumber.phoneNumber,
        isTestJob: true,
        testConfiguration: {
          pauseAfterStage: input.pauseAfterStage,
          mockData: input.mockData,
          mode: input.mode,
          startStage: input.startStage,
        },
      });

      if (!job) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create test job'
        });
      }

      // TODO: Enqueue appropriate stage based on input.startStage
      // Queue manager is in voice-worker app, will need to expose via API or Redis

      return { jobId: job.id };
    }),

  // Get job status with full details
  getJobStatus: protectedProcedure
    .input(z.object({
      jobId: z.string()
    }))
    .query(async ({ ctx, input }) => {
      const { session } = ctx;

      const job = await getVoiceMessageJob(ctx.db, input.jobId);

      if (job && job.userId !== session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized'
        });
      }

      if (!job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Job not found'
        });
      }

      // Get conversation state if exists
      const conversation = await getConversationStateByJobId(ctx.db, input.jobId);

      const pendingIntent = await getPendingIntentByJobId(ctx.db, input.jobId);

      const interactivePromptRecords = pendingIntent
        ? await getInteractivePromptsByPendingIntentId(ctx.db, pendingIntent.id)
        : [];

      const flowSessionRecords = pendingIntent
        ? await getFlowSessionsByPendingIntentId(ctx.db, pendingIntent.id)
        : [];

      const timings = await getVoiceJobTimings(ctx.db, input.jobId);
      const intentPayloads = await getIntentPipelinePayloadsByJobId(ctx.db, input.jobId);
      const timingSummary = buildTimingSummary(timings);

      return {
        job,
        conversation,
        pendingIntent: pendingIntent ?? null,
        interactivePrompts: interactivePromptRecords,
        flowSessions: flowSessionRecords,
        timings,
        timingSummary,
        intentPayloads,
      };
    }),

  // Resume a paused job
  resumeJob: protectedProcedure
    .input(z.object({
      jobId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, session } = ctx;

      // Verify job belongs to user
      const job = await getVoiceMessageJob(db, input.jobId);

      if (!job || job.userId !== session.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Job not found'
        });
      }

      if (!job.pausedAtStage) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Job is not paused'
        });
      }

      // Determine the next queue and stage based on the paused stage
      // The pausedAtStage is "paused_after_X", so we need to proceed to the NEXT stage
      let queueName: string | null = null;
      let nextStage: string | null = null;

      if (job.status === 'paused_after_download') {
        queueName = QUEUE_NAMES.TRANSCRIBE_AUDIO;
        nextStage = 'transcribe';
      } else if (job.status === 'paused_after_transcribe') {
        queueName = QUEUE_NAMES.ANALYZE_INTENT;
        nextStage = 'analyze';
      } else if (job.status === 'paused_after_analyze' || job.status === 'paused_after_intent') {
        queueName = QUEUE_NAMES.PROCESS_INTENT;
        nextStage = 'process';
      } else if (job.status === 'paused_after_process' || job.status === 'paused_after_resolve') {
        queueName = QUEUE_NAMES.CREATE_EVENT;
        nextStage = 'create';
      } else if (job.status === 'paused_after_create') {
        queueName = QUEUE_NAMES.SEND_NOTIFICATION;
        nextStage = 'notify';
      } else if (job.status === 'paused_after_notify') {
        // Job is complete, nothing to resume
        queueName = null;
        nextStage = null;
      }

      // Update testConfiguration to pause at the next stage
      const testConfig = job.testConfiguration as { pauseAfterStage?: string; [key: string]: any } | null;
      const updatedTestConfig = {
        ...testConfig,
        pauseAfterStage: nextStage,
      };

      // Clear pause and update testConfiguration for next stage
      await updateVoiceMessageJobPause(db, input.jobId, null, updatedTestConfig);

      if (queueName) {
        // Add job back to the appropriate queue
        const queue = getQueue(queueName);

        // Build the job data based on queue requirements
        let jobData: any = {
          voiceJobId: input.jobId,
          userId: job.userId,
        };

        // Add additional data based on queue type
        if (queueName === QUEUE_NAMES.TRANSCRIBE_AUDIO) {
          if (!job.audioFilePath || !job.mimeType) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Missing audio file path or mime type for transcription'
            });
          }
          jobData = {
            voiceJobId: input.jobId,
            audioFilePath: job.audioFilePath,
            mimeType: job.mimeType,
          };
        } else if (queueName === QUEUE_NAMES.ANALYZE_INTENT) {
          if (!job.transcribedText) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Missing transcribed text for intent analysis'
            });
          }
          jobData = {
            voiceJobId: input.jobId,
            transcribedText: job.transcribedText,
            userId: job.userId,
          };
        } else if (queueName === QUEUE_NAMES.PROCESS_INTENT || queueName === QUEUE_NAMES.CREATE_EVENT) {
          jobData = {
            voiceJobId: input.jobId,
            userId: job.userId,
          };
        } else if (queueName === QUEUE_NAMES.SEND_NOTIFICATION) {
          // Success is determined by whether we have a calendar event ID
          // (not by status, which might be 'paused_after_create' for test jobs)
          const success = !!job.calendarEventId;
          jobData = {
            voiceJobId: input.jobId,
            senderPhone: job.senderPhone,
            success,
            eventId: job.calendarEventId,
          };
        }

        await queue.add('process', jobData);
      } else {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Unable to determine queue for paused stage: ${job.pausedAtStage}`
        });
      }

      return { success: true, resumedAt: job.pausedAtStage };
    }),

  // Manually run a specific stage
  runStage: protectedProcedure
    .input(z.object({
      jobId: z.string(),
      stage: z.enum(['download', 'transcribe', 'analyze', 'process', 'resolve', 'create', 'notify']),
      skipToNext: z.boolean().default(false),
      mockData: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, session } = ctx;

      // Verify job belongs to user
      const job = await getVoiceMessageJob(db, input.jobId);

      if (!job || job.userId !== session.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Job not found'
        });
      }

      // Clear pause to allow processing
      await updateVoiceMessageJobPause(db, input.jobId, null);

      // Map stage to queue name
      const stageQueueMap: Record<string, string> = {
        download: QUEUE_NAMES.DOWNLOAD_AUDIO,
        transcribe: QUEUE_NAMES.TRANSCRIBE_AUDIO,
        analyze: QUEUE_NAMES.ANALYZE_INTENT,
        process: QUEUE_NAMES.PROCESS_INTENT,
        resolve: QUEUE_NAMES.PROCESS_INTENT,
        create: QUEUE_NAMES.CREATE_EVENT,
        notify: QUEUE_NAMES.SEND_NOTIFICATION,
      };

      const queueName = stageQueueMap[input.stage];
      if (queueName) {
        const queue = getQueue(queueName);
        await queue.add('process', {
          jobId: input.jobId,
          mockData: input.mockData,
          skipToNext: input.skipToNext
        });
      }

      return { success: true };
    }),

  // Inject clarification response for testing
  simulateClarification: protectedProcedure
    .input(z.object({
      jobId: z.string(),
      response: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { session } = ctx;

      // Find conversation state
      const conversation = await getConversationStateByJobId(ctx.db, input.jobId);

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active conversation'
        });
      }

      // Verify belongs to user
      if (conversation.userId !== session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized'
        });
      }

      // Update resolved data
      const resolvedData = {
        ...(conversation.resolvedData as Record<string, any> || {}),
        clarificationResponse: input.response,
      };

      await updateConversationStateResolvedData(
        ctx.db,
        conversation.id,
        resolvedData,
        'processing'
      );

      // Re-run resolve stage
      const queue = getQueue(QUEUE_NAMES.PROCESS_INTENT);
      await queue.add('process', {
        jobId: input.jobId,
        isRetry: true
      });

      return { success: true };
    }),

  // Get all test jobs for user
  getTestJobs: protectedProcedure
    .input(z.object({
      includeAll: z.boolean().optional().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { db, session } = ctx;
      
      // If includeAll is true, get all voice jobs, not just test jobs
      if (input?.includeAll) {
        return getUserVoiceMessageJobs(db, session.user.id, 50);
      }
      
      return getTestVoiceMessageJobs(db, session.user.id);
    }),

  // Clean up all jobs (previously only test jobs)
  cleanupTestJobs: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { db, session } = ctx;
      await deleteAllUserVoiceMessageJobs(db, session.user.id);
      return { success: true };
    }),
});

function buildTimingSummary(timings: Array<{
  stage: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
  durationMs: number | null;
}>) {
  if (!Array.isArray(timings) || timings.length === 0) {
    return {
      stages: {},
      stageOrder: [],
      totalDurationMs: null,
      startedAt: null,
      completedAt: null,
    };
  }

  const sorted = [...timings].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  const stages: Record<string, {
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
  }> = {};

  sorted.forEach((entry) => {
    stages[entry.stage] = {
      startedAt: new Date(entry.startedAt).toISOString(),
      completedAt: entry.completedAt ? new Date(entry.completedAt).toISOString() : null,
      durationMs: entry.durationMs ?? (entry.completedAt
        ? new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime()
        : null),
    };
  });

  const startedAt = new Date(sorted[0]!.startedAt);
  const lastEntry = sorted[sorted.length - 1]!;
  const completedAtDate = lastEntry.completedAt ? new Date(lastEntry.completedAt) : new Date(lastEntry.startedAt);
  const totalDurationMs = completedAtDate.getTime() - startedAt.getTime();

  return {
    stages,
    stageOrder: sorted.map((entry) => entry.stage),
    totalDurationMs,
    startedAt: startedAt.toISOString(),
    completedAt: completedAtDate.toISOString(),
  };
}
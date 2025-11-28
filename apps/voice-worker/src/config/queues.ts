// Queue names and configuration for voice processing pipeline

import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

// Queue names
export const QUEUE_NAMES = {
  DOWNLOAD_AUDIO: 'voice-download-audio',
  TRANSCRIBE_AUDIO: 'voice-transcribe-audio',
  ANALYZE_INTENT: 'voice-analyze-intent',
  PROCESS_INTENT: 'voice-process-intent',
  CREATE_EVENT: 'voice-create-event',
  UPDATE_EVENT: 'voice-update-event',
  DELETE_EVENT: 'voice-delete-event',
  CLARIFICATION_WATCHDOG: 'voice-clarification-watchdog',
  SEND_NOTIFICATION: 'voice-send-notification',
} as const;

// Job data types for each queue
export interface DownloadAudioJobData {
  voiceJobId: string;
  mediaId: string;
  mimeType?: string;
}

export interface TranscribeAudioJobData {
  voiceJobId: string;
  audioFilePath: string;
  mimeType: string;
}

export interface AnalyzeIntentJobData {
  voiceJobId: string;
  transcribedText: string;
  userId: string;
}

export interface ProcessIntentJobData {
  jobId: string;
  voiceJobId: string;
  intentJobId: string;
  userId: string;
  whatsappNumberId: string;
  transcribedText: string;
  senderPhone: string;
}

export interface CreateEventJobData {
  voiceJobId: string;
  userId: string;
}

export interface UpdateEventJobData {
  voiceJobId: string;
  userId: string;
}

export interface DeleteEventJobData {
  voiceJobId: string;
  userId: string;
}

export interface ClarificationWatchdogJobData {
  triggeredAt: string;
}

export interface SendNotificationJobData {
  voiceJobId: string;
  senderPhone: string;
  success: boolean;
  eventId?: string;
  errorMessage?: string;
}

// Default job options per queue
export const JOB_OPTIONS = {
  [QUEUE_NAMES.DOWNLOAD_AUDIO]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: false,
  },
  [QUEUE_NAMES.TRANSCRIBE_AUDIO]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: false,
  },
  [QUEUE_NAMES.ANALYZE_INTENT]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: false,
  },
  [QUEUE_NAMES.PROCESS_INTENT]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: false,
  },
  [QUEUE_NAMES.CREATE_EVENT]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: false,
  },
  [QUEUE_NAMES.UPDATE_EVENT]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: false,
  },
  [QUEUE_NAMES.DELETE_EVENT]: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: false,
  },
  [QUEUE_NAMES.CLARIFICATION_WATCHDOG]: {
    attempts: 1,
    removeOnComplete: { age: 600, count: 10 },
    removeOnFail: false,
  },
  [QUEUE_NAMES.SEND_NOTIFICATION]: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { age: 3600, count: 50 },
    removeOnFail: false,
  },
} as const;

// Worker concurrency settings
export const WORKER_CONCURRENCY = {
  [QUEUE_NAMES.DOWNLOAD_AUDIO]: 5,
  [QUEUE_NAMES.TRANSCRIBE_AUDIO]: 3,
  [QUEUE_NAMES.ANALYZE_INTENT]: 3,
  [QUEUE_NAMES.PROCESS_INTENT]: 3,
  [QUEUE_NAMES.CREATE_EVENT]: 3,
  [QUEUE_NAMES.UPDATE_EVENT]: 3,
  [QUEUE_NAMES.DELETE_EVENT]: 3,
  [QUEUE_NAMES.CLARIFICATION_WATCHDOG]: 1,
  [QUEUE_NAMES.SEND_NOTIFICATION]: 5,
} as const;

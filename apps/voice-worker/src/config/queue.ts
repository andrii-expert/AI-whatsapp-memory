// BullMQ queue configuration

import type { WorkerOptions, DefaultJobOptions } from 'bullmq';

export const QUEUE_NAME = 'voice-messages';
export const DLQ_NAME = 'voice-messages-dlq';

// Default job options (connection is added when creating Queue)
export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // Start with 5 seconds
  },
  removeOnComplete: {
    age: 3600, // Remove completed jobs after 1 hour
    count: 100, // Keep last 100 completed jobs
  },
  removeOnFail: false, // Keep failed jobs for debugging
};

export const workerConfig: Partial<WorkerOptions> = {
  concurrency: 3, // Process 3 jobs concurrently
  lockDuration: 60000, // 60 seconds lock duration
};

export const deadLetterQueueDefaultJobOptions: DefaultJobOptions = {
  attempts: 1, // No retries in DLQ
  removeOnComplete: false,
  removeOnFail: false,
};

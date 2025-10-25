// Shared BullMQ queue utilities for the API service
import { Queue } from 'bullmq';
import { getRedisConnection } from './redis';

// Queue name constants (matches voice-worker configuration)
export const QUEUE_NAMES = {
  DOWNLOAD_AUDIO: 'voice-download-audio',
  TRANSCRIBE_AUDIO: 'voice-transcribe-audio',
  ANALYZE_INTENT: 'voice-analyze-intent',
  CREATE_EVENT: 'voice-create-event',
  PROCESS_INTENT: 'voice-process-intent',
  SEND_NOTIFICATION: 'voice-send-notification',
} as const;

// Queue instances cache
const queueInstances = new Map<string, Queue>();

/**
 * Get or create a queue instance
 */
export function getQueue(queueName: string): Queue {
  if (!queueInstances.has(queueName)) {
    const queue = new Queue(queueName, {
      connection: getRedisConnection(),
    });

    queueInstances.set(queueName, queue);
  }

  return queueInstances.get(queueName)!;
}

/**
 * Get all voice processing queues
 */
export function getAllVoiceQueues(): Queue[] {
  return Object.values(QUEUE_NAMES).map(getQueue);
}

/**
 * Close all queue connections
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.all(
    Array.from(queueInstances.values()).map((queue) => queue.close())
  );
  queueInstances.clear();
}

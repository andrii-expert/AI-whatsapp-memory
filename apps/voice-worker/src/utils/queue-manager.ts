// Queue manager for enqueuing jobs across the pipeline

import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { logger } from '@imaginecalendar/logger';
import {
  QUEUE_NAMES,
  JOB_OPTIONS,
  type DownloadAudioJobData,
  type TranscribeAudioJobData,
  type AnalyzeIntentJobData,
  type ProcessIntentJobData,
  type CreateEventJobData,
  type UpdateEventJobData,
  type DeleteEventJobData,
  type ClarificationWatchdogJobData,
  type SendNotificationJobData,
} from '../config/queues';

export class QueueManager {
  private queues: Map<string, Queue> = new Map();

  constructor(private connection: Redis) {}

  /**
   * Initialize all queues
   */
  async initialize(): Promise<void> {
    for (const queueName of Object.values(QUEUE_NAMES)) {
      const queue = new Queue(queueName, {
        connection: this.connection,
        defaultJobOptions: JOB_OPTIONS[queueName],
      });

      this.queues.set(queueName, queue);

      logger.info({ queueName }, 'Queue initialized');

      if (queueName === QUEUE_NAMES.CLARIFICATION_WATCHDOG) {
        await this.ensureClarificationWatchdog(queue);
      }
    }
  }

  /**
   * Get queue by name
   */
  private getQueue(queueName: string): Queue {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not initialized`);
    }
    return queue;
  }

  /**
   * Enqueue download audio job
   */
  async enqueueDownloadAudio(data: DownloadAudioJobData): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.DOWNLOAD_AUDIO);
    await queue.add('download-audio', data, {
      jobId: `download-${data.voiceJobId}`,
    });
    logger.info({ voiceJobId: data.voiceJobId }, 'Enqueued download audio job');
  }

  /**
   * Enqueue transcribe audio job
   */
  async enqueueTranscribeAudio(data: TranscribeAudioJobData): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.TRANSCRIBE_AUDIO);
    await queue.add('transcribe-audio', data, {
      jobId: `transcribe-${data.voiceJobId}`,
    });
    logger.info({ voiceJobId: data.voiceJobId }, 'Enqueued transcribe audio job');
  }

  /**
   * Enqueue analyze intent job
   */
  async enqueueAnalyzeIntent(data: AnalyzeIntentJobData): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.ANALYZE_INTENT);
    await queue.add('analyze-intent', data, {
      jobId: `analyze-${data.voiceJobId}`,
    });
    logger.info({ voiceJobId: data.voiceJobId }, 'Enqueued analyze intent job');
  }

  /**
   * Enqueue unified process intent job
   */
  async enqueueProcessIntent(data: ProcessIntentJobData): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.PROCESS_INTENT);
    await queue.add('process-intent', data, {
      jobId: `process-${data.voiceJobId}`,
    });
    logger.info({ voiceJobId: data.voiceJobId, intentJobId: data.intentJobId }, 'Enqueued process intent job');
  }

  /**
   * Enqueue create event job
   */
  async enqueueCreateEvent(data: CreateEventJobData): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.CREATE_EVENT);
    await queue.add('create-event', data, {
      jobId: `create-${data.voiceJobId}`,
    });
    logger.info({ voiceJobId: data.voiceJobId }, 'Enqueued create event job');
  }

  async enqueueUpdateEvent(data: UpdateEventJobData): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.UPDATE_EVENT);
    await queue.add('update-event', data, {
      jobId: `update-${data.voiceJobId}`,
    });
    logger.info({ voiceJobId: data.voiceJobId }, 'Enqueued update event job');
  }

  async enqueueDeleteEvent(data: DeleteEventJobData): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.DELETE_EVENT);
    await queue.add('delete-event', data, {
      jobId: `delete-${data.voiceJobId}`,
    });
    logger.info({ voiceJobId: data.voiceJobId }, 'Enqueued delete event job');
  }

  /**
   * Schedule clarification watchdog job (runs every minute)
   */
  private async ensureClarificationWatchdog(queue: Queue): Promise<void> {
    const existing = await queue.getRepeatableJobs();
    const hasWatchdog = existing.some((job) => job.name === 'clarification-watchdog');

    if (!hasWatchdog) {
      await queue.add(
        'clarification-watchdog',
        { triggeredAt: new Date().toISOString() } satisfies ClarificationWatchdogJobData,
        {
          jobId: 'clarification-watchdog',
          repeat: { every: 60_000 },
        }
      );
      logger.info({}, 'Scheduled clarification watchdog job');
    }
  }

  /**
   * Enqueue send notification job
   */
  async enqueueSendNotification(data: SendNotificationJobData): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.SEND_NOTIFICATION);
    await queue.add('send-notification', data, {
      jobId: `notify-${data.voiceJobId}`,
    });
    logger.info({ voiceJobId: data.voiceJobId }, 'Enqueued send notification job');
  }

  /**
   * Close all queues
   */
  async close(): Promise<void> {
    for (const [queueName, queue] of this.queues.entries()) {
      await queue.close();
      logger.info({ queueName }, 'Queue closed');
    }
    this.queues.clear();
  }
}

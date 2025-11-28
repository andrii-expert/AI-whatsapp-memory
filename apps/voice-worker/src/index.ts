// Voice Worker - BullMQ worker for voice message processing pipeline

import { Worker } from 'bullmq';
import { connectDb } from '@imaginecalendar/database/client';
import { logger } from '@imaginecalendar/logger';
import { getRedisConnection, closeRedisConnection } from './config/redis';
import { QUEUE_NAMES, WORKER_CONCURRENCY } from './config/queues';
import { QueueManager } from './utils/queue-manager';
import {
  processDownloadAudio,
  processTranscribeAudio,
  processAnalyzeIntent,
  processProcessIntent,
  processCreateEvent,
  processUpdateEvent,
  processDeleteEvent,
  processClarificationWatchdog,
  processSendNotification,
} from './processors';

async function main() {
  try {
    // Connect to database
    const db = await connectDb();
    logger.info({}, 'Database connected');

    // Connect to Redis
    const connection = getRedisConnection();

    // Initialize queue manager
    const queueManager = new QueueManager(connection);
    await queueManager.initialize();
    logger.info({}, 'Queue manager initialized');

    // Create workers for each queue
    const workers: Worker[] = [];

    // 1. Download Audio Worker
    const downloadWorker = new Worker(
      QUEUE_NAMES.DOWNLOAD_AUDIO,
      async (job) => processDownloadAudio(job, db, queueManager),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.DOWNLOAD_AUDIO],
      }
    );
    workers.push(downloadWorker);

    // 2. Transcribe Audio Worker
    const transcribeWorker = new Worker(
      QUEUE_NAMES.TRANSCRIBE_AUDIO,
      async (job) => processTranscribeAudio(job, db, queueManager),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.TRANSCRIBE_AUDIO],
      }
    );
    workers.push(transcribeWorker);

    // 3. Analyze Intent Worker
    const analyzeWorker = new Worker(
      QUEUE_NAMES.ANALYZE_INTENT,
      async (job) => processAnalyzeIntent(job, db, queueManager),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.ANALYZE_INTENT],
      }
    );
    workers.push(analyzeWorker);

    // 4. Process Intent Worker (new unified pipeline)
    const processIntentWorker = new Worker(
      QUEUE_NAMES.PROCESS_INTENT,
      async (job) => processProcessIntent(job, db, queueManager),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.PROCESS_INTENT],
      }
    );
    workers.push(processIntentWorker);

    // 5. Create Event Worker
    const createEventWorker = new Worker(
      QUEUE_NAMES.CREATE_EVENT,
      async (job) => processCreateEvent(job, db, queueManager),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.CREATE_EVENT],
      }
    );
    workers.push(createEventWorker);

    // 6. Update Event Worker
    const updateEventWorker = new Worker(
      QUEUE_NAMES.UPDATE_EVENT,
      async (job) => processUpdateEvent(job, db, queueManager),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.UPDATE_EVENT],
      }
    );
    workers.push(updateEventWorker);

    // 7. Delete Event Worker
    const deleteEventWorker = new Worker(
      QUEUE_NAMES.DELETE_EVENT,
      async (job) => processDeleteEvent(job, db, queueManager),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.DELETE_EVENT],
      }
    );
    workers.push(deleteEventWorker);

    // 8. Clarification Watchdog Worker
    const clarificationWorker = new Worker(
      QUEUE_NAMES.CLARIFICATION_WATCHDOG,
      async (job) => processClarificationWatchdog(job, db, queueManager),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.CLARIFICATION_WATCHDOG],
      }
    );
    workers.push(clarificationWorker);

    // 9. Send Notification Worker
    const notificationWorker = new Worker(
      QUEUE_NAMES.SEND_NOTIFICATION,
      async (job) => processSendNotification(job, db),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.SEND_NOTIFICATION],
      }
    );
    workers.push(notificationWorker);

    // Set up event handlers for all workers
    workers.forEach((worker, index) => {
      const queueName = Object.values(QUEUE_NAMES)[index];

      worker.on('completed', (job) => {
        logger.info(
          { queueName, jobId: job.id, duration: Date.now() - job.timestamp },
          'Job completed'
        );
      });

      worker.on('failed', (job, err) => {
        logger.error(
          { queueName, jobId: job?.id, error: err.message, attempts: job?.attemptsMade },
          'Job failed'
        );
      });

      worker.on('error', (err) => {
        logger.error({ queueName, error: err.message }, 'Worker error');
      });
    });

    logger.info(
      {
        workerCount: workers.length,
        queues: Object.values(QUEUE_NAMES),
      },
      'Voice message workers started successfully'
    );

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down gracefully');

      // Close all workers
      await Promise.all(workers.map(w => w.close()));
      logger.info({}, 'All workers closed');

      // Close queue manager
      await queueManager.close();
      logger.info({}, 'Queue manager closed');

      // Close Redis connection
      await closeRedisConnection();

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start voice worker');
    process.exit(1);
  }
}

main();

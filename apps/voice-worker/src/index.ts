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
  processWhatsAppVoice,
  processCreateEvent,
  processUpdateEvent,
  processDeleteEvent,
  processClarificationWatchdog,
  processSendNotification,
} from './processors';

async function main() {
  try {
    logger.info({}, 'Starting voice worker...');
    
    // Connect to database
    logger.info({}, 'Connecting to database...');
    const db = await connectDb();
    logger.info({}, 'Database connected');

    // Connect to Redis
    logger.info({}, 'Connecting to Redis...');
    const connection = getRedisConnection();
    logger.info({}, 'Redis connected');

    // Initialize queue manager
    logger.info({}, 'Initializing queue manager...');
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

    // 4b. Process WhatsApp Voice Worker (uses same analysis as text messages)
    const processWhatsAppVoiceWorker = new Worker(
      QUEUE_NAMES.PROCESS_WHATSAPP_VOICE,
      async (job) => processWhatsAppVoice(job, db, queueManager),
      {
        connection,
        concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.PROCESS_WHATSAPP_VOICE],
      }
    );
    workers.push(processWhatsAppVoiceWorker);

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
    // Map workers to their queue names explicitly
    const workerQueueMap = [
      { worker: downloadWorker, queueName: QUEUE_NAMES.DOWNLOAD_AUDIO },
      { worker: transcribeWorker, queueName: QUEUE_NAMES.TRANSCRIBE_AUDIO },
      { worker: analyzeWorker, queueName: QUEUE_NAMES.ANALYZE_INTENT },
      { worker: processIntentWorker, queueName: QUEUE_NAMES.PROCESS_INTENT },
      { worker: processWhatsAppVoiceWorker, queueName: QUEUE_NAMES.PROCESS_WHATSAPP_VOICE },
      { worker: createEventWorker, queueName: QUEUE_NAMES.CREATE_EVENT },
      { worker: updateEventWorker, queueName: QUEUE_NAMES.UPDATE_EVENT },
      { worker: deleteEventWorker, queueName: QUEUE_NAMES.DELETE_EVENT },
      { worker: clarificationWorker, queueName: QUEUE_NAMES.CLARIFICATION_WATCHDOG },
      { worker: notificationWorker, queueName: QUEUE_NAMES.SEND_NOTIFICATION },
    ];

    workerQueueMap.forEach(({ worker, queueName }) => {
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(
      { 
        error: errorMessage,
        errorStack,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      }, 
      'Failed to start voice worker'
    );
    
    console.error('Voice worker startup error:', errorMessage);
    if (errorStack) {
      console.error('Stack trace:', errorStack);
    }
    
    process.exit(1);
  }
}

main();

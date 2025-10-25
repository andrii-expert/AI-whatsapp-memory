// Redis connection configuration for BullMQ

import Redis from 'ioredis';
import { logger } from '@imaginecalendar/logger';

let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false, // Required for BullMQ
    };

    redisConnection = new Redis(config);

    redisConnection.on('connect', () => {
      logger.info({ host: config.host, port: config.port }, 'Redis connected');
    });

    redisConnection.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    redisConnection.on('close', () => {
      logger.warn({}, 'Redis connection closed');
    });
  }

  return redisConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
    logger.info({}, 'Redis connection closed gracefully');
  }
}

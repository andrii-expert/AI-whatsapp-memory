// Shared Redis connection for the API service
import Redis from 'ioredis';
import { logger } from '@imaginecalendar/logger';

let redisConnection: Redis | null = null;

/**
 * Get or create a singleton Redis connection
 */
export function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    redisConnection.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    redisConnection.on('connect', () => {
      logger.info({}, 'Redis connected successfully');
    });

    logger.info(
      {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || '6379',
      },
      'Redis connection initialized'
    );
  }

  return redisConnection;
}

/**
 * Close the Redis connection (useful for cleanup)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
    logger.info({}, 'Redis connection closed');
  }
}

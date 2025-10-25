import { logger } from "@imaginecalendar/logger";

/**
 * Wraps a database query with logging for consistent error handling
 * Following midday's pattern of logging at the database layer
 */
export async function withQueryLogging<T>(
  operation: string,
  context: Record<string, any>,
  queryFn: () => Promise<T>
): Promise<T> {
  try {
    const result = await queryFn();
    
    // Log if no results found (for find operations)
    if (result === null || result === undefined) {
      logger.info(context, `${operation}: No results found`);
    }
    
    return result;
  } catch (error) {
    logger.error({ ...context, error }, `${operation}: Query failed`);
    throw error;
  }
}

/**
 * Wraps a database mutation with logging
 */
export async function withMutationLogging<T>(
  operation: string,
  context: Record<string, any>,
  mutationFn: () => Promise<T>
): Promise<T> {
  try {
    const result = await mutationFn();
    logger.info(context, `${operation}: Success`);
    return result;
  } catch (error) {
    logger.error({ ...context, error }, `${operation}: Failed`);
    throw error;
  }
}
// Error classification and handling utilities

import { logger } from '@imaginecalendar/logger';

export type ErrorCategory =
  | 'NETWORK'
  | 'RATE_LIMIT'
  | 'AUTHENTICATION'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'PROCESSING'
  | 'UNKNOWN';

export interface ClassifiedError {
  category: ErrorCategory;
  isRetryable: boolean;
  message: string; // Keep the actual error message
  userMessage: string; // Separate user-friendly message
  originalError: Error;
}

export class ErrorHandler {
  /**
   * Classify error and determine if it's retryable
   */
  static classify(error: unknown): ClassifiedError {
    const err = error instanceof Error ? error : new Error(String(error));
    const messageLower = err.message.toLowerCase();
    const actualMessage = err.message; // Keep the ACTUAL error message

    // Network errors - retryable
    if (
      messageLower.includes('etimedout') ||
      messageLower.includes('econnreset') ||
      messageLower.includes('enotfound') ||
      messageLower.includes('econnrefused') ||
      messageLower.includes('network')
    ) {
      return {
        category: 'NETWORK',
        isRetryable: true,
        message: actualMessage,
        userMessage: "We're having trouble connecting. We'll try again shortly.",
        originalError: err,
      };
    }

    // Rate limit errors - retryable with backoff
    if (
      messageLower.includes('rate limit') ||
      messageLower.includes('too many requests') ||
      messageLower.includes('429')
    ) {
      return {
        category: 'RATE_LIMIT',
        isRetryable: true,
        message: actualMessage,
        userMessage: "We're processing a lot of requests. We'll try again in a moment.",
        originalError: err,
      };
    }

    // Authentication errors - not retryable
    if (
      messageLower.includes('unauthorized') ||
      messageLower.includes('401') ||
      messageLower.includes('403') ||
      messageLower.includes('authentication') ||
      messageLower.includes('invalid token')
    ) {
      return {
        category: 'AUTHENTICATION',
        isRetryable: false,
        message: actualMessage,
        userMessage: "There's an issue with your account permissions. Please contact support.",
        originalError: err,
      };
    }

    // Not found errors - not retryable
    if (
      messageLower.includes('not found') ||
      messageLower.includes('404')
    ) {
      return {
        category: 'NOT_FOUND',
        isRetryable: false,
        message: actualMessage, // KEEP THE ACTUAL ERROR!
        userMessage: actualMessage, // Show user the real error for calendar issues
        originalError: err,
      };
    }

    // Invalid input - not retryable
    if (
      messageLower.includes('invalid') ||
      messageLower.includes('validation') ||
      messageLower.includes('400')
    ) {
      return {
        category: 'INVALID_INPUT',
        isRetryable: false,
        message: actualMessage,
        userMessage: "We couldn't understand your voice note. Please try again.",
        originalError: err,
      };
    }

    // Processing errors - might be retryable
    if (
      messageLower.includes('processing') ||
      messageLower.includes('timeout') ||
      messageLower.includes('service unavailable') ||
      messageLower.includes('503')
    ) {
      return {
        category: 'PROCESSING',
        isRetryable: true,
        message: actualMessage,
        userMessage: "We're having trouble processing your request. We'll try again.",
        originalError: err,
      };
    }

    // Unknown errors - retryable by default
    return {
      category: 'UNKNOWN',
      isRetryable: true,
      message: actualMessage,
      userMessage: "Something went wrong. We'll try again shortly.",
      originalError: err,
    };
  }

  /**
   * Log error with appropriate level and context
   */
  static log(error: ClassifiedError, context: Record<string, any>): void {
    const logData = {
      ...context,
      category: error.category,
      isRetryable: error.isRetryable,
      error: error.originalError,
    };

    if (error.category === 'AUTHENTICATION' || error.category === 'INVALID_INPUT') {
      logger.error(logData, `${error.category}: ${error.message}`);
    } else if (error.isRetryable) {
      logger.warn(logData, `${error.category}: ${error.message} (will retry)`);
    } else {
      logger.error(logData, `${error.category}: ${error.message}`);
    }
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(error: ClassifiedError): string {
    return error.userMessage;
  }
}

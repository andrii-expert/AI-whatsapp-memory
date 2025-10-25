import type { Database } from '@imaginecalendar/database/client';
import {
  verifyWhatsAppCode,
  logIncomingWhatsAppMessage,
} from '@imaginecalendar/database/queries';
import type { WhatsAppParsedMessage } from '@imaginecalendar/whatsapp';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { extractVerificationCode } from '@imaginecalendar/whatsapp';
import { metrics } from '@/lib/metrics';
import { logger } from '@imaginecalendar/logger';
import type { WebhookProcessingSummary } from './types';

export async function handleVerificationMessage(
  parsedMessage: WhatsAppParsedMessage,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<boolean> {
  const { phoneNumber, messageText, contactName, messageId } = parsedMessage;

  const verificationCode = extractVerificationCode(messageText);

  if (!verificationCode) {
    return false;
  }

  logger.info({ phoneNumber, messageId }, 'Processing verification message');

  try {
    const verificationResult = await verifyWhatsAppCode(db, phoneNumber, verificationCode);

    metrics.increment('verification.success');

    logger.info(
      {
        phoneNumber,
        userId: verificationResult.userId,
      },
      'WhatsApp verification successful'
    );

    summary.verificationSuccess.push({
      phoneNumber: verificationResult.phoneNumber,
      userId: verificationResult.userId,
    });

    try {
      const whatsappService = new WhatsAppService();
      await whatsappService.sendWelcomeMessage(phoneNumber, contactName, {
        db,
        whatsappNumberId: verificationResult.whatsappNumberId,
        userId: verificationResult.userId,
      });
    } catch (welcomeError) {
      logger.error(
        {
          error: welcomeError,
          phoneNumber,
          userId: verificationResult.userId,
        },
        'Failed to send welcome message after verification'
      );
    }

    try {
      await logIncomingWhatsAppMessage(db, {
        whatsappNumberId: verificationResult.whatsappNumberId,
        userId: verificationResult.userId,
        messageId,
        messageType: 'text',
      });
    } catch (logError) {
      logger.error(
        {
          error: logError,
          phoneNumber,
          messageId,
        },
        'Failed to log incoming verification message'
      );
    }

    return true;
  } catch (error) {
    metrics.increment('verification.failure');

    logger.error(
      {
        error,
        phoneNumber,
        messageId,
        verificationCode: '[REDACTED]',
      },
      'WhatsApp verification failed'
    );

    summary.verificationFailures.push({
      phoneNumber,
      reason: error instanceof Error ? error.message : 'unknown',
    });

    return true;
  }
}

import type { Database } from '@imaginecalendar/database/client';
import {
  verifyWhatsAppCode,
  logIncomingWhatsAppMessage,
  getUserById,
} from '@imaginecalendar/database/queries';
import type { WhatsAppParsedMessage } from '@imaginecalendar/whatsapp';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { extractVerificationCode, isVerificationMessage } from '@imaginecalendar/whatsapp';
import { metrics } from '@/lib/metrics';
import { logger } from '@imaginecalendar/logger';
import type { WebhookProcessingSummary } from './types';

export async function handleVerificationMessage(
  parsedMessage: WhatsAppParsedMessage,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<boolean> {
  const { phoneNumber, messageText, contactName, messageId } = parsedMessage;

  // Check if this is a verification message format
  if (!isVerificationMessage(messageText)) {
    return false;
  }

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

    // Send verification completed message and welcome message
    try {
      // Check WhatsApp configuration before attempting to send
      const hasAccessToken = !!process.env.WHATSAPP_ACCESS_TOKEN;
      const hasPhoneNumberId = !!process.env.WHATSAPP_PHONE_NUMBER_ID;
      
      if (!hasAccessToken || !hasPhoneNumberId) {
        logger.error(
          {
            phoneNumber,
            userId: verificationResult.userId,
            hasAccessToken,
            hasPhoneNumberId,
            missingVars: {
              WHATSAPP_ACCESS_TOKEN: !hasAccessToken,
              WHATSAPP_PHONE_NUMBER_ID: !hasPhoneNumberId,
            },
          },
          'WhatsApp environment variables missing - cannot send verification messages'
        );
        throw new Error('WhatsApp service not configured. Missing required environment variables.');
      }

      const whatsappService = new WhatsAppService();
      
      // Get user details for personalization
      const user = await getUserById(db, verificationResult.userId);
      const userName = user?.firstName 
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
        : contactName || 'there';

      // Send welcome message as plain text
      try {
        const welcomeMessage = `Hey ${userName} 👋 Welcome to CrackOn!\n\nYou have been successfully verified\n\nNow, just tell me what you need and I'll sort it out. Simply use voice notes or type text commands in this chat\n\n• Meetings ("Meet John at 2pm")\n• Tasks ("Buy Milk")\n• Reminders ("Pick up kids at 5pm")\n• Notes ("John said that...")`;
        
        const welcomeResponse = await whatsappService.sendTextMessage(phoneNumber, welcomeMessage);
        
        // Log the outgoing message
        try {
          const { logOutgoingWhatsAppMessage, isWithinFreeMessageWindow } = await import('@imaginecalendar/database/queries');
          const isFreeMessage = await isWithinFreeMessageWindow(db, verificationResult.whatsappNumberId);
          
          await logOutgoingWhatsAppMessage(db, {
            whatsappNumberId: verificationResult.whatsappNumberId,
            userId: verificationResult.userId,
            messageId: welcomeResponse.messages?.[0]?.id,
            messageType: 'text',
            isFreeMessage,
          });
        } catch (logError) {
          logger.error(
            {
              error: logError,
              phoneNumber,
              userId: verificationResult.userId,
            },
            'Failed to log outgoing welcome message'
          );
        }
        
        logger.info(
          {
            phoneNumber,
            userId: verificationResult.userId,
            messageId: welcomeResponse.messages?.[0]?.id,
          },
          'Welcome message sent successfully after verification'
        );
      } catch (welcomeMsgError) {
        const errorDetails = welcomeMsgError instanceof Error 
          ? {
              message: welcomeMsgError.message,
              stack: welcomeMsgError.stack,
            }
          : welcomeMsgError;
        
        logger.error(
          {
            error: errorDetails,
            phoneNumber,
            userId: verificationResult.userId,
            errorType: welcomeMsgError?.constructor?.name,
          },
          'Failed to send welcome message after verification'
        );
        throw welcomeMsgError; // Re-throw to be caught by outer catch
      }
    } catch (welcomeError) {
      const errorDetails = welcomeError instanceof Error 
        ? {
            message: welcomeError.message,
            stack: welcomeError.stack,
          }
        : welcomeError;
      
      logger.error(
        {
          error: errorDetails,
          phoneNumber,
          userId: verificationResult.userId,
          errorType: welcomeError?.constructor?.name,
        },
        'Failed to send WhatsApp messages after verification'
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

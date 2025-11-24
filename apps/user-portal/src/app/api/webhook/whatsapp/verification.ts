import type { Database } from '@imaginecalendar/database/client';
import {
  verifyWhatsAppCode,
  logIncomingWhatsAppMessage,
  getUserById,
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

      // Send verification completed confirmation message
      const verificationMessage = `✅ Verification Complete!\n\nHi ${userName}, your WhatsApp number has been successfully verified. You're all set to use CrackOn for managing your calendar, reminders, and notes!\n\n`;
      
      try {
        const verificationResponse = await whatsappService.sendTextMessage(phoneNumber, verificationMessage);
        logger.info(
          {
            phoneNumber,
            userId: verificationResult.userId,
            messageId: verificationResponse.messages?.[0]?.id,
          },
          'Verification completed message sent successfully'
        );
      } catch (verificationMsgError) {
        const errorDetails = verificationMsgError instanceof Error 
          ? {
              message: verificationMsgError.message,
              stack: verificationMsgError.stack,
            }
          : verificationMsgError;
        
        logger.error(
          {
            error: errorDetails,
            phoneNumber,
            userId: verificationResult.userId,
            errorType: verificationMsgError?.constructor?.name,
          },
          'Failed to send verification completed message'
        );
        // Continue to send welcome message even if verification message fails
      }

      // Send welcome message with reply buttons
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.crackon.ai';
        const welcomeMessage = `Hey ${userName} 👋 Welcome to CrackOn!\n\nYou have been successfully verified\n\nNow, just tell me what you need and I'll sort it out. Simply use voice notes or type text commands in this chat\n\n• Calendar Events ("meeting John at 2pm")\n• Create Tasks ("Add milk to my shopping list")\n• Set reminders ("Feed dogs every day at 5pm")\n• Save notes ("Your meeting minutes")`;
        
        const welcomeResponse = await whatsappService.sendReplyButtonMessage(phoneNumber, {
          bodyText: welcomeMessage,
          buttons: [
            {
              id: 'upgrade_package',
              title: 'Upgrade Package',
            },
            {
              id: 'view_dashboard',
              title: 'View Dashboard',
            },
          ],
        });
        
        // Log the outgoing message
        try {
          const { logOutgoingWhatsAppMessage, isWithinFreeMessageWindow } = await import('@imaginecalendar/database/queries');
          const isFreeMessage = await isWithinFreeMessageWindow(db, verificationResult.whatsappNumberId);
          
          await logOutgoingWhatsAppMessage(db, {
            whatsappNumberId: verificationResult.whatsappNumberId,
            userId: verificationResult.userId,
            messageId: welcomeResponse.messages?.[0]?.id,
            messageType: 'interactive',
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

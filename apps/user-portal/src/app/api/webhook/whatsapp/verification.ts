import type { Database } from '@imaginecalendar/database/client';
import {
  verifyWhatsAppCode,
  logIncomingWhatsAppMessage,
  getUserById,
} from '@imaginecalendar/database/queries';
import type { WhatsAppParsedMessage, CTAButtonMessage } from '@imaginecalendar/whatsapp';
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

      // Send welcome message with CTA button
      try {
        // Get the base URL for the redirect button
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crackon.ai';
        const finishSetupUrl = `${baseUrl}/onboarding/whatsapp`;
        
        const welcomeMessage: CTAButtonMessage = {
          bodyText: `*👋Welcome to CrackOn ${userName}*\n\nYour number is verified and you are one step closer to being more efficient, effective and organised. Tap the button below to complete your setup.`,
          buttonText: 'Finish setup',
          buttonUrl: finishSetupUrl,
        };
        
        const welcomeResponse = await whatsappService.sendCTAButtonMessage(phoneNumber, welcomeMessage);
        
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

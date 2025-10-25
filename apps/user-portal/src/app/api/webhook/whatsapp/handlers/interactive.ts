import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import type { WebhookProcessingSummary } from '../types';
import {
  processFlowSubmission,
  processInteractiveSelection,
} from '../clarifications';

export async function handleInteractiveMessage(
  message: any,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<void> {
  const interactive = message.interactive;
  if (!interactive) {
    return;
  }

  const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, message.from);

  if (!whatsappNumber || !whatsappNumber.isVerified) {
    logger.info(
      {
        senderPhone: message.from,
        found: !!whatsappNumber,
        verified: whatsappNumber?.isVerified,
      },
      'Ignoring interactive message from unverified number'
    );
    return;
  }

  try {
    await logIncomingWhatsAppMessage(db, {
      whatsappNumberId: whatsappNumber.id,
      userId: whatsappNumber.userId,
      messageId: message.id,
      messageType: 'interactive',
    });
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to log incoming interactive message'
    );
  }

  if (message.id && message.from) {
    try {
      const whatsappService = new WhatsAppService();
      await whatsappService.sendTypingIndicator(message.from, message.id);
    } catch (error) {
      logger.warn(
        {
          error,
          messageId: message.id,
          senderPhone: message.from,
        },
        'Failed to send typing indicator for interactive message'
      );
    }
  }

  if (interactive.type === 'nfm_reply') {
    const handled = await processFlowSubmission(message, db, summary);
    if (!handled) {
      logger.warn({ messageId: message.id }, 'Flow response could not be matched to pending intent');
    }
    return;
  }

  if (interactive.type === 'button_reply' || interactive.type === 'list_reply') {
    const selectedText = interactive.list_reply?.title ?? interactive.button_reply?.title ?? '';
    const selectionId = interactive.list_reply?.id ?? interactive.button_reply?.id ?? '';

    if (!selectionId) {
      logger.warn({ messageId: message.id }, 'Interactive selection missing identifier');
      return;
    }

    const handled = await processInteractiveSelection({
      message,
      interactive,
      selectedText,
      selectionId,
      whatsappNumberId: whatsappNumber.id,
      db,
      summary,
    });

    if (!handled) {
      logger.warn(
        {
          messageId: message.id,
          selectionId,
        },
        'Interactive selection did not match a pending intent'
      );
    }

    return;
  }

  logger.warn(
    {
      messageId: message.id,
      interactiveType: interactive.type,
    },
    'Unsupported interactive message subtype'
  );
}

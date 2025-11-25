import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, matchesVerificationPhrase } from '@imaginecalendar/whatsapp';
import { WhatsappTextAnalysisService } from '@imaginecalendar/ai-services';
import type { WebhookProcessingSummary } from '../types';

const ANALYSIS_ORDER = ['task', 'reminder', 'note', 'event'] as const;
const GLOBAL_FALLBACK = "I’m sorry, I couldn’t interpret that request. Could you rephrase with more detail?";

type AnalysisIntent = (typeof ANALYSIS_ORDER)[number];

type IntentAnalyzer = {
  intent: AnalysisIntent;
  handler: (service: WhatsappTextAnalysisService, text: string) => Promise<string>;
};

const INTENT_ANALYZERS: IntentAnalyzer[] = [
  {
    intent: 'task',
    handler: (svc, text) => svc.analyzeTask(text),
  },
  {
    intent: 'reminder',
    handler: (svc, text) => svc.analyzeReminder(text),
  },
  {
    intent: 'note',
    handler: (svc, text) => svc.analyzeNote(text),
  },
  {
    intent: 'event',
    handler: (svc, text) => svc.analyzeEvent(text),
  },
];

export async function handleTextMessage(
  message: any,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<void> {
  const messageText = message.text?.body?.trim();

  if (!messageText) {
    return;
  }

  if (matchesVerificationPhrase(messageText)) {
    logger.info(
      {
        messageId: message.id,
        senderPhone: message.from,
      },
      'Verification message handled separately'
    );
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
      'Ignoring text from unverified number'
    );
    return;
  }

  try {
    await logIncomingWhatsAppMessage(db, {
      whatsappNumberId: whatsappNumber.id,
      userId: whatsappNumber.userId,
      messageId: message.id,
      messageType: 'text',
    });
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to log incoming text message'
    );
  }

  await sendTypingIndicatorSafely(message.from, message.id);

  try {
    await analyzeAndRespond(messageText, message.from, whatsappNumber.userId);
    summary.textJobIds.push(message.id);
  } catch (error) {
    logger.error(
      {
        error,
        senderPhone: message.from,
        userId: whatsappNumber.userId,
      },
      'Failed to send AI response for WhatsApp text'
    );
  }
}

async function analyzeAndRespond(text: string, recipient: string, userId: string): Promise<void> {
  const analyzer = new WhatsappTextAnalysisService();
  const whatsappService = new WhatsAppService();
  const responses: string[] = [];

  for (const item of INTENT_ANALYZERS) {
    try {
      const result = (await item.handler(analyzer, text)).trim();
      if (result) {
        responses.push(result);
      }
    } catch (error) {
      logger.error(
        {
          error,
          intent: item.intent,
          userId,
        },
        'AI analysis failed for WhatsApp text'
      );
    }
  }

  const reply = responses.length > 0 ? responses.join('\n\n') : GLOBAL_FALLBACK;
  await whatsappService.sendTextMessage(recipient, reply);
}

async function sendTypingIndicatorSafely(recipient: string, messageId: string | undefined): Promise<void> {
  if (!recipient || !messageId) {
    return;
  }

  try {
    const whatsappService = new WhatsAppService();
    await whatsappService.sendTypingIndicator(recipient, messageId);
  } catch (error) {
    logger.warn(
      {
        error,
        recipient,
        messageId,
      },
      'Failed to send typing indicator'
    );
  }
}

import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, matchesVerificationPhrase } from '@imaginecalendar/whatsapp';
import { WhatsappTextAnalysisService } from '@imaginecalendar/ai-services';
import type { WebhookProcessingSummary } from '../types';

const ANALYSIS_ORDER = ['task', 'reminder', 'note', 'event'] as const;

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

function isErrorOrFallbackResponse(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return (
    normalized.includes("i'm sorry") ||
    normalized.includes("i didn't understand") ||
    normalized.includes("couldn't interpret") ||
    normalized.includes("could you rephrase") ||
    normalized.includes("please rephrase") ||
    normalized.length === 0
  );
}

function isValidTemplateResponse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isErrorOrFallbackResponse(trimmed)) {
    return false;
  }
  
  const templatePatterns = [
    /^Create a task:/i,
    /^Edit a task:/i,
    /^Delete a task:/i,
    /^Complete a task:/i,
    /^Move a task:/i,
    /^Share a task:/i,
    /^Create a task folder:/i,
    /^Edit a task folder:/i,
    /^Delete a task folder:/i,
    /^Share a task folder:/i,
    /^Create a task sub-folder:/i,
    /^Create a reminder:/i,
    /^Update a reminder:/i,
    /^Delete a reminder:/i,
    /^Pause a reminder:/i,
    /^Resume a reminder:/i,
    /^Create a note:/i,
    /^Update a note:/i,
    /^Delete a note:/i,
    /^Move a note:/i,
    /^Share a note:/i,
    /^Create a note folder:/i,
    /^Create a note sub-folder:/i,
    /^Edit a note folder:/i,
    /^Delete a note folder:/i,
    /^Share a note folder:/i,
  ];
  
  return templatePatterns.some(pattern => pattern.test(trimmed));
}

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
        messageText,
      },
      'Failed to send AI response for WhatsApp text'
    );
    
    try {
      const whatsappService = new WhatsAppService();
      await whatsappService.sendTextMessage(
        message.from,
        "I'm sorry, I encountered an error processing your message. Please try again."
      );
    } catch (sendError) {
      logger.error({ error: sendError, senderPhone: message.from }, 'Failed to send error response');
    }
  }
}

async function analyzeAndRespond(text: string, recipient: string, userId: string): Promise<void> {
  const analyzer = new WhatsappTextAnalysisService();
  const whatsappService = new WhatsAppService();
  const validResponses: string[] = [];
  const allResponses: Record<string, string> = {};

  for (const item of INTENT_ANALYZERS) {
    try {
      const result = (await item.handler(analyzer, text)).trim();
      allResponses[item.intent] = result;
      
      if (result && isValidTemplateResponse(result)) {
        validResponses.push(result);
        logger.info(
          {
            intent: item.intent,
            responseLength: result.length,
            userId,
          },
          'Got valid template response from AI'
        );
      } else {
        logger.debug(
          {
            intent: item.intent,
            response: result,
            isError: isErrorOrFallbackResponse(result),
            userId,
          },
          'AI response was empty or fallback'
        );
      }
    } catch (error) {
      logger.error(
        {
          error,
          intent: item.intent,
          userId,
          messageText: text,
        },
        'AI analysis failed for WhatsApp text'
      );
      allResponses[item.intent] = `[ERROR: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }

  if (validResponses.length > 0) {
    const reply = validResponses.join('\n\n');
    await whatsappService.sendTextMessage(recipient, reply);
    const validIntents = Object.keys(allResponses).filter(k => {
      const response = allResponses[k];
      return response && isValidTemplateResponse(response);
    });
    
    logger.info(
      {
        recipient,
        userId,
        responseCount: validResponses.length,
        intents: validIntents,
      },
      'Sent valid AI responses to user'
    );
  } else {
    logger.warn(
      {
        recipient,
        userId,
        allResponses,
        messageText: text,
      },
      'No valid template responses from any AI analyzer'
    );
    
    const fallbackMessage = "I'm sorry, I couldn't interpret that request. Could you rephrase with more detail?";
    await whatsappService.sendTextMessage(recipient, fallbackMessage);
  }
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

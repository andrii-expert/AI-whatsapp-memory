import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, matchesVerificationPhrase } from '@imaginecalendar/whatsapp';
import { WhatsappTextAnalysisService, WhatsappIntentRouterService } from '@imaginecalendar/ai-services';
import type { WebhookProcessingSummary } from '../types';

type AnalysisIntent = 'task' | 'reminder' | 'note' | 'event';

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
  const router = new WhatsappIntentRouterService();
  const analyzer = new WhatsappTextAnalysisService();
  const whatsappService = new WhatsAppService();

  // Step 1: Detect which intent(s) are present in the message
  logger.debug({ textLength: text.length, userId }, 'Detecting intent with router');
  const detectedIntents = await router.detectIntents(text);
  const primaryIntent = router.getPrimaryIntent(detectedIntents);

  logger.info(
    {
      detectedIntents,
      primaryIntent,
      userId,
      messageText: text.substring(0, 100),
    },
    'Intent detection completed'
  );

  // Step 2: Only analyze with the primary intent (priority: task > note > reminder > event)
  if (!primaryIntent) {
    logger.warn(
      {
        recipient,
        userId,
        messageText: text,
        detectedIntents,
      },
      'No intent detected, sending fallback message'
    );
    
    const fallbackMessage = "I'm sorry, I couldn't interpret that request. Could you rephrase with more detail?";
    await whatsappService.sendTextMessage(recipient, fallbackMessage);
    return;
  }

  // Step 3: Analyze only the primary intent
  let response: string;
  try {
    logger.info(
      {
        intent: primaryIntent,
        userId,
        messageText: text.substring(0, 100),
      },
      `Analyzing message with ${primaryIntent} intent only`
    );

    switch (primaryIntent) {
      case 'task':
        response = (await analyzer.analyzeTask(text)).trim();
        break;
      case 'note':
        response = (await analyzer.analyzeNote(text)).trim();
        break;
      case 'reminder':
        response = (await analyzer.analyzeReminder(text)).trim();
        break;
      case 'event':
        response = (await analyzer.analyzeEvent(text)).trim();
        break;
      default:
        throw new Error(`Unknown intent: ${primaryIntent}`);
    }

    logger.debug(
      {
        intent: primaryIntent,
        responseLength: response.length,
        responsePreview: response.substring(0, 200),
        userId,
      },
      'Got response from AI analyzer'
    );

    // Step 4: Validate and send response
    if (response && isValidTemplateResponse(response)) {
      await whatsappService.sendTextMessage(recipient, response);
      logger.info(
        {
          recipient,
          userId,
          intent: primaryIntent,
          responseLength: response.length,
        },
        'Sent valid AI response to user'
      );
    } else {
      logger.warn(
        {
          recipient,
          userId,
          intent: primaryIntent,
          response,
          isError: isErrorOrFallbackResponse(response),
        },
        'AI response was invalid or fallback'
      );
      
      const fallbackMessage = "I'm sorry, I couldn't interpret that request. Could you rephrase with more detail?";
      await whatsappService.sendTextMessage(recipient, fallbackMessage);
    }
  } catch (error) {
    logger.error(
      {
        error,
        intent: primaryIntent,
        userId,
        messageText: text,
      },
      'AI analysis failed for WhatsApp text'
    );
    
    try {
      await whatsappService.sendTextMessage(
        recipient,
        "I'm sorry, I encountered an error processing your message. Please try again."
      );
    } catch (sendError) {
      logger.error({ error: sendError, senderPhone: recipient }, 'Failed to send error response');
    }
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

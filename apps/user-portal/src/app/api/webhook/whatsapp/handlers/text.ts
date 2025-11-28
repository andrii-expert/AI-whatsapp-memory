import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage, logOutgoingWhatsAppMessage, getRecentMessageHistory } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, matchesVerificationPhrase } from '@imaginecalendar/whatsapp';
import { WhatsappTextAnalysisService } from '@imaginecalendar/ai-services';
import type { WebhookProcessingSummary } from '../types';
import { ActionExecutor } from './action-executor';

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
      messageContent: messageText, // Store message content for history
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
    await analyzeAndRespond(messageText, message.from, whatsappNumber.userId, db);
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

async function analyzeAndRespond(
  text: string,
  recipient: string,
  userId: string,
  db: Database
): Promise<void> {
  const analyzer = new WhatsappTextAnalysisService();
  const whatsappService = new WhatsAppService();

  // Get last 10 message history for context
  let messageHistory: Array<{ direction: 'incoming' | 'outgoing'; content: string }> = [];
  try {
    const history = await getRecentMessageHistory(db, userId, 10);
    messageHistory = history
      .filter(msg => msg.content && msg.content.trim().length > 0)
      .slice(0, 10) // Ensure we only use last 10
      .map(msg => ({
        direction: msg.direction,
        content: msg.content,
      }));
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to retrieve message history, continuing without history');
  }

  // Step 1: Analyze message with merged prompt
  let aiResponse: string;
  try {
    logger.info(
      {
        userId,
        messageText: text.substring(0, 100),
        historyCount: messageHistory.length,
      },
      'Analyzing message with merged prompt'
    );

    aiResponse = (await analyzer.analyzeMessage(text, { messageHistory })).trim();

    logger.debug(
      {
        responseLength: aiResponse.length,
        responsePreview: aiResponse.substring(0, 200),
        userId,
      },
      'Got response from AI analyzer'
    );

    // Step 2: Send AI response to user immediately
    const responseToUser = extractUserFriendlyResponse(aiResponse);
    await whatsappService.sendTextMessage(recipient, responseToUser);
    
    // Store outgoing message in history (free message since it's a response to incoming)
    try {
      const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
      if (whatsappNumber) {
        await logOutgoingWhatsAppMessage(db, {
          whatsappNumberId: whatsappNumber.id,
          userId,
          messageType: 'text',
          messageContent: responseToUser,
          isFreeMessage: true, // Response to incoming message, within 24-hour window
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to log outgoing message');
    }

    // Step 3: Process the AI response in main workflow
    await processAIResponse(aiResponse, recipient, userId, db, whatsappService);

  } catch (error) {
    logger.error(
      {
        error,
        userId,
        messageText: text,
      },
      'AI analysis failed'
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

/**
 * Extract user-friendly response from AI response (removes Title: prefix for user display)
 */
function extractUserFriendlyResponse(aiResponse: string): string {
  const lines = aiResponse.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // If response starts with "Title:", remove it and return the rest
  if (lines[0]?.startsWith('Title:')) {
    return lines.slice(1).join('\n') || lines[0]; // If only title, return it
  }
  
  return aiResponse;
}

/**
 * Process AI response in main workflow - parse Title and route to appropriate executor
 */
async function processAIResponse(
  aiResponse: string,
  recipient: string,
  userId: string,
  db: Database,
  whatsappService: WhatsAppService
): Promise<void> {
  try {
    // Parse the Title from response
    const titleMatch = aiResponse.match(/^Title:\s*(task|note|reminder|event|verification)/i);
    if (!titleMatch || !titleMatch[1]) {
      logger.warn(
        {
          userId,
          responsePreview: aiResponse.substring(0, 200),
        },
        'AI response missing Title, skipping workflow processing'
      );
      return;
    }

    const titleType = titleMatch[1].toLowerCase();
    
    // Extract the action template (everything after Title line)
    const actionLines = aiResponse
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('Title:'));
    
    const actionTemplate = actionLines.join('\n');

    logger.info(
      {
        titleType,
        actionTemplate: actionTemplate.substring(0, 200),
        userId,
      },
      'Processing AI response in main workflow'
    );

    // Route to appropriate executor based on Title
    const executor = new ActionExecutor(db, userId, whatsappService, recipient);
    
    if (titleType === 'task') {
      const parsed = executor.parseAction(actionTemplate);
      if (parsed) {
        const result = await executor.executeAction(parsed);
        // Send success/error message to user
        await whatsappService.sendTextMessage(recipient, result.message);
        
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: result.message,
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing message');
        }
      } else {
        // Already sent AI response, no need to send again
        logger.info({ userId, titleType }, 'Action parsing failed, user already received AI response');
      }
    } else if (titleType === 'note') {
      // TODO: Implement note executor
      logger.info({ userId, titleType }, 'Note executor not yet implemented');
    } else if (titleType === 'reminder') {
      // TODO: Implement reminder executor
      logger.info({ userId, titleType }, 'Reminder executor not yet implemented');
    } else if (titleType === 'event') {
      // TODO: Implement event executor
      logger.info({ userId, titleType }, 'Event executor not yet implemented');
    } else if (titleType === 'verification') {
      // Verification is handled separately, no need to process here
      logger.info({ userId }, 'Verification handled separately');
    }
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        responsePreview: aiResponse.substring(0, 200),
      },
      'Failed to process AI response in main workflow'
    );
    
    // Send error message to user
    try {
      await whatsappService.sendTextMessage(
        recipient,
        "I encountered an error while processing your request. Please try again."
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

import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage, logOutgoingWhatsAppMessage, getRecentMessageHistory } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, matchesVerificationPhrase } from '@imaginecalendar/whatsapp';
import { WhatsappTextAnalysisService, IntentAnalysisService } from '@imaginecalendar/ai-services';
import type { WebhookProcessingSummary } from '../types';
import { CalendarService } from './calendar-service';
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
    /^List tasks:/i,
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
    /^List reminders:/i,
    /^Create a note:/i,
    /^Update a note:/i,
    /^Delete a note:/i,
    /^Move a note:/i,
    /^Share a note:/i,
    /^List notes:/i,
    /^Create a note folder:/i,
    /^Create a note sub-folder:/i,
    /^Edit a note folder:/i,
    /^Delete a note folder:/i,
    /^Share a note folder:/i,
    /^Create an event:/i,
    /^Update an event:/i,
    /^Delete an event:/i,
    /^List events:/i,
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

    // Process the AI response in main workflow (workflow will send appropriate response to user)
    await processAIResponse(aiResponse, recipient, userId, db, whatsappService, text);

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
  whatsappService: WhatsAppService,
  originalUserText?: string
): Promise<void> {
  try {
    // Parse the Title from response
    const titleMatch = aiResponse.match(/^Title:\s*(task|note|reminder|event|verification|normal)/i);
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

    // Handle Normal conversation - send directly to user without workflow processing
    if (titleType === 'normal') {
      // For Normal conversations, the actionTemplate is the natural response
      // Send it to the user
      await whatsappService.sendTextMessage(recipient, actionTemplate);
      
      // Log outgoing message
      try {
        const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
        if (whatsappNumber) {
          await logOutgoingWhatsAppMessage(db, {
            whatsappNumberId: whatsappNumber.id,
            userId,
            messageType: 'text',
            messageContent: actionTemplate,
            isFreeMessage: true,
          });
        }
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to log outgoing message');
      }
      
      logger.info(
        {
          userId,
          responsePreview: actionTemplate.substring(0, 200),
        },
        'Normal conversation response sent to user'
      );
      return;
    }

    // Route to appropriate executor based on Title
    const executor = new ActionExecutor(db, userId, whatsappService, recipient);
    
    // Check if this is a list operation (works for all types)
    const isListOperation = actionTemplate.toLowerCase().startsWith('list ');
    
    if (titleType === 'task' || (isListOperation && (titleType === 'note' || titleType === 'reminder' || titleType === 'event'))) {
      // For tasks, always try to parse and execute
      // For notes/reminders/events, only handle list operations for now
      const parsed = executor.parseAction(actionTemplate);
      if (parsed) {
        // Set resourceType based on titleType for list operations
        if (isListOperation && titleType !== 'task') {
          parsed.resourceType = titleType as 'note' | 'reminder' | 'event';
        }
        
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
    } else if (titleType === 'event') {
      // Handle event operations (create, update, delete, list)
      const isListOperation = actionTemplate.toLowerCase().startsWith('list events:');
      
      if (isListOperation) {
        // List events - handled by ActionExecutor
        const executor = new ActionExecutor(db, userId, whatsappService, recipient);
        const parsed = executor.parseAction(actionTemplate);
        if (parsed) {
          parsed.resourceType = 'event';
          const result = await executor.executeAction(parsed);
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
        }
      } else if (originalUserText) {
        // Create, Update, or Delete event - use calendar intent analysis
        await handleEventOperation(originalUserText, actionTemplate, recipient, userId, db, whatsappService);
      } else {
        logger.warn({ userId, actionTemplate: actionTemplate.substring(0, 100) }, 'Event operation but no original user text available');
        await whatsappService.sendTextMessage(
          recipient,
          "I'm sorry, I encountered an error processing your event request. Please try again."
        );
      }
    } else if (titleType === 'note' || titleType === 'reminder') {
      // For non-list operations on notes/reminders, log as TODO
      logger.info({ userId, titleType, actionTemplate: actionTemplate.substring(0, 100) }, `${titleType} executor not yet implemented for this operation`);
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

/**
 * Handle event operations (create, update, delete) by analyzing the original user text
 * and routing to calendar service
 */
async function handleEventOperation(
  originalUserText: string,
  actionTemplate: string,
  recipient: string,
  userId: string,
  db: Database,
  whatsappService: WhatsAppService
): Promise<void> {
  try {
    logger.info(
      {
        userId,
        originalText: originalUserText.substring(0, 100),
        actionTemplate: actionTemplate.substring(0, 100),
      },
      'Handling event operation from text message'
    );

    // Determine operation type from action template
    const isCreate = actionTemplate.toLowerCase().startsWith('create an event:');
    const isUpdate = actionTemplate.toLowerCase().startsWith('update an event:');
    const isDelete = actionTemplate.toLowerCase().startsWith('delete an event:');

    if (!isCreate && !isUpdate && !isDelete) {
      logger.warn({ userId, actionTemplate }, 'Unknown event operation type');
      await whatsappService.sendTextMessage(
        recipient,
        "I'm sorry, I couldn't understand what event operation you want to perform. Please try again."
      );
      return;
    }

    // Analyze the original user text to extract calendar intent
    const intentService = new IntentAnalysisService();
    const intent = await intentService.analyzeCalendarIntent(originalUserText, {
      userId,
      currentDate: new Date(),
    });

    logger.info(
      {
        userId,
        action: intent.action,
        confidence: intent.confidence,
        hasTitle: !!intent.title,
        hasStartDate: !!intent.startDate,
      },
      'Calendar intent analyzed from text'
    );

    // Validate required fields
    if (intent.action === 'CREATE' && (!intent.title || !intent.startDate)) {
      const missing = [];
      if (!intent.title) missing.push('title');
      if (!intent.startDate) missing.push('date');
      
      await whatsappService.sendTextMessage(
        recipient,
        `I need more information to create this event. Please provide: ${missing.join(', ')}.`
      );
      
      // Log outgoing message
      try {
        const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
        if (whatsappNumber) {
          await logOutgoingWhatsAppMessage(db, {
            whatsappNumberId: whatsappNumber.id,
            userId,
            messageType: 'text',
            messageContent: `I need more information to create this event. Please provide: ${missing.join(', ')}.`,
            isFreeMessage: true,
          });
        }
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to log outgoing message');
      }
      return;
    }

    // Execute the calendar operation
    const calendarService = new CalendarService(db);
    const result = await calendarService.execute(userId, intent);

    // Send response to user
    let responseMessage: string;
    if (result.success) {
      if (result.action === 'CREATE' && result.event) {
        const eventTime = result.event.start.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const eventDate = result.event.start.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        responseMessage = `✅ Event "${result.event.title}" created successfully!\n📅 ${eventDate} at ${eventTime}`;
        if (result.event.location) {
          responseMessage += `\n📍 ${result.event.location}`;
        }
      } else if (result.action === 'UPDATE' && result.event) {
        responseMessage = `✅ Event "${result.event.title}" updated successfully!`;
      } else if (result.action === 'DELETE' && result.event) {
        responseMessage = `✅ Event "${result.event.title}" deleted successfully!`;
      } else if (result.action === 'QUERY' && result.events) {
        if (result.events.length === 0) {
          responseMessage = "📅 You have no events scheduled.";
        } else {
          responseMessage = `📅 You have ${result.events.length} event${result.events.length !== 1 ? 's' : ''}:\n\n`;
          result.events.slice(0, 10).forEach((event: { title: string; start: Date }, index: number) => {
            const eventTime = event.start.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });
            const eventDate = event.start.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            responseMessage += `${index + 1}. ${event.title}\n   ${eventDate} at ${eventTime}\n`;
          });
          if (result.events.length > 10) {
            responseMessage += `\n... and ${result.events.length - 10} more events.`;
          }
        }
      } else {
        responseMessage = result.message || 'Operation completed successfully!';
      }
    } else {
      responseMessage = result.message || "I'm sorry, I couldn't complete that operation. Please try again.";
    }

    await whatsappService.sendTextMessage(recipient, responseMessage);

    // Log outgoing message
    try {
      const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
      if (whatsappNumber) {
        await logOutgoingWhatsAppMessage(db, {
          whatsappNumberId: whatsappNumber.id,
          userId,
          messageType: 'text',
          messageContent: responseMessage,
          isFreeMessage: true,
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to log outgoing message');
    }

    logger.info({ userId, action: result.action, success: result.success }, 'Event operation completed');
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        userId,
        originalText: originalUserText.substring(0, 100),
      },
      'Failed to handle event operation'
    );

    try {
      await whatsappService.sendTextMessage(
        recipient,
        "I'm sorry, I encountered an error processing your event request. Please try again."
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

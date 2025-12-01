import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage, logOutgoingWhatsAppMessage, getRecentMessageHistory } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, matchesVerificationPhrase } from '@imaginecalendar/whatsapp';
import { WhatsappTextAnalysisService, IntentAnalysisService, type CalendarIntent, calendarIntentSchema } from '@imaginecalendar/ai-services';
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
      // Log AI response for debugging
      logger.info(
        {
          userId,
          titleType,
          actionTemplate: actionTemplate.substring(0, 200),
          fullAIResponse: aiResponse.substring(0, 500),
        },
        'Processing event operation - AI response logged'
      );

      // Send AI response to user for debugging (as requested)
      try {
        await whatsappService.sendTextMessage(
          recipient,
          `🤖 AI Response:\n${aiResponse.substring(0, 500)}`
        );
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: `🤖 AI Response:\n${aiResponse.substring(0, 500)}`,
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing message');
        }
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to send AI response to user');
      }

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
        originalText: originalUserText,
        actionTemplate: actionTemplate,
      },
      'Handling event operation from text message'
    );

    // Determine operation type from action template
    const isCreate = actionTemplate.toLowerCase().startsWith('create an event:');
    const isUpdate = actionTemplate.toLowerCase().startsWith('update an event:');
    const isDelete = actionTemplate.toLowerCase().startsWith('delete an event:');

    logger.info(
      {
        userId,
        isCreate,
        isUpdate,
        isDelete,
        actionTemplate: actionTemplate.substring(0, 200),
      },
      'Event operation type detection'
    );

    if (!isCreate && !isUpdate && !isDelete) {
      logger.warn({ userId, actionTemplate }, 'Unknown event operation type');
      await whatsappService.sendTextMessage(
        recipient,
        `I'm sorry, I couldn't understand what event operation you want to perform.\n\nAction template: ${actionTemplate.substring(0, 200)}\n\nPlease try again.`
      );
      return;
    }

    // Parse the action template to extract calendar intent
    logger.info({ userId, actionTemplate }, 'Parsing event template to calendar intent');
    
    let intent;
    try {
      intent = parseEventTemplateToIntent(actionTemplate, isCreate, isUpdate, isDelete);
      
      logger.info(
        {
          userId,
          action: intent.action,
          hasTitle: !!intent.title,
          title: intent.title,
          hasStartDate: !!intent.startDate,
          startDate: intent.startDate,
          startTime: intent.startTime,
          location: intent.location,
          attendees: intent.attendees,
          fullIntent: JSON.stringify(intent, null, 2),
        },
        'Calendar intent parsed from template'
      );
    } catch (parseError) {
      logger.error(
        {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          errorStack: parseError instanceof Error ? parseError.stack : undefined,
          userId,
          actionTemplate,
        },
        'Failed to parse event template'
      );
      throw new Error(`Template parsing failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

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
    logger.info({ userId, intentAction: intent.action }, 'Executing calendar operation');
    
    let result;
    try {
      const calendarService = new CalendarService(db);
      result = await calendarService.execute(userId, intent);
      logger.info({ userId, success: result.success, action: result.action }, 'Calendar operation executed');
    } catch (calendarError) {
      logger.error(
        {
          error: calendarError instanceof Error ? calendarError.message : String(calendarError),
          errorStack: calendarError instanceof Error ? calendarError.stack : undefined,
          userId,
          intentAction: intent.action,
          intentTitle: intent.title,
        },
        'Failed to execute calendar operation'
      );
      throw new Error(`Calendar operation failed: ${calendarError instanceof Error ? calendarError.message : String(calendarError)}`);
    }

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error(
      {
        error: errorMessage,
        errorStack,
        errorName: error instanceof Error ? error.name : undefined,
        userId,
        originalText: originalUserText,
        actionTemplate: actionTemplate,
      },
      'Failed to handle event operation'
    );

    try {
      // Send detailed error message to user for debugging
      const errorResponse = `❌ Error processing event request:\n\n${errorMessage}\n\nPlease check the logs for more details or try again.`;
      await whatsappService.sendTextMessage(recipient, errorResponse);
      
      // Log outgoing error message
      try {
        const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
        if (whatsappNumber) {
          await logOutgoingWhatsAppMessage(db, {
            whatsappNumberId: whatsappNumber.id,
            userId,
            messageType: 'text',
            messageContent: errorResponse,
            isFreeMessage: true,
          });
        }
      } catch (logError) {
        logger.warn({ error: logError, userId }, 'Failed to log outgoing error message');
      }
    } catch (sendError) {
      logger.error({ error: sendError, senderPhone: recipient }, 'Failed to send error response');
    }
  }
}

/**
 * Parse event template string to CalendarIntent
 * Handles formats like:
 * - "Create an event: {title} - date: {date} - time: {time} - calendar: {calendar}"
 * - "Update an event: {title} - changes: {details} - calendar: {calendar}"
 * - "Delete an event: {title} - calendar: {calendar}"
 */
function parseEventTemplateToIntent(
  template: string,
  isCreate: boolean,
  isUpdate: boolean,
  isDelete: boolean
): CalendarIntent {
  // Determine action
  let action: 'CREATE' | 'UPDATE' | 'DELETE' | 'QUERY';
  if (isCreate) {
    action = 'CREATE';
  } else if (isUpdate) {
    action = 'UPDATE';
  } else if (isDelete) {
    action = 'DELETE';
  } else {
    throw new Error('Unknown event operation type');
  }

  const intent: any = {
    action,
    confidence: 0.9, // High confidence since we're parsing a structured template
  };

  if (isCreate) {
    // Parse: "Create an event: {title} - date: {date} - time: {time} - calendar: {calendar}"
    // Can also have: - location: {location} - attendees: {name1, name2}
    
    // Extract title (everything after "Create an event:" until first " - ")
    const titleMatch = template.match(/^Create an event:\s*(.+?)(?:\s*-\s*date:|\s*-\s*time:|\s*-\s*calendar:|\s*-\s*location:|\s*-\s*attendees:|$)/i);
    if (titleMatch && titleMatch[1]) {
      intent.title = titleMatch[1].trim();
    }
    
    // Extract date
    const dateMatch = template.match(/\s*-\s*date:\s*(.+?)(?:\s*-\s*time:|\s*-\s*calendar:|\s*-\s*location:|\s*-\s*attendees:|$)/i);
    if (dateMatch && dateMatch[1]) {
      intent.startDate = parseRelativeDate(dateMatch[1].trim());
    }
    
    // Extract time
    const timeMatch = template.match(/\s*-\s*time:\s*(.+?)(?:\s*-\s*calendar:|\s*-\s*location:|\s*-\s*attendees:|$)/i);
    if (timeMatch && timeMatch[1]) {
      intent.startTime = parseTime(timeMatch[1].trim());
    }
    
    // Extract location
    const locationMatch = template.match(/\s*-\s*location:\s*(.+?)(?:\s*-\s*calendar:|\s*-\s*attendees:|$)/i);
    if (locationMatch && locationMatch[1]) {
      intent.location = locationMatch[1].trim();
    }
    
    // Extract attendees
    const attendeesMatch = template.match(/\s*-\s*attendees:\s*(.+?)(?:\s*-\s*calendar:|$)/i);
    if (attendeesMatch && attendeesMatch[1]) {
      const attendeesStr = attendeesMatch[1].trim();
      intent.attendees = attendeesStr.split(',').map(a => a.trim()).filter(a => a.length > 0);
    }
    
    // Ensure we have at least a title
    if (!intent.title) {
      throw new Error(`Could not extract event title from template: ${template}`);
    }
    
    // If no date provided, default to today
    if (!intent.startDate) {
      intent.startDate = parseRelativeDate('today');
    }
  } else if (isUpdate) {
    // Parse: "Update an event: {title} - changes: {details} - calendar: {calendar}"
    const updateMatch = template.match(/^Update an event:\s*(.+?)(?:\s*-\s*changes:\s*(.+?))?(?:\s*-\s*calendar:\s*(.+?))?$/i);
    
    if (updateMatch && updateMatch[1]) {
      intent.targetEventTitle = updateMatch[1].trim();
      
      if (updateMatch[2]) {
        const changes = updateMatch[2].trim();
        // Try to extract new date/time from changes
        const dateMatch = changes.match(/date\s+to\s+(.+?)(?:\s|$)/i) || changes.match(/(?:on|for)\s+(.+?)(?:\s|$)/i);
        if (dateMatch && dateMatch[1]) {
          intent.startDate = parseRelativeDate(dateMatch[1].trim());
        }
        
        const timeMatch = changes.match(/time\s+to\s+(.+?)(?:\s|$)/i) || changes.match(/(?:at|to)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (timeMatch && timeMatch[1]) {
          intent.startTime = parseTime(timeMatch[1].trim());
        }
        
        // Check if title is being updated
        const titleMatch = changes.match(/title\s+to\s+(.+?)(?:\s|$)/i);
        if (titleMatch && titleMatch[1]) {
          intent.title = titleMatch[1].trim();
        }
      }
    }
  } else if (isDelete) {
    // Parse: "Delete an event: {title} - calendar: {calendar}"
    const deleteMatch = template.match(/^Delete an event:\s*(.+?)(?:\s*-\s*calendar:\s*(.+?))?$/i);
    
    if (deleteMatch && deleteMatch[1]) {
      intent.targetEventTitle = deleteMatch[1].trim();
    }
  }

  // Validate and parse with schema
  return calendarIntentSchema.parse(intent);
}

/**
 * Parse relative date strings to YYYY-MM-DD format
 * Handles: today, tomorrow, day names (Friday, Monday), "next Monday", "15 March", "the 12th", etc.
 */
function parseRelativeDate(dateStr: string): string {
  const lower = dateStr.toLowerCase().trim();
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Handle "today"
  if (lower === 'today') {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Handle "tomorrow"
  if (lower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Handle "next [day]" (e.g., "next Monday", "next Friday")
  const nextMatch = lower.match(/next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (nextMatch && nextMatch[1]) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIndex = dayNames.indexOf(nextMatch[1]);
    if (dayIndex !== -1) {
      const daysUntil = (dayIndex - now.getDay() + 7) % 7 || 7;
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + daysUntil + 7); // Add 7 more days for "next"
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  
  // Handle day names (e.g., "Friday", "Monday") - find next occurrence
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = dayNames.findIndex(d => lower === d || lower.startsWith(d));
  if (dayIndex !== -1 && !lower.includes('next')) {
    const daysUntil = (dayIndex - now.getDay() + 7) % 7 || 7;
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysUntil);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Handle "the [day]th" or "[day]" (e.g., "the 12th", "15", "15th")
  const dayNumberMatch = lower.match(/(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/);
  if (dayNumberMatch && dayNumberMatch[1]) {
    const dayNum = parseInt(dayNumberMatch[1], 10);
    if (dayNum >= 1 && dayNum <= 31) {
      // Try current month first
      const targetDate = new Date(currentYear, now.getMonth(), dayNum);
      if (targetDate.getDate() === dayNum && targetDate >= now) {
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      // If past, try next month
      const nextMonthDate = new Date(currentYear, now.getMonth() + 1, dayNum);
      if (nextMonthDate.getDate() === dayNum) {
        const year = nextMonthDate.getFullYear();
        const month = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
        const day = String(nextMonthDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
  }
  
  // Handle "[day] [Month]" or "[Month] [day]" (e.g., "15 March", "March 15", "15th March")
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                     'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  
  for (let i = 0; i < monthNames.length; i++) {
    const monthName = monthNames[i];
    const monthAb = monthAbbr[i];
    
    // Pattern: "[day] [Month]" or "[Month] [day]"
    const pattern1 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthName}|${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i');
    const pattern2 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthAb}|${monthAb}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i');
    
    const match1 = lower.match(pattern1);
    const match2 = lower.match(pattern2);
    const match = match1 || match2;
    
    if (match) {
      const dayNum = parseInt(match[1] || match[2] || '0', 10);
      if (dayNum >= 1 && dayNum <= 31) {
        const targetDate = new Date(currentYear, i, dayNum);
        // If date is in the past, try next year
        if (targetDate < now) {
          targetDate.setFullYear(currentYear + 1);
        }
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
  }
  
  // Try to parse as date string (YYYY-MM-DD or other formats)
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Default to today if can't parse
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse time strings to HH:MM format (24-hour)
 * Handles: "2pm", "14:00", "morning", "afternoon", "noon", "midnight", etc.
 */
function parseTime(timeStr: string): string {
  const trimmed = timeStr.trim().toLowerCase();
  
  // Handle time-of-day descriptions
  if (trimmed === 'morning' || trimmed.includes('morning')) {
    return '09:00'; // Default morning time
  }
  if (trimmed === 'afternoon' || trimmed.includes('afternoon')) {
    return '14:00'; // Default afternoon time
  }
  if (trimmed === 'evening' || trimmed.includes('evening')) {
    return '18:00'; // Default evening time
  }
  if (trimmed === 'noon' || trimmed === 'midday') {
    return '12:00';
  }
  if (trimmed === 'midnight') {
    return '00:00';
  }
  
  // Already in HH:MM format
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  // Parse 12-hour format (2pm, 2:30pm, 2 PM, 2:30 PM, etc.)
  const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (match) {
    let hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const period = (match[3] || '').toLowerCase();
    
    if (period === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period === 'am' && hours === 12) {
      hours = 0;
    }
    
    // Validate hours and minutes
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }
  
  // Try to parse as HH:MM directly (24-hour format)
  const directMatch = trimmed.match(/(\d{1,2}):(\d{2})/);
  if (directMatch) {
    const hours = parseInt(directMatch[1] || '0', 10);
    const minutes = parseInt(directMatch[2] || '0', 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }
  
  // Try to parse just a number (e.g., "10" = 10:00, "14" = 14:00)
  const numberMatch = trimmed.match(/^(\d{1,2})$/);
  if (numberMatch && numberMatch[1]) {
    const hours = parseInt(numberMatch[1], 10);
    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:00`;
    }
  }
  
  // Default to current time if can't parse
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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

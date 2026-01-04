import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage, logOutgoingWhatsAppMessage, getRecentMessageHistory, getPrimaryCalendar, getWhatsAppCalendars, getUserAddresses, getUserFriends } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, matchesVerificationPhrase } from '@imaginecalendar/whatsapp';
import { WhatsappTextAnalysisService, IntentAnalysisService, type CalendarIntent, calendarIntentSchema } from '@imaginecalendar/ai-services';
import type { WebhookProcessingSummary } from '../types';
import { CalendarService } from './calendar-service';
import { ActionExecutor, type ParsedAction } from './action-executor';

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
    /^Share a shopping list folder:/i,
    /^Create a task sub-folder:/i,
    /^Create a shopping list category:/i,
    /^Create a reminder:/i,
    /^Update a reminder:/i,
    /^Delete a reminder:/i,
    /^Create a friend:/i,
    /^Update a friend:/i,
    /^Delete a friend:/i,
    /^List friends:/i,
    /^Create a friend folder:/i,
    /^Edit a friend folder:/i,
    /^Delete a friend folder:/i,
    /^List friend folders:/i,
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
    /^Create a file:/i,
    /^Edit a file:/i,
    /^Delete a file:/i,
    /^View a file:/i,
    /^Move a file:/i,
    /^Share a file:/i,
    /^List files:/i,
    /^Create a file folder:/i,
    /^Edit a file folder:/i,
    /^Delete a file folder:/i,
    /^Share a file folder:/i,
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

  // Get user's calendar timezone for accurate date/time context (used for AI analysis and list operations)
  let userTimezone = 'Africa/Johannesburg'; // Default fallback
  try {
    const calendarConnection = await getPrimaryCalendar(db, userId);
    if (calendarConnection) {
      const calendarService = new CalendarService(db);
      // Access the private getUserTimezone method using bracket notation
      // This method will fetch timezone from calendar, fallback to user preferences, then default
      userTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
    }
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to get user timezone, using default');
  }

  // Step 1: Analyze message with merged prompt
  let aiResponse: string;
  try {
      
      const currentDate = new Date();
      
      logger.info(
        {
          userId,
          messageText: text.substring(0, 100),
          historyCount: messageHistory.length,
          currentDate: currentDate.toISOString(),
          timezone: userTimezone,
        },
        'Analyzing message with merged prompt'
      );

      aiResponse = (await analyzer.analyzeMessage(text, { 
        messageHistory,
        currentDate,
        timezone: userTimezone,
      })).trim();

    logger.debug(
      {
        responseLength: aiResponse.length,
        responsePreview: aiResponse.substring(0, 200),
        userId,
      },
      'Got response from AI analyzer'
    );

    // Process the AI response in main workflow (workflow will send appropriate response to user)
    await processAIResponse(aiResponse, recipient, userId, db, whatsappService, text, userTimezone);

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
  originalUserText?: string,
  userTimezone?: string
): Promise<void> {
  try {
    // Parse the Title from response
    const titleMatch = aiResponse.match(/^Title:\s*(shopping|task|note|reminder|event|document|address|friend|verification|normal)/i);
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
    
    // Special handling: If AI response is empty or doesn't contain expected action format,
    // but originalUserText is a simple "delete X,Y" command and titleType is shopping,
    // handle it directly
    if (titleType === 'shopping' && originalUserText && /^delete\s+[\d\s,]+/i.test(originalUserText) && (!actionTemplate || actionTemplate.trim().length === 0 || !actionTemplate.toLowerCase().includes('delete'))) {
      logger.info({ originalUserText, actionTemplate }, 'Detected simple delete command, handling directly');
      const executor = new ActionExecutor(db, userId, whatsappService, recipient);
      const numberMatch = originalUserText.match(/delete\s+(?:shopping\s+items?:\s*)?([\d\s,]+(?:and\s*\d+)?)/i);
      if (numberMatch) {
        const numbersStr = numberMatch[1].trim();
        const numbers = numbersStr
          .split(/[,\s]+|and\s+/i)
          .map(n => parseInt(n.trim(), 10))
          .filter(n => !isNaN(n) && n > 0);
        
        if (numbers.length > 0) {
          const parsed: ParsedAction = {
            action: 'delete',
            resourceType: 'shopping',
            itemNumbers: numbers,
            missingFields: [],
          };
          logger.info({ originalUserText, parsed }, 'Handling shopping item deletion directly from user text');
          const result = await executor.executeAction(parsed, userTimezone);
          if (result.message.trim().length > 0) {
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
            } catch (logError) {
              logger.warn({ error: logError, userId }, 'Failed to log outgoing shopping message');
            }
            await whatsappService.sendTextMessage(recipient, result.message);
          }
          return;
        }
      }
    }

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
    const isListEvents = actionTemplate.toLowerCase().startsWith('list events:');
    
    // For events, check if "List events: [name/number]" is actually a view/show request
    // This must be checked BEFORE handling as a list operation
    if (titleType === 'event' && isListEvents) {
      const listEventsMatch = actionTemplate.match(/^List events:\s*(.+?)(?:\s*-\s*calendar:.*)?$/i);
      const hasEventNameInList = listEventsMatch && listEventsMatch[1] && listEventsMatch[1].trim().length > 0;
      const listEventValue = listEventsMatch && listEventsMatch[1] ? listEventsMatch[1].trim() : '';
      
      // Timeframe keywords that should NOT be converted to view/show (these are list operations)
      // Check for exact matches or if the value starts with a timeframe keyword
      const timeframeKeywords = ['today', 'tomorrow', 'this week', 'this month', 'next week', 'next month', 'all', 'upcoming'];
      const lowerValue = listEventValue.toLowerCase().trim();
      const isTimeframe = timeframeKeywords.some(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        // Exact match
        if (lowerValue === lowerKeyword) return true;
        // Starts with keyword followed by space (e.g., "this week" matches "this week events")
        if (lowerValue.startsWith(lowerKeyword + ' ')) return true;
        // For single words like "week" or "month", check if they're standalone or part of "this week"/"next month"
        if ((lowerKeyword === 'week' || lowerKeyword === 'month') && 
            (lowerValue === lowerKeyword || lowerValue.includes('this ' + lowerKeyword) || lowerValue.includes('next ' + lowerKeyword))) {
          return true;
        }
        return false;
      });
      
      // Check if user wants to view a specific event (not list all events)
      // Only convert if:
      // 1. It's NOT a timeframe keyword
      // 2. User explicitly says "show me [number]" or "show me event [name]" or "show me [name] event"
      const userTextLower = originalUserText?.toLowerCase() || '';
      const hasEventKeyword = userTextLower.includes('event');
      // Check for timeframe keywords as whole words (not substrings)
      const hasTimeframeInUserText = timeframeKeywords.some(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        // Check for whole word matches using word boundaries
        const regex = new RegExp(`\\b${lowerKeyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
        return regex.test(userTextLower);
      });
      
      const userWantsToView = !isTimeframe && (
        // "show me 2" or "send info on 3" - number only
        (userTextLower.match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) && /^\d+$/.test(listEventValue)) ||
        // "send info on [number]" - explicit pattern
        userTextLower.match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)$/i) ||
        // "show me event [name]" or "show me event- [name]" - explicit event keyword with name
        userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?(?:the\s+)?event\s*[-]?\s*["']?([^"']+)/i) ||
        // "show me [name] event" - name followed by event keyword
        userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?["']?([^"']+)\s+event["']?/i) ||
        // "send info on [name]" - send info pattern with name
        userTextLower.match(/(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+["']?([^"']+)/i) ||
        // "show me [specific event name]" - but NOT if user text contains timeframe keywords
        (hasEventKeyword && !hasTimeframeInUserText && userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?(?:the\s+)?event\s*[-]?\s*["']?([^"']+)/i))
      );
      
      // Also check if user text clearly indicates viewing a specific event, even if AI generated wrong action
      // This handles cases where AI generates "List events: today" but user said "show me event [name]"
      let eventNameFromUserText: string | null = null;
      if (originalUserText && hasEventKeyword && !hasTimeframeInUserText) {
        // Try to extract event name from "show me event [name]" or "show me event- [name]"
        const eventNameMatch1 = originalUserText.match(/(?:show|view|get|see)\s+(?:me\s+)?(?:the\s+)?event\s*[-]?\s*["']?([^"']+)/i);
        if (eventNameMatch1 && eventNameMatch1[1]) {
          eventNameFromUserText = eventNameMatch1[1].trim();
        } else {
          // Try "show me [name] event"
          const eventNameMatch2 = originalUserText.match(/(?:show|view|get|see)\s+(?:me\s+)?["']?([^"']+)\s+event["']?/i);
          if (eventNameMatch2 && eventNameMatch2[1]) {
            eventNameFromUserText = eventNameMatch2[1].trim();
          }
        }
      }
      
      const isListEventsWithName = (hasEventNameInList && userWantsToView && !isTimeframe) || (eventNameFromUserText !== null);
      
      if (isListEventsWithName) {
        // Convert to show event details operation
        let eventActionTemplate = actionTemplate;
        
        // Prefer event name from user text if available (more accurate than AI's interpretation)
        if (eventNameFromUserText) {
          eventActionTemplate = `Show event details: ${eventNameFromUserText}`;
        } else {
          const eventNameMatch = actionTemplate.match(/^List events:\s*(.+?)(?:\s*-\s*calendar:.*)?$/i);
          if (eventNameMatch && eventNameMatch[1]) {
            eventActionTemplate = `Show event details: ${eventNameMatch[1].trim()}`;
          } else if (originalUserText) {
            // Extract event name from original text
            const originalMatch = originalUserText.match(/(?:show|view|get|see)\s+(?:me\s+)?(?:the\s+)?(?:event|details?|overview)\s+(?:of\s+)?["']?([^"']+)["']?/i) ||
                               originalUserText.match(/(?:show|view|get|see)\s+(?:me\s+)?["']?([^"']+)\s+event["']?/i);
            if (originalMatch && originalMatch[1]) {
              eventActionTemplate = `Show event details: ${originalMatch[1].trim()}`;
            } else {
              eventActionTemplate = `Show event details: ${originalUserText}`;
            }
          }
        }
        
        logger.info(
          {
            userId,
            titleType,
            originalActionTemplate: actionTemplate.substring(0, 200),
            eventActionTemplate: eventActionTemplate.substring(0, 200),
          },
          'Converting List events to Show event details'
        );
        
        const parsed = executor.parseAction(eventActionTemplate);
        if (parsed) {
          parsed.resourceType = 'event';
          
          // Get timezone for event operations
          let eventTimezone = userTimezone || 'Africa/Johannesburg';
          try {
            const calendarConnection = await getPrimaryCalendar(db, userId);
            if (calendarConnection) {
              const calendarService = new CalendarService(db);
              eventTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
            }
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to get timezone for event operation, using default');
          }
          
          const result = await executor.executeAction(parsed, eventTimezone);
          
          if (result.message.trim().length > 0) {
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
        } else {
          logger.warn({ userId, actionTemplate, eventActionTemplate }, 'Failed to parse converted show event action');
          await whatsappService.sendTextMessage(
            recipient,
            `I'm sorry, I couldn't understand what event you want to view. Please try again.`
          );
        }
        return; // Exit early after handling view/show event operation
      }
    }
    
    // Handle list operations for all types (tasks, notes, reminders, events, documents, addresses)
    if (isListOperation && (titleType === 'shopping' || titleType === 'task' || titleType === 'note' || titleType === 'reminder' || titleType === 'event' || titleType === 'document' || titleType === 'address' || titleType === 'friend')) {
      try {
        logger.info(
          {
            userId,
            titleType,
            actionTemplate: actionTemplate.substring(0, 200),
            isListEvents,
          },
          'Processing list operation'
        );
        
        const parsed = executor.parseAction(actionTemplate);
        if (parsed) {
          // Set resourceType based on titleType for list operations
          // BUT preserve resourceType if it's already set to 'folder' (for folder listing operations)
          if (parsed.action !== 'list_folders' && parsed.resourceType !== 'folder') {
            parsed.resourceType = titleType as 'shopping' | 'task' | 'note' | 'reminder' | 'event' | 'document' | 'address';
          }
          
          logger.info(
            {
              userId,
              resourceType: parsed.resourceType,
              action: parsed.action,
              listFilter: parsed.listFilter,
            },
            'Parsed list operation, executing'
          );
          
          // Send AI response to user (for debugging/transparency)
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
              logger.warn({ error, userId }, 'Failed to log outgoing AI response message');
            }
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to send AI response to user');
          }
          
          // Get timezone for list operations (needed for reminder filtering)
          let listTimezone = userTimezone || 'Africa/Johannesburg';
          if (parsed.resourceType === 'reminder' || parsed.resourceType === 'event') {
            if (!userTimezone) {
              try {
                const calendarConnection = await getPrimaryCalendar(db, userId);
                if (calendarConnection) {
                  const calendarService = new CalendarService(db);
                  listTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
                }
              } catch (error) {
                logger.warn({ error, userId }, 'Failed to get timezone for list operation, using default');
              }
            } else {
              listTimezone = userTimezone;
            }
          }
          
          const result = await executor.executeAction(parsed, listTimezone);
          
          logger.info(
            {
              userId,
              success: result.success,
              messageLength: result.message.length,
            },
            'List operation executed, sending response'
          );
          
          // Send success/error message to user (skip if empty, e.g., when button was already sent)
          if (result.message.trim().length > 0) {
            await whatsappService.sendTextMessage(recipient, result.message);
          }
          
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
          logger.warn({ userId, titleType, actionTemplate: actionTemplate.substring(0, 200) }, 'Failed to parse list operation');
          await whatsappService.sendTextMessage(
            recipient,
            "I'm sorry, I couldn't understand your request. Please try asking again, for example: 'Show me my schedule' or 'What's on my calendar today?'"
          );
        }
      } catch (listError) {
        const errorMessage = listError instanceof Error ? listError.message : String(listError);
        const errorStack = listError instanceof Error ? listError.stack : undefined;
        
        logger.error(
          {
            error: errorMessage,
            errorStack,
            userId,
            titleType,
            actionTemplate: actionTemplate.substring(0, 200),
          },
          'Failed to process list operation'
        );
        
        // Provide more specific error messages based on error type
        let userMessage: string;
        if (errorMessage.includes('No calendar connected') || errorMessage.includes('calendar connection')) {
          userMessage = "I couldn't find a connected calendar. Please connect your calendar in settings first.";
        } else if (errorMessage.includes('authentication') || errorMessage.includes('expired') || errorMessage.includes('token')) {
          userMessage = "Your calendar authentication has expired. Please reconnect your calendar in settings.";
        } else if (errorMessage.includes('inactive')) {
          userMessage = "Your calendar connection is inactive. Please reconnect your calendar in settings.";
        } else {
          // For other errors, use the error message from the executor if available
          // Otherwise use a generic message
          userMessage = errorMessage && errorMessage.length < 200 
            ? errorMessage 
            : "I encountered an error processing your request. Please try again or reconnect your calendar.";
        }
        
        await whatsappService.sendTextMessage(recipient, userMessage);
      }
      return; // Exit early after handling list operation
    }
    
    // Handle non-list shopping operations
    if (titleType === 'shopping') {
      // Split action template into individual lines for multi-item support
      const actionLines = actionTemplate.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // If actionTemplate is empty or doesn't match expected format, check if it's a simple "delete X,Y" command
      if (actionLines.length === 0 || (!actionTemplate.toLowerCase().includes('delete') && !actionTemplate.toLowerCase().includes('create') && !actionTemplate.toLowerCase().includes('edit') && !actionTemplate.toLowerCase().includes('complete'))) {
        // Check if the original user message was a simple delete command
        if (originalUserText && /^delete\s+[\d\s,]+/i.test(originalUserText)) {
          const numberMatch = originalUserText.match(/delete\s+(?:shopping\s+items?:\s*)?([\d\s,]+(?:and\s*\d+)?)/i);
          if (numberMatch) {
            const numbersStr = numberMatch[1].trim();
            const numbers = numbersStr
              .split(/[,\s]+|and\s+/i)
              .map(n => parseInt(n.trim(), 10))
              .filter(n => !isNaN(n) && n > 0);
            
            if (numbers.length > 0) {
              const parsed: ParsedAction = {
                action: 'delete',
                resourceType: 'shopping',
                itemNumbers: numbers,
                missingFields: [],
              };
              logger.info({ originalUserText, parsed }, 'Fallback: Created shopping item deletion from original user text');
              const result = await executor.executeAction(parsed, userTimezone);
              if (result.message.trim().length > 0) {
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
                } catch (logError) {
                  logger.warn({ error: logError, userId }, 'Failed to log outgoing shopping message');
                }
                await whatsappService.sendTextMessage(recipient, result.message);
              }
              return;
            }
          }
        }
      }
      
      const results: string[] = [];
      let successCount = 0;
      let failCount = 0;
      
      for (const actionLine of actionLines) {
        let parsed = executor.parseAction(actionLine);
        
        // If parsing failed but we have a shopping context, try to handle "delete X,Y" format
        // Check both the actionLine and originalUserText
        if (!parsed && titleType === 'shopping') {
          // First try actionLine
          if (/^delete\s+[\d\s,]+/i.test(actionLine)) {
            const numberMatch = actionLine.match(/delete\s+(?:shopping\s+items?:\s*)?([\d\s,]+(?:and\s*\d+)?)/i);
            if (numberMatch) {
              const numbersStr = numberMatch[1].trim();
              const numbers = numbersStr
                .split(/[,\s]+|and\s+/i)
                .map(n => parseInt(n.trim(), 10))
                .filter(n => !isNaN(n) && n > 0);
              
              if (numbers.length > 0) {
                parsed = {
                  action: 'delete',
                  resourceType: 'shopping',
                  itemNumbers: numbers,
                  missingFields: [],
                };
                logger.info({ actionLine, parsed }, 'Fallback: Created shopping item deletion from actionLine numbers');
              }
            }
          }
          
          // If still not parsed, try originalUserText as fallback
          if (!parsed && originalUserText && /^delete\s+[\d\s,]+/i.test(originalUserText)) {
            const numberMatch = originalUserText.match(/delete\s+(?:shopping\s+items?:\s*)?([\d\s,]+(?:and\s*\d+)?)/i);
            if (numberMatch) {
              const numbersStr = numberMatch[1].trim();
              const numbers = numbersStr
                .split(/[,\s]+|and\s+/i)
                .map(n => parseInt(n.trim(), 10))
                .filter(n => !isNaN(n) && n > 0);
              
              if (numbers.length > 0) {
                parsed = {
                  action: 'delete',
                  resourceType: 'shopping',
                  itemNumbers: numbers,
                  missingFields: [],
                };
                logger.info({ originalUserText, parsed }, 'Fallback: Created shopping item deletion from originalUserText numbers');
              }
            }
          }
        }
        
        if (parsed) {
          // Ensure resourceType is set to shopping for shopping operations
          if (parsed.action === 'delete' && !parsed.resourceType) {
            parsed.resourceType = 'shopping';
          } else if (parsed.resourceType !== 'shopping' && titleType === 'shopping') {
            parsed.resourceType = 'shopping';
          }
          logger.info({ 
            actionLine, 
            parsedAction: parsed.action, 
            parsedResourceType: parsed.resourceType,
            itemNumbers: parsed.itemNumbers,
            taskName: parsed.taskName 
          }, 'Processing shopping action line');
          const result = await executor.executeAction(parsed, userTimezone);
          if (result.success) {
            successCount++;
            results.push(result.message);
          } else {
            failCount++;
            results.push(result.message);
          }
        } else {
          logger.warn({ actionLine, titleType, originalUserText }, 'Failed to parse shopping action line');
        }
      }
      
      if (results.length > 0) {
        const combinedMessage = results.join('\n\n');
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: combinedMessage,
              isFreeMessage: true,
            });
          }
        } catch (logError) {
          logger.warn({ error: logError, userId }, 'Failed to log outgoing shopping message');
        }
        
        await whatsappService.sendTextMessage(recipient, combinedMessage);
      }
      return;
    }
    
    // Handle non-list task operations
    if (titleType === 'task') {
      // Split action template into individual lines for multi-item support (e.g., shopping list)
      const actionLines = actionTemplate.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const results: string[] = [];
      let successCount = 0;
      let failCount = 0;
      
      for (const actionLine of actionLines) {
        const parsed = executor.parseAction(actionLine);
        if (parsed) {
          const result = await executor.executeAction(parsed);
          if (result.success) {
            successCount++;
            results.push(result.message);
          } else {
            failCount++;
            results.push(result.message);
          }
        } else {
          logger.warn({ userId, actionLine }, 'Failed to parse action line');
        }
      }
      
      // Send combined results to user (filter out empty messages from button sends)
      const nonEmptyResults = results.filter(r => r.trim().length > 0);
      if (nonEmptyResults.length > 0) {
        // Check if we have shopping list items to format specially
        const shoppingItems: string[] = [];
        const otherMessages: string[] = [];
        
        for (const result of nonEmptyResults) {
          // Check for shopping item additions (new format: "✓ Added ..." or old format: "SHOPPING_ITEM_ADDED:")
          if (result.startsWith('SHOPPING_ITEM_ADDED:')) {
            shoppingItems.push(result.replace('SHOPPING_ITEM_ADDED:', ''));
          } else if (result.includes('Added') && result.includes('to Shopping Lists')) {
            // Extract item name from "✓ Added "{item}" to Shopping Lists"
            const match = result.match(/Added\s+"([^"]+)"\s+to\s+Shopping\s+Lists/i);
            if (match && match[1]) {
              shoppingItems.push(match[1]);
            } else {
              otherMessages.push(result);
            }
          } else {
            otherMessages.push(result);
          }
        }
        
        let combinedMessage = '';
        
        // Format shopping list items if any
        if (shoppingItems.length > 0) {
          const itemsText = shoppingItems.length === 1
            ? shoppingItems[0]
            : shoppingItems.length === 2
            ? `${shoppingItems[0]} and ${shoppingItems[1]}`
            : `${shoppingItems.slice(0, -1).join(', ')} and ${shoppingItems[shoppingItems.length - 1]}`;
          combinedMessage = `✅ *Added to Shopping List:*\nItem/s: ${itemsText}`;
        }
        
        // Add other messages
        if (otherMessages.length > 0) {
          if (combinedMessage) {
            combinedMessage += '\n\n' + otherMessages.join('\n');
          } else {
            combinedMessage = otherMessages.join('\n');
          }
        }
        
        await whatsappService.sendTextMessage(recipient, combinedMessage);
        
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: combinedMessage,
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing message');
        }
        
        logger.info({ userId, successCount, failCount, totalLines: actionLines.length }, 'Processed task operations');
      } else {
        logger.info({ userId, titleType }, 'No actions parsed from template');
      }
      return; // Exit early after handling task operation
    }
    
    // Handle non-list document operations
    if (titleType === 'document') {
      // Send AI response to user (as requested)
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
          logger.warn({ error, userId }, 'Failed to log outgoing AI response message');
        }
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to send AI response to user');
      }
      
      // Split action template into individual lines for multi-item support
      const actionLines = actionTemplate.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const results: string[] = [];
      let successCount = 0;
      let failCount = 0;
      
      for (const actionLine of actionLines) {
        const parsed = executor.parseAction(actionLine);
        if (parsed) {
          const result = await executor.executeAction(parsed);
          if (result.success) {
            successCount++;
            results.push(result.message);
          } else {
            failCount++;
            results.push(result.message);
          }
        } else {
          logger.warn({ userId, actionLine }, 'Failed to parse document action line');
        }
      }
      
      // Send combined results to user (filter out empty messages from button sends)
      const nonEmptyResults = results.filter(r => r.trim().length > 0);
      if (nonEmptyResults.length > 0) {
        const combinedMessage = nonEmptyResults.join('\n');
        await whatsappService.sendTextMessage(recipient, combinedMessage);
        
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: combinedMessage,
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing message');
        }
        
        logger.info({ userId, successCount, failCount, totalLines: actionLines.length }, 'Processed document operations');
      } else {
        logger.info({ userId, titleType }, 'No actions parsed from template');
      }
      return; // Exit early after handling document operation
    }
    
    // Handle event operations (create, update, delete, view, show)
    if (titleType === 'event') {
      // Check if AI misclassified an event request as an address request
      // This happens when user says "send info on 3" but AI generates "Get address: [event name]"
      const isGetAddress = actionTemplate.toLowerCase().startsWith('get address:');
      if (isGetAddress && originalUserText) {
        const userTextLower = originalUserText.toLowerCase();
        // Check if user wants event info (not address info)
        const wantsEventInfo = userTextLower.match(/(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)/i) ||
                              userTextLower.match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) ||
                              userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?(?:the\s+)?event/i) ||
                              userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?[^"]+\s+event/i);
        
        if (wantsEventInfo) {
          // Extract number from user text
          const numberMatch = userTextLower.match(/(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)/i) ||
                            userTextLower.match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i);
          
          if (numberMatch && numberMatch[1]) {
            // Convert to event details operation
            const eventActionTemplate = `Show event details: ${numberMatch[1]}`;
            
            logger.info(
              {
                userId,
                originalAction: actionTemplate,
                convertedAction: eventActionTemplate,
                originalUserText,
                reason: 'misclassified_as_address_but_user_wants_event_info'
              },
              'Converting address operation to event details operation (in event handler)'
            );
            
            // Route to event view operation
            const executor = new ActionExecutor(db, userId, whatsappService, recipient);
            const parsed = executor.parseAction(eventActionTemplate);
            if (parsed) {
              parsed.resourceType = 'event';
              const result = await executor.executeAction(parsed);
              
              if (result.success && result.message) {
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
                // If execution failed, send error message
                await whatsappService.sendTextMessage(
                  recipient,
                  result.message || "I'm sorry, I couldn't retrieve the event details. Please try again."
                );
              }
            } else {
              logger.warn({ userId, eventActionTemplate }, 'Failed to parse event details action');
              await whatsappService.sendTextMessage(
                recipient,
                "I'm sorry, I couldn't understand what event you want to view. Please try again."
              );
            }
            
            return; // Exit early, don't process as address operation
          }
        }
      }
      
      // Check if this is a view/show operation (should go to ActionExecutor)
      // Also check if "List events: [name/number]" is actually a request to show a specific event
      // This happens when user says "show me [event name] event" or "show me 2" but AI generates "List events: [name/number]"
      const listEventsMatch = actionTemplate.match(/^List events:\s*(.+?)(?:\s*-\s*calendar:.*)?$/i);
      const hasEventNameInList = listEventsMatch && listEventsMatch[1] && listEventsMatch[1].trim().length > 0;
      const listEventValue = listEventsMatch && listEventsMatch[1] ? listEventsMatch[1].trim() : '';
      
      // Check if user wants to view a specific event (not list all events)
      // Pattern matches: "show me [name] event", "show event [name]", "view [name] event", "show me 2", "send info on 3", etc.
      const userWantsToView = originalUserText?.toLowerCase().match(/(?:show|view|get|see|send|give|provide|details?|overview)\s+(?:me\s+)?(?:the\s+)?(?:event|details?|overview|info|information)/i) ||
                              originalUserText?.toLowerCase().match(/(?:show|view|get|see|send)\s+(?:me\s+)?[^"]+\s+event/i) ||
                              originalUserText?.toLowerCase().match(/(?:show|view|get|see|send)\s+(?:me\s+)?(?:the\s+)?event\s+(?:of|for|details?|overview)/i) ||
                              originalUserText?.toLowerCase().match(/(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)/i) ||
                              // Also match "show me [number]" or "send info on [number]" - likely referring to a numbered item from a list
                              (originalUserText?.toLowerCase().match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) && hasEventNameInList && /^\d+$/.test(listEventValue)) ||
                              (originalUserText?.toLowerCase().match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)$/i) && hasEventNameInList && /^\d+$/.test(listEventValue));
      
      const isListEventsWithName = actionTemplate.toLowerCase().startsWith('list events:') && 
                                   hasEventNameInList &&
                                   userWantsToView;
      
      // Check for "View an event:" format (AI sometimes generates this)
      const isViewAnEvent = actionTemplate.toLowerCase().match(/^view\s+an\s+event:/i) ||
                            actionTemplate.toLowerCase().match(/^view\s+event:/i);
      
      const isViewShowOperation = actionTemplate.toLowerCase().match(/^(view|show|get|see|details? of|overview of)\s+(?:event|events?|me\s+event|me\s+the\s+event)/i) ||
                                  actionTemplate.toLowerCase().match(/^(view|show|get|see)\s+(?:me\s+)?(?:the\s+)?(?:details?|overview|info|information)\s+(?:of|for)\s+(?:event|events?)?/i) ||
                                  (actionTemplate.toLowerCase().startsWith('view a file:') && originalUserText?.toLowerCase().includes('event')) ||
                                  isViewAnEvent ||
                                  isListEventsWithName;
      
      if (isViewShowOperation) {
        // Handle view/show event operations via ActionExecutor
        let eventActionTemplate = actionTemplate;
        
        // If AI generated "List events: [name]" but user wants to see a specific event
        if (isListEventsWithName) {
          const eventNameMatch = actionTemplate.match(/^List events:\s*(.+?)(?:\s*-\s*calendar:.*)?$/i);
          if (eventNameMatch && eventNameMatch[1]) {
            eventActionTemplate = `Show event details: ${eventNameMatch[1].trim()}`;
          } else if (originalUserText) {
            // Extract event name from original text
            const originalMatch = originalUserText.match(/(?:show|view|get|see)\s+(?:me\s+)?(?:the\s+)?(?:event|details?|overview)\s+(?:of\s+)?["']?([^"']+)["']?/i) ||
                               originalUserText.match(/(?:show|view|get|see)\s+(?:me\s+)?["']?([^"']+)\s+event["']?/i);
            if (originalMatch && originalMatch[1]) {
              eventActionTemplate = `Show event details: ${originalMatch[1].trim()}`;
            } else {
              eventActionTemplate = `Show event details: ${originalUserText}`;
            }
          }
        } else if (isViewAnEvent) {
          // Extract event name/number from "View an event: [name]" or "View event: [name]"
          const viewEventMatch = actionTemplate.match(/^View\s+(?:an\s+)?event:\s*(.+?)(?:\s*-\s*on folder:.*)?$/i);
          if (viewEventMatch && viewEventMatch[1]) {
            const extractedValue = viewEventMatch[1].trim();
            // If user said "show me 2" or "send info on 3", use the number from user text instead of event name from AI
            const userNumberMatch = originalUserText?.toLowerCase().match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) ||
                                   originalUserText?.toLowerCase().match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)$/i);
            if (userNumberMatch && userNumberMatch[1]) {
              eventActionTemplate = `Show event details: ${userNumberMatch[1]}`;
            } else {
              eventActionTemplate = `Show event details: ${extractedValue}`;
            }
          } else if (originalUserText) {
            // Extract from original user text
            const userNumberMatch = originalUserText.toLowerCase().match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) ||
                                   originalUserText.toLowerCase().match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)$/i);
            if (userNumberMatch && userNumberMatch[1]) {
              eventActionTemplate = `Show event details: ${userNumberMatch[1]}`;
            } else {
              eventActionTemplate = `Show event details: ${originalUserText}`;
            }
          }
        } else if (actionTemplate.toLowerCase().startsWith('view a file:')) {
          // Extract event name from "View a file: [event name]"
          const eventNameMatch = actionTemplate.match(/View a file:\s*(.+?)(?:\s*-\s*on folder:.*)?$/i);
          if (eventNameMatch && eventNameMatch[1]) {
            eventActionTemplate = `Show event details: ${eventNameMatch[1].trim()}`;
          } else if (originalUserText) {
            // Fallback: use original user text
            eventActionTemplate = `Show event details: ${originalUserText}`;
          }
        }
        
        logger.info(
          {
            userId,
            titleType,
            originalActionTemplate: actionTemplate.substring(0, 200),
            eventActionTemplate: eventActionTemplate.substring(0, 200),
          },
          'Processing view/show event operation'
        );
        
        const parsed = executor.parseAction(eventActionTemplate);
        if (parsed) {
          parsed.resourceType = 'event';
          
          // Get timezone for event operations
          let eventTimezone = userTimezone || 'Africa/Johannesburg';
          try {
            const calendarConnection = await getPrimaryCalendar(db, userId);
            if (calendarConnection) {
              const calendarService = new CalendarService(db);
              eventTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
            }
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to get timezone for event operation, using default');
          }
          
          const result = await executor.executeAction(parsed, eventTimezone);
          
          if (result.message.trim().length > 0) {
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
        } else {
          logger.warn({ userId, actionTemplate, eventActionTemplate }, 'Failed to parse view/show event action');
          await whatsappService.sendTextMessage(
            recipient,
            `I'm sorry, I couldn't understand what event you want to view. Please try again.`
          );
        }
        return; // Exit early after handling view/show event operation
      }
      
      // Log AI response for debugging
      logger.info(
        {
          userId,
          titleType,
          actionTemplate: actionTemplate.substring(0, 200),
          fullAIResponse: aiResponse.substring(0, 500),
        },
        'Processing non-list event operation (create/update/delete)'
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

      // Handle non-list event operations (create, update, delete)
      if (originalUserText) {
        // Create, Update, or Delete event - use calendar intent analysis
        await handleEventOperation(originalUserText, actionTemplate, recipient, userId, db, whatsappService);
      } else {
        logger.warn({ userId, actionTemplate: actionTemplate.substring(0, 100) }, 'Event operation but no original user text available');
        await whatsappService.sendTextMessage(
          recipient,
          "I'm sorry, I encountered an error processing your event request. Please try again."
        );
      }
    } else if (titleType === 'note') {
      // For non-list operations on notes, log as TODO
      logger.info({ userId, titleType, actionTemplate: actionTemplate.substring(0, 100) }, `${titleType} executor not yet implemented for this operation`);
    } else if (titleType === 'reminder') {
      // Handle reminder operations
      const isCreate = /^Create a reminder:/i.test(actionTemplate);
      const isUpdate = /^Update a reminder:/i.test(actionTemplate);
      const isDelete = /^Delete a reminder:/i.test(actionTemplate);
      const isPause = /^Pause a reminder:/i.test(actionTemplate);
      const isResume = /^Resume a reminder:/i.test(actionTemplate);
      const isList = /^List reminders:/i.test(actionTemplate);
      
      // Send AI response to user (as requested)
      if (!isList) {
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
            logger.warn({ error, userId }, 'Failed to log outgoing AI response message');
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to send AI response to user');
        }
      }
      
      // Get calendar timezone for reminder operations
      let calendarTimezone = 'Africa/Johannesburg'; // Default fallback
      try {
        const calendarConnection = await getPrimaryCalendar(db, userId);
        if (calendarConnection) {
          const calendarService = new CalendarService(db);
          calendarTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
        }
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to get calendar timezone for reminder operations, using default');
      }
      
      // Handle reminder operations
      const executor = new ActionExecutor(db, userId, whatsappService, recipient);
      
      if (isList) {
        // List reminders is handled by action executor
        // Send AI response to user for debugging
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
            logger.warn({ error, userId }, 'Failed to log outgoing AI response message');
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to send AI response to user');
        }
        
        const parsed = executor.parseAction(actionTemplate);
        if (parsed) {
          parsed.resourceType = 'reminder';
          
          logger.info({
            userId,
            parsedAction: parsed,
            listFilter: parsed.listFilter,
            status: parsed.status,
            typeFilter: parsed.typeFilter,
            calendarTimezone,
          }, 'Parsed reminder list action');
          
          const result = await executor.executeAction(parsed, calendarTimezone);
          
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
          } catch (logError) {
            logger.warn({ error: logError, userId }, 'Failed to log outgoing reminder list message');
          }
          
          // Skip if empty (e.g., when button was already sent)
          if (result.message.trim().length > 0) {
            await whatsappService.sendTextMessage(recipient, result.message);
          }
        }
      } else {
        // For create/update/delete/pause/resume, parse and execute with timezone
        const parsed = parseReminderTemplateToAction(actionTemplate, isCreate, isUpdate, isDelete, isPause, isResume);
        const result = await executor.executeAction(parsed, calendarTimezone);
        
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
        } catch (logError) {
          logger.warn({ error: logError, userId }, 'Failed to log outgoing reminder message');
        }
        
        // Skip if empty (e.g., when button was already sent)
        if (result.message.trim().length > 0) {
          await whatsappService.sendTextMessage(recipient, result.message);
        }
      }
    } else if (titleType === 'address') {
      // Check if AI misclassified an event request as an address request
      // This happens when user says "send info on 3" but AI generates "Get address: [event name]"
      const isGetAddress = actionTemplate.toLowerCase().startsWith('get address:');
      if (isGetAddress && originalUserText) {
        const userTextLower = originalUserText.toLowerCase();
        // Check if user wants event info (not address info)
        const wantsEventInfo = userTextLower.match(/(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)/i) ||
                              userTextLower.match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) ||
                              userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?(?:the\s+)?event/i) ||
                              userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?[^"]+\s+event/i);
        
        if (wantsEventInfo) {
          // Extract number from user text
          const numberMatch = userTextLower.match(/(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)/i) ||
                            userTextLower.match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i);
          
          if (numberMatch && numberMatch[1]) {
            // Convert to event details operation
            const eventActionTemplate = `Show event details: ${numberMatch[1]}`;
            
            logger.info(
              {
                userId,
                originalAction: actionTemplate,
                convertedAction: eventActionTemplate,
                originalUserText,
                reason: 'misclassified_as_address_but_user_wants_event_info'
              },
              'Converting address operation to event details operation'
            );
            
            // Route to event view operation
            const executor = new ActionExecutor(db, userId, whatsappService, recipient);
            const parsed = executor.parseAction(eventActionTemplate);
            if (parsed) {
              parsed.resourceType = 'event';
              const result = await executor.executeAction(parsed);
              
              if (result.success && result.message) {
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
            }
            
            return; // Exit early, don't process as address operation
          }
        }
      }
      
      // Handle address operations (create, update, delete, get, list)
      
      // Send AI response to user (for debugging/transparency)
      try {
        await whatsappService.sendTextMessage(
          recipient,
          `🤖 AI Analysis:\n${aiResponse.substring(0, 500)}`
        );
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: `🤖 AI Analysis:\n${aiResponse.substring(0, 500)}`,
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing AI analysis message');
        }
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to send AI analysis to user');
      }
      
      const actionLines = actionTemplate.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const results: string[] = [];
      let successCount = 0;
      let failCount = 0;
      
      for (const actionLine of actionLines) {
        const parsed = executor.parseAction(actionLine);
        if (parsed) {
          parsed.resourceType = 'address';
          const result = await executor.executeAction(parsed);
          if (result.success) {
            successCount++;
            results.push(result.message);
          } else {
            failCount++;
            results.push(result.message);
          }
        } else {
          logger.warn({ userId, actionLine }, 'Failed to parse address action line');
        }
      }
      
      // Send combined results to user (filter out empty messages from button sends)
      const nonEmptyResults = results.filter(r => r.trim().length > 0);
      if (nonEmptyResults.length > 0) {
        const combinedMessage = nonEmptyResults.join('\n');
        await whatsappService.sendTextMessage(recipient, combinedMessage);
        
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: combinedMessage,
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing message');
        }
        
        logger.info({ userId, successCount, failCount, totalLines: actionLines.length }, 'Processed address operations');
      } else {
        logger.info({ userId, titleType }, 'No address actions parsed from template');
      }
    } else if (titleType === 'friend') {
      // Handle friend operations (create, update, delete, list, folder operations)
      
      // Send AI response to user (for debugging/transparency)
      try {
        await whatsappService.sendTextMessage(
          recipient,
          `🤖 AI Analysis:\n${aiResponse.substring(0, 500)}`
        );
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: `🤖 AI Analysis:\n${aiResponse.substring(0, 500)}`,
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing AI analysis message');
        }
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to send AI analysis to user');
      }
      
      const actionLines = actionTemplate.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const results: string[] = [];
      let successCount = 0;
      let failCount = 0;
      
      for (const actionLine of actionLines) {
        const parsed = executor.parseAction(actionLine);
        if (parsed) {
          // Ensure resourceType is set to friend for friend operations
          if (parsed.resourceType !== 'friend' && !parsed.isFriendFolder) {
            parsed.resourceType = 'friend';
          }
          const result = await executor.executeAction(parsed);
          if (result.success) {
            successCount++;
            results.push(result.message);
          } else {
            failCount++;
            results.push(result.message);
          }
        } else {
          logger.warn({ userId, actionLine }, 'Failed to parse friend action line');
        }
      }
      
      // Send combined results to user (filter out empty messages from button sends)
      const nonEmptyResults = results.filter(r => r.trim().length > 0);
      if (nonEmptyResults.length > 0) {
        const combinedMessage = nonEmptyResults.join('\n\n');
        await whatsappService.sendTextMessage(recipient, combinedMessage);
        
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: combinedMessage,
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing message');
        }
        
        logger.info({ userId, successCount, failCount, totalLines: actionLines.length }, 'Processed friend operations');
      } else {
        logger.info({ userId, titleType }, 'No friend actions parsed from template');
      }
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
      
      // Check if user wants Google Meet (check both original user text and action template for keywords)
      const userTextLower = originalUserText.toLowerCase();
      const actionTemplateLower = actionTemplate.toLowerCase();
      const wantsGoogleMeet = 
        userTextLower.includes('google meet') ||
        userTextLower.includes('meet link') ||
        userTextLower.includes('video call') ||
        userTextLower.includes('video meeting') ||
        userTextLower.includes('create meet') ||
        userTextLower.includes('add meet') ||
        (userTextLower.includes('meet') && (userTextLower.includes('link') || userTextLower.includes('url'))) ||
        actionTemplateLower.includes('google meet') ||
        actionTemplateLower.includes('meet link') ||
        (actionTemplateLower.includes('attendees:') && actionTemplateLower.includes('google meet'));
      
      // Remove "Google Meet" from attendees if it was incorrectly added (more aggressive filtering)
      if (intent.attendees && intent.attendees.length > 0) {
        const googleMeetKeywords = ['google meet', 'meet link', 'video call', 'video meeting', 'googlemeet'];
        intent.attendees = intent.attendees.filter(attendee => {
          const lower = attendee.toLowerCase().trim();
          
          // Filter out exact matches
          if (lower === 'meet' || lower === 'google meet' || lower === 'googlemeet' || 
              lower === 'meet link' || lower === 'video call' || lower === 'video meeting') {
            return false;
          }
          
          // Filter out if it contains Google Meet keywords as whole words (using word boundaries)
          const hasGoogleMeetKeyword = googleMeetKeywords.some(keyword => {
            // Check for exact match or as a whole word (with word boundaries)
            const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
            return regex.test(lower);
          });
          
          // Also check for standalone "meet" (but allow names like "Meeta" or "Meetings")
          if (lower === 'meet' || (lower.length <= 5 && lower.includes('meet'))) {
            // Only filter if it's exactly "meet" or very short and contains "meet"
            // This prevents filtering out names like "Meeta" or "Meetings"
            if (lower === 'meet') {
              return false;
            }
          }
          
          return !hasGoogleMeetKeyword;
        });
        
        // If all attendees were filtered out, set to undefined
        if (intent.attendees.length === 0) {
          intent.attendees = undefined;
        }
        
        logger.info(
          {
            userId,
            filteredAttendees: intent.attendees,
            originalAttendeesCount: intent.attendees?.length || 0,
          },
          'Google Meet filtered from attendees'
        );
      }
      
      // Resolve attendee names to email addresses (for friends and direct emails)
      if (intent.attendees && intent.attendees.length > 0 && isCreate) {
        try {
          const originalAttendees = [...intent.attendees];
          logger.info(
            {
              userId,
              originalAttendees,
              attendeeCount: originalAttendees.length,
            },
            'Starting attendee resolution'
          );
          
          const friends = await getUserFriends(db, userId);
          logger.info(
            {
              userId,
              friendsCount: friends.length,
              friendDetails: friends.map(f => ({
                id: f.id,
                name: f.name,
                email: f.email,
                connectedUserEmail: f.connectedUser?.email,
                hasEmail: !!(f.email || f.connectedUser?.email),
                allFields: {
                  name: f.name,
                  email: f.email,
                  phone: f.phone,
                  connectedUser: f.connectedUser ? {
                    email: f.connectedUser.email,
                    name: f.connectedUser.name,
                  } : null,
                },
              })),
            },
            '📋 Retrieved friends for attendee resolution - FULL DETAILS'
          );
          
          const resolvedAttendees: string[] = [];
          
          logger.info(
            {
              userId,
              intentAttendeesArray: intent.attendees,
              intentAttendeesCount: intent.attendees.length,
              intentAttendeesTypes: intent.attendees.map(a => typeof a),
            },
            'Starting attendee resolution loop - ALL ATTENDEES TO PROCESS'
          );
          
          // Process ALL attendees - no special cases, no early exits
          logger.info(
            {
              userId,
              totalAttendeesToProcess: intent.attendees.length,
              allAttendeesToProcess: intent.attendees,
            },
            '🔄 Starting to process ALL attendees - no special handling for any attendee'
          );
          
          for (let i = 0; i < intent.attendees.length; i++) {
            const attendee = intent.attendees[i];
            if (!attendee) {
              logger.warn({ userId, attendeeIndex: i, totalAttendees: intent.attendees.length }, 'Skipping undefined attendee at index');
              continue;
            }
            const attendeeTrimmed = attendee.trim();
            
            if (!attendeeTrimmed) {
              logger.warn({ userId, attendeeIndex: i, totalAttendees: intent.attendees.length }, 'Skipping empty attendee at index');
              continue;
            }
            
            logger.info(
              {
                userId,
                attendeeIndex: i,
                totalAttendees: intent.attendees.length,
                processingAttendee: attendeeTrimmed,
                attendeeType: typeof attendee,
                currentResolvedCount: resolvedAttendees.length,
                currentResolvedEmails: [...resolvedAttendees], // Copy array to show current state
              },
              `🔄 Processing attendee ${i + 1}/${intent.attendees.length}: "${attendeeTrimmed}"`
            );
            
            // Check if it's already a valid email address (use proper regex validation)
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(attendeeTrimmed)) {
              const emailLower = attendeeTrimmed.toLowerCase();
              if (!resolvedAttendees.includes(emailLower)) {
                resolvedAttendees.push(emailLower);
                logger.info(
                  {
                    userId,
                    attendeeName: attendeeTrimmed,
                    resolvedEmail: emailLower,
                    resolvedCount: resolvedAttendees.length,
                  },
                  'Attendee is already a valid email address'
                );
              } else {
                logger.warn(
                  {
                    userId,
                    attendeeName: attendeeTrimmed,
                    resolvedEmail: emailLower,
                  },
                  'Skipping duplicate email address (already in resolved list)'
                );
              }
              continue;
            }
            
            // Try to find matching friend by name (case-insensitive, with priority matching)
            // IMPORTANT: Reset matchingFriend for each attendee - no shared state
            let matchingFriend: typeof friends[0] | undefined = undefined;
            let matchType: string = '';
            
            logger.info(
              {
                userId,
                attendeeIndex: i,
                attendeeName: attendeeTrimmed,
                attendeeLower: attendeeTrimmed.toLowerCase().trim(),
                friendsCount: friends.length,
                friendNames: friends.map(f => f.name),
                friendNamesLower: friends.map(f => f.name.toLowerCase().trim()),
                friendDetails: friends.map(f => ({
                  name: f.name,
                  nameLower: f.name.toLowerCase().trim(),
                  email: f.email,
                  connectedUserEmail: f.connectedUser?.email,
                  hasEmail: !!(f.email || f.connectedUser?.email),
                })),
              },
              `🔍 Starting friend matching for "${attendeeTrimmed}" - checking against ${friends.length} friends`
            );
            
            // First, try exact match
            matchingFriend = friends.find(friend => {
              const friendNameLower = friend.name.toLowerCase().trim();
              const attendeeLower = attendeeTrimmed.toLowerCase().trim();
              return friendNameLower === attendeeLower;
            });
            
            if (matchingFriend) {
              matchType = 'exact';
              logger.info(
                {
                  userId,
                  attendeeIndex: i,
                  attendeeName: attendeeTrimmed,
                  matchType: 'exact',
                  friendName: matchingFriend.name,
                  friendEmail: matchingFriend.email,
                },
                `✅ Found exact match for "${attendeeTrimmed}" -> ${matchingFriend.name} (${matchingFriend.email})`
              );
            }
            
            // If no exact match, try first name match (e.g., "Paul" matches "Paul Smith")
            if (!matchingFriend) {
              matchingFriend = friends.find(friend => {
                const friendNameLower = friend.name.toLowerCase().trim();
                const attendeeLower = attendeeTrimmed.toLowerCase().trim();
                const friendWords = friendNameLower.split(/\s+/);
                const firstWord = friendWords[0];
                // Check if attendee matches the first word of friend's name
                return firstWord === attendeeLower;
              });
              
              if (matchingFriend) {
                matchType = 'first_name';
                logger.info(
                  {
                    userId,
                    attendeeName: attendeeTrimmed,
                    matchType: 'first_name',
                    friendName: matchingFriend.name,
                    friendEmail: matchingFriend.email,
                  },
                  'Found first name match for attendee'
                );
              }
            }
            
            // If still no match, try word boundary match (e.g., "John" matches "John Doe" or "Doe, John")
            if (!matchingFriend) {
              matchingFriend = friends.find(friend => {
                const friendNameLower = friend.name.toLowerCase().trim();
                const attendeeLower = attendeeTrimmed.toLowerCase().trim();
                const friendWords = friendNameLower.split(/\s+/);
                // Check if any word in friend's name matches the attendee name
                return friendWords.some(word => word === attendeeLower);
              });
              
              if (matchingFriend) {
                matchType = 'word_boundary';
                logger.info(
                  {
                    userId,
                    attendeeName: attendeeTrimmed,
                    matchType: 'word_boundary',
                    friendName: matchingFriend.name,
                    friendEmail: matchingFriend.email,
                  },
                  'Found word boundary match for attendee'
                );
              }
            }
            
            // Try partial match (e.g., "Drala" matches "Draladanyil")
            if (!matchingFriend) {
              matchingFriend = friends.find(friend => {
                const friendNameLower = friend.name.toLowerCase().trim();
                const attendeeLower = attendeeTrimmed.toLowerCase().trim();
                // Match if friend name starts with attendee name or vice versa
                return friendNameLower.startsWith(attendeeLower) || attendeeLower.startsWith(friendNameLower);
              });
              
              if (matchingFriend) {
                matchType = 'partial';
                logger.info(
                  {
                    userId,
                    attendeeName: attendeeTrimmed,
                    matchType: 'partial',
                    friendName: matchingFriend.name,
                    friendEmail: matchingFriend.email,
                  },
                  'Found partial match for attendee'
                );
              }
            }
            
            // Try aggressive partial match (contains check)
            if (!matchingFriend) {
              matchingFriend = friends.find(friend => {
                const friendNameLower = friend.name.toLowerCase().trim();
                const attendeeLower = attendeeTrimmed.toLowerCase().trim();
                
                // Check if attendee is contained in friend name or vice versa
                if (friendNameLower.includes(attendeeLower) || attendeeLower.includes(friendNameLower)) {
                  return true;
                }
                
                // Check if any word in friend name matches attendee
                const friendWords = friendNameLower.split(/\s+/);
                return friendWords.some(word => word === attendeeLower || attendeeLower === word);
              });
              
              if (matchingFriend) {
                matchType = 'aggressive_partial';
                logger.info(
                  {
                    userId,
                    attendeeName: attendeeTrimmed,
                    matchType: 'aggressive_partial',
                    friendName: matchingFriend.name,
                    friendEmail: matchingFriend.email,
                  },
                  'Found aggressive partial match for attendee'
                );
              }
            }
            
            // Process the match result
            if (matchingFriend) {
              // Get email from friend.email or connectedUser.email
              const friendEmail = matchingFriend.email || matchingFriend.connectedUser?.email;
              
              if (friendEmail) {
                const emailLower = friendEmail.toLowerCase();
                // Avoid duplicates
                if (!resolvedAttendees.includes(emailLower)) {
                  resolvedAttendees.push(emailLower);
                  logger.info(
                    {
                      userId,
                      attendeeIndex: i,
                      attendeeName: attendeeTrimmed,
                      friendName: matchingFriend.name,
                      friendEmailDirect: matchingFriend.email,
                      friendEmailFromConnected: matchingFriend.connectedUser?.email,
                      resolvedEmail: friendEmail,
                      resolvedCount: resolvedAttendees.length,
                      matchType: matchType,
                      allResolvedSoFar: [...resolvedAttendees],
                    },
                    `✅ SUCCESS: Resolved "${attendeeTrimmed}" -> ${friendEmail} (${matchType} match)`
                  );
                } else {
                  logger.warn(
                    {
                      userId,
                      attendeeIndex: i,
                      attendeeName: attendeeTrimmed,
                      friendName: matchingFriend.name,
                      resolvedEmail: friendEmail,
                    },
                    `⚠️ Skipping duplicate email: ${friendEmail} (already resolved)`
                  );
                }
              } else {
                logger.error(
                  {
                    userId,
                    attendeeIndex: i,
                    attendeeName: attendeeTrimmed,
                    friendName: matchingFriend.name,
                    matchType: matchType,
                    friendHasEmail: !!matchingFriend.email,
                    friendHasConnectedUser: !!matchingFriend.connectedUser,
                    friendConnectedUserEmail: matchingFriend.connectedUser?.email,
                  },
                  `❌ ERROR: Found matching friend "${matchingFriend.name}" but friend has NO email address (checked both friend.email and connectedUser.email)!`
                );
              }
            } else {
              // No matching friend found - try other options
              logger.debug(
                {
                  userId,
                  attendeeIndex: i,
                  attendeeName: attendeeTrimmed,
                },
                `❌ No friend match found for "${attendeeTrimmed}" - checking if it's an email`
              );
              // If not found in friends, check if it's already a valid email (double-check)
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (emailRegex.test(attendeeTrimmed)) {
                // It's already a valid email, use it
                const emailLower = attendeeTrimmed.toLowerCase();
                if (!resolvedAttendees.includes(emailLower)) {
                  resolvedAttendees.push(emailLower);
                  logger.info(
                    {
                      userId,
                      attendeeName: attendeeTrimmed,
                      resolvedEmail: emailLower,
                      resolvedCount: resolvedAttendees.length,
                    },
                    'Attendee is already a valid email address (not in friends but valid email)'
                  );
                } else {
                  logger.warn(
                    {
                      userId,
                      attendeeName: attendeeTrimmed,
                      resolvedEmail: emailLower,
                    },
                    'Skipping duplicate email address (already in resolved list)'
                  );
                }
              } else {
                // Not a friend and not an email - skip it and warn with detailed info
                logger.error(
                  {
                    userId,
                    attendeeIndex: i,
                    attendeeName: attendeeTrimmed,
                    totalAttendees: intent.attendees.length,
                    currentResolvedCount: resolvedAttendees.length,
                    availableFriends: friends.map(f => ({ name: f.name, email: f.email })),
                    allFriendNames: friends.map(f => f.name),
                    allFriendEmails: friends.map(f => f.email).filter((e): e is string => !!e),
                    attemptedMatches: friends.map(f => ({
                      friendName: f.name,
                      friendNameLower: f.name.toLowerCase().trim(),
                      attendeeLower: attendeeTrimmed.toLowerCase().trim(),
                      exactMatch: f.name.toLowerCase().trim() === attendeeTrimmed.toLowerCase().trim(),
                      firstWordMatch: f.name.toLowerCase().trim().split(/\s+/)[0] === attendeeTrimmed.toLowerCase().trim(),
                      wordMatch: f.name.toLowerCase().trim().split(/\s+/).some(word => word === attendeeTrimmed.toLowerCase().trim()),
                      startsWithMatch: f.name.toLowerCase().trim().startsWith(attendeeTrimmed.toLowerCase().trim()) || attendeeTrimmed.toLowerCase().trim().startsWith(f.name.toLowerCase().trim()),
                      containsMatch: f.name.toLowerCase().trim().includes(attendeeTrimmed.toLowerCase().trim()) || attendeeTrimmed.toLowerCase().trim().includes(f.name.toLowerCase().trim()),
                    })),
                  },
                  `❌ FAILED: Could not resolve "${attendeeTrimmed}" - not a friend and not a valid email - SKIPPING`
                );
                // Don't add it - it will cause an error with the calendar API
              }
            }
            
            // Log completion of this attendee processing
            logger.info(
              {
                userId,
                attendeeIndex: i,
                attendeeName: attendeeTrimmed,
                wasResolved: matchingFriend && matchingFriend.email ? true : false,
                resolvedEmail: matchingFriend && matchingFriend.email ? matchingFriend.email : null,
                totalResolvedSoFar: resolvedAttendees.length,
                allResolvedEmails: [...resolvedAttendees],
              },
              `✅ Completed processing attendee ${i + 1}/${intent.attendees.length}: "${attendeeTrimmed}"`
            );
          }
          
          logger.info(
            {
              userId,
              totalAttendeesProcessed: intent.attendees.length,
              totalResolved: resolvedAttendees.length,
              resolvedAttendees: [...resolvedAttendees],
            },
            '🎯 FINISHED processing ALL attendees - summary'
          );
          
          // Create a summary of what was resolved vs what wasn't
          const resolutionSummary = originalAttendees.map(orig => {
            const resolved = resolvedAttendees.find(resolvedEmail => {
              const emailPrefix = resolvedEmail.split('@')[0];
              return resolvedEmail.includes(orig.toLowerCase()) || (emailPrefix && orig.toLowerCase().includes(emailPrefix));
            });
            return {
              original: orig,
              resolved: resolved || null,
              wasResolved: !!resolved,
            };
          });
          
          logger.info(
            {
              userId,
              totalProcessed: intent.attendees.length,
              totalResolved: resolvedAttendees.length,
              resolvedAttendees: resolvedAttendees,
              allResolvedEmails: [...resolvedAttendees],
              resolutionSummary: resolutionSummary,
            },
            '✅ Attendee resolution loop completed - SUMMARY: showing what was resolved vs what was not'
          );
          
          // Final validation: ensure all resolved attendees are valid email addresses
          const validEmails = resolvedAttendees.filter(email => {
            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValid = emailRegex.test(email);
            if (!isValid) {
              logger.warn(
                {
                  userId,
                  invalidEmail: email,
                },
                'Invalid email address found in resolved attendees - filtering out'
              );
            }
            return isValid;
          });
          
          // Ensure we have valid emails before assigning
          if (validEmails.length > 0) {
            intent.attendees = validEmails;
            logger.info(
              {
                userId,
                originalAttendees,
                originalCount: originalAttendees.length,
                resolvedAttendees,
                resolvedCount: resolvedAttendees.length,
                validEmails,
                validCount: validEmails.length,
                filteredCount: resolvedAttendees.length - validEmails.length,
                finalAttendees: intent.attendees,
                finalAttendeesCount: intent.attendees.length,
              },
              'Attendee resolution and validation completed - attendees assigned to intent'
            );
          } else {
            intent.attendees = undefined;
            logger.warn(
              {
                userId,
                originalAttendees,
                originalCount: originalAttendees.length,
                resolvedAttendees,
                resolvedCount: resolvedAttendees.length,
                validEmails,
                validCount: validEmails.length,
              },
              'No valid emails after resolution - setting attendees to undefined'
            );
          }
          
          // Final check: warn if we lost attendees - this is critical for debugging
          if (validEmails.length < originalAttendees.length) {
            const lostAttendees = originalAttendees.filter(orig => {
              // Check if this original attendee was resolved
              const wasResolved = resolvedAttendees.some(resolved => {
                // Try to match by checking if the resolved email could have come from this original
                const emailPrefix = resolved.split('@')[0];
                return resolved.includes(orig.toLowerCase()) || (emailPrefix && orig.toLowerCase().includes(emailPrefix));
              });
              return !wasResolved;
            });
            
            // For each lost attendee, try to find why it wasn't matched
            const lostAttendeeAnalysis = lostAttendees.map(lost => {
              const lostLower = lost.toLowerCase().trim();
              const potentialMatches = friends.map(f => {
                const friendNameLower = f.name.toLowerCase().trim();
                return {
                  friendName: f.name,
                  friendEmail: f.email,
                  exactMatch: friendNameLower === lostLower,
                  firstWordMatch: friendNameLower.split(/\s+/)[0] === lostLower,
                  wordMatch: friendNameLower.split(/\s+/).some(word => word === lostLower),
                  startsWithMatch: friendNameLower.startsWith(lostLower) || lostLower.startsWith(friendNameLower),
                  containsMatch: friendNameLower.includes(lostLower) || lostLower.includes(friendNameLower),
                };
              });
              return {
                lostAttendee: lost,
                potentialMatches: potentialMatches.filter(m => m.exactMatch || m.firstWordMatch || m.wordMatch || m.startsWithMatch || m.containsMatch),
                allPotentialMatches: potentialMatches,
              };
            });
            
            logger.error(
              {
                userId,
                originalAttendees,
                originalCount: originalAttendees.length,
                validEmails,
                validCount: validEmails.length,
                lostCount: originalAttendees.length - validEmails.length,
                lostAttendees,
                lostAttendeeAnalysis,
                resolvedAttendees,
                allFriendNames: friends.map(f => f.name),
                allFriendEmails: friends.map(f => f.email).filter((e): e is string => !!e),
              },
              'CRITICAL: Some attendees were not resolved to valid emails - detailed analysis with potential matches'
            );
          }
          
          // Log final state before passing to calendar service
          logger.info(
            {
              userId,
              intentAttendees: intent.attendees,
              intentAttendeesCount: intent.attendees?.length || 0,
              intentAttendeesType: Array.isArray(intent.attendees) ? 'array' : typeof intent.attendees,
            },
            'Final intent.attendees before passing to calendar service'
          );
        } catch (error) {
          logger.error(
            {
              error,
              userId,
              attendees: intent.attendees,
            },
            'Failed to resolve attendee names to emails'
          );
          // Continue with original attendees - will fail with clear error if invalid
        }
      }
      
      // If Google Meet is requested, add it to description if not already present
      if (wantsGoogleMeet && isCreate && intent.description && !intent.description.toLowerCase().includes('google meet')) {
        intent.description = (intent.description + ' (Google Meet requested)').trim();
      } else if (wantsGoogleMeet && isCreate && !intent.description) {
        intent.description = 'Google Meet requested';
      }
      
      logger.info(
        {
          userId,
          wantsGoogleMeet,
          hasAttendees: !!intent.attendees,
          attendeesCount: intent.attendees?.length || 0,
          attendees: intent.attendees,
        },
        'Google Meet detection and attendee filtering'
      );
      
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
    logger.info(
      {
        userId,
        intentAction: intent.action,
        intentAttendees: intent.attendees,
        intentAttendeesCount: intent.attendees?.length || 0,
        intentAttendeesType: Array.isArray(intent.attendees) ? 'array' : typeof intent.attendees,
        intentAttendeesArray: Array.isArray(intent.attendees) ? intent.attendees : undefined,
      },
      '🚀 Executing calendar operation - FINAL INTENT STATE'
    );
    
    // Get calendar timezone for formatting response
    let calendarTimezone = 'Africa/Johannesburg'; // Default fallback
    try {
      const calendarConnection = await getPrimaryCalendar(db, userId);
      if (calendarConnection) {
        const calendarService = new CalendarService(db);
        calendarTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get calendar timezone for response formatting, using default');
    }
    
    let result;
    try {
      const calendarService = new CalendarService(db);
      // Log one more time right before execute
      logger.info(
        {
          userId,
          intentAttendeesBeforeExecute: intent.attendees,
          intentAttendeesCountBeforeExecute: intent.attendees?.length || 0,
        },
        '📤 About to call calendarService.execute with intent.attendees'
      );
      result = await calendarService.execute(userId, intent);
      logger.info(
        {
          userId,
          success: result.success,
          action: result.action,
          resultEventAttendees: (result.event as any)?.attendees,
          resultEventAttendeesCount: (result.event as any)?.attendees?.length || 0,
        },
        '✅ Calendar operation executed - checking result attendees'
      );
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

    // Helper function to send Google Maps and Google Meet buttons
    const sendEventLinkButtons = async (
      recipient: string,
      userId: string,
      location: string | undefined,
      mapsLink: string | null,
      conferenceUrl: string | undefined
    ): Promise<void> => {
      // Send Google Maps button if location link is available
      if (location && mapsLink) {
        try {
          await whatsappService.sendCTAButtonMessage(recipient, {
            bodyText: `📍 Location: ${location}`,
            buttonText: 'Open in Google Maps',
            buttonUrl: mapsLink,
          });
          
          // Log button message
          try {
            const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
            if (whatsappNumber) {
              await logOutgoingWhatsAppMessage(db, {
                whatsappNumberId: whatsappNumber.id,
                userId,
                messageType: 'interactive',
                messageContent: `Google Maps button: ${mapsLink}`,
                isFreeMessage: true,
              });
            }
          } catch (logError) {
            logger.warn({ error: logError, userId }, 'Failed to log Google Maps button message');
          }
        } catch (error) {
          logger.warn({ error, userId, mapsLink }, 'Failed to send Google Maps button, falling back to text');
          await whatsappService.sendTextMessage(recipient, `📍 *Location:* ${mapsLink}`);
        }
      }
      
      // Send Google Meet button if available
      if (conferenceUrl) {
        try {
          await whatsappService.sendCTAButtonMessage(recipient, {
            bodyText: '🔗 Join the meeting',
            buttonText: 'Join Google Meet',
            buttonUrl: conferenceUrl,
          });
          
          // Log button message
          try {
            const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
            if (whatsappNumber) {
              await logOutgoingWhatsAppMessage(db, {
                whatsappNumberId: whatsappNumber.id,
                userId,
                messageType: 'interactive',
                messageContent: `Google Meet button: ${conferenceUrl}`,
                isFreeMessage: true,
              });
            }
          } catch (logError) {
            logger.warn({ error: logError, userId }, 'Failed to log Google Meet button message');
          }
        } catch (error) {
          logger.warn({ error, userId, conferenceUrl }, 'Failed to send Google Meet button, falling back to text');
          await whatsappService.sendTextMessage(recipient, `🔗 *Link:* ${conferenceUrl}`);
        }
      }
    };

    // Helper function to find matching address and generate Google Maps link
    const getGoogleMapsLinkForLocation = async (location: string | undefined, userId: string): Promise<string | null> => {
      if (!location) return null;
      
      try {
        const addresses = await getUserAddresses(db, userId);
        
        // Try to find matching address by name or full address
        const locationLower = location.toLowerCase().trim();
        
        for (const address of addresses) {
          // Check if location matches address name
          if (address.name.toLowerCase().trim() === locationLower) {
            // Build Google Maps link from coordinates or address
            if (address.latitude != null && address.longitude != null) {
              return `https://www.google.com/maps?q=${address.latitude},${address.longitude}`;
            } else {
              // Build full address string
              const addressParts = [
                address.street,
                address.city,
                address.state,
                address.zip,
                address.country,
              ].filter((part): part is string => typeof part === 'string' && part.trim() !== '');
              
              if (addressParts.length > 0) {
                const fullAddress = addressParts.join(', ');
                return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
              }
            }
          }
          
          // Check if location matches full address
          const addressParts = [
            address.street,
            address.city,
            address.state,
            address.zip,
            address.country,
          ].filter((part): part is string => typeof part === 'string' && part.trim() !== '');
          
          if (addressParts.length > 0) {
            const fullAddress = addressParts.join(', ').toLowerCase();
            if (fullAddress === locationLower || locationLower.includes(fullAddress) || fullAddress.includes(locationLower)) {
              if (address.latitude != null && address.longitude != null) {
                return `https://www.google.com/maps?q=${address.latitude},${address.longitude}`;
              } else {
                return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressParts.join(', '))}`;
              }
            }
          }
        }
        
        // If no match found, create Google Maps link from location string
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
      } catch (error) {
        logger.warn({ error, userId, location }, 'Failed to get Google Maps link for location');
        // Fallback: create Google Maps link from location string
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
      }
    };

    // Send response to user
    let responseMessage: string;
    if (result.success) {
      if (result.action === 'CREATE' && result.event) {
        const fullEvent = result.event as any; // Access conferenceUrl and attendees if available
        
        // Format time as 24-hour format (e.g., "13:40")
        const eventTime = result.event.start.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: calendarTimezone,
        });
        
        // Format date as "3 Jan" (day month) - manually format to ensure correct order
        // toLocaleDateString with 'en-US' returns "Jan 3", so we need to reorder
        const dateStr = result.event.start.toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'short',
          timeZone: calendarTimezone,
        });
        // Split and reorder: "Jan 3" -> ["Jan", "3"] -> "3 Jan"
        const dateParts = dateStr.split(' ');
        const month = dateParts[0] || '';
        const day = dateParts[1] || '';
        const eventDate = `${day} ${month}`;
        
        // Build message text (all in one message with button)
        responseMessage = `✅ *New Event Created*\n\n`;
        responseMessage += `*Title:* ${result.event.title || 'Untitled Event'}\n`;
        responseMessage += `*Date:* ${eventDate}\n`;
        responseMessage += `*Time:* ${eventTime}\n`;
        
        // Determine what to show in Location field:
        // - If location/address exists: show location name (not URL)
        // - If no location OR Google Meet requested: show Google Meet link
        let locationLink: string | null = null;
        let buttonUrl: string | null = null;
        let buttonText: string = '';
        
        if (result.event.location) {
          // User provided location/address - show location name, button will have Google Maps link
          locationLink = await getGoogleMapsLinkForLocation(result.event.location, userId);
          responseMessage += `*Location:* ${result.event.location}\n`;
          if (locationLink) {
            buttonUrl = locationLink;
            buttonText = 'Open in Google Maps';
          }
        } else if (fullEvent.conferenceUrl) {
          // No location but Google Meet exists - use Google Meet in Location field
          responseMessage += `*Location:* ${fullEvent.conferenceUrl}\n`;
          buttonUrl = fullEvent.conferenceUrl;
          buttonText = 'Google Meet';
        }
        
        // Attendees
        if (fullEvent.attendees && fullEvent.attendees.length > 0) {
          const attendeeNames = fullEvent.attendees.map((attendee: string) => {
            if (attendee.includes('@')) {
              const namePart = attendee.split('@')[0];
              if (namePart) {
                return namePart.split('.').map((part: string) =>
                  part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                ).join(' ');
              }
            }
            return attendee;
          });
          responseMessage += `*Invited:* ${attendeeNames.join(', ')}\n`;
        }
        
        // Send as CTA button message if we have a button, otherwise send as text
        if (buttonUrl && buttonText) {
          try {
            await whatsappService.sendCTAButtonMessage(recipient, {
              bodyText: responseMessage.trim(),
              buttonText: buttonText,
              buttonUrl: buttonUrl,
            });
            
            // Log button message
            try {
              const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
              if (whatsappNumber) {
                await logOutgoingWhatsAppMessage(db, {
                  whatsappNumberId: whatsappNumber.id,
                  userId,
                  messageType: 'interactive',
                  messageContent: `${responseMessage.trim()}\n[Button: ${buttonText}]`,
                  isFreeMessage: true,
                });
              }
            } catch (logError) {
              logger.warn({ error: logError, userId }, `Failed to log ${buttonText} button message`);
            }
          } catch (error) {
            logger.warn({ error, userId, buttonUrl }, `Failed to send ${buttonText} button, falling back to text`);
            // Fallback: send as text message with URL
            await whatsappService.sendTextMessage(recipient, `${responseMessage.trim()}\n\n${buttonText}: ${buttonUrl}`);
            
            // Log fallback text message
            try {
              const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
              if (whatsappNumber) {
                await logOutgoingWhatsAppMessage(db, {
                  whatsappNumberId: whatsappNumber.id,
                  userId,
                  messageType: 'text',
                  messageContent: `${responseMessage.trim()}\n\n${buttonText}: ${buttonUrl}`,
                  isFreeMessage: true,
                });
              }
            } catch (logError) {
              logger.warn({ error: logError, userId }, 'Failed to log fallback text message');
            }
          }
        } else {
          // No button, send as regular text message
          await whatsappService.sendTextMessage(recipient, responseMessage);
          
          // Log text message
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
            logger.warn({ error, userId }, 'Failed to log outgoing text message');
          }
        }
        
        // Set responseMessage to empty since we've already sent the messages
        responseMessage = '';
      } else if (result.action === 'UPDATE' && result.event) {
        const fullEvent = result.event as any; // Access conferenceUrl and attendees if available
        
        // Format time as 24-hour format (e.g., "13:40")
        const eventTime = result.event.start.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: calendarTimezone,
        });
        
        // Format date as "3 Jan" (day month) - manually format to ensure correct order
        const dateStr = result.event.start.toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'short',
          timeZone: calendarTimezone,
        });
        // Split and reorder: "Jan 3" -> ["Jan", "3"] -> "3 Jan"
        const dateParts = dateStr.split(' ');
        const month = dateParts[0] || '';
        const day = dateParts[1] || '';
        const eventDate = `${day} ${month}`;
        
        // Build message text with clickable URLs (all in one message)
        responseMessage = `✅ *Event Updated*\n\n`;
        responseMessage += `*Title:* ${result.event.title || 'Untitled Event'}\n`;
        responseMessage += `*Date:* ${eventDate}\n`;
        responseMessage += `*Time:* ${eventTime}\n`;
        
        // Location with clickable Google Maps link
        if (result.event.location) {
          const mapsLink = await getGoogleMapsLinkForLocation(result.event.location, userId);
          if (mapsLink) {
            responseMessage += `*Location:* ${mapsLink}\n`;
          } else {
            responseMessage += `*Location:* ${result.event.location}\n`;
          }
        }
        
        // Google Meet link (if available) - as clickable URL
        if (fullEvent.conferenceUrl) {
          responseMessage += `*Link:* ${fullEvent.conferenceUrl}\n`;
        }
        
        // Attendees
        if (fullEvent.attendees && fullEvent.attendees.length > 0) {
          const attendeeNames = fullEvent.attendees.map((attendee: string) => {
            if (attendee.includes('@')) {
              const namePart = attendee.split('@')[0];
              if (namePart) {
                return namePart.split('.').map((part: string) =>
                  part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                ).join(' ');
              }
            }
            return attendee;
          });
          responseMessage += `*Invited:* ${attendeeNames.join(', ')}\n`;
        }
      } else if (result.action === 'DELETE' && result.event) {
        const fullEvent = result.event as any; // Access conferenceUrl and attendees if available
        
        // Format time as 24-hour format (e.g., "13:40")
        const eventTime = result.event.start.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: calendarTimezone,
        });
        
        // Format date as "3 Jan" (day month) - manually format to ensure correct order
        const dateStr = result.event.start.toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'short',
          timeZone: calendarTimezone,
        });
        // Split and reorder: "Jan 3" -> ["Jan", "3"] -> "3 Jan"
        const dateParts = dateStr.split(' ');
        const month = dateParts[0] || '';
        const day = dateParts[1] || '';
        const eventDate = `${day} ${month}`;
        
        // Build message text with clickable URLs (all in one message)
        responseMessage = `✅ *Event Deleted*\n\n`;
        responseMessage += `*Title:* ${result.event.title || 'Untitled Event'}\n`;
        responseMessage += `*Date:* ${eventDate}\n`;
        responseMessage += `*Time:* ${eventTime}\n`;
        
        // Location with clickable Google Maps link
        if (result.event.location) {
          const mapsLink = await getGoogleMapsLinkForLocation(result.event.location, userId);
          if (mapsLink) {
            responseMessage += `*Location:* ${mapsLink}\n`;
          } else {
            responseMessage += `*Location:* ${result.event.location}\n`;
          }
        }
        
        // Google Meet link (if available) - as clickable URL
        if (fullEvent.conferenceUrl) {
          responseMessage += `*Link:* ${fullEvent.conferenceUrl}\n`;
        }
        
        // Attendees
        if (fullEvent.attendees && fullEvent.attendees.length > 0) {
          const attendeeNames = fullEvent.attendees.map((attendee: string) => {
            if (attendee.includes('@')) {
              const namePart = attendee.split('@')[0];
              if (namePart) {
                return namePart.split('.').map((part: string) =>
                  part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                ).join(' ');
              }
            }
            return attendee;
          });
          responseMessage += `*Invited:* ${attendeeNames.join(', ')}\n`;
        }
      } else if (result.action === 'QUERY' && result.events) {
        if (result.events.length === 0) {
          responseMessage = "📅 *You have no events scheduled.*";
        } else {
          // Determine header based on timeframe or infer from events
          let headerText = "Events:";
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          
          // Check if all events are today
          const allToday = result.events.every((event: any) => {
            const eventDate = new Date(event.start);
            const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
            return eventDay.getTime() === today.getTime();
          });
          
          // Check if all events are tomorrow
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const allTomorrow = result.events.every((event: any) => {
            const eventDate = new Date(event.start);
            const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
            return eventDay.getTime() === tomorrow.getTime();
          });
          
          if (allToday) {
            // Format header with calendar icon and date (e.g., "JUL 17")
            const todayMonth = now.toLocaleDateString('en-US', {
              month: 'short',
              timeZone: calendarTimezone,
            }).toUpperCase();
            const todayDay = now.toLocaleDateString('en-US', {
              day: 'numeric',
              timeZone: calendarTimezone,
            });
            headerText = `📅 *Today's Events:*`;
          } else if (allTomorrow) {
            const tomorrowMonth = tomorrow.toLocaleDateString('en-US', {
              month: 'short',
              timeZone: calendarTimezone,
            }).toUpperCase();
            const tomorrowDay = tomorrow.toLocaleDateString('en-US', {
              day: 'numeric',
              timeZone: calendarTimezone,
            });
            headerText = `📅 *Tomorrow's Events:*`;
          } else {
            headerText = `📅 *Events:*`;
          }
          
          responseMessage = `${headerText}\n\n`;
          
          result.events.slice(0, 10).forEach((event: any, index: number) => {
            const eventStart = new Date(event.start);
            
            // Format time as 24-hour format (e.g., "15:00") in bold
            const eventTime24 = eventStart.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: calendarTimezone,
            });
            
            // Format date as "Sat, 3 Jan" (short weekday, day, short month)
            // We need to manually format to get "day month" order instead of "month day"
            const dateParts = eventStart.toLocaleDateString('en-US', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              timeZone: calendarTimezone,
            }).split(', ');
            const weekday = dateParts[0] || '';
            const monthDay = dateParts[1] || '';
            // Split monthDay to get month and day separately, then reorder
            const monthDayParts = monthDay.split(' ');
            const month = monthDayParts[0] || '';
            const day = monthDayParts[1] || '';
            const eventDate = `${weekday}, ${day} ${month}`;
            
            // Format: Numbered list, title on one line, date and time on next line (indented)
            responseMessage += `*${index + 1}*. ${event.title || 'Untitled Event'}\n${eventDate} | *${eventTime24}*\n\n`;
          });
          
          if (result.events.length > 10) {
            responseMessage += `... and ${result.events.length - 10} more event${result.events.length - 10 !== 1 ? 's' : ''}.`;
          }
        }
      } else {
        responseMessage = result.message || 'Operation completed successfully!';
      }
    } else {
      responseMessage = result.message || "I'm sorry, I couldn't complete that operation. Please try again.";
    }

    // Only send text message if responseMessage is not empty
    // (CREATE, UPDATE, DELETE operations send their own messages with buttons)
    if (responseMessage.trim().length > 0) {
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
    } else {
      // For CREATE/UPDATE/DELETE, log that messages were sent via buttons
      try {
        const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
        if (whatsappNumber) {
          await logOutgoingWhatsAppMessage(db, {
            whatsappNumberId: whatsappNumber.id,
            userId,
            messageType: 'interactive',
            messageContent: 'Event operation completed (sent with buttons)',
            isFreeMessage: true,
          });
        }
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to log outgoing message');
      }
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
      const errorResponse = `❌ *Error Processing Event Request*\n\n${errorMessage}\n\nPlease check the logs for more details or try again.`;
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
        logger.info(
          {
            attendeesStrFromTemplate: attendeesStr,
            template: template,
          },
          '📋 Raw attendees string extracted from template'
        );

        // Filter out "Google Meet" and similar phrases that are not actual attendees
        const googleMeetKeywords = ['google meet', 'meet link', 'video call', 'video meeting', 'meet', 'googlemeet'];
        
        // Split by comma, but also handle "and" as a separator (e.g., "Paul and Liz" or "Paul, Liz and John")
        // First, replace " and " with comma for easier parsing
        const normalizedStr = attendeesStr.replace(/\s+and\s+/gi, ', ');
        logger.info(
          {
            originalAttendeesStr: attendeesStr,
            normalizedStr: normalizedStr,
          },
          '🔄 Normalized attendees string (replaced "and" with commas)'
        );
        
        const splitAttendees = normalizedStr.split(',').map(a => a.trim()).filter(a => a.length > 0);
        logger.info(
          {
            splitAttendees: splitAttendees,
            splitCount: splitAttendees.length,
          },
          '📝 Split attendees by comma'
        );
        
        intent.attendees = splitAttendees.filter(a => {
            const lower = a.toLowerCase().trim();
            // Filter out exact matches for Google Meet keywords
            if (googleMeetKeywords.includes(lower)) {
              logger.info({ filteredAttendee: a, reason: 'exact_keyword_match_in_parse' }, '❌ Filtered out attendee during parsing (exact Google Meet keyword)');
              return false;
            }
            // Filter out if it contains Google Meet keywords as whole words
            const hasGoogleMeetKeyword = googleMeetKeywords.some(keyword => {
              const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
              return regex.test(lower);
            });
            if (hasGoogleMeetKeyword) {
              logger.info({ filteredAttendee: a, reason: 'whole_word_keyword_match_in_parse' }, '❌ Filtered out attendee during parsing (whole word Google Meet keyword)');
            }
            return !hasGoogleMeetKeyword;
          });
        logger.info(
          {
            parsedAttendeesAfterFilter: intent.attendees,
            parsedAttendeesCount: intent.attendees?.length || 0,
            allParsedAttendees: [...(intent.attendees || [])],
          },
          '✅ Parsed attendees after Google Meet filter - FINAL PARSED LIST'
        );
      } else {
        logger.info({ template: template }, 'No attendees found in template');
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
        
        // Handle "reschedule to {date} at {time}" pattern
        // Support both 24-hour (17:00) and 12-hour (5pm) formats
        // Pattern: "reschedule to 2025-12-03 at 17:00" or "reschedule to 2025-12-03 at 5pm"
        // First, try to match the full pattern with date and time separated by "at"
        const rescheduleWithTimeMatch = changes.match(/reschedule\s+(?:to|for)\s+(.+?)\s+at\s+([\d:]+(?:\s*(?:am|pm))?)/i);
        if (rescheduleWithTimeMatch && rescheduleWithTimeMatch[1] && rescheduleWithTimeMatch[2]) {
          intent.startDate = parseRelativeDate(rescheduleWithTimeMatch[1].trim());
          intent.startTime = parseTime(rescheduleWithTimeMatch[2].trim());
        } else {
          // Try to extract new date/time from changes using other patterns
          const dateMatch = changes.match(/date\s+to\s+(.+?)(?:\s|$)/i) 
            || changes.match(/reschedule\s+to\s+(.+?)(?:\s+at|\s|$)/i)
            || changes.match(/(?:on|for)\s+(.+?)(?:\s+at|\s|$)/i)
            || changes.match(/move\s+to\s+(.+?)(?:\s+at|\s|$)/i);
          if (dateMatch && dateMatch[1]) {
            const datePart = dateMatch[1].trim();
            // Check if date part contains time (e.g., "2025-12-03 17:00" or "2025-12-03 at 17:00")
            const dateTimeMatch = datePart.match(/^(.+?)(?:\s+at\s+|\s+)([\d:]+(?:\s*(?:am|pm))?)$/i);
            if (dateTimeMatch && dateTimeMatch[1] && dateTimeMatch[2]) {
              intent.startDate = parseRelativeDate(dateTimeMatch[1].trim());
              intent.startTime = parseTime(dateTimeMatch[2].trim());
            } else {
              intent.startDate = parseRelativeDate(datePart);
            }
          }
          
          // Try to extract time separately if not already extracted
          if (!intent.startTime) {
            const timeMatch = changes.match(/time\s+to\s+([\d:]+(?:\s*(?:am|pm))?)(?:\s|$)/i) 
              || changes.match(/at\s+([\d:]+(?:\s*(?:am|pm))?)(?:\s|$)/i);
            if (timeMatch && timeMatch[1]) {
              intent.startTime = parseTime(timeMatch[1].trim());
            }
          }
        }
        
        // Check if title is being updated
        const titleMatch = changes.match(/title\s+to\s+(.+?)(?:\s|$)/i) 
          || changes.match(/rename\s+to\s+(.+?)(?:\s|$)/i);
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
 * Parse reminder template string to ParsedAction
 * Handles formats like:
 * - "Create a reminder: {title} - schedule: {schedule} - status: {active|paused}"
 * - "Update a reminder: {title} - to: {changes}"
 * - "Delete a reminder: {title}"
 * - "Pause a reminder: {title}"
 * - "Resume a reminder: {title}"
 */
function parseReminderTemplateToAction(
  template: string,
  isCreate: boolean,
  isUpdate: boolean,
  isDelete: boolean,
  isPause: boolean,
  isResume: boolean
): ParsedAction {
  let action: string;
  let resourceType: 'task' | 'folder' | 'note' | 'reminder' | 'event' = 'reminder';
  let reminderTitle: string | undefined;
  let reminderSchedule: string | undefined;
  let reminderStatus: string | undefined;
  let reminderChanges: string | undefined;
  const missingFields: string[] = [];

  if (isCreate) {
    action = 'create';
    // Parse: "Create a reminder: {title} - schedule: {schedule} - status: {active|paused}"
    const titleMatch = template.match(/^Create a reminder:\s*(.+?)(?:\s*-\s*schedule:|\s*-\s*status:|$)/i);
    if (titleMatch && titleMatch[1]) {
      reminderTitle = titleMatch[1].trim();
    } else {
      missingFields.push('reminder title');
    }

    const scheduleMatch = template.match(/\s*-\s*schedule:\s*(.+?)(?:\s*-\s*status:|$)/i);
    if (scheduleMatch && scheduleMatch[1]) {
      reminderSchedule = scheduleMatch[1].trim();
    }

    const statusMatch = template.match(/\s*-\s*status:\s*(.+?)$/i);
    if (statusMatch && statusMatch[1]) {
      reminderStatus = statusMatch[1].trim().toLowerCase();
    }
  } else if (isUpdate) {
    action = 'edit';
    // Parse: "Update a reminder: {title} - to: {changes}"
    const updateMatch = template.match(/^Update a reminder:\s*(.+?)(?:\s*-\s*to:\s*(.+?))?$/i);
    if (updateMatch && updateMatch[1]) {
      reminderTitle = updateMatch[1].trim();
    } else {
      missingFields.push('reminder title');
    }
    if (updateMatch && updateMatch[2]) {
      reminderChanges = updateMatch[2].trim();
    }
  } else if (isDelete) {
    action = 'delete';
    // Parse: "Delete a reminder: {title}"
    const deleteMatch = template.match(/^Delete a reminder:\s*(.+?)$/i);
    if (deleteMatch && deleteMatch[1]) {
      reminderTitle = deleteMatch[1].trim();
    } else {
      missingFields.push('reminder title');
    }
  } else if (isPause) {
    action = 'pause';
    // Parse: "Pause a reminder: {title}"
    const pauseMatch = template.match(/^Pause a reminder:\s*(.+?)$/i);
    if (pauseMatch && pauseMatch[1]) {
      reminderTitle = pauseMatch[1].trim();
    } else {
      missingFields.push('reminder title');
    }
  } else if (isResume) {
    action = 'resume';
    // Parse: "Resume a reminder: {title}"
    const resumeMatch = template.match(/^Resume a reminder:\s*(.+?)$/i);
    if (resumeMatch && resumeMatch[1]) {
      reminderTitle = resumeMatch[1].trim();
    } else {
      missingFields.push('reminder title');
    }
  } else {
    throw new Error('Unknown reminder operation type');
  }

  return {
    action,
    resourceType,
    taskName: reminderTitle, // Reuse taskName field for reminder title
    newName: reminderChanges, // Reuse newName field for reminder changes
    listFilter: reminderSchedule, // Reuse listFilter field for reminder schedule
    status: reminderStatus, // Reuse status field for reminder status
    missingFields,
  };
}

/**
 * Parse relative date strings to YYYY-MM-DD format
 * Handles: today, tomorrow, day names (Friday, Monday), "next Monday", "15 March", "the 12th", etc.
 */
function parseRelativeDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  const lower = trimmed.toLowerCase();
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // FIRST: Check if the date is already in YYYY-MM-DD format
  // If it is, return it as-is (don't parse it, as that can cause timezone issues)
  const yyyyMmDdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMmDdMatch && yyyyMmDdMatch[1] && yyyyMmDdMatch[2] && yyyyMmDdMatch[3]) {
    const year = parseInt(yyyyMmDdMatch[1], 10);
    const month = parseInt(yyyyMmDdMatch[2], 10);
    const day = parseInt(yyyyMmDdMatch[3], 10);
    
    // Validate the date components
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // Return as-is - it's already in the correct format
      return trimmed;
    }
  }
  
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

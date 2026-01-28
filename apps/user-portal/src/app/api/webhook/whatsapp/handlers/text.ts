import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage, logOutgoingWhatsAppMessage, getRecentMessageHistory, getPrimaryCalendar, getWhatsAppCalendars, getUserAddresses, getUserFriends } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, matchesVerificationPhrase } from '@imaginecalendar/whatsapp';
import { WhatsappTextAnalysisService, IntentAnalysisService, type CalendarIntent, calendarIntentSchema } from '@imaginecalendar/ai-services';
import type { WebhookProcessingSummary } from '../types';
import { CalendarService } from './calendar-service';
import { ActionExecutor, type ParsedAction } from './action-executor';

// Store pending event operations waiting for user confirmation (in-memory, keyed by userId)
interface PendingEventOperation {
  intent: CalendarIntent;
  actionTemplate: string;
  originalUserText: string;
  recipient: string;
  timestamp: Date;
}

const pendingEventOperations = new Map<string, PendingEventOperation>();

// OPTIMIZATION: In-memory cache for frequently accessed data (with TTL)
interface CachedData<T> {
  data: T;
  timestamp: number;
}

const cache = {
  calendarConnections: new Map<string, CachedData<any>>(),
  userTimezones: new Map<string, CachedData<string>>(),
  messageHistory: new Map<string, CachedData<Array<{ direction: 'incoming' | 'outgoing'; content: string }>>>(),
  
  // Cache TTL: 30 seconds for calendar/timezone, 10 seconds for message history
  ttl: {
    calendar: 30 * 1000,
    timezone: 30 * 1000,
    history: 10 * 1000,
  },
  
  get<T>(map: Map<string, CachedData<T>>, key: string, ttl: number): T | null {
    const cached = map.get(key);
    if (cached && (Date.now() - cached.timestamp) < ttl) {
      return cached.data;
    }
    if (cached) {
      map.delete(key); // Remove expired entry
    }
    return null;
  },
  
  set<T>(map: Map<string, CachedData<T>>, key: string, data: T): void {
    map.set(key, { data, timestamp: Date.now() });
  },
  
  clear(userId: string): void {
    this.calendarConnections.delete(userId);
    this.userTimezones.delete(userId);
    this.messageHistory.delete(userId);
  },
};

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
    /^Update all reminders:/i,
    /^Move a reminder:/i,
    /^Delete a reminder:/i,
    /^Delete all reminders$/i,
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

  const userId = whatsappNumber.userId;
  const recipient = message.from;
  const whatsappService = new WhatsAppService();

  // Check if user is responding to a pending event operation (conflict resolution)
  const pendingOp = pendingEventOperations.get(userId);
  if (pendingOp) {
    // Check if pending operation is still valid (not older than 5 minutes)
    const ageMinutes = (new Date().getTime() - pendingOp.timestamp.getTime()) / (1000 * 60);
    if (ageMinutes > 5) {
      // Pending operation expired
      pendingEventOperations.delete(userId);
      await whatsappService.sendTextMessage(
        recipient,
        "The pending operation has expired. Please try creating/updating the event again."
      );
      return;
    }
    
    const messageLower = messageText.toLowerCase().trim();
    const isConfirmation = messageLower === 'yes' || messageLower === 'y' || messageLower === 'ok' || messageLower === 'okay' || messageLower === 'confirm' || messageLower === 'proceed' || messageLower === 'leave it as is' || messageLower.includes('leave it') || messageLower.includes('overlap') || messageLower === 'overlap it' || messageLower === 'overlap';
    
    // Check if user provided a new date/time instead of just confirming
    // Look for date/time patterns in the message
    const hasDatePattern = /(?:on|for|at|tomorrow|today|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|january|february|march|april|may|june|july|august|september|october|november|december)/i.test(messageText);
    const hasTimePattern = /(?:at|@)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})?\s*(?:am|pm)/i.test(messageText);
    const hasNewDateTime = hasDatePattern || hasTimePattern;
    
    if (hasNewDateTime && !isConfirmation) {
      // User provided a new date/time - parse it and update the pending intent
      logger.info(
        {
          userId,
          action: pendingOp.intent.action,
          userMessage: messageText,
          hasDatePattern,
          hasTimePattern,
          originalIntent: pendingOp.intent,
        },
        'User provided new date/time for pending event operation'
      );
      
      // Parse date and time from the user's message
      try {
        // Extract date and time from message
        // Patterns: "27th Jan at 17.pm", "27th Jan 17pm", "change it to 27th Jan at 17.pm", etc.
        let parsedDate: string | undefined;
        let parsedTime: string | undefined;
        
        // Try to extract date with month name (e.g., "27th Jan", "27 Jan", "Jan 27th")
        const dateMatch = messageText.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)/i);
        if (dateMatch && dateMatch[1] && dateMatch[2]) {
          const day = dateMatch[1];
          const month = dateMatch[2];
          parsedDate = parseRelativeDate(`${day} ${month}`);
          logger.info({ userId, day, month, parsedDate }, 'Parsed date from conflict response');
        }
        
        // Try to extract time - handle both single time and time range
        // First check for time range: "change time from 15:00 to 16:20", "time from X to Y", etc.
        const timeRangeMatch = messageText.match(/(?:change\s+)?time\s+(?:from|to)\s+(\d{1,2})(?:\.|:)?(\d{2})?\s*(?:\.)?\s*(am|pm)?\s+(?:to|until|-)\s+(\d{1,2})(?:\.|:)?(\d{2})?\s*(?:\.)?\s*(am|pm)?/i);
        if (timeRangeMatch && timeRangeMatch[1] && timeRangeMatch[4]) {
          // Time range detected - extract start and end times
          const startHour = timeRangeMatch[1];
          const startMinute = timeRangeMatch[2] || '00';
          const startPeriod = timeRangeMatch[3] || '';
          const endHour = timeRangeMatch[4];
          const endMinute = timeRangeMatch[5] || '00';
          const endPeriod = timeRangeMatch[6] || '';
          
          // Normalize times
          let normalizedStartHour = startHour;
          let normalizedStartPeriod = startPeriod;
          if (parseInt(startHour) > 12 && startPeriod) {
            normalizedStartHour = String(parseInt(startHour) - 12);
            normalizedStartPeriod = startPeriod;
          }
          
          let normalizedEndHour = endHour;
          let normalizedEndPeriod = endPeriod;
          if (parseInt(endHour) > 12 && endPeriod) {
            normalizedEndHour = String(parseInt(endHour) - 12);
            normalizedEndPeriod = endPeriod;
          }
          
          const startTimeStr = startPeriod 
            ? `${normalizedStartHour}:${startMinute}${normalizedStartPeriod}`.replace(/\./g, '')
            : `${startHour}:${startMinute}`.replace(/\./g, '');
          const endTimeStr = endPeriod 
            ? `${normalizedEndHour}:${endMinute}${normalizedEndPeriod}`.replace(/\./g, '')
            : `${endHour}:${endMinute}`.replace(/\./g, '');
          
          parsedTime = parseTime(startTimeStr);
          // Store endTime separately to add to intent later
          const parsedEndTime = parseTime(endTimeStr);
          logger.info({ userId, startTimeStr, endTimeStr, parsedTime, parsedEndTime }, 'Parsed time range from conflict response');
          
          // Store endTime in pendingOp to use when creating updatedIntent
          (pendingOp as any).parsedEndTime = parsedEndTime;
        } else {
          // Try single time (handle "17.pm", "17pm", "at 17.pm", "at 17:00", etc.)
          // Pattern: optional "at" or "@", then number, optional dot or colon, optional minutes, optional am/pm
          const timeMatch = messageText.match(/(?:at|@|time\s+(?:to|is))?\s*(\d{1,2})(?:\.|:)?(\d{2})?\s*(?:\.)?\s*(am|pm)?/i);
          if (timeMatch && timeMatch[1]) {
            const hour = timeMatch[1];
            const minute = timeMatch[2] || '00';
            const period = timeMatch[3] || '';
            
            // Handle "17.pm" format - if hour > 12 and period is pm, it's likely a typo (should be 5pm)
            // But also handle "17pm" as 17:00 (5pm) in 12-hour format
            let normalizedHour = hour;
            let normalizedPeriod = period;
            
            // If hour > 12 and has period, treat as 12-hour format (e.g., "17pm" = 5pm)
            if (parseInt(hour) > 12 && period) {
              normalizedHour = String(parseInt(hour) - 12);
              normalizedPeriod = period;
            }
            
            // Normalize "17.pm" to "17pm" by removing dot, or use normalized values
            const timeStr = period 
              ? `${normalizedHour}:${minute}${normalizedPeriod}`.replace(/\./g, '')
              : `${hour}:${minute}`.replace(/\./g, '');
            
            parsedTime = parseTime(timeStr);
            logger.info({ userId, hour, minute, period, normalizedHour, normalizedPeriod, timeStr, parsedTime }, 'Parsed single time from conflict response');
          }
        }
        
        // If we found date or time, update the intent and re-execute
        if (parsedDate || parsedTime) {
          // Remove from pending operations
          pendingEventOperations.delete(userId);
          
          // Update the intent with new date/time
          const updatedIntent: CalendarIntent = {
            ...pendingOp.intent,
            ...(parsedDate ? { startDate: parsedDate } : {}),
            ...(parsedTime ? { startTime: parsedTime } : {}),
          };
          
          logger.info(
            {
              userId,
              action: pendingOp.intent.action,
              originalDate: pendingOp.intent.startDate,
              originalTime: pendingOp.intent.startTime,
              newDate: parsedDate,
              newTime: parsedTime,
              updatedIntent,
            },
            'Updated pending event intent with new date/time, re-executing operation'
          );
          
          // Re-execute the event operation with updated intent
          // Directly call calendar service with updated intent (bypass template parsing)
          try {
            const calendarService = new CalendarService(db);
            
            logger.info(
              {
                userId,
                action: updatedIntent.action,
                updatedDate: updatedIntent.startDate,
                updatedTime: updatedIntent.startTime,
                originalIntent: pendingOp.intent,
              },
              'Re-executing event operation with updated date/time from conflict response'
            );
            
            // Execute the operation with updated intent
            let result;
            if (updatedIntent.action === 'CREATE') {
              result = await calendarService.create(userId, updatedIntent);
            } else if (updatedIntent.action === 'UPDATE') {
              result = await calendarService.update(userId, updatedIntent);
            } else {
              throw new Error(`Unsupported action: ${updatedIntent.action}`);
            }
            
            // Handle the result
            if (result.success && result.event) {
              const event = result.event;
              const eventDate = new Date(event.start);
              
              // Get calendar timezone for formatting
              let calendarTimezone = 'Africa/Johannesburg';
              try {
                const calendarConnection = await getPrimaryCalendar(db, userId);
                if (calendarConnection) {
                  calendarTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
                }
              } catch (error) {
                logger.warn({ error, userId }, 'Failed to get calendar timezone for response formatting');
              }
              
              const eventTime = eventDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: calendarTimezone,
              });
              const eventDateStr = eventDate.toLocaleDateString('en-US', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                timeZone: calendarTimezone,
              });
              
              let successMessage = `✅ *Event ${updatedIntent.action === 'CREATE' ? 'Created' : 'Updated'}*\n\n`;
              successMessage += `*Title:* ${event.title || 'Untitled Event'}\n`;
              successMessage += `*Date:* ${eventDateStr}\n`;
              successMessage += `*Time:* ${eventTime}\n`;
              if (event.location) {
                successMessage += `*Location:* ${event.location}\n`;
              }
              
              await whatsappService.sendTextMessage(pendingOp.recipient, successMessage);
              
              // Log outgoing message
              logOutgoingMessageNonBlocking(db, pendingOp.recipient, userId, successMessage);
            } else if (result.requiresConfirmation && result.conflictEvents) {
              // New conflict detected with the updated time - store and ask again
              pendingEventOperations.set(userId, {
                intent: updatedIntent,
                actionTemplate: pendingOp.actionTemplate,
                originalUserText: pendingOp.originalUserText + ' ' + messageText,
                recipient: pendingOp.recipient,
                timestamp: new Date(),
              });
              
              await whatsappService.sendTextMessage(pendingOp.recipient, result.message || 'Event conflict detected. Please confirm to proceed.');
              logOutgoingMessageNonBlocking(db, pendingOp.recipient, userId, result.message || 'Event conflict detected. Please confirm to proceed.');
            } else {
              await whatsappService.sendTextMessage(
                pendingOp.recipient,
                result.message || `Event ${updatedIntent.action === 'CREATE' ? 'created' : 'updated'} successfully.`
              );
              logOutgoingMessageNonBlocking(db, pendingOp.recipient, userId, result.message || `Event ${updatedIntent.action === 'CREATE' ? 'created' : 'updated'} successfully.`);
            }
          } catch (error) {
            logger.error({ error, userId, updatedIntent }, 'Failed to re-execute event operation with updated date/time');
            await whatsappService.sendTextMessage(
              pendingOp.recipient,
              "I'm sorry, I encountered an error while updating the event with the new date/time. Please try again."
            );
          }
          
          return; // Exit early
        } else {
          // Couldn't parse date/time, fall back to AI analysis with full context
          logger.warn({ userId, messageText }, 'Could not parse date/time from message, falling back to AI analysis with context');
          // CRITICAL: Include the original CREATE request and conflict context
          // This helps AI understand this is a continuation of CREATE, not a new UPDATE
          const contextualMessage = `I was trying to create an event: "${pendingOp.originalUserText}". There was a conflict, and now I'm providing a new time: "${messageText}". Please create the event with this new time.`;
          pendingEventOperations.delete(userId);
          
          // Get message history to include conflict message
          let messageHistory: Array<{ direction: 'incoming' | 'outgoing'; content: string }> = [];
          try {
            const history = await getRecentMessageHistory(db, userId, 10);
            messageHistory = history
              .filter(msg => msg.content && msg.content.trim().length > 0)
              .slice(0, 10)
              .map(msg => ({
                direction: msg.direction,
                content: msg.content,
              }));
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to retrieve message history for conflict response');
          }
          
          await analyzeAndRespond(contextualMessage, recipient, userId, db, messageHistory);
          return;
        }
      } catch (error) {
        logger.error({ error, userId, messageText }, 'Failed to parse and update date/time from user message');
        // Fall back to AI analysis with full context
        const contextualMessage = `I was trying to create an event: "${pendingOp.originalUserText}". There was a conflict, and now I'm providing a new time: "${messageText}". Please create the event with this new time.`;
        pendingEventOperations.delete(userId);
        
        // Get message history to include conflict message
        let messageHistory: Array<{ direction: 'incoming' | 'outgoing'; content: string }> = [];
        try {
          const history = await getRecentMessageHistory(db, userId, 10);
          messageHistory = history
            .filter(msg => msg.content && msg.content.trim().length > 0)
            .slice(0, 10)
            .map(msg => ({
              direction: msg.direction,
              content: msg.content,
            }));
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to retrieve message history for conflict response');
        }
        
        await analyzeAndRespond(contextualMessage, recipient, userId, db, messageHistory);
        return;
      }
    } else if (isConfirmation) {
      // User confirmed - proceed with the operation (leave it as is / overlap)
      logger.info(
        {
          userId,
          action: pendingOp.intent.action,
          pendingSince: pendingOp.timestamp.toISOString(),
        },
        'User confirmed pending event operation, proceeding with overlap'
      );
      
      // Remove from pending operations
      pendingEventOperations.delete(userId);
      
      // Proceed with the operation (bypass conflict check by setting bypassConflictCheck flag)
      try {
        const calendarService = new CalendarService(db);
        // Set bypass flag to skip conflict check since user confirmed
        const intentWithBypass = {
          ...pendingOp.intent,
          bypassConflictCheck: true,
        };
        
        let result;
        if (pendingOp.intent.action === 'CREATE') {
          result = await calendarService.create(userId, intentWithBypass as CalendarIntent);
        } else if (pendingOp.intent.action === 'UPDATE') {
          result = await calendarService.update(userId, intentWithBypass as CalendarIntent);
        } else {
          throw new Error(`Unsupported action: ${pendingOp.intent.action}`);
        }
        
        // Format and send success message
        if (result.success && result.event) {
          const event = result.event;
          const eventDate = new Date(event.start);
          
          // Get calendar timezone for formatting
          let calendarTimezone = 'Africa/Johannesburg';
          try {
            const calendarConnection = await getPrimaryCalendar(db, userId);
            if (calendarConnection) {
              calendarTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
            }
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to get calendar timezone for response formatting');
          }
          
          const eventTime = eventDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: calendarTimezone,
          });
          const eventDateStr = eventDate.toLocaleDateString('en-US', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            timeZone: calendarTimezone,
          });
          
          let successMessage = `✅ *Event ${pendingOp.intent.action === 'CREATE' ? 'Created' : 'Updated'}*\n\n`;
          successMessage += `*Title:* ${event.title || 'Untitled Event'}\n`;
          successMessage += `*Date:* ${eventDateStr}\n`;
          successMessage += `*Time:* ${eventTime}\n`;
          if (event.location) {
            successMessage += `*Location:* ${event.location}\n`;
          }
          
          await whatsappService.sendTextMessage(recipient, successMessage);
        } else {
          await whatsappService.sendTextMessage(
            recipient,
            result.message || `Event ${pendingOp.intent.action === 'CREATE' ? 'created' : 'updated'} successfully.`
          );
        }
      } catch (error) {
        logger.error({ error, userId }, 'Failed to proceed with confirmed event operation');
        await whatsappService.sendTextMessage(
          recipient,
          "I'm sorry, I encountered an error while processing your confirmation. Please try again."
        );
      }
      return; // Exit early after handling confirmation
    }
    // If neither confirmation nor new date/time, continue with normal processing
    // (user might be asking something else, or the message will be processed normally)
  }

  // OPTIMIZATION: Non-blocking logging and typing indicator (fire-and-forget)
  // Don't await these operations to improve response time
  logIncomingWhatsAppMessage(db, {
      whatsappNumberId: whatsappNumber.id,
      userId: whatsappNumber.userId,
      messageId: message.id,
      messageType: 'text',
      messageContent: messageText, // Store message content for history
  }).catch((error) => {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to log incoming text message'
    );
  });

  // Send typing indicator in parallel (don't await)
  sendTypingIndicatorSafely(message.from, message.id).catch((error) => {
    logger.warn({ error, senderPhone: message.from }, 'Failed to send typing indicator');
  });

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
  db: Database,
  providedMessageHistory?: Array<{ direction: 'incoming' | 'outgoing'; content: string }>
): Promise<void> {
  const analyzer = new WhatsappTextAnalysisService();
  const whatsappService = new WhatsAppService();

  // OPTIMIZATION: Check cache first, then parallelize independent database queries
  // Use provided history if available, otherwise check cache
  let messageHistory = providedMessageHistory || cache.get(cache.messageHistory, userId, cache.ttl.history);
  let calendarConnection = cache.get(cache.calendarConnections, userId, cache.ttl.calendar);
  let userTimezone = cache.get(cache.userTimezones, userId, cache.ttl.timezone);
  
  // If not in cache, fetch in parallel
  if (!messageHistory || !calendarConnection || !userTimezone) {
    const [historyResult, calendarResult] = await Promise.allSettled([
      messageHistory ? Promise.resolve(null) : getRecentMessageHistory(db, userId, 10),
      calendarConnection ? Promise.resolve(null) : getPrimaryCalendar(db, userId),
    ]);

    // Process message history
    if (!messageHistory) {
      if (historyResult.status === 'fulfilled' && historyResult.value) {
        messageHistory = historyResult.value
      .filter(msg => msg.content && msg.content.trim().length > 0)
      .slice(0, 10) // Ensure we only use last 10
      .map(msg => ({
        direction: msg.direction,
        content: msg.content,
      }));
        cache.set(cache.messageHistory, userId, messageHistory);
      } else {
        logger.warn({ error: historyResult.status === 'rejected' ? historyResult.reason : 'No history', userId }, 'Failed to retrieve message history, continuing without history');
        messageHistory = [];
      }
  }

  // Get user's calendar timezone for accurate date/time context (used for AI analysis and list operations)
    if (!userTimezone) {
      userTimezone = 'Africa/Johannesburg'; // Default fallback
      if (calendarResult.status === 'fulfilled' && calendarResult.value) {
  try {
          calendarConnection = calendarResult.value;
          cache.set(cache.calendarConnections, userId, calendarConnection);
          
      const calendarService = new CalendarService(db);
      // Access the private getUserTimezone method using bracket notation
      // This method will fetch timezone from calendar, fallback to user preferences, then default
      userTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
          cache.set(cache.userTimezones, userId, userTimezone);
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to get user timezone, using default');
        }
      } else {
        logger.warn({ error: calendarResult.status === 'rejected' ? calendarResult.reason : 'No calendar', userId }, 'Failed to get calendar connection, using default timezone');
      }
    } else if (!calendarConnection) {
      // We have timezone but not connection - try to get it for future use
      if (calendarResult.status === 'fulfilled' && calendarResult.value) {
        calendarConnection = calendarResult.value;
        cache.set(cache.calendarConnections, userId, calendarConnection);
      }
    }
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
    const titleMatch = aiResponse.match(/^Title:\s*(shopping|reminder|event|friend|verification|normal)/i);
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
    
    // CRITICAL: Use AI to analyze if user wants to view an event by number
    // This must happen BEFORE any other processing to catch cases where AI misclassifies
    if (originalUserText) {
      try {
        // OPTIMIZATION: Reuse cached message history and timezone if available
        // OPTIMIZATION: Use cache first
        let eventViewMessageHistory = messageHistory || cache.get(cache.messageHistory, userId, cache.ttl.history) || [];
        let eventViewTimezone = userTimezone || 'Africa/Johannesburg';
        
        // Only fetch if we don't have cached data
        if (eventViewMessageHistory.length === 0) {
        try {
          const history = await getRecentMessageHistory(db, userId, 10);
            eventViewMessageHistory = history
            .filter(msg => msg.content && msg.content.trim().length > 0)
            .slice(0, 10)
            .map(msg => ({
              direction: msg.direction,
              content: msg.content,
            }));
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to retrieve message history for event view analysis');
          }
        }

        // Only fetch timezone if not already cached
        if (!userTimezone || userTimezone === 'Africa/Johannesburg') {
        try {
          const calendarConnection = await getPrimaryCalendar(db, userId);
          if (calendarConnection) {
            const calendarService = new CalendarService(db);
            eventViewTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to get timezone for event view analysis, using default');
          }
        }

        // Analyze with AI
        const analyzer = new WhatsappTextAnalysisService();
        const eventViewAnalysis = await analyzer.analyzeEventViewRequest(originalUserText, {
          messageHistory: eventViewMessageHistory,
          currentDate: new Date(),
          timezone: eventViewTimezone,
        });

        logger.info(
          {
            userId,
            originalUserText,
            eventViewAnalysis,
          },
          '🔍 AI Analysis: Event view request detection'
        );

        // If AI detected an event view request with numbers, handle it
        if (eventViewAnalysis.isEventViewRequest && eventViewAnalysis.eventNumbers && eventViewAnalysis.eventNumbers.length > 0) {
          const executor = new ActionExecutor(db, userId, whatsappService, recipient);
          
          // OPTIMIZATION: Reuse cached timezone
          const eventTimezone = eventViewTimezone;

          // Handle multiple event numbers
          if (eventViewAnalysis.eventNumbers.length > 1) {
            logger.info(
              {
                userId,
                eventNumbers: eventViewAnalysis.eventNumbers,
                originalUserText,
                aiReasoning: eventViewAnalysis.reasoning,
              },
              '✅ AI detected multiple event view requests, showing each event overview'
            );

            // OPTIMIZATION: Parallelize multiple event number processing
            const eventPromises = eventViewAnalysis.eventNumbers.map(async (eventNumber) => {
              const eventActionTemplate = `Show event details: ${eventNumber}`;
              const parsed = executor.parseAction(eventActionTemplate);
              if (parsed) {
                parsed.resourceType = 'event';
                const result = await executor.executeAction(parsed, eventTimezone);
                return { eventNumber, result, parsed: true };
              }
              return { eventNumber, result: null, parsed: false };
            });
            
            const eventResults = await Promise.allSettled(eventPromises);
            
            // Send messages in order (but processed in parallel)
            for (const result of eventResults) {
              if (result.status === 'fulfilled' && result.value.parsed && result.value.result) {
                const { result: execResult } = result.value;
                if (execResult.success && execResult.message) {
                  await whatsappService.sendTextMessage(recipient, execResult.message);
                  logOutgoingMessageNonBlocking(db, recipient, userId, execResult.message);
                } else if (!execResult.success && execResult.message) {
                  await whatsappService.sendTextMessage(recipient, execResult.message);
                }
              }
            }
          } else {
            // Single event number
            const eventNumber = eventViewAnalysis.eventNumbers[0]!;
            const eventActionTemplate = `Show event details: ${eventNumber}`;
            
            logger.info(
              {
                userId,
                originalTitleType: titleType,
                originalAction: actionTemplate,
                convertedAction: eventActionTemplate,
                extractedNumber: eventNumber,
                originalUserText,
                aiReasoning: eventViewAnalysis.reasoning,
                reason: 'ai_based_event_view_detection'
              },
              '✅ AI Analysis: User wants to view event by number, routing to event overview'
            );
            
            const parsed = executor.parseAction(eventActionTemplate);
            if (parsed) {
              parsed.resourceType = 'event';
              const result = await executor.executeAction(parsed, eventTimezone);
              
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
              } else if (!result.success && result.message) {
                await whatsappService.sendTextMessage(recipient, result.message);
              }
            }
          }
          return; // Exit early, don't process further (even if AI said "normal")
        }
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            userId,
            originalUserText,
          },
          'Failed to analyze event view request with AI, continuing with normal flow'
        );
        // Continue with normal processing if AI analysis fails
      }
    }
    
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
            // OPTIMIZATION: Non-blocking logging
            logOutgoingMessageNonBlocking(db, recipient, userId, result.message);
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
    // BUT: Check if it's actually an event view request that AI misclassified as "normal"
    if (titleType === 'normal') {
      // Before sending "normal" response, use AI to check if user actually wants event info by number
      // This prevents AI from sending error messages when user clearly wants event overview
      if (originalUserText) {
        try {
          // Get message history for context
          let messageHistory: Array<{ direction: 'incoming' | 'outgoing'; content: string }> = [];
          try {
            const history = await getRecentMessageHistory(db, userId, 10);
            messageHistory = history
              .filter(msg => msg.content && msg.content.trim().length > 0)
              .slice(0, 10)
              .map(msg => ({
                direction: msg.direction,
                content: msg.content,
              }));
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to retrieve message history for event view analysis');
          }

          // Get user's calendar timezone
          let eventViewTimezone = userTimezone || 'Africa/Johannesburg';
          try {
            const calendarConnection = await getPrimaryCalendar(db, userId);
            if (calendarConnection) {
              const calendarService = new CalendarService(db);
              eventViewTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
            }
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to get timezone for event view analysis, using default');
          }

          // Analyze with AI
          const analyzer = new WhatsappTextAnalysisService();
          const eventViewAnalysis = await analyzer.analyzeEventViewRequest(originalUserText, {
            messageHistory,
            currentDate: new Date(),
            timezone: eventViewTimezone,
          });

          logger.info(
            {
              userId,
              originalUserText,
              eventViewAnalysis,
              titleType,
            },
            '🔍 AI Analysis: Checking if "normal" title is actually event view request'
          );

          // If AI detected an event view request with numbers, handle it
          if (eventViewAnalysis.isEventViewRequest && eventViewAnalysis.eventNumbers && eventViewAnalysis.eventNumbers.length > 0) {
            const executor = new ActionExecutor(db, userId, whatsappService, recipient);
            
            // Get timezone for event operations
            let eventTimezone = eventViewTimezone;
            try {
              const calendarConnection = await getPrimaryCalendar(db, userId);
              if (calendarConnection) {
                const calendarService = new CalendarService(db);
                eventTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
              }
            } catch (error) {
              logger.warn({ error, userId }, 'Failed to get timezone for event operation, using default');
            }

            // Handle multiple event numbers
            if (eventViewAnalysis.eventNumbers.length > 1) {
              logger.info(
                {
                  userId,
                  eventNumbers: eventViewAnalysis.eventNumbers,
                  originalUserText,
                  aiReasoning: eventViewAnalysis.reasoning,
                },
                '✅ AI detected multiple event view requests in "normal" title, showing each event overview'
              );

              // Show event overview for each requested number
              for (const eventNumber of eventViewAnalysis.eventNumbers) {
                const eventActionTemplate = `Show event details: ${eventNumber}`;
                const parsed = executor.parseAction(eventActionTemplate);
                if (parsed) {
                  parsed.resourceType = 'event';
                  const result = await executor.executeAction(parsed, eventTimezone);
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
                  } else if (!result.success && result.message) {
                    await whatsappService.sendTextMessage(recipient, result.message);
                  }
                }
              }
            } else {
              // Single event number
              const eventNumber = eventViewAnalysis.eventNumbers[0]!;
              const eventActionTemplate = `Show event details: ${eventNumber}`;
              
              logger.info(
                {
                  userId,
                  originalTitleType: titleType,
                  originalAction: actionTemplate,
                  convertedAction: eventActionTemplate,
                  extractedNumber: eventNumber,
                  originalUserText,
                  aiReasoning: eventViewAnalysis.reasoning,
                  reason: 'ai_override_normal_title_for_event_view_request'
                },
                '✅ AI Analysis: Overriding "normal" title - User wants to view event by number'
              );
              
              const parsed = executor.parseAction(eventActionTemplate);
              if (parsed) {
                parsed.resourceType = 'event';
                const result = await executor.executeAction(parsed, eventTimezone);
                
                if (result.success && result.message) {
                  await whatsappService.sendTextMessage(recipient, result.message);
                  
                  // OPTIMIZATION: Non-blocking logging
                  logOutgoingMessageNonBlocking(db, recipient, userId, result.message);
                } else if (!result.success && result.message) {
                  await whatsappService.sendTextMessage(recipient, result.message);
                }
              }
            }
            return; // Exit early, don't send AI's "normal" response
          }
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
              userId,
              originalUserText,
            },
            'Failed to analyze event view request with AI in normal title section, continuing with normal flow'
          );
          // Continue with normal processing if AI analysis fails
        }
      }
      
      // For Normal conversations, the actionTemplate is the natural response
      // Send it to the user
      await whatsappService.sendTextMessage(recipient, actionTemplate);
      
      // OPTIMIZATION: Non-blocking logging
      logOutgoingMessageNonBlocking(db, recipient, userId, actionTemplate);
      
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
      
      const userTextLower = originalUserText?.toLowerCase() || '';
      
      // CRITICAL: Use AI to check for number-based view requests FIRST (before timeframe check)
      // If user says "show me 1" or "show info on 1" or "show me 1, 2 and 3", ALWAYS treat as view operation
      // regardless of what the AI generated (even if it's "List events: all")
      let requestedNumbers: number[] = [];
      let isNumberBasedViewRequest = false;
      
      if (originalUserText) {
        try {
          // Get message history for context
          let messageHistory: Array<{ direction: 'incoming' | 'outgoing'; content: string }> = [];
          try {
            const history = await getRecentMessageHistory(db, userId, 10);
            messageHistory = history
              .filter(msg => msg.content && msg.content.trim().length > 0)
              .slice(0, 10)
              .map(msg => ({
                direction: msg.direction,
                content: msg.content,
              }));
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to retrieve message history for event view analysis');
          }

          // Get user's calendar timezone
          let eventViewTimezone = userTimezone || 'Africa/Johannesburg';
          try {
            const calendarConnection = await getPrimaryCalendar(db, userId);
            if (calendarConnection) {
              const calendarService = new CalendarService(db);
              eventViewTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
            }
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to get timezone for event view analysis, using default');
          }

          // Analyze with AI
          const analyzer = new WhatsappTextAnalysisService();
          const eventViewAnalysis = await analyzer.analyzeEventViewRequest(originalUserText, {
            messageHistory,
            currentDate: new Date(),
            timezone: eventViewTimezone,
          });

          logger.info(
            {
              userId,
              originalUserText,
              eventViewAnalysis,
              actionTemplate,
            },
            '🔍 AI Analysis: Checking if "List events" is actually event view request'
          );

          // If AI detected an event view request with numbers, use those numbers
          if (eventViewAnalysis.isEventViewRequest && eventViewAnalysis.eventNumbers && eventViewAnalysis.eventNumbers.length > 0) {
            isNumberBasedViewRequest = true;
            requestedNumbers = eventViewAnalysis.eventNumbers;
          }
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
              userId,
              originalUserText,
            },
            'Failed to analyze event view request with AI in list events section, continuing with normal flow'
          );
          // Continue with normal processing if AI analysis fails
        }
      }
      
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
      
      // CRITICAL: Check if user said "events" (plural) - this ALWAYS means list, never view!
      const hasEventsPlural = /\bevents\b/i.test(userTextLower);
      const hasEventSingular = /\bevent\b(?!s)/i.test(userTextLower); // event without 's' after it
      
      // If user said "events" (plural), NEVER convert to view - it's always a list operation
      let isListEventsWithName = false;
      if (hasEventsPlural) {
        logger.info(
          {
            userId,
            originalUserText,
            actionTemplate,
            reason: 'user_said_events_plural_always_list'
          },
          'User said "events" (plural) - treating as list operation, NOT view'
        );
        // Skip the view conversion logic - isListEventsWithName stays false, so we continue to list operation
      } else {
        // Only check for view if user said "event" (singular), not "events" (plural)
      // Check if user wants to view a specific event (not list all events)
      // CRITICAL: If user says a number, ALWAYS treat as view operation (even if AI generated timeframe)
      // Only convert if:
      // 1. User says a number (always view) OR
      // 2. It's NOT a timeframe keyword AND user explicitly says "show me event [name]" or "show me [name] event"
      // Check for timeframe keywords as whole words (not substrings)
      const hasTimeframeInUserText = timeframeKeywords.some(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        // Check for whole word matches using word boundaries
        const regex = new RegExp(`\\b${lowerKeyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
        return regex.test(userTextLower);
      });
      
      const userWantsToView = isNumberBasedViewRequest || (!isTimeframe && (
          // "show me event [name]" or "show me event- [name]" - explicit event keyword with name (SINGULAR)
          userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?(?:the\s+)?event(?!s)\s*[-]?\s*["']?([^"']+)/i) ||
          // "show me [name] event" - name followed by event keyword (SINGULAR)
          userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?["']?([^"']+)\s+event(?!s)["']?/i) ||
        // "send info on [name]" - send info pattern with name
        userTextLower.match(/(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+["']?([^"']+)/i) ||
        // "show me [specific event name]" - but NOT if user text contains timeframe keywords
          (hasEventSingular && !hasTimeframeInUserText && userTextLower.match(/(?:show|view|get|see|send)\s+(?:me\s+)?(?:the\s+)?event(?!s)\s*[-]?\s*["']?([^"']+)/i))
      ));
      
      // Also check if user text clearly indicates viewing a specific event, even if AI generated wrong action
      // This handles cases where AI generates "List events: today" but user said "show me event [name]"
      let eventNameFromUserText: string | null = null;
        if (originalUserText && hasEventSingular && !hasTimeframeInUserText) {
        // Try to extract event name from "show me event [name]" or "show me event- [name]"
          const eventNameMatch1 = originalUserText.match(/(?:show|view|get|see)\s+(?:me\s+)?(?:the\s+)?event(?!s)\s*[-]?\s*["']?([^"']+)/i);
        if (eventNameMatch1 && eventNameMatch1[1]) {
          eventNameFromUserText = eventNameMatch1[1].trim();
        } else {
          // Try "show me [name] event"
            const eventNameMatch2 = originalUserText.match(/(?:show|view|get|see)\s+(?:me\s+)?["']?([^"']+)\s+event(?!s)["']?/i);
          if (eventNameMatch2 && eventNameMatch2[1]) {
            eventNameFromUserText = eventNameMatch2[1].trim();
          }
        }
      }
      
      // CRITICAL: If user said a number, ALWAYS treat as view operation (even if AI generated timeframe)
        isListEventsWithName = isNumberBasedViewRequest || (hasEventNameInList && userWantsToView && !isTimeframe) || (eventNameFromUserText !== null);
      }
      
      if (isListEventsWithName) {
        // Convert to show event details operation
        let eventActionTemplate = actionTemplate;
        
        // CRITICAL: If user said a number (or multiple numbers), extract and handle them
        if (isNumberBasedViewRequest && requestedNumbers.length > 0) {
          // If multiple numbers, show each event overview in sequence
          if (requestedNumbers.length > 1) {
            logger.info(
              {
                userId,
                originalAction: actionTemplate,
                requestedNumbers,
                originalUserText,
                reason: 'multiple_number_based_view_early_detection'
              },
              '✅ Early detection: Multiple numbers detected, will show event overviews for each'
            );
            
            // OPTIMIZATION: Use cached timezone or fetch once
            let eventTimezone = userTimezone || cache.get(cache.userTimezones, userId, cache.ttl.timezone) || 'Africa/Johannesburg';
            if (!userTimezone || eventTimezone === 'Africa/Johannesburg') {
            try {
                const calendarConnection = cache.get(cache.calendarConnections, userId, cache.ttl.calendar) || await getPrimaryCalendar(db, userId);
              if (calendarConnection) {
                  if (!cache.get(cache.calendarConnections, userId, cache.ttl.calendar)) {
                    cache.set(cache.calendarConnections, userId, calendarConnection);
                  }
                const calendarService = new CalendarService(db);
                eventTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
                  cache.set(cache.userTimezones, userId, eventTimezone);
              }
            } catch (error) {
              logger.warn({ error, userId }, 'Failed to get timezone for event operation, using default');
              }
            }
            
            // OPTIMIZATION: Parallelize multiple event number processing
            const eventPromises = requestedNumbers.map(async (eventNumber) => {
              const eventActionTemplate = `Show event details: ${eventNumber}`;
              const parsed = executor.parseAction(eventActionTemplate);
              if (parsed) {
                parsed.resourceType = 'event';
                const result = await executor.executeAction(parsed, eventTimezone);
                return { eventNumber, result, parsed: true };
              }
              return { eventNumber, result: null, parsed: false };
            });
            
            const eventResults = await Promise.allSettled(eventPromises);
            
            // Send messages in order (but processed in parallel)
            for (const result of eventResults) {
              if (result.status === 'fulfilled' && result.value.parsed && result.value.result) {
                const { result: execResult } = result.value;
                if (execResult.message.trim().length > 0) {
                  await whatsappService.sendTextMessage(recipient, execResult.message);
                  logOutgoingMessageNonBlocking(db, recipient, userId, execResult.message);
                }
              }
            }
            return; // Exit early after handling multiple events
          } else {
            // Single number - use existing logic
            // Support patterns like "show meeting info for 4", "show info for number 4", etc.
            const numberMatch = userTextLower.match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:meeting\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(?:number\s+)?(\d+)$/i) ||
                               userTextLower.match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) ||
                               userTextLower.match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(?:number\s+)?(\d+)$/i) ||
                               userTextLower.match(/^(?:show|view|get|see)\s+(?:me\s+)?(\d+)$/i);
            if (numberMatch && numberMatch[1]) {
              eventActionTemplate = `Show event details: ${numberMatch[1]}`;
              logger.info(
                {
                  userId,
                  originalAction: actionTemplate,
                  convertedAction: eventActionTemplate,
                  extractedNumber: numberMatch[1],
                  originalUserText,
                  reason: 'number_based_view_early_detection'
                },
                '✅ Early detection: Extracted number from user text for number-based view request'
              );
            }
          }
        } else if (eventNameFromUserText) {
          // Prefer event name from user text if available (more accurate than AI's interpretation)
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
    if (isListOperation && (titleType === 'shopping' || titleType === 'reminder' || titleType === 'event' || titleType === 'friend')) {
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
            // OPTIMIZATION: Non-blocking logging
            logOutgoingMessageNonBlocking(db, recipient, userId, `🤖 AI Response:\n${aiResponse.substring(0, 500)}`);
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
                // OPTIMIZATION: Non-blocking logging
                logOutgoingMessageNonBlocking(db, recipient, userId, result.message);
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
      
      // Send combined results to user (filter out empty messages from button sends)
      const nonEmptyResults = results.filter(r => r.trim().length > 0);
      if (nonEmptyResults.length > 0) {
        // Group similar messages together
        const shoppingItems: string[] = [];
        const purchasedItems: string[] = [];
        const reopenedItems: string[] = [];
        let shoppingListLabel: string | null = null;
        const tasks: string[] = [];
        const notes: string[] = [];
        const events: string[] = [];
        const reminders: string[] = [];
        const otherMessages: string[] = [];
        
        for (const result of nonEmptyResults) {
          // Check for shopping item additions
          if (result.startsWith('SHOPPING_ITEM_ADDED:')) {
            shoppingItems.push(result.replace('SHOPPING_ITEM_ADDED:', ''));
          } else if (
            // Match both singular and plural forms, and our current formatted header
            result.includes('Added to ') && result.includes(' List:')
          ) {
            // Extract item name from "✅ *Added to {ListName} List:*\nItem/s: {item}"
            // or from legacy format: 'Added "{item}" to Shopping List(s)'
            let itemName: string | null = null;
            // Try to extract list label from header once
            if (!shoppingListLabel) {
              const headerMatch = result.match(/Added to\s+(.+?)\s+List:/i);
              if (headerMatch && headerMatch[1]) {
                shoppingListLabel = headerMatch[1].trim();
              }
            }
            const match1 = result.match(/Item\/s:\s*([^\n]+)/i);
            if (match1 && match1[1]) {
              itemName = match1[1].trim();
            } else {
              const match2 = result.match(/Added\s+"([^"]+)"\s+to\s+Shopping\s+Lists?/i);
              if (match2 && match2[1]) {
                itemName = match2[1].trim();
              }
            }
            if (itemName) {
              shoppingItems.push(itemName);
            } else {
              otherMessages.push(result);
            }
          }
          // Check for shopping item completion/reopen (purchased / reopened)
          else if (result.includes('Item Purchased')) {
            const lines = result.split('\n');
            const nameLine = lines[1]?.trim();
            if (nameLine) {
              purchasedItems.push(nameLine);
            } else {
              otherMessages.push(result);
            }
          } else if (result.includes('Item Reopened')) {
            const lines = result.split('\n');
            const nameLine = lines[1]?.trim();
            if (nameLine) {
              reopenedItems.push(nameLine);
            } else {
              otherMessages.push(result);
            }
          } 
          // Check for task creation
          else if (result.includes('New Task Created')) {
            const match = result.match(/Title:\s*([^\n]+)/i);
            if (match && match[1]) {
              tasks.push(match[1].trim());
            } else {
              otherMessages.push(result);
            }
          }
          // Check for note creation
          else if (result.includes('New Note Created') || result.includes('Note Created')) {
            const match = result.match(/Title:\s*([^\n]+)/i);
            if (match && match[1]) {
              notes.push(match[1].trim());
            } else {
              otherMessages.push(result);
            }
          }
          // Check for event creation
          else if (result.includes('New Event Created')) {
            const match = result.match(/\*Title:\*\s*([^\n]+)/i);
            if (match && match[1]) {
              events.push(match[1].trim());
            } else {
              otherMessages.push(result);
            }
          }
          // Check for reminder creation
          else if (result.includes('New Reminder Created')) {
            const match = result.match(/Title:\s*([^\n]+)/i);
            if (match && match[1]) {
              reminders.push(match[1].trim());
            } else {
              otherMessages.push(result);
            }
          }
          else {
            otherMessages.push(result);
          }
        }
        
        let combinedMessage = '';
        const messageParts: string[] = [];
        
        // Format shopping list items (added)
        if (shoppingItems.length > 0) {
          const itemsText = shoppingItems.length === 1
            ? shoppingItems[0]
            : shoppingItems.length === 2
            ? `${shoppingItems[0]} and ${shoppingItems[1]}`
            : `${shoppingItems.slice(0, -1).join(', ')} and ${shoppingItems[shoppingItems.length - 1]}`;
          const listLabel = shoppingListLabel || 'Home';
          messageParts.push(`✅ *Added to ${listLabel} List:*\nItem/s: ${itemsText}`);
        }

        // Format purchased items
        if (purchasedItems.length > 0) {
          const itemsText = purchasedItems.length === 1
            ? purchasedItems[0]
            : purchasedItems.length === 2
            ? `${purchasedItems[0]} and ${purchasedItems[1]}`
            : `${purchasedItems.slice(0, -1).join(', ')} and ${purchasedItems[purchasedItems.length - 1]}`;
          messageParts.push(`✅ *Items Purchased:*\n${itemsText}`);
        }

        // Format reopened items
        if (reopenedItems.length > 0) {
          const itemsText = reopenedItems.length === 1
            ? reopenedItems[0]
            : reopenedItems.length === 2
            ? `${reopenedItems[0]} and ${reopenedItems[1]}`
            : `${reopenedItems.slice(0, -1).join(', ')} and ${reopenedItems[reopenedItems.length - 1]}`;
          messageParts.push(`📝 *Items Reopened:*\n${itemsText}`);
        }
        
        // Format tasks
        if (tasks.length > 0) {
          const tasksText = tasks.length === 1
            ? tasks[0]
            : tasks.length === 2
            ? `${tasks[0]} and ${tasks[1]}`
            : `${tasks.slice(0, -1).join(', ')} and ${tasks[tasks.length - 1]}`;
          messageParts.push(`✅ *New Task${tasks.length > 1 ? 's' : ''} Created:*\nTitle${tasks.length > 1 ? 's' : ''}: ${tasksText}`);
        }
        
        // Format notes
        if (notes.length > 0) {
          const notesText = notes.length === 1
            ? notes[0]
            : notes.length === 2
            ? `${notes[0]} and ${notes[1]}`
            : `${notes.slice(0, -1).join(', ')} and ${notes[notes.length - 1]}`;
          messageParts.push(`✅ *New Note${notes.length > 1 ? 's' : ''} Created:*\nTitle${notes.length > 1 ? 's' : ''}: ${notesText}`);
        }
        
        // Format events
        if (events.length > 0) {
          const eventsText = events.length === 1
            ? events[0]
            : events.length === 2
            ? `${events[0]} and ${events[1]}`
            : `${events.slice(0, -1).join(', ')} and ${events[events.length - 1]}`;
          messageParts.push(`✅ *New Event${events.length > 1 ? 's' : ''} Created:*\nTitle${events.length > 1 ? 's' : ''}: ${eventsText}`);
        }
        
        // Format reminders
        if (reminders.length > 0) {
          const remindersText = reminders.length === 1
            ? reminders[0]
            : reminders.length === 2
            ? `${reminders[0]} and ${reminders[1]}`
            : `${reminders.slice(0, -1).join(', ')} and ${reminders[reminders.length - 1]}`;
          messageParts.push(`✅ *New Reminder${reminders.length > 1 ? 's' : ''} Created:*\nTitle${reminders.length > 1 ? 's' : ''}: ${remindersText}`);
        }
        
        // Add other messages
        if (otherMessages.length > 0) {
          messageParts.push(...otherMessages);
        }
        
        combinedMessage = messageParts.join('\n\n');
        
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
    
    // Handle unsupported operations (task, note, document, address removed)
    if (titleType === 'task' || titleType === 'note' || titleType === 'document' || titleType === 'address') {
      logger.warn({ userId, titleType }, `${titleType} operations are no longer supported`);
      await whatsappService.sendTextMessage(
        recipient,
        `I'm sorry, ${titleType} operations are not currently supported. I can help you with reminders, events, shopping lists, and friends.`
      );
      return;
    }
    
    // Legacy handlers removed - kept for reference only
    if (false && titleType === 'task') {
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
        // Group similar messages together
        const shoppingItems: string[] = [];
        const purchasedItems: string[] = [];
        const reopenedItems: string[] = [];
        let shoppingListLabel: string | null = null;
        const tasks: string[] = [];
        const notes: string[] = [];
        const events: string[] = [];
        const reminders: string[] = [];
        const otherMessages: string[] = [];
        
        for (const result of nonEmptyResults) {
          // Check for shopping item additions
          if (result.startsWith('SHOPPING_ITEM_ADDED:')) {
            shoppingItems.push(result.replace('SHOPPING_ITEM_ADDED:', ''));
          } else if (
            // Match both singular and plural forms, and our current formatted header
            result.includes('Added to ') && result.includes(' List:')
          ) {
            // Extract item name from "✅ *Added to {ListName} List:*\nItem/s: {item}"
            // or from legacy format: 'Added "{item}" to Shopping List(s)'
            let itemName: string | null = null;
            // Try to extract list label from header once
            if (!shoppingListLabel) {
              const headerMatch = result.match(/Added to\s+(.+?)\s+List:/i);
              if (headerMatch && headerMatch[1]) {
                shoppingListLabel = headerMatch[1].trim();
              }
            }
            const match1 = result.match(/Item\/s:\s*([^\n]+)/i);
            if (match1 && match1[1]) {
              itemName = match1[1].trim();
            } else {
              const match2 = result.match(/Added\s+"([^"]+)"\s+to\s+Shopping\s+Lists?/i);
              if (match2 && match2[1]) {
                itemName = match2[1].trim();
              }
            }
            if (itemName) {
              shoppingItems.push(itemName);
            } else {
              otherMessages.push(result);
            }
          } 
          // Check for shopping item completion / reopen
          else if (result.includes('Item Purchased')) {
            const lines = result.split('\n');
            const nameLine = lines[1]?.trim();
            if (nameLine) {
              purchasedItems.push(nameLine);
            } else {
              otherMessages.push(result);
            }
          } else if (result.includes('Item Reopened')) {
            const lines = result.split('\n');
            const nameLine = lines[1]?.trim();
            if (nameLine) {
              reopenedItems.push(nameLine);
            } else {
              otherMessages.push(result);
            }
          } 
          // Check for task creation
          else if (result.includes('New Task Created')) {
            const match = result.match(/Title:\s*([^\n]+)/i);
            if (match && match[1]) {
              tasks.push(match[1].trim());
            } else {
              otherMessages.push(result);
            }
          }
          // Check for note creation
          else if (result.includes('New Note Created') || result.includes('Note Created')) {
            const match = result.match(/Title:\s*([^\n]+)/i);
            if (match && match[1]) {
              notes.push(match[1].trim());
            } else {
              otherMessages.push(result);
            }
          }
          // Check for event creation
          else if (result.includes('New Event Created')) {
            const match = result.match(/\*Title:\*\s*([^\n]+)/i);
            if (match && match[1]) {
              events.push(match[1].trim());
            } else {
              otherMessages.push(result);
            }
          }
          // Check for reminder creation
          else if (result.includes('New Reminder Created')) {
            const match = result.match(/Title:\s*([^\n]+)/i);
            if (match && match[1]) {
              reminders.push(match[1].trim());
            } else {
              otherMessages.push(result);
            }
          }
          else {
            otherMessages.push(result);
          }
        }
        
        let combinedMessage = '';
        const messageParts: string[] = [];
        
        // Format shopping list items
        if (shoppingItems.length > 0) {
          const itemsText = shoppingItems.length === 1
            ? shoppingItems[0]
            : shoppingItems.length === 2
            ? `${shoppingItems[0]} and ${shoppingItems[1]}`
            : `${shoppingItems.slice(0, -1).join(', ')} and ${shoppingItems[shoppingItems.length - 1]}`;
          const listLabel = shoppingListLabel || 'Home';
          messageParts.push(`✅ *Added to ${listLabel} List:*\nItem/s: ${itemsText}`);
        }
        // Format purchased items
        if (purchasedItems.length > 0) {
          const itemsText = purchasedItems.length === 1
            ? purchasedItems[0]
            : purchasedItems.length === 2
            ? `${purchasedItems[0]} and ${purchasedItems[1]}`
            : `${purchasedItems.slice(0, -1).join(', ')} and ${purchasedItems[purchasedItems.length - 1]}`;
          messageParts.push(`✅ *Items Purchased:*\n${itemsText}`);
        }

        // Format reopened items
        if (reopenedItems.length > 0) {
          const itemsText = reopenedItems.length === 1
            ? reopenedItems[0]
            : reopenedItems.length === 2
            ? `${reopenedItems[0]} and ${reopenedItems[1]}`
            : `${reopenedItems.slice(0, -1).join(', ')} and ${reopenedItems[reopenedItems.length - 1]}`;
          messageParts.push(`📝 *Items Reopened:*\n${itemsText}`);
        }
        
        // Format tasks
        if (tasks.length > 0) {
          const tasksText = tasks.length === 1
            ? tasks[0]
            : tasks.length === 2
            ? `${tasks[0]} and ${tasks[1]}`
            : `${tasks.slice(0, -1).join(', ')} and ${tasks[tasks.length - 1]}`;
          messageParts.push(`✅ *New Task${tasks.length > 1 ? 's' : ''} Created:*\nTitle${tasks.length > 1 ? 's' : ''}: ${tasksText}`);
        }
        
        // Format notes
        if (notes.length > 0) {
          const notesText = notes.length === 1
            ? notes[0]
            : notes.length === 2
            ? `${notes[0]} and ${notes[1]}`
            : `${notes.slice(0, -1).join(', ')} and ${notes[notes.length - 1]}`;
          messageParts.push(`✅ *New Note${notes.length > 1 ? 's' : ''} Created:*\nTitle${notes.length > 1 ? 's' : ''}: ${notesText}`);
        }
        
        // Format events
        if (events.length > 0) {
          const eventsText = events.length === 1
            ? events[0]
            : events.length === 2
            ? `${events[0]} and ${events[1]}`
            : `${events.slice(0, -1).join(', ')} and ${events[events.length - 1]}`;
          messageParts.push(`✅ *New Event${events.length > 1 ? 's' : ''} Created:*\nTitle${events.length > 1 ? 's' : ''}: ${eventsText}`);
        }
        
        // Format reminders
        if (reminders.length > 0) {
          const remindersText = reminders.length === 1
            ? reminders[0]
            : reminders.length === 2
            ? `${reminders[0]} and ${reminders[1]}`
            : `${reminders.slice(0, -1).join(', ')} and ${reminders[reminders.length - 1]}`;
          messageParts.push(`✅ *New Reminder${reminders.length > 1 ? 's' : ''} Created:*\nTitle${reminders.length > 1 ? 's' : ''}: ${remindersText}`);
        }
        
        // Add other messages
        if (otherMessages.length > 0) {
          messageParts.push(...otherMessages);
        }
        
        combinedMessage = messageParts.join('\n\n');
        
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
      return; // Exit early after handling task operation (legacy - disabled)
    }
    
    // Legacy document handler removed (disabled)
    if (false && titleType === 'document') {
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
      // CRITICAL: First, check if user wants to view an event by number, regardless of what AI generated
      // This catches cases like "show meeting info for number 5" even if AI generates unexpected responses
      if (originalUserText) {
        const userTextLower = originalUserText.toLowerCase();
        // Extract numbers from user text
        const extractNumbers = (text: string): number[] => {
          const numbers: number[] = [];
          const numberMatches = text.match(/\d+/g);
          if (numberMatches) {
            numbers.push(...numberMatches.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0));
          }
          return numbers;
        };
        
        // Use AI to analyze if this is an event view request
        try {
          // OPTIMIZATION: Use cache first, then parallelize if needed
          let messageHistory = cache.get(cache.messageHistory, userId, cache.ttl.history) || [];
          let eventViewTimezone = userTimezone || cache.get(cache.userTimezones, userId, cache.ttl.timezone) || 'Africa/Johannesburg';
          let calendarConnection = cache.get(cache.calendarConnections, userId, cache.ttl.calendar);
          
          // Only fetch if not in cache
          if (messageHistory.length === 0 || !eventViewTimezone || eventViewTimezone === 'Africa/Johannesburg' || !calendarConnection) {
            const [historyResult, calendarResult] = await Promise.allSettled([
              messageHistory.length === 0 ? getRecentMessageHistory(db, userId, 10) : Promise.resolve(null),
              !calendarConnection ? getPrimaryCalendar(db, userId) : Promise.resolve(null),
            ]);
            
            // Process message history
            if (messageHistory.length === 0 && historyResult.status === 'fulfilled' && historyResult.value) {
              messageHistory = historyResult.value
              .filter(msg => msg.content && msg.content.trim().length > 0)
              .slice(0, 10)
              .map(msg => ({
                direction: msg.direction,
                content: msg.content,
              }));
              cache.set(cache.messageHistory, userId, messageHistory);
          }

            // Process calendar connection and timezone
            if (!calendarConnection && calendarResult.status === 'fulfilled' && calendarResult.value) {
              calendarConnection = calendarResult.value;
              cache.set(cache.calendarConnections, userId, calendarConnection);
            }
            
            if ((!eventViewTimezone || eventViewTimezone === 'Africa/Johannesburg') && calendarConnection) {
              try {
              const calendarService = new CalendarService(db);
              eventViewTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
                cache.set(cache.userTimezones, userId, eventViewTimezone);
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to get timezone for event view analysis, using default');
              }
            }
          }

          // Analyze with AI
          const analyzer = new WhatsappTextAnalysisService();
          const eventViewAnalysis = await analyzer.analyzeEventViewRequest(originalUserText, {
            messageHistory,
            currentDate: new Date(),
            timezone: eventViewTimezone,
          });

          logger.info(
            {
              userId,
              originalUserText,
              eventViewAnalysis,
              actionTemplate,
            },
            '🔍 AI Analysis: Catch-all event view request detection'
          );

          // If AI detected an event view request with numbers, handle it
          if (eventViewAnalysis.isEventViewRequest && eventViewAnalysis.eventNumbers && eventViewAnalysis.eventNumbers.length > 0) {
            const executor = new ActionExecutor(db, userId, whatsappService, recipient);
            
            // OPTIMIZATION: Reuse cached timezone (already fetched above)
            const eventTimezone = eventViewTimezone;

            // Handle multiple event numbers
            if (eventViewAnalysis.eventNumbers.length > 1) {
              logger.info(
                {
                  userId,
                  eventNumbers: eventViewAnalysis.eventNumbers,
                  originalUserText,
                  aiReasoning: eventViewAnalysis.reasoning,
                },
                '✅ AI detected multiple event view requests in catch-all, showing each event overview'
              );

              // OPTIMIZATION: Parallelize multiple event number processing
              const eventPromises = eventViewAnalysis.eventNumbers.map(async (eventNumber) => {
                const eventActionTemplate = `Show event details: ${eventNumber}`;
                const parsed = executor.parseAction(eventActionTemplate);
                if (parsed) {
                  parsed.resourceType = 'event';
                  const result = await executor.executeAction(parsed, eventTimezone);
                  return { eventNumber, result, parsed: true };
                }
                return { eventNumber, result: null, parsed: false };
              });
              
              const eventResults = await Promise.allSettled(eventPromises);
              
              // Send messages in order (but processed in parallel)
              for (const result of eventResults) {
                if (result.status === 'fulfilled' && result.value.parsed && result.value.result) {
                  const { result: execResult } = result.value;
                  if (execResult.success && execResult.message) {
                    await whatsappService.sendTextMessage(recipient, execResult.message);
                    logOutgoingMessageNonBlocking(db, recipient, userId, execResult.message);
                  } else if (!execResult.success && execResult.message) {
                    await whatsappService.sendTextMessage(recipient, execResult.message);
                  }
                }
              }
            } else {
              // Single event number
              const eventNumber = eventViewAnalysis.eventNumbers[0]!;
              const eventActionTemplate = `Show event details: ${eventNumber}`;
              
              logger.info(
                {
                  userId,
                  originalAction: actionTemplate,
                  convertedAction: eventActionTemplate,
                  extractedNumber: eventNumber,
                  originalUserText,
                  aiReasoning: eventViewAnalysis.reasoning,
                  reason: 'ai_catch_all_event_view_detection'
                },
                '✅ AI Analysis: Catch-all - User wants to view event by number'
              );
              
              const parsed = executor.parseAction(eventActionTemplate);
              if (parsed) {
                parsed.resourceType = 'event';
                const result = await executor.executeAction(parsed, eventTimezone);
                
                if (result.success && result.message) {
                  await whatsappService.sendTextMessage(recipient, result.message);
                  
                  // OPTIMIZATION: Non-blocking logging
                  logOutgoingMessageNonBlocking(db, recipient, userId, result.message);
                } else if (!result.success && result.message) {
                  await whatsappService.sendTextMessage(recipient, result.message);
                }
              }
            }
            return; // Exit early, don't process further
          }
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
              userId,
              originalUserText,
            },
            'Failed to analyze event view request with AI in catch-all section, continuing with normal flow'
          );
          // Continue with normal processing if AI analysis fails
        }
      }
      
      // Check if AI misclassified an event request as an address request
      // This happens when user says "send info on 3" but AI generates "Get address: [event name]"
      const isGetAddress = actionTemplate.toLowerCase().startsWith('get address:');
      if (isGetAddress && originalUserText) {
        const userTextLower = originalUserText.toLowerCase();
        // Check if user wants event info (not address info)
        // Support patterns like "show meeting info for number 5", "show info for 4", etc.
        const wantsEventInfo = userTextLower.match(/(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(?:number\s+)?(\d+)/i) ||
                              userTextLower.match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:meeting\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(?:number\s+)?(\d+)$/i) ||
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
      // Pattern matches: "show me [name] event", "show event [name]", "view [name] event", "show me 2", "send info on 3", "show meeting info for 4", etc.
      const userWantsToView = originalUserText?.toLowerCase().match(/(?:show|view|get|see|send|give|provide|details?|overview)\s+(?:me\s+)?(?:the\s+)?(?:event|details?|overview|info|information|meeting)/i) ||
                              originalUserText?.toLowerCase().match(/(?:show|view|get|see|send)\s+(?:me\s+)?[^"]+\s+event/i) ||
                              originalUserText?.toLowerCase().match(/(?:show|view|get|see|send)\s+(?:me\s+)?(?:the\s+)?event\s+(?:of|for|details?|overview)/i) ||
                              originalUserText?.toLowerCase().match(/(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)/i) ||
                              originalUserText?.toLowerCase().match(/(?:show|view|get|see)\s+(?:me\s+)?(?:meeting\s+)?(?:info|information|details?)\s+(?:on|about|for)/i) ||
                              // Also match "show me [number]" or "send info on [number]" or "show meeting info for [number]" - likely referring to a numbered item from a list
                              (originalUserText?.toLowerCase().match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:meeting\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(?:number\s+)?(\d+)$/i) && hasEventNameInList && /^\d+$/.test(listEventValue)) ||
                              (originalUserText?.toLowerCase().match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) && hasEventNameInList && /^\d+$/.test(listEventValue)) ||
                              (originalUserText?.toLowerCase().match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(?:number\s+)?(\d+)$/i) && hasEventNameInList && /^\d+$/.test(listEventValue));
      
      const isListEventsWithName = actionTemplate.toLowerCase().startsWith('list events:') && 
                                   hasEventNameInList &&
                                   userWantsToView;
      
      // Check for "View an event:" format (AI sometimes generates this)
      const isViewAnEvent = actionTemplate.toLowerCase().match(/^view\s+an\s+event:/i) ||
                            actionTemplate.toLowerCase().match(/^view\s+event:/i);
      
      // Check for "Show details for event:" format (AI sometimes generates this)
      const isShowDetailsForEvent = actionTemplate.toLowerCase().match(/^show\s+details?\s+for\s+event:/i) ||
                                     actionTemplate.toLowerCase().match(/^show\s+event\s+details?:/i) ||
                                     actionTemplate.toLowerCase().startsWith('show details for event:');
      
      // Check if user said "show me [number]" or "show info on [number]" after listing events - this is always an event operation in event context
      const userTextLower = originalUserText?.toLowerCase() || '';
      const actionTemplateLower = actionTemplate.toLowerCase();
      
      // Detect number-based view requests using AI (e.g., "show me 1", "show info on 1", "show meeting info for 4", "show info for number 4")
      let isNumberBasedView = false;
      let numberBasedViewNumbers: number[] = [];
      
      if (titleType === 'event' && originalUserText) {
        try {
          // Get message history for context
          let messageHistory: Array<{ direction: 'incoming' | 'outgoing'; content: string }> = [];
          try {
            const history = await getRecentMessageHistory(db, userId, 10);
            messageHistory = history
              .filter(msg => msg.content && msg.content.trim().length > 0)
              .slice(0, 10)
              .map(msg => ({
                direction: msg.direction,
                content: msg.content,
              }));
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to retrieve message history for event view analysis');
          }

          // Get user's calendar timezone
          let eventViewTimezone = userTimezone || 'Africa/Johannesburg';
          try {
            const calendarConnection = await getPrimaryCalendar(db, userId);
            if (calendarConnection) {
              const calendarService = new CalendarService(db);
              eventViewTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
            }
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to get timezone for event view analysis, using default');
          }

          // Analyze with AI
          const analyzer = new WhatsappTextAnalysisService();
          const eventViewAnalysis = await analyzer.analyzeEventViewRequest(originalUserText, {
            messageHistory,
            currentDate: new Date(),
            timezone: eventViewTimezone,
          });

          logger.info(
            {
              userId,
              originalUserText,
              eventViewAnalysis,
              actionTemplate,
            },
            '🔍 AI Analysis: Detecting number-based view requests in view/show operation section'
          );

          // If AI detected an event view request with numbers, use those
          if (eventViewAnalysis.isEventViewRequest && eventViewAnalysis.eventNumbers && eventViewAnalysis.eventNumbers.length > 0) {
            isNumberBasedView = true;
            numberBasedViewNumbers = eventViewAnalysis.eventNumbers;
          }
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
              userId,
              originalUserText,
            },
            'Failed to analyze event view request with AI in view/show section, continuing with normal flow'
          );
          // Continue with normal processing if AI analysis fails
        }
      }
      
      // Detect name-based view requests (e.g., "show me call with paul")
      // Exclude list requests like "show me all events" or "show me events"
      const isNameBasedView = titleType === 'event' &&
                              originalUserText &&
                              userTextLower.match(/^(?:show|view|get|see)\s+(?:me\s+)?(.+?)(?:\s+event)?$/i) &&
                              !userTextLower.match(/^(?:show|view|get|see)\s+(?:me\s+)?(?:all|list|every)\s+/i) &&
                              !userTextLower.match(/^(?:show|view|get|see)\s+(?:me\s+)?(?:events?|event\s+list)/i) &&
                              !userTextLower.match(/^(?:show|view|get|see)\s+(?:me\s+)?(?:today|tomorrow|this\s+week|this\s+month)/i);
      
      // If user said "show info on 1" or "show me 1" in event context, always treat as view operation
      // This handles cases where AI generates "List events: tomorrow" or "List events: all" but user wants to see event #1
      // CRITICAL: In event context, ANY number-based request should be treated as a view operation
      // regardless of what the AI generates (list, view file, etc.)
      const isNumberViewInEventContext = isNumberBasedView && 
                                         (actionTemplateLower.startsWith('list events:') || 
                                          actionTemplateLower.startsWith('view a file:') ||
                                          actionTemplateLower.startsWith('list events: all') ||
                                          actionTemplateLower.startsWith('list events:all'));
      
      // ALWAYS treat number-based views in event context as view operations
      // This ensures "show me 1" works even if AI generates unexpected responses
      const isNumberViewAlways = isNumberBasedView && titleType === 'event';
      
      // If user wants to view by name and AI generated a list, treat as view operation
      // User intent (view specific event by name) takes priority over AI's list response
      // This works even if AI generated "List events: tomorrow" - user wants a specific event
      const isNameViewInEventContext = isNameBasedView &&
                                       actionTemplateLower.startsWith('list events:');
      
      const isViewShowOperation = actionTemplateLower.match(/^(view|show|get|see|details? of|overview of)\s+(?:event|events?|me\s+event|me\s+the\s+event)/i) ||
                                  actionTemplateLower.match(/^(view|show|get|see)\s+(?:me\s+)?(?:the\s+)?(?:details?|overview|info|information)\s+(?:of|for)\s+(?:event|events?)?/i) ||
                                  (actionTemplateLower.startsWith('view a file:') && (originalUserText?.toLowerCase().includes('event') || isNumberBasedView)) ||
                                  isViewAnEvent ||
                                  isShowDetailsForEvent ||
                                  isListEventsWithName ||
                                  isNumberBasedView ||
                                  isNumberViewInEventContext ||
                                  isNumberViewAlways || // ALWAYS treat number-based views as view operations in event context
                                  isNameBasedView ||
                                  isNameViewInEventContext;
      
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
        } else if (isShowDetailsForEvent) {
          // Always check user text first for number - this takes priority over AI response
          const userNumberMatch = originalUserText?.toLowerCase().match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) ||
                                 originalUserText?.toLowerCase().match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)$/i);
          
          if (userNumberMatch && userNumberMatch[1]) {
            // User specified a number - use it directly (this is the most important case)
            eventActionTemplate = `Show event details: ${userNumberMatch[1]}`;
            logger.info(
              {
                userId,
                originalAction: actionTemplate,
                convertedAction: eventActionTemplate,
                extractedNumber: userNumberMatch[1],
                originalUserText,
                reason: 'user_specified_number_in_show_info_request'
              },
              '✅ Extracted number from user text for show info request - PRIORITY'
            );
          } else {
            // Extract event name/number from "Show details for event: [name]" or "Show event details: [name]"
            // Try multiple patterns to match different AI response formats
            const showDetailsMatch = actionTemplate.match(/^Show\s+details?\s+for\s+event:\s*(.+?)(?:\s*-\s*(?:date|time|calendar):.*)?$/i) ||
                                    actionTemplate.match(/^Show\s+event\s+details?:\s*(.+?)(?:\s*-\s*(?:date|time|calendar):.*)?$/i);
            
            if (showDetailsMatch && showDetailsMatch[1]) {
              // Extract from AI response
              const extractedValue = showDetailsMatch[1].trim();
              // Extract just the event name (before any "- date:" or "- time:" parts)
              const eventNameParts = extractedValue.split(/\s*-\s*(?:date|time|calendar):/i);
              const eventNameOnly = eventNameParts[0]?.trim() || extractedValue.trim();
              eventActionTemplate = `Show event details: ${eventNameOnly}`;
              logger.info(
                {
                  userId,
                  originalAction: actionTemplate,
                  convertedAction: eventActionTemplate,
                  extractedEventName: eventNameOnly,
                  reason: 'extracted_from_ai_response'
                },
                'Extracted event name from AI response for show details'
              );
            } else if (originalUserText) {
              // Fallback: extract from original user text
              const fallbackNumberMatch = originalUserText.toLowerCase().match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) ||
                                         originalUserText.toLowerCase().match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)$/i);
              if (fallbackNumberMatch && fallbackNumberMatch[1]) {
                eventActionTemplate = `Show event details: ${fallbackNumberMatch[1]}`;
              } else {
                eventActionTemplate = `Show event details: ${originalUserText}`;
              }
            }
          }
        } else if (actionTemplate.toLowerCase().startsWith('view a file:')) {
          // Extract event name/number from "View a file: [event name]"
          // If user said "show me 1" or similar, prioritize the number from user text
          const userNumberMatch = originalUserText?.toLowerCase().match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) ||
                                 originalUserText?.toLowerCase().match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)$/i);
          
          if (userNumberMatch && userNumberMatch[1]) {
            // User specified a number - use it directly (this is the most important case)
            eventActionTemplate = `Show event details: ${userNumberMatch[1]}`;
            logger.info(
              {
                userId,
                originalAction: actionTemplate,
                convertedAction: eventActionTemplate,
                extractedNumber: userNumberMatch[1],
                originalUserText,
                reason: 'user_specified_number_in_view_file_request'
              },
              '✅ Extracted number from user text for "View a file" request - PRIORITY'
            );
          } else {
            // Extract event name from AI response
            const eventNameMatch = actionTemplate.match(/View a file:\s*(.+?)(?:\s*-\s*on folder:.*)?$/i);
            if (eventNameMatch && eventNameMatch[1]) {
              eventActionTemplate = `Show event details: ${eventNameMatch[1].trim()}`;
            } else if (originalUserText) {
              // Fallback: use original user text
              eventActionTemplate = `Show event details: ${originalUserText}`;
            }
          }
        } else if (isNumberBasedView || isNumberViewInEventContext || isNumberViewAlways) {
          // User said "show me 1" or "show info on 1" or similar - extract number directly
          // This handles cases where AI generates "List events: tomorrow", "List events: all", or any other response
          // CRITICAL: Always extract the number from user text, regardless of AI response
          const userNumberMatch = originalUserText.toLowerCase().match(/^(?:show|view|get|see|send)\s+(?:me\s+)?(?:info\s+on\s+)?(\d+)$/i) ||
                                 originalUserText.toLowerCase().match(/^(?:send|give|provide)\s+(?:me\s+)?(?:info|information|details?)\s+(?:on|about|for)\s+(\d+)$/i) ||
                                 originalUserText.toLowerCase().match(/^(?:show|view|get|see)\s+(?:me\s+)?(\d+)$/i);
          if (userNumberMatch && userNumberMatch[1]) {
            eventActionTemplate = `Show event details: ${userNumberMatch[1]}`;
            logger.info(
              {
                userId,
                originalAction: actionTemplate,
                convertedAction: eventActionTemplate,
                extractedNumber: userNumberMatch[1],
                originalUserText,
                isNumberViewInEventContext: !!isNumberViewInEventContext,
                isNumberViewAlways: !!isNumberViewAlways,
                reason: 'number_based_view_in_event_context_always'
              },
              '✅ Extracted number from user text for number-based view request (ALWAYS in event context)'
            );
          } else {
            // Fallback: if we couldn't extract number, log warning but still try to route as view
            logger.warn(
              {
                userId,
                originalAction: actionTemplate,
                originalUserText,
                isNumberBasedView,
                isNumberViewInEventContext,
                isNumberViewAlways,
              },
              '⚠️ Number-based view detected but could not extract number from user text'
            );
          }
        } else if (isNameViewInEventContext) {
          // User said "show me call with paul" or similar - extract event name from user text
          // This handles cases where AI generates "List events: tomorrow" but user wants to see a specific event
          const nameMatch = originalUserText.toLowerCase().match(/^(?:show|view|get|see)\s+(?:me\s+)?(.+?)(?:\s+event)?$/i);
          if (nameMatch && nameMatch[1]) {
            const eventName = nameMatch[1].trim();
            // Filter out common list keywords and timeframes
            if (!eventName.match(/^(?:all|list|every|today|tomorrow|this\s+week|this\s+month|events?|event\s+list)/i)) {
              eventActionTemplate = `Show event details: ${eventName}`;
              logger.info(
                {
                  userId,
                  originalAction: actionTemplate,
                  convertedAction: eventActionTemplate,
                  extractedEventName: eventName,
                  originalUserText,
                  reason: 'name_based_view_in_event_context'
                },
                '✅ Extracted event name from user text for name-based view request'
              );
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
    } else if (titleType === 'reminder') {
      // Handle reminder operations
      const isCreate = /^Create a reminder:/i.test(actionTemplate);
      const isUpdate = /^Update a reminder:/i.test(actionTemplate) || /^Update all reminders:/i.test(actionTemplate);
      const isMove = /^Move a reminder:/i.test(actionTemplate);
      const isDelete = /^Delete a reminder:/i.test(actionTemplate) || /^Delete all reminders$/i.test(actionTemplate);
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
          // OPTIMIZATION: Non-blocking logging
          logOutgoingMessageNonBlocking(db, recipient, userId, `🤖 AI Response:\n${aiResponse.substring(0, 500)}`);
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to send AI response to user');
        }
      }
      
      // OPTIMIZATION: Reuse cached calendar connection and timezone
      let calendarTimezone = userTimezone || 'Africa/Johannesburg'; // Default fallback
      let calendarConnection = cache.get(cache.calendarConnections, userId, cache.ttl.calendar);
      
      if (!calendarConnection) {
        try {
          calendarConnection = await getPrimaryCalendar(db, userId);
        if (calendarConnection) {
            cache.set(cache.calendarConnections, userId, calendarConnection);
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to get calendar connection for reminder operations');
        }
      }
      
      if (calendarConnection && (!userTimezone || userTimezone === 'Africa/Johannesburg')) {
        try {
          const calendarService = new CalendarService(db);
          calendarTimezone = await (calendarService as any).getUserTimezone(userId, calendarConnection);
          cache.set(cache.userTimezones, userId, calendarTimezone);
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to get calendar timezone for reminder operations, using default');
        }
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
          // OPTIMIZATION: Non-blocking logging
          logOutgoingMessageNonBlocking(db, recipient, userId, `🤖 AI Response:\n${aiResponse.substring(0, 500)}`);
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
        // Support multi-line templates (e.g., multiple deletes)
        const actionLines = actionTemplate.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const results: string[] = [];
        let successCount = 0;
        let failCount = 0;
        
        const allActionsAreDeleteReminder = actionLines.every(l => /^Delete a reminder:/i.test(l) || /^Delete all reminders$/i.test(l));

        for (const line of actionLines) {
          const parsed = parseReminderTemplateToAction(line, /^Create a reminder:/i.test(line), /^Update a reminder:/i.test(line) || /^Update all reminders:/i.test(line) || /^Move a reminder:/i.test(line), /^Delete a reminder:/i.test(line) || /^Delete all reminders$/i.test(line), /^Pause a reminder:/i.test(line), /^Resume a reminder:/i.test(line));
          const result = await executor.executeAction(parsed, calendarTimezone);
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
          if (result.message.trim().length > 0) {
            results.push(result.message);
          }
        }

        // If all actions are reminder deletions, aggregate into a single confirmation message
        let combinedMessage: string;
        if (allActionsAreDeleteReminder && results.length > 0) {
          const titles = results.flatMap(msg => {
            const matches = [...msg.matchAll(/Title:\s*(.+)/g)];
            return matches.map(m => m[1].trim()).filter(Boolean);
          });
          if (titles.length > 0) {
            combinedMessage = `⛔ Reminder Deleted:\n${titles.map(t => `Title: ${t}`).join('\n')}`;
          } else {
            combinedMessage = results.filter(Boolean).join('\n');
          }
        } else {
          combinedMessage = results.filter(Boolean).join('\n');
        }
        
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
          logger.warn({ error: logError, userId }, 'Failed to log outgoing reminder message');
        }
        
        // Skip if empty (e.g., when button was already sent)
        if (combinedMessage.trim().length > 0) {
          await whatsappService.sendTextMessage(recipient, combinedMessage);
        }
      }
    } else if (titleType === 'address') {
      // Address operations no longer supported - removed handler
      logger.warn({ userId, titleType }, 'Address operations are no longer supported');
      await whatsappService.sendTextMessage(
        recipient,
        "I'm sorry, address operations are not currently supported. I can help you with reminders, events, shopping lists, and friends."
      );
      return;
    }
    
    // Legacy address handler removed - kept for reference only
    if (false && titleType === 'address') {
      // Check if AI misclassified an event location update as an address update
      // This happens when user says "edit location to paul office" but AI generates "Update an address: Paul - changes: location to Office"
      const isUpdateAddress = actionTemplate.toLowerCase().startsWith('update an address:') || 
                              actionTemplate.toLowerCase().startsWith('edit an address:');
      if (isUpdateAddress && originalUserText) {
        const userTextLower = originalUserText.toLowerCase();
        // Check if user wants to update event location (not address location)
        // Look for patterns like "edit location", "add location", "change location", etc.
        const wantsEventLocationUpdate = userTextLower.match(/(?:edit|change|update|add|set)\s+location\s+(?:to|as|is|:|-)\s*(.+)/i) ||
                                         userTextLower.match(/(?:edit|change|update|add|set)\s+(?:the\s+)?(?:event\s+)?location/i) ||
                                         userTextLower.match(/location\s+(?:to|as|is|:|-)\s*(.+)/i) ||
                                         (userTextLower.includes('location') && (userTextLower.includes('edit') || userTextLower.includes('add') || userTextLower.includes('change')));
        
        if (wantsEventLocationUpdate) {
          // Extract location value - try multiple patterns
          let locationValue = '';
          const locationMatch1 = userTextLower.match(/(?:edit|change|update|add|set)\s+location\s+(?:to|as|is|:|-)\s*(.+)/i);
          const locationMatch2 = userTextLower.match(/location\s+(?:to|as|is|:|-)\s*(.+)/i);
          
          if (locationMatch1 && locationMatch1[1]) {
            locationValue = locationMatch1[1].trim();
          } else if (locationMatch2 && locationMatch2[1]) {
            locationValue = locationMatch2[1].trim();
          } else {
            // Try to extract from the action template - combine address name and location change
            const addressMatch = actionTemplate.match(/(?:Update|Edit)\s+an\s+address:\s*(.+?)\s*-\s*changes:/i);
            const changesMatch = actionTemplate.match(/changes:\s*(.+?)(?:\s*-\s*calendar:|$)/i);
            if (addressMatch && changesMatch) {
              // Combine address name and location change (e.g., "Paul" + "location to Office" = "paul office")
              const addressName = addressMatch[1].trim();
              const changes = changesMatch[1].trim();
              const locationInChanges = changes.match(/location\s+to\s+(.+?)(?:\s|$)/i);
              if (locationInChanges && locationInChanges[1]) {
                locationValue = `${addressName} ${locationInChanges[1].trim()}`.trim();
              }
            }
          }
          
          // Try to find a recent event to update (check last 30 days)
          try {
            const calendarService = new CalendarService(db);
            const recentEvents = await calendarService.getRecentEvents(userId, { days: 30, limit: 10 });
            
            if (recentEvents.length > 0 && recentEvents[0]) {
              // Use the most recent event
              const targetEvent = recentEvents[0];
              
              logger.info(
                {
                  userId,
                  originalAction: actionTemplate,
                  targetEventTitle: targetEvent.title,
                  locationValue,
                  originalUserText,
                  reason: 'misclassified_as_address_but_user_wants_event_location_update'
                },
                'Converting address update to event location update'
              );
              
              // Convert to event update operation
              const eventActionTemplate = `Update an event: ${targetEvent.title} - changes: location to ${locationValue}`;
              
              // Route to event update operation
              await handleEventOperation(originalUserText, eventActionTemplate, recipient, userId, db, whatsappService);
              
              return; // Exit early, don't process as address operation
            }
          } catch (error) {
            logger.warn({ error, userId }, 'Failed to find recent event for location update');
          }
        }
      }
      
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

    // Check if this is multiple delete operations (e.g., "Delete an event: aaaa\nDelete an event: aaa\nDelete an event: test")
    const deleteLines = actionTemplate.split('\n').filter(line => 
      line.trim().toLowerCase().startsWith('delete an event:')
    );
    
    // If we have multiple delete lines, handle them separately
    if (deleteLines.length > 1) {
      logger.info(
        {
          userId,
          deleteLinesCount: deleteLines.length,
          deleteLines: deleteLines,
        },
        'Detected multiple event deletions, processing each separately'
      );
      
      const results: string[] = [];
      let successCount = 0;
      let failCount = 0;
      
      for (const deleteLine of deleteLines) {
        try {
          // Process each deletion
          await handleSingleEventOperation(originalUserText, deleteLine.trim(), recipient, userId, db, whatsappService, (result) => {
            if (result.success) {
              successCount++;
              if (result.message) {
                results.push(result.message);
              }
            } else {
              failCount++;
              if (result.message) {
                results.push(result.message);
              }
            }
          });
        } catch (error) {
          failCount++;
          logger.error({ error, userId, deleteLine }, 'Failed to process individual event deletion');
          results.push(`Failed to delete event: ${deleteLine.substring(0, 50)}`);
        }
      }
      
      // Send summary message
      if (successCount > 0 || failCount > 0) {
        let summaryMessage = '';
        if (successCount > 0) {
          summaryMessage += `⛔ *${successCount} event${successCount !== 1 ? 's' : ''} deleted*\n\n`;
        }
        if (failCount > 0) {
          summaryMessage += `❌ *${failCount} deletion${failCount !== 1 ? 's' : ''} failed*\n\n`;
        }
        if (results.length > 0) {
          summaryMessage += results.join('\n');
        }
        
        await whatsappService.sendTextMessage(recipient, summaryMessage.trim());
        
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: summaryMessage.trim(),
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing message');
        }
      }
      
      return; // Exit after handling multiple deletions
    }

    // Single operation - process normally
    await handleSingleEventOperation(originalUserText, actionTemplate, recipient, userId, db, whatsappService);
  } catch (error) {
    logger.error({ error, userId, originalText: originalUserText }, 'Failed to handle event operation');
    await whatsappService.sendTextMessage(
      recipient,
      "❌ Error Processing Event Request\n\nCalendar operation failed. Please check the logs for more details or try again."
    );
  }
}

/**
 * Handle a single event operation (create, update, delete)
 */
async function handleSingleEventOperation(
  originalUserText: string,
  actionTemplate: string,
  recipient: string,
  userId: string,
  db: Database,
  whatsappService: WhatsAppService,
  onResult?: (result: { success: boolean; message?: string }) => void
): Promise<void> {
  try {
    // Trim the action template to handle any leading/trailing whitespace
    const trimmedTemplate = actionTemplate.trim();
    
    // Determine operation type from action template
    const isCreate = trimmedTemplate.toLowerCase().startsWith('create an event:');
    const isUpdate = trimmedTemplate.toLowerCase().startsWith('update an event:');
    const isDelete = trimmedTemplate.toLowerCase().startsWith('delete an event:');
    const isShare = trimmedTemplate.toLowerCase().startsWith('share an event:');

      logger.info(
        {
          userId,
          isCreate,
          isUpdate,
          isDelete,
          isShare,
          actionTemplate: actionTemplate.substring(0, 200),
          trimmedTemplate: trimmedTemplate.substring(0, 200),
        },
        'Event operation type detection'
      );

    // Handle "Share an event" - convert to UPDATE operation with attendees
    if (isShare) {
      logger.info(
        {
          userId,
          actionTemplate,
          templateLength: actionTemplate.length,
          firstChars: actionTemplate.substring(0, 50),
        },
        'Detected "Share an event" template, attempting to parse'
      );
      
      // Parse: "Share an event: {title} - with: {person1, person2} - calendar: {calendar}"
      // More flexible regex that handles variations - use trimmed template
      const shareMatch = trimmedTemplate.match(/^Share an event:\s*(.+?)(?:\s*-\s*with:\s*(.+?))?(?:\s*-\s*calendar:\s*(.+?))?$/i);
      
      if (shareMatch && shareMatch[1]) {
        const eventTitle = shareMatch[1].trim();
        const attendeesStr = shareMatch[2] ? shareMatch[2].trim() : '';
        
        logger.info(
          {
            userId,
            originalTemplate: actionTemplate,
            eventTitle,
            attendeesStr,
            shareMatchGroups: shareMatch,
          },
          'Successfully parsed "Share an event" template'
        );
        
        if (!attendeesStr) {
          logger.warn({ userId, actionTemplate }, 'No attendees found in "Share an event" template');
          const errorMessage = `I'm sorry, I couldn't find who to invite. Please specify the person(s) to invite.\n\nExample: "invite Drala to Call with Paul event"`;
          await whatsappService.sendTextMessage(recipient, errorMessage);
          if (onResult) {
            onResult({ success: false, message: errorMessage });
          }
          return;
        }
        
        // Convert to UPDATE operation format
        // Extract attendees and format them
        // Normalize "and" to comma for easier parsing
        const normalizedAttendees = attendeesStr.replace(/\s+and\s+/gi, ', ');
        
        // Create UPDATE template: "Update an event: {title} - changes: attendees to {attendees}"
        const calendarStr = shareMatch[3] ? shareMatch[3].trim() : 'primary';
        const updateTemplate = `Update an event: ${eventTitle} - changes: attendees to ${normalizedAttendees} - calendar: ${calendarStr}`;
        
        logger.info(
          {
            userId,
            originalTemplate: actionTemplate,
            convertedTemplate: updateTemplate,
            eventTitle,
            normalizedAttendees,
          },
          'Converted "Share an event" to UPDATE template, calling handleSingleEventOperation recursively'
        );
        
        // Recursively call handleSingleEventOperation with the converted template
        await handleSingleEventOperation(originalUserText, updateTemplate, recipient, userId, db, whatsappService, onResult);
        return;
      } else {
        logger.warn(
          {
            userId,
            actionTemplate,
            shareMatchResult: shareMatch,
          },
          'Failed to parse "Share an event" template - regex did not match'
        );
        const errorMessage = `I'm sorry, I couldn't understand which event to share or who to invite.\n\nPlease try again with a format like: "invite [person] to [event name]" or "share [event name] with [person]".`;
        await whatsappService.sendTextMessage(recipient, errorMessage);
        if (onResult) {
          onResult({ success: false, message: errorMessage });
        }
        return;
      }
    }

    // Fallback: Check if it's a "Share an event" that wasn't caught by the initial check
    // This handles cases where there might be extra whitespace or formatting issues
    if (!isCreate && !isUpdate && !isDelete && !isShare) {
      const lowerTemplate = trimmedTemplate.toLowerCase();
      if (lowerTemplate.includes('share an event') || lowerTemplate.includes('invite')) {
        logger.info(
          {
            userId,
            actionTemplate: trimmedTemplate,
            detectedViaFallback: true,
          },
          'Detected "Share an event" via fallback check'
        );
        // Try to parse as share operation
        const shareMatch = trimmedTemplate.match(/Share an event:\s*(.+?)(?:\s*-\s*with:\s*(.+?))?(?:\s*-\s*calendar:\s*(.+?))?/i);
        if (shareMatch && shareMatch[1]) {
          const eventTitle = shareMatch[1].trim();
          const attendeesStr = shareMatch[2] ? shareMatch[2].trim() : '';
          
          if (attendeesStr) {
            const normalizedAttendees = attendeesStr.replace(/\s+and\s+/gi, ', ');
            const calendarStr = shareMatch[3] ? shareMatch[3].trim() : 'primary';
            const updateTemplate = `Update an event: ${eventTitle} - changes: attendees to ${normalizedAttendees} - calendar: ${calendarStr}`;
            
            logger.info(
              {
                userId,
                convertedTemplate: updateTemplate,
              },
              'Converted "Share an event" via fallback, calling handleSingleEventOperation'
            );
            
            await handleSingleEventOperation(originalUserText, updateTemplate, recipient, userId, db, whatsappService, onResult);
            return;
          }
        }
      }
      
      logger.warn(
        {
          userId,
          actionTemplate: trimmedTemplate,
          isCreate,
          isUpdate,
          isDelete,
          isShare,
          lowerTemplate: lowerTemplate.substring(0, 100),
        },
        'Unknown event operation type'
      );
      const errorMessage = `I'm sorry, I couldn't understand what event operation you want to perform.\n\nAction template: ${trimmedTemplate.substring(0, 200)}\n\nPlease try again.`;
      await whatsappService.sendTextMessage(recipient, errorMessage);
      if (onResult) {
        onResult({ success: false, message: errorMessage });
      }
      return;
    }

    // Parse the action template to extract calendar intent
    logger.info({ userId, actionTemplate }, 'Parsing event template to calendar intent');
    
    let intent;
    try {
      intent = parseEventTemplateToIntent(actionTemplate, isCreate, isUpdate, isDelete);
      
      // Check if this is a number-based deletion (e.g., "Delete an event: 1")
      if (isDelete && intent.targetEventTitle) {
        const eventNumberMatch = intent.targetEventTitle.match(/^(\d+)$/);
        if (eventNumberMatch && eventNumberMatch[1]) {
          const eventNumber = parseInt(eventNumberMatch[1], 10);
          logger.info(
            {
              userId,
              eventNumber,
              originalTargetEventTitle: intent.targetEventTitle,
            },
            'Detected number-based event deletion, checking list context'
          );
          
          // Get list context from ActionExecutor to find the actual event
          const executor = new ActionExecutor(db, userId, whatsappService, recipient);
          const listContext = (executor as any).getListContext();
          
          if (listContext && listContext.type === 'event' && listContext.items.length > 0) {
            const cachedEvent = listContext.items.find((item: any) => item.number === eventNumber);
            if (cachedEvent && cachedEvent.name) {
              logger.info(
                {
                  userId,
                  eventNumber,
                  cachedEventId: cachedEvent.id,
                  cachedEventName: cachedEvent.name,
                  cachedCalendarId: cachedEvent.calendarId,
                },
                'Found event in list context, updating intent with actual event name'
              );
              // Update intent with the actual event name from the list
              intent.targetEventTitle = cachedEvent.name;
              // Store calendarId if available for later use
              if (cachedEvent.calendarId) {
                (intent as any).calendarId = cachedEvent.calendarId;
              }
            } else {
              logger.warn(
                {
                  userId,
                  eventNumber,
                  listContextType: listContext.type,
                  itemsCount: listContext.items.length,
                },
                'Event number not found in list context'
              );
            }
          } else {
            logger.warn(
              {
                userId,
                eventNumber,
                hasListContext: !!listContext,
                listContextType: listContext?.type,
              },
              'No event list context available for number-based deletion'
            );
          }
        }
      }
      
      // Check if user wants Google Meet (check both original user text and action template for keywords)
      const userTextLower = originalUserText.toLowerCase();
      const actionTemplateLower = actionTemplate.toLowerCase();
      
      // Check if location is actually "Google Meet" - if so, clear location and request Google Meet
      const locationLower = intent.location?.toLowerCase().trim() || '';
      const isGoogleMeetLocation = 
        locationLower === 'google meet' ||
        locationLower === 'meet' ||
        locationLower === 'googlemeet' ||
        locationLower.includes('google meet') ||
        locationLower.includes('meet link');
      
      if (isGoogleMeetLocation) {
        logger.info(
          {
            userId,
            originalLocation: intent.location,
            reason: 'location_is_google_meet',
          },
          'Detected Google Meet in location field - clearing location and requesting Google Meet'
        );
        intent.location = ''; // Set to empty string to remove location (not undefined)
      }
      
      // Resolve location from saved addresses if it matches an address name
      if (intent.location && intent.location.trim()) {
        try {
          const addresses = await getUserAddresses(db, userId);
          const locationLower = intent.location.toLowerCase().trim();
          
          // Try to find matching address by name (exact match or contains)
          for (const address of addresses) {
            const addressNameLower = address.name.toLowerCase().trim();
            
            // Check for exact match or if location contains address name or vice versa
            if (locationLower === addressNameLower || 
                locationLower.includes(addressNameLower) || 
                addressNameLower.includes(locationLower)) {
              
              // Build full address string from address components
              const addressParts = [
                address.street,
                address.city,
                address.state,
                address.zip,
                address.country,
              ].filter((part): part is string => typeof part === 'string' && part.trim() !== '');
              
              if (addressParts.length > 0) {
                const fullAddress = addressParts.join(', ');
                logger.info(
                  {
                    userId,
                    originalLocation: intent.location,
                    resolvedLocation: fullAddress,
                    addressName: address.name,
                  },
                  'Resolved location from saved address'
                );
                intent.location = fullAddress;
                break; // Use first match
              } else if (address.name) {
                // If no address parts but we have a name, use the name
                logger.info(
                  {
                    userId,
                    originalLocation: intent.location,
                    resolvedLocation: address.name,
                    addressName: address.name,
                  },
                  'Resolved location to address name (no address parts)'
                );
                intent.location = address.name;
                break;
              }
            }
          }
        } catch (error) {
          logger.warn({ error, userId, location: intent.location }, 'Failed to resolve location from saved addresses');
        }
      }
      
      // Enhanced Google Meet detection - also check for "remove location and add google meet" pattern
      const removeLocationAndAddMeet = 
        (userTextLower.includes('remove location') && userTextLower.includes('add google meet')) ||
        (userTextLower.includes('remove location') && userTextLower.includes('add meet')) ||
        (userTextLower.includes('delete location') && userTextLower.includes('add google meet')) ||
        (userTextLower.includes('clear location') && userTextLower.includes('add google meet'));
      
      const wantsGoogleMeet = 
        removeLocationAndAddMeet ||
        userTextLower.includes('google meet') ||
        userTextLower.includes('meet link') ||
        userTextLower.includes('video call') ||
        userTextLower.includes('video meeting') ||
        userTextLower.includes('create meet') ||
        userTextLower.includes('add meet') ||
        (userTextLower.includes('meet') && (userTextLower.includes('link') || userTextLower.includes('url'))) ||
        actionTemplateLower.includes('google meet') ||
        actionTemplateLower.includes('meet link') ||
        (actionTemplateLower.includes('attendees:') && actionTemplateLower.includes('google meet')) ||
        isGoogleMeetLocation; // Also check if location was Google Meet
      
      // If user wants to remove location and add Google Meet, ensure location is empty
      if (removeLocationAndAddMeet && isUpdate) {
        intent.location = ''; // Explicitly set to empty string
        logger.info(
          {
            userId,
            originalUserText,
            reason: 'remove_location_and_add_google_meet',
          },
          'Detected "remove location and add google meet" - setting location to empty and requesting Google Meet'
        );
      }
      
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
      // Support both CREATE and UPDATE operations for adding attendees
      if (intent.attendees && intent.attendees.length > 0 && (isCreate || isUpdate)) {
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
            
            // Normalize email addresses from voice input (e.g., "paul at imaginesignage.com" -> "paul@imaginesignage.com")
            const normalizedAttendee = normalizeEmailFromVoice(attendeeTrimmed);
            
            // Check if it's already a valid email address (use proper regex validation)
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(normalizedAttendee)) {
              const emailLower = normalizedAttendee.toLowerCase();
              if (!resolvedAttendees.includes(emailLower)) {
                resolvedAttendees.push(emailLower);
                logger.info(
                  {
                    userId,
                    attendeeName: attendeeTrimmed,
                    normalizedAttendee: normalizedAttendee,
                    resolvedEmail: emailLower,
                    resolvedCount: resolvedAttendees.length,
                  },
                  'Attendee is already a valid email address (possibly normalized from voice input)'
                );
              } else {
                logger.warn(
                  {
                    userId,
                    attendeeName: attendeeTrimmed,
                    normalizedAttendee: normalizedAttendee,
                    resolvedEmail: emailLower,
                  },
                  'Skipping duplicate email address (already in resolved list)'
                );
              }
              continue;
            }
            
            // Use normalized version for friend matching (but keep original for logging)
            const attendeeForMatching = normalizedAttendee;
            
            // Check if attendee is a tag (before friend name matching)
            const attendeeLower = attendeeForMatching.toLowerCase().trim();
            const matchingTagFriends = friends.filter(friend => 
              friend.tags && Array.isArray(friend.tags) && friend.tags.some(tag => 
                tag && typeof tag === 'string' && tag.toLowerCase() === attendeeLower
              )
            );
            
            if (matchingTagFriends.length > 0) {
              // Found friends with this tag - add all their emails
              logger.info(
                {
                  userId,
                  attendeeIndex: i,
                  attendeeName: attendeeTrimmed,
                  tag: attendeeTrimmed,
                  matchingFriendsCount: matchingTagFriends.length,
                  friendNames: matchingTagFriends.map(f => f.name),
                },
                `✅ Found tag "${attendeeTrimmed}" with ${matchingTagFriends.length} friends`
              );
              
              let tagEmailsAdded = 0;
              for (const tagFriend of matchingTagFriends) {
                const friendEmail = tagFriend.email || tagFriend.connectedUser?.email;
                if (friendEmail) {
                  const emailLower = friendEmail.toLowerCase();
                  if (!resolvedAttendees.includes(emailLower)) {
                    resolvedAttendees.push(emailLower);
                    tagEmailsAdded++;
                    logger.info(
                      {
                        userId,
                        attendeeIndex: i,
                        tag: attendeeTrimmed,
                        friendName: tagFriend.name,
                        friendEmail: emailLower,
                        tagEmailsAdded,
                      },
                      `Added email from tag friend: ${tagFriend.name} (${emailLower})`
                    );
                  }
                }
              }
              
              if (tagEmailsAdded > 0) {
                logger.info(
                  {
                    userId,
                    attendeeIndex: i,
                    tag: attendeeTrimmed,
                    tagEmailsAdded,
                    totalResolved: resolvedAttendees.length,
                  },
                  `✅ Tag "${attendeeTrimmed}" resolved to ${tagEmailsAdded} email(s)`
                );
                continue; // Move to next attendee
              } else {
                logger.warn(
                  {
                    userId,
                    attendeeIndex: i,
                    tag: attendeeTrimmed,
                    matchingFriendsCount: matchingTagFriends.length,
                  },
                  `Tag "${attendeeTrimmed}" found but no emails available from friends`
                );
                // Continue to try friend name matching as fallback
              }
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
                normalizedAttendee: normalizedAttendee,
                attendeeLower: attendeeForMatching.toLowerCase().trim(),
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
              const attendeeLower = attendeeForMatching.toLowerCase().trim();
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
                const attendeeLower = attendeeForMatching.toLowerCase().trim();
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
                const attendeeLower = attendeeForMatching.toLowerCase().trim();
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
                const attendeeLower = attendeeForMatching.toLowerCase().trim();
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
                const attendeeLower = attendeeForMatching.toLowerCase().trim();
                
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
              // Normalize again in case it wasn't normalized earlier
              const doubleCheckNormalized = normalizeEmailFromVoice(attendeeTrimmed);
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (emailRegex.test(doubleCheckNormalized)) {
                // It's already a valid email, use it
                const emailLower = doubleCheckNormalized.toLowerCase();
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
      // For CREATE operations, add to description
      if (wantsGoogleMeet && isCreate && intent.description && !intent.description.toLowerCase().includes('google meet')) {
        intent.description = (intent.description + ' (Google Meet requested)').trim();
      } else if (wantsGoogleMeet && isCreate && !intent.description) {
        intent.description = 'Google Meet requested';
      }
      
      // For UPDATE operations, also add to description so calendar service can detect it
      if (wantsGoogleMeet && isUpdate && intent.description && !intent.description.toLowerCase().includes('google meet')) {
        intent.description = (intent.description + ' (Google Meet requested)').trim();
      } else if (wantsGoogleMeet && isUpdate && !intent.description) {
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
          requiresConfirmation: result.requiresConfirmation,
          resultEventAttendees: (result.event as any)?.attendees,
          resultEventAttendeesCount: (result.event as any)?.attendees?.length || 0,
        },
        '✅ Calendar operation executed - checking result attendees'
      );
      
      // Check if conflict was detected and confirmation is required
      if (result.requiresConfirmation && result.conflictEvents) {
        // Store pending operation for later confirmation
        pendingEventOperations.set(userId, {
          intent,
          actionTemplate: actionTemplate,
          originalUserText: originalUserText,
          recipient: recipient,
          timestamp: new Date(),
        });
        
        logger.info(
          {
            userId,
            action: intent.action,
            conflictsCount: result.conflictEvents.length,
          },
          'Event conflict detected, stored pending operation and asking for confirmation'
        );
        
        // Send conflict message to user
        await whatsappService.sendTextMessage(recipient, result.message || 'Event conflict detected. Please confirm to proceed.');
        
        // Log outgoing message
        try {
          const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, recipient);
          if (whatsappNumber) {
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId,
              messageType: 'text',
              messageContent: result.message || 'Event conflict detected. Please confirm to proceed.',
              isFreeMessage: true,
            });
          }
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to log outgoing conflict message');
        }
        
        if (onResult) {
          onResult({ success: false, message: result.message });
        }
        return; // Exit early, don't proceed with event creation/update
      }
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
      
      const errorMessage = `Calendar operation failed: ${calendarError instanceof Error ? calendarError.message : String(calendarError)}. Please check the logs for more details or try again.`;
      
      // Call callback if provided (for multiple deletions)
      if (onResult) {
        onResult({ success: false, message: errorMessage });
        return; // Don't send message here, let the caller handle it
      }
      
      throw new Error(errorMessage);
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
        // - If no location OR Google Meet requested: show "No location" with Google Meet button
        let locationLink: string | null = null;
        let buttonUrl: string | null = null;
        let buttonText: string = '';
        
        // Check if location is actually "Google Meet" - filter it out
        const eventLocation = result.event.location?.trim() || '';
        const locationLower = eventLocation.toLowerCase();
        const isGoogleMeetLocation = 
          locationLower === 'google meet' ||
          locationLower === 'meet' ||
          locationLower === 'googlemeet' ||
          locationLower.includes('google meet') ||
          locationLower.includes('meet link');
        
        // Check if location is empty string (explicitly removed) or just empty/undefined
        const hasLocation = eventLocation && eventLocation.trim().length > 0 && !isGoogleMeetLocation;
        
        if (hasLocation) {
          // User provided actual location/address - show location name, button will have Google Maps link
          locationLink = await getGoogleMapsLinkForLocation(result.event.location, userId);
          responseMessage += `*Location:* ${result.event.location}\n`;
          if (locationLink) {
            buttonUrl = locationLink;
            buttonText = 'Open in Google Maps';
          }
        } else {
          // No location (empty, undefined, or was Google Meet) - show "No location"
          responseMessage += `*Location:* No location\n`;
          // If Google Meet exists, use it as the button
          if (fullEvent.conferenceUrl) {
            buttonUrl = fullEvent.conferenceUrl;
            buttonText = 'Google Meet';
          }
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
        
        // Build message text (all in one message with button) - matching CREATE style
        responseMessage = `⚠️ *Event Updated*\n\n`;
        responseMessage += `*Title:* ${result.event.title || 'Untitled Event'}\n`;
        responseMessage += `*Date:* ${eventDate}\n`;
        responseMessage += `*Time:* ${eventTime}\n`;
        
        // Determine what to show in Location field:
        // - If location/address exists: show location name (not URL)
        // - If no location OR Google Meet requested: show "No location" with Google Meet button
        let locationLink: string | null = null;
        let buttonUrl: string | null = null;
        let buttonText: string = '';
        
        // Check if location is actually "Google Meet" - filter it out
        const eventLocation = result.event.location?.trim() || '';
        const locationLower = eventLocation.toLowerCase();
        const isGoogleMeetLocation = 
          locationLower === 'google meet' ||
          locationLower === 'meet' ||
          locationLower === 'googlemeet' ||
          locationLower.includes('google meet') ||
          locationLower.includes('meet link');
        
        // Check if location is empty string (explicitly removed) or just empty/undefined
        const hasLocation = eventLocation && eventLocation.trim().length > 0 && !isGoogleMeetLocation;
        
        if (hasLocation) {
          // User provided actual location/address - show location name, button will have Google Maps link
          locationLink = await getGoogleMapsLinkForLocation(result.event.location, userId);
          responseMessage += `*Location:* ${result.event.location}\n`;
          if (locationLink) {
            buttonUrl = locationLink;
            buttonText = 'Open in Google Maps';
          }
        } else {
          // No location (empty, undefined, or was Google Meet) - show "No location"
          responseMessage += `*Location:* No location\n`;
          // If Google Meet exists, use it as the button
          if (fullEvent.conferenceUrl) {
            buttonUrl = fullEvent.conferenceUrl;
            buttonText = 'Google Meet';
          }
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
      } else if (result.action === 'DELETE' && result.event) {
        // Simple delete message - only show event name
        responseMessage = `⛔ ${result.event.title || 'Untitled Event'} deleted`;
        
        // Call callback if provided (for multiple deletions)
        if (onResult) {
          onResult({ success: result.success, message: responseMessage });
          return; // Don't send message here, let the caller handle it
        }
        // If no callback, continue to send message normally below
      } else if (result.action === 'QUERY' && result.events) {
        if (result.events.length === 0) {
          responseMessage = "📅 *You have no events scheduled.*";
        } else {
          // Determine header based on actionTemplate timeframe first, then infer from events
          let headerText = "Events:";
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          
          // Check actionTemplate for timeframe keywords (this takes priority)
          const actionTemplateLower = actionTemplate.toLowerCase();
          const isTodayQuery = actionTemplateLower.includes('list events: today') || 
                              actionTemplateLower.includes('list events:today') ||
                              actionTemplateLower.match(/list events:\s*today/i);
          const isTomorrowQuery = actionTemplateLower.includes('list events: tomorrow') || 
                                 actionTemplateLower.includes('list events:tomorrow') ||
                                 actionTemplateLower.match(/list events:\s*tomorrow/i);
          const isThisWeekQuery = actionTemplateLower.includes('list events: this week') || 
                                  actionTemplateLower.includes('list events:this week') ||
                                  actionTemplateLower.match(/list events:\s*this\s+week/i);
          
          // Check if all events are today (for fallback when timeframe not in template)
          const allToday = result.events.every((event: any) => {
            const eventDate = new Date(event.start);
            const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
            return eventDay.getTime() === today.getTime();
          });
          
          // Check if all events are tomorrow (for fallback when timeframe not in template)
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const allTomorrow = result.events.every((event: any) => {
            const eventDate = new Date(event.start);
            const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
            return eventDay.getTime() === tomorrow.getTime();
          });
          
          // Determine header - prioritize actionTemplate timeframe
          if (isTodayQuery || (allToday && !isTomorrowQuery && !isThisWeekQuery)) {
            headerText = `📅 *Today's Events:*`;
          } else if (isTomorrowQuery || (allTomorrow && !isTodayQuery && !isThisWeekQuery)) {
            headerText = `📅 *Tomorrow's Events:*`;
          } else if (isThisWeekQuery) {
            headerText = `📅 *Events This Week*`;
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
    // Can also have: - location: {location} - attendees: {name1, name2} - overlap: yes
    
    // Extract title (everything after "Create an event:" until first " - ")
    const titleMatch = template.match(/^Create an event:\s*(.+?)(?:\s*-\s*date:|\s*-\s*time:|\s*-\s*calendar:|\s*-\s*location:|\s*-\s*attendees:|\s*-\s*overlap:|$)/i);
    if (titleMatch && titleMatch[1]) {
      intent.title = titleMatch[1].trim();
    }
    
    // Extract overlap flag (for conflict confirmations)
    const overlapMatch = template.match(/\s*-\s*overlap:\s*(yes|true|1)/i);
    if (overlapMatch) {
      (intent as any).bypassConflictCheck = true;
      logger.info({ template }, '✅ Parsed overlap: yes from event template, setting bypassConflictCheck');
    }
    
    // Extract date
    const dateMatch = template.match(/\s*-\s*date:\s*(.+?)(?:\s*-\s*time:|\s*-\s*calendar:|\s*-\s*location:|\s*-\s*attendees:|$)/i);
    if (dateMatch && dateMatch[1]) {
      intent.startDate = parseRelativeDate(dateMatch[1].trim());
    }
    
    // Extract time (can be a single time or a time range like "10:00 to 11:30")
    const timeMatch = template.match(/\s*-\s*time:\s*(.+?)(?:\s*-\s*calendar:|\s*-\s*location:|\s*-\s*attendees:|$)/i);
    if (timeMatch && timeMatch[1]) {
      const timeStr = timeMatch[1].trim();
      
      // Check for time range patterns: "10:00 to 11:30", "from 10:00 to 11:30", "10:00-11:30", "10:00 until 11:30"
      // Pattern matches: optional "from", start time, "to"/"-"/"until", end time
      const timeRangeMatch = timeStr.match(/(?:from\s+)?([\d:]+(?:\s*(?:am|pm))?)\s+(?:to|-|until)\s+([\d:]+(?:\s*(?:am|pm))?)/i);
      if (timeRangeMatch && timeRangeMatch[1] && timeRangeMatch[2]) {
        // Time range detected - extract start and end times
        intent.startTime = parseTime(timeRangeMatch[1].trim());
        intent.endTime = parseTime(timeRangeMatch[2].trim());
        logger.info(
          {
            timeStr,
            startTime: intent.startTime,
            endTime: intent.endTime,
            template,
          },
          '✅ Parsed time range from event template'
        );
      } else {
        // Single time - just parse it
        intent.startTime = parseTime(timeStr);
        logger.info(
          {
            timeStr,
            parsedTime: intent.startTime,
            template,
          },
          '✅ Parsed single time from event template'
        );
      }
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
        
        // Normalize email addresses from voice input first (e.g., "paul at imaginesignage.com" -> "paul@imaginesignage.com")
        const emailNormalizedStr = normalizeEmailFromVoice(attendeesStr);
        
        // Split by comma, but also handle "and" as a separator (e.g., "Paul and Liz" or "Paul, Liz and John")
        // First, replace " and " with comma for easier parsing
        const normalizedStr = emailNormalizedStr.replace(/\s+and\s+/gi, ', ');
        logger.info(
          {
            originalAttendeesStr: attendeesStr,
            emailNormalizedStr: emailNormalizedStr,
            normalizedStr: normalizedStr,
          },
          '🔄 Normalized attendees string (normalized emails from voice input, replaced "and" with commas)'
        );
        
        const splitAttendees = normalizedStr.split(',').map(a => normalizeEmailFromVoice(a.trim())).filter(a => a.length > 0);
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
    // Parse: "Update an event: {title} - changes: {details} - calendar: {calendar} - overlap: yes"
    const updateMatch = template.match(/^Update an event:\s*(.+?)(?:\s*-\s*changes:\s*(.+?))?(?:\s*-\s*calendar:\s*(.+?))?(?:\s*-\s*overlap:\s*(yes|true|1))?$/i);
    
    if (updateMatch && updateMatch[1]) {
      intent.targetEventTitle = updateMatch[1].trim();
      
      // Extract overlap flag (for conflict confirmations)
      if (updateMatch[4]) {
        (intent as any).bypassConflictCheck = true;
        logger.info({ template }, '✅ Parsed overlap: yes from UPDATE event template, setting bypassConflictCheck');
      }
      
      if (updateMatch[2]) {
        const changes = updateMatch[2].trim();
        
        // CRITICAL: Only parse date/time if user explicitly mentions date/time keywords
        // Skip date/time parsing if only location, title, description, or attendees are being updated
        const hasExplicitDateKeyword = /date\s+to|reschedule|move\s+to|time\s+to|on\s+(?:today|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})/i.test(changes);
        const hasExplicitTimeKeyword = /time\s+to|at\s+[\d:]+(?:\s*(?:am|pm))?/i.test(changes);
        
        // Only parse date/time if explicit keywords are present
        if (hasExplicitDateKeyword || hasExplicitTimeKeyword) {
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
            // Only match explicit date patterns, not generic "on" or "for" that might match location strings
          const dateMatch = changes.match(/date\s+to\s+(.+?)(?:\s|$)/i) 
            || changes.match(/reschedule\s+to\s+(.+?)(?:\s+at|\s|$)/i)
              || changes.match(/move\s+to\s+(.+?)(?:\s+at|\s|$)/i)
              || changes.match(/(?:on|for)\s+(today|tomorrow|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})(?:\s+at|\s|$)/i);
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
          // Handle patterns like "time to 12:00 tomorrow" or "time to 12:00 on tomorrow"
          if (!intent.startTime) {
            // First, try time range pattern: "time to 10:00 to 11:30" or "time to 10:00-11:30"
            const timeRangeMatch = changes.match(/time\s+to\s+(?:from\s+)?([\d:]+(?:\s*(?:am|pm))?)\s+(?:to|-|until)\s+([\d:]+(?:\s*(?:am|pm))?)/i);
            if (timeRangeMatch && timeRangeMatch[1] && timeRangeMatch[2]) {
              // Time range detected - extract start and end times
              intent.startTime = parseTime(timeRangeMatch[1].trim());
              intent.endTime = parseTime(timeRangeMatch[2].trim());
              logger.info(
                {
                  changes,
                  startTime: intent.startTime,
                  endTime: intent.endTime,
                },
                '✅ Parsed time range from UPDATE changes'
              );
            } else {
              // Try "time to {time} {date}" pattern (e.g., "time to 12:00 tomorrow", "time to 12:00 on tomorrow")
            // This pattern matches: "time to" followed by time, then optional "on", then date keyword
            const timeWithDateMatch = changes.match(/time\s+to\s+([\d:]+(?:\s*(?:am|pm))?)\s+(?:on\s+)?(today|tomorrow|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}|.+?)(?:\s|$)/i);
            if (timeWithDateMatch && timeWithDateMatch[1] && timeWithDateMatch[2]) {
              intent.startTime = parseTime(timeWithDateMatch[1].trim());
              // Only set date if it wasn't already set
              if (!intent.startDate) {
                intent.startDate = parseRelativeDate(timeWithDateMatch[2].trim());
              }
              logger.info(
                {
                  changes,
                  extractedTime: timeWithDateMatch[1],
                  extractedDate: timeWithDateMatch[2],
                  parsedStartDate: intent.startDate,
                  parsedStartTime: intent.startTime,
                },
                '✅ Extracted time and date from "time to {time} {date}" pattern'
              );
            } else {
              // Try simple "time to {time}" pattern (e.g., "time to 12:00")
              const timeMatch = changes.match(/time\s+to\s+([\d:]+(?:\s*(?:am|pm))?)(?:\s|$)/i) 
                || changes.match(/at\s+([\d:]+(?:\s*(?:am|pm))?)(?:\s|$)/i);
              if (timeMatch && timeMatch[1]) {
                intent.startTime = parseTime(timeMatch[1].trim());
                }
              }
            }
          }
          
          // If we have time but no date, and the changes contain a date keyword, try to extract it
          // This handles cases where date appears elsewhere in the changes string
          if (intent.startTime && !intent.startDate) {
            // Look for date keywords that might have been missed (e.g., "tomorrow", "today", day names)
            // Check the entire changes string for date keywords
            const dateKeywordMatch = changes.match(/(?:on\s+|to\s+)?(today|tomorrow|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
            if (dateKeywordMatch && dateKeywordMatch[1]) {
              intent.startDate = parseRelativeDate(dateKeywordMatch[1].trim());
              logger.info(
                {
                  changes,
                  extractedDate: dateKeywordMatch[1],
                  parsedStartDate: intent.startDate,
                },
                '✅ Extracted date keyword from changes string'
              );
            }
          }
        }
        // End of date/time parsing - only executed if explicit date/time keywords were found
        }
        
        // Check if title is being updated
        const titleMatch = changes.match(/title\s+to\s+(.+?)(?:\s|$)/i) 
          || changes.match(/rename\s+to\s+(.+?)(?:\s|$)/i);
        if (titleMatch && titleMatch[1]) {
          intent.title = titleMatch[1].trim();
        }
        
        // Check if location should be removed
        // Support patterns: "remove location", "delete location", "clear location"
        const removeLocationMatch = changes.match(/(?:remove|delete|clear)\s+location/i);
        if (removeLocationMatch) {
          intent.location = ''; // Set to empty string to remove location
          logger.info(
            {
              changes,
              reason: 'remove_location_detected',
            },
            'Detected location removal request - setting location to empty'
          );
        }
        
        // Check if location/address is being updated
        // Support patterns: "location to X", "add location X", "edit location to X", "location: X", "location - X"
        // Only match if location removal wasn't already detected
        if (!removeLocationMatch) {
          // Capture full location value - use greedy match to get all words until end of string
          // or until another change field pattern appears
          // First try to match with lookahead for other change fields
          let locationMatch = changes.match(/location\s+to\s+(.+?)(?:\s+(?:title|description|notes?|details?|date|time|attendees?)\s+to\s)/i) 
            || changes.match(/address\s+to\s+(.+?)(?:\s+(?:title|description|notes?|details?|date|time|attendees?)\s+to\s)/i)
            || changes.match(/place\s+to\s+(.+?)(?:\s+(?:title|description|notes?|details?|date|time|attendees?)\s+to\s)/i)
            || changes.match(/(?:add|edit|set|change|update)\s+location\s+(?:to\s+)?(.+?)(?:\s+(?:title|description|notes?|details?|date|time|attendees?)\s+to\s)/i)
            || changes.match(/location\s*[:=]\s*(.+?)(?:\s+(?:title|description|notes?|details?|date|time|attendees?)\s+to\s)/i)
            || changes.match(/location\s*-\s*(.+?)(?:\s+(?:title|description|notes?|details?|date|time|attendees?)\s+to\s)/i);
          
          // If no match (meaning no other change fields), capture until end of string
          if (!locationMatch) {
            locationMatch = changes.match(/location\s+to\s+(.+)$/i) 
              || changes.match(/address\s+to\s+(.+)$/i)
              || changes.match(/place\s+to\s+(.+)$/i)
              || changes.match(/(?:add|edit|set|change|update)\s+location\s+(?:to\s+)?(.+)$/i)
              || changes.match(/location\s*[:=]\s*(.+)$/i)
              || changes.match(/location\s*-\s*(.+)$/i);
          }
          
          if (locationMatch && locationMatch[1]) {
            const locationValue = locationMatch[1].trim();
            // Check if the location value is empty (e.g., "location to " with nothing after)
            if (locationValue === '') {
              intent.location = ''; // Explicitly set to empty
            } else {
              intent.location = locationValue;
            }
          }
        }
        
        // Check if description is being updated
        const descriptionMatch = changes.match(/description\s+to\s+(.+?)(?:\s|$)/i) 
          || changes.match(/notes?\s+to\s+(.+?)(?:\s|$)/i)
          || changes.match(/details?\s+to\s+(.+?)(?:\s|$)/i);
        if (descriptionMatch && descriptionMatch[1]) {
          intent.description = descriptionMatch[1].trim();
        }
        
        // Check if attendees are being added/updated
        // Support patterns: "attendees to X", "invite X", "add attendees X", "attendees: X"
        const attendeesMatch = changes.match(/attendees?\s+to\s+(.+?)(?:\s|$)/i)
          || changes.match(/invite\s+(.+?)(?:\s|$)/i)
          || changes.match(/add\s+attendees?\s+(.+?)(?:\s|$)/i)
          || changes.match(/attendees?\s*[:=]\s*(.+?)(?:\s|$)/i);
        if (attendeesMatch && attendeesMatch[1]) {
          const attendeesStr = attendeesMatch[1].trim();
          logger.info(
            {
              attendeesStrFromTemplate: attendeesStr,
              template: template,
            },
            '📋 Raw attendees string extracted from UPDATE template'
          );

          // Normalize email addresses from voice input first (e.g., "paul at imaginesignage.com" -> "paul@imaginesignage.com")
          const emailNormalizedStr = normalizeEmailFromVoice(attendeesStr);

          // Filter out "Google Meet" and similar phrases that are not actual attendees
          const googleMeetKeywords = ['google meet', 'meet link', 'video call', 'video meeting', 'meet', 'googlemeet'];
          
          // Split by comma, but also handle "and" as a separator (e.g., "Paul and Liz" or "Paul, Liz and John")
          // First, replace " and " with comma for easier parsing
          const normalizedStr = emailNormalizedStr.replace(/\s+and\s+/gi, ', ');
          logger.info(
            {
              originalAttendeesStr: attendeesStr,
              emailNormalizedStr: emailNormalizedStr,
              normalizedStr: normalizedStr,
            },
            '🔄 Normalized attendees string (normalized emails from voice input, replaced "and" with commas)'
          );
          
          const splitAttendees = normalizedStr.split(',').map(a => normalizeEmailFromVoice(a.trim())).filter(a => a.length > 0);
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
            '✅ Parsed attendees after Google Meet filter - FINAL PARSED LIST (UPDATE)'
          );
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
  let reminderCategory: string | undefined;
  const missingFields: string[] = [];

  if (isCreate) {
    action = 'create';
    // Parse: "Create a reminder: {title} - schedule: {schedule} - status: {active|paused} - category: {category}"
    const titleMatch = template.match(/^Create a reminder:\s*(.+?)(?:\s*-\s*schedule:|\s*-\s*status:|\s*-\s*category:|$)/i);
    if (titleMatch && titleMatch[1]) {
      reminderTitle = titleMatch[1].trim();
    } else {
      missingFields.push('reminder title');
    }

    const scheduleMatch = template.match(/\s*-\s*schedule:\s*(.+?)(?:\s*-\s*status:|\s*-\s*category:|$)/i);
    if (scheduleMatch && scheduleMatch[1]) {
      reminderSchedule = scheduleMatch[1].trim();
    }

    const statusMatch = template.match(/\s*-\s*status:\s*(.+?)(?:\s*-\s*category:|$)/i);
    if (statusMatch && statusMatch[1]) {
      reminderStatus = statusMatch[1].trim().toLowerCase();
    }

    const categoryMatch = template.match(/\s*-\s*category:\s*(.+?)$/i);
    if (categoryMatch && categoryMatch[1]) {
      reminderCategory = categoryMatch[1].trim();
    }
  } else if (isUpdate) {
    action = 'edit';
    // Check for "Update all reminders:" first
    const allRemindersMatch = template.match(/^Update all reminders:\s*(.+?)(?:\s*-\s*to:\s*(.+?))?$/i);
    if (allRemindersMatch) {
      // Bulk update: "Update all reminders: {filter} - to: {changes}"
      reminderTitle = `all reminders${allRemindersMatch[1] ? ` ${allRemindersMatch[1].trim()}` : ''}`;
      if (allRemindersMatch[2]) {
        reminderChanges = allRemindersMatch[2].trim();
      }
    } else {
      // Parse: "Update a reminder: {title} - to: {changes}" or "Move a reminder: {title} - to: {changes}"
      const updateMatch = template.match(/^(?:Update|Move) a reminder:\s*(.+?)(?:\s*-\s*to:\s*(.+?))?$/i);
      if (updateMatch && updateMatch[1]) {
        reminderTitle = updateMatch[1].trim();
      } else {
        missingFields.push('reminder title');
      }
      if (updateMatch && updateMatch[2]) {
        reminderChanges = updateMatch[2].trim();
      }
    }
  } else if (isDelete) {
    action = 'delete';
    // Check for "Delete all reminders" first
    if (template.match(/^Delete all reminders$/i)) {
      reminderTitle = 'all';
    } else {
      // Parse: "Delete a reminder: {title}" (title can span multiple lines, e.g. numbers list)
      const deleteMatch = template.match(/^Delete a reminder:\s*([\s\S]+)$/i);
      if (deleteMatch && deleteMatch[1]) {
        reminderTitle = deleteMatch[1].trim();
      } else {
        // Fallback: use the full template after the first colon, but DO NOT mark missingFields
        const parts = template.split(':');
        reminderTitle = (parts[1] || template).trim();
      }
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

  const parsed: ParsedAction = {
    action,
    resourceType,
    taskName: reminderTitle, // Reuse taskName field for reminder title
    newName: reminderChanges, // Reuse newName field for reminder changes
    listFilter: reminderSchedule, // Reuse listFilter field for reminder schedule
    status: reminderStatus, // Reuse status field for reminder status
    missingFields,
  };

  // Add category if it was parsed (for create operations)
  if (isCreate && reminderCategory) {
    parsed.reminderCategory = reminderCategory;
  }

  return parsed;
}

/**
 * Parse relative date strings to YYYY-MM-DD format
 * Handles: today, tomorrow, day names (Friday, Monday), "next Monday", "15 March", "the 12th", etc.
 */
/**
 * Normalize email addresses from voice input
 * Converts "name at domain.com" to "name@domain.com"
 * Handles patterns like:
 * - "paul at imaginesignage.com" -> "paul@imaginesignage.com"
 * - "john at gmail.com" -> "john@gmail.com"
 * - "name at domain.co.uk" -> "name@domain.co.uk"
 */
function normalizeEmailFromVoice(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }
  
  // Pattern: word(s) + " at " + domain (word.word format, possibly with multiple dots)
  // Match: "name at domain.com", "firstname lastname at domain.co.uk", etc.
  // Use word boundaries and ensure "at" is surrounded by spaces (not part of another word)
  // Improved pattern to handle cases like "macayla at interactivemedia.co.za"
  // Match: name (can have dots, hyphens, underscores) + " at " + domain (with dots, can be .co.za, .com, etc.)
  
  // First, normalize "At" or "AT" to lowercase "at" for consistent matching
  const normalizedInput = input.replace(/\s+[Aa][Tt]\s+/g, ' at ');
  
  // Improved email pattern that handles:
  // - "macayla at interactivemedia.co.za"
  // - "paul at gmail.com"
  // - "firstname lastname at company.co.uk"
  // Pattern breakdown:
  // - Name part: [a-zA-Z0-9._-]+ (one or more alphanumeric, dots, underscores, hyphens)
  //   optionally followed by spaces and more words for multi-word names
  // - " at " (with spaces, case-insensitive)
  // - Domain part: [a-zA-Z0-9.-]+ (domain name with dots and hyphens) followed by .[a-zA-Z]{2,} (TLD)
  //   and optionally another .[a-zA-Z]{2,} for multi-part TLDs like .co.za, .co.uk
  const emailPattern = /\b([a-zA-Z0-9._-]+(?:\s+[a-zA-Z0-9._-]+)*)\s+at\s+([a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)\b/gi;
  
  const normalized = normalizedInput.replace(emailPattern, (match, namePart, domainPart) => {
    // Clean the name part (remove any extra spaces, though there shouldn't be any with the simplified pattern)
    const cleanName = namePart.trim();
    const result = `${cleanName}@${domainPart}`;
    
    logger.info(
      {
        originalMatch: match,
        namePart,
        domainPart,
        result,
      },
      'Normalizing email pattern from voice input'
    );
    
    return result;
  });
  
  // If normalization occurred, log it
  if (normalized !== input) {
    logger.info(
      {
        original: input,
        normalized: normalized,
      },
      'Normalized email address from voice input (converted "at" to "@")'
    );
  }
  
  return normalized;
}

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
  
  // Handle "next week [day]" FIRST (e.g., "next week Sunday", "next week Monday")
  // This must come before "next [day]" to avoid incorrect matching
  const nextWeekDayMatch = lower.match(/next\s+week\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (nextWeekDayMatch && nextWeekDayMatch[1]) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDayIndex = dayNames.indexOf(nextWeekDayMatch[1]); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const currentDayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    if (targetDayIndex !== -1) {
      // Calculate days until next Monday (week starts on Monday)
      // If today is Monday (1), next Monday is in 7 days
      // Otherwise: (8 - currentDow) % 7 gives days until next Monday, or 7 if that equals 0
      let daysUntilNextMonday = currentDayOfWeek === 1 ? 7 : ((8 - currentDayOfWeek) % 7) || 7;
      
      if (currentDayOfWeek === 0 && targetDayIndex === 0) {
        daysUntilNextMonday += 7; // Add 7 more days to get to the week after next Monday
      }
      
      // From next Monday, find the target day
      // Monday=1, Tuesday=2, ..., Sunday=0
      // Offset from Monday: Monday=0, Tuesday=1, ..., Sunday=6
      const offsetFromMonday = targetDayIndex === 0 ? 6 : targetDayIndex - 1;
      
      const daysToAdd = daysUntilNextMonday + offsetFromMonday;
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + daysToAdd);
      
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  
  // Handle "next [day]" (e.g., "next Monday", "next Friday")
  // This is for finding the next occurrence of that day (not necessarily next week)
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
  
  // CRITICAL: Check for month names FIRST before checking day-only patterns
  // This prevents "22nd January" from being matched as just "22nd" (which would use current month)
  // Handle "[day] [Month]" or "[Month] [day]" (e.g., "15 March", "March 15", "15th March", "22nd January")
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
        // Use the current year for the date (allow past dates - don't automatically move to next year)
        // Note: JavaScript Date months are 0-indexed (0 = January, 11 = December)
        // So 'i' from monthNames array (0-11) is correct
        const targetYear = currentYear;
        const targetMonth = i; // 0-indexed (0 = January, 11 = December)
        const targetDay = dayNum;
        
        // Return date string directly (no Date object creation to avoid timezone issues)
        // Allow past dates - use the date as specified by the user
        const year = targetYear;
        const month = String(targetMonth + 1).padStart(2, '0'); // Convert 0-indexed to 1-indexed
        const day = String(targetDay).padStart(2, '0');
        
        // Log for debugging
        logger.info(
          {
            inputDateStr: dateStr,
            matchedMonthIndex: i,
            matchedMonthName: monthNames[i],
            dayNum,
            currentYear,
            targetYear: targetYear,
            targetMonth: targetMonth,
            targetDay: targetDay,
            finalYear: year,
            finalMonth: month,
            finalDay: day,
          },
          'Parsed date with month name (allowing past dates)'
        );
        
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

/**
 * OPTIMIZATION: Non-blocking logging helper
 * Logs outgoing messages without blocking the main workflow
 */
function logOutgoingMessageNonBlocking(
  db: Database,
  recipient: string,
  userId: string,
  messageContent: string,
  messageType: 'text' | 'interactive' = 'text',
  isFreeMessage: boolean = true
): void {
  // Fire-and-forget logging to improve response time
  getVerifiedWhatsappNumberByPhone(db, recipient)
    .then((whatsappNumber) => {
      if (whatsappNumber) {
        return logOutgoingWhatsAppMessage(db, {
          whatsappNumberId: whatsappNumber.id,
          userId,
          messageType,
          messageContent,
          isFreeMessage,
        });
      }
    })
    .catch((error) => {
      logger.warn({ error, userId, recipient }, 'Failed to log outgoing message (non-blocking)');
    });
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
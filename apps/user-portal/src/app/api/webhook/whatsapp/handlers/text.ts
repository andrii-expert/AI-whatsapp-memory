import type { Database } from '@imaginecalendar/database/client';
import { getVerifiedWhatsappNumberByPhone, logIncomingWhatsAppMessage, logOutgoingWhatsAppMessage, getRecentMessageHistory, getPrimaryCalendar } from '@imaginecalendar/database/queries';
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
    const titleMatch = aiResponse.match(/^Title:\s*(task|note|reminder|event|document|address|verification|normal)/i);
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
    const isListEvents = actionTemplate.toLowerCase().startsWith('list events:');
    
    // Handle list operations for all types (tasks, notes, reminders, events, documents, addresses)
    if (isListOperation && (titleType === 'task' || titleType === 'note' || titleType === 'reminder' || titleType === 'event' || titleType === 'document' || titleType === 'address')) {
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
            parsed.resourceType = titleType as 'task' | 'note' | 'reminder' | 'event' | 'document' | 'address';
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
          combinedMessage = `✅ *Added to Shopping Lists:*\nItem/s: ${itemsText}`;
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
    
    // Handle non-list event operations (create, update, delete)
    if (titleType === 'event') {
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
        // Format time as lowercase am/pm
        const eventTime = result.event.start.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: calendarTimezone,
        }).toLowerCase();
        
        // Format date as "Tue, Dec 9"
        const eventDate = result.event.start.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          timeZone: calendarTimezone,
        });
        
        // New format: Title, date/time on one line, event name on next line (indented)
        responseMessage = `✅ *Event Created Successfully*\n   ${eventDate}, ${eventTime}\n   ${result.event.title}`;
        if (result.event.location) {
          responseMessage += `\n   📍 ${result.event.location}`;
        }
      } else if (result.action === 'UPDATE' && result.event) {
        responseMessage = `✅ *Event Updated Successfully*\n   ${result.event.title}`;
      } else if (result.action === 'DELETE' && result.event) {
        responseMessage = `✅ *Event Deleted Successfully*\n   ${result.event.title}`;
      } else if (result.action === 'QUERY' && result.events) {
        if (result.events.length === 0) {
          responseMessage = "📅 *You have no events scheduled.*";
        } else {
          responseMessage = `📅 *You have ${result.events.length} event${result.events.length !== 1 ? 's' : ''}:*\n\n`;
          result.events.slice(0, 10).forEach((event: { title: string; start: Date }, index: number) => {
            const eventTime = event.start.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: calendarTimezone,
            });
            const eventDate = event.start.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              timeZone: calendarTimezone,
            });
            responseMessage += `*${index + 1}.* ${event.title}\n   ${eventDate} at ${eventTime}\n\n`;
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

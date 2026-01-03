// API endpoint for checking and sending calendar event reminder notifications
// This should be called by a cron job every minute
//
// To set up cron job:
// 1. Add CRON_SECRET to your environment variables
// 2. Set up a cron job to call: GET /api/cron/calendar-events with Authorization: Bearer {CRON_SECRET}
// 3. Example cron: * * * * * curl -X GET "https://your-domain.com/api/cron/calendar-events" -H "Authorization: Bearer YOUR_CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@imaginecalendar/database/client';
import { getUsersWithCalendarNotifications, getUserById, getUserWhatsAppNumbers, logOutgoingWhatsAppMessage } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { createCalendarProvider } from '@imaginecalendar/calendar-integrations';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

// In-memory cache to prevent duplicate notifications
// Key: eventId-dateKey, Value: timestamp when notification was sent
const notificationCache = new Map<string, number>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret (allow bypass in development if not set)
    const authHeader = req.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      logger.warn({ authHeader: authHeader ? 'present' : 'missing' }, 'Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!CRON_SECRET) {
      logger.warn({}, 'CRON_SECRET not set - allowing request (development mode)');
    }

    const db = await connectDb();
    const now = new Date();

    // Check WhatsApp configuration before proceeding
    const hasWhatsAppConfig = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    if (!hasWhatsAppConfig) {
      logger.error(
        {
          hasAccessToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
          hasPhoneNumberId: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        },
        'WhatsApp service not configured - cannot send calendar event reminders'
      );
      return NextResponse.json(
        {
          error: 'WhatsApp service not configured',
          message: 'Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID environment variables'
        },
        { status: 500 }
      );
    }

    const whatsappService = new WhatsAppService();

    logger.info(
      {
        timestamp: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      'Starting calendar event reminders check'
    );

    // Get all active calendar connections
    const calendarConnections = await getUsersWithCalendarNotifications(db);

    logger.info(
      {
        totalConnections: calendarConnections.length,
      },
      'Found calendar connections'
    );

    let notificationsSent = 0;
    let notificationsSkipped = 0;
    const errors: string[] = [];

    // Group connections by user
    const connectionsByUser = new Map<string, typeof calendarConnections>();
    for (const connection of calendarConnections) {
      if (!connectionsByUser.has(connection.userId)) {
        connectionsByUser.set(connection.userId, []);
      }
      connectionsByUser.get(connection.userId)!.push(connection);
    }

    // Process each user's calendar connections
    for (const [userId, userConnections] of connectionsByUser.entries()) {
      try {
        // Get user info
        const user = await getUserById(db, userId);
        if (!user) {
          logger.warn({ userId }, 'User not found');
          continue;
        }

        // Get user's timezone from database - priority: user.timezone > userPreferences.timezone > default
        const userPrefsRaw = (user as any).preferences;
        const userPreferences = Array.isArray(userPrefsRaw) 
          ? userPrefsRaw[0] 
          : userPrefsRaw;
        
        // CRITICAL: Use user.timezone from users table first, then preferences
        const userTimezone = (user as any).timezone || userPreferences?.timezone || 'Africa/Johannesburg';
        
        // Get user's calendar notification minutes from preferences
        const calendarNotificationMinutes = userPreferences?.calendarNotificationMinutes || 10;
        
        // Verify calendar notifications are enabled
        const calendarNotificationsEnabled = userPreferences?.calendarNotifications === true;
        
        if (!calendarNotificationsEnabled) {
          logger.debug({ userId }, 'User has calendar notifications disabled, skipping');
          continue;
        }

        logger.info(
          {
            userId,
            userTimezone,
            calendarNotificationMinutes,
            timezoneSource: (user as any).timezone ? 'user' : userPreferences?.timezone ? 'userPreferences' : 'default',
          },
          'Processing user calendar events'
        );

        // Get user's verified WhatsApp numbers
        const whatsappNumbers = await getUserWhatsAppNumbers(db, userId);
        const whatsappNumber = whatsappNumbers.find(n => n.isVerified && n.isActive) ||
                              whatsappNumbers.find(n => n.isVerified);

        if (!whatsappNumber) {
          logger.debug({ userId }, 'User has no verified WhatsApp number, skipping');
          continue;
        }

        // Get current time in user's timezone
        const userTimeFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false,
        });

        const userTimeParts = userTimeFormatter.formatToParts(now);
        const getUserTimePart = (type: string) => userTimeParts.find(p => p.type === type)?.value || '0';

        const userLocalTime = {
          year: parseInt(getUserTimePart('year'), 10),
          month: parseInt(getUserTimePart('month'), 10) - 1,
          day: parseInt(getUserTimePart('day'), 10),
          hours: parseInt(getUserTimePart('hour'), 10),
          minutes: parseInt(getUserTimePart('minute'), 10),
          seconds: parseInt(getUserTimePart('second'), 10),
        };

        // Check each calendar connection and fetch upcoming events
        for (const connection of userConnections) {
          try {
            if (!connection.accessToken) {
              logger.debug({ userId, calendarId: connection.id }, 'Calendar connection has no access token, skipping');
              continue;
            }

            const provider = createCalendarProvider(connection.provider);
            
            // Fetch events from now to 24 hours ahead
            const fromTime = new Date(now.getTime());
            const toTime = new Date(now.getTime() + (24 * 60 * 60 * 1000));

            try {
              const events = await provider.searchEvents(connection.accessToken, {
                calendarId: connection.calendarId || 'primary',
                timeMin: fromTime,
                timeMax: toTime,
                maxResults: 50,
              });

              // Check each event for reminder timing
              for (const event of events) {
                try {
                  const eventStart = new Date(event.start);
                  
                  // Only process future events
                  if (eventStart.getTime() <= now.getTime()) {
                    continue;
                  }

                  // Calculate the exact target reminder time (event start - notification minutes)
                  const reminderTimeMs = calendarNotificationMinutes * 60 * 1000;
                  const targetReminderTime = new Date(eventStart.getTime() - reminderTimeMs);
                  
                  // Get the current minute (rounded down to the start of the minute)
                  const currentMinute = new Date(now.getTime());
                  currentMinute.setSeconds(0, 0);
                  
                  // Get the target reminder minute (rounded down to the start of the minute)
                  const targetReminderMinute = new Date(targetReminderTime.getTime());
                  targetReminderMinute.setSeconds(0, 0);
                  
                  // Check if we're in the exact minute when the reminder should be sent
                  // This ensures reminders are sent at the correct time (e.g., 7:51 AM for an 8:01 AM event with 10-minute reminder)
                  const shouldNotify = currentMinute.getTime() === targetReminderMinute.getTime();
                  
                  // Calculate time difference for logging purposes
                  const timeDiffMs = eventStart.getTime() - now.getTime();
                  const timeDiffMinutes = Math.floor(timeDiffMs / (1000 * 60));

                  if (shouldNotify) {
                    // Check cache to prevent duplicate notifications
                    const eventDate = new Date(event.start);
                    const dateKey = `${eventDate.getUTCFullYear()}-${eventDate.getUTCMonth() + 1}-${eventDate.getUTCDate()}-${eventDate.getUTCHours()}-${eventDate.getUTCMinutes()}`;
                    const cacheKey = `${event.id}-${dateKey}`;
                    const lastSent = notificationCache.get(cacheKey);

                    if (!lastSent || (now.getTime() - lastSent) >= CACHE_TTL) {
                      // Send reminder notification
                      await sendEventReminder(
                        db,
                        whatsappService,
                        whatsappNumber,
                        event,
                        userTimezone,
                        calendarNotificationMinutes,
                        connection.calendarName || 'Calendar'
                      );

                      // Cache the notification
                      notificationCache.set(cacheKey, now.getTime());
                      notificationsSent++;

                      logger.info(
                        {
                          userId,
                          calendarId: connection.id,
                          eventId: event.id,
                          eventTitle: event.title,
                          eventStart: event.start.toISOString(),
                          targetReminderTime: targetReminderTime.toISOString(),
                          currentTime: now.toISOString(),
                          timeDiffMinutes,
                          calendarNotificationMinutes,
                        },
                        'Calendar event reminder sent successfully'
                      );
                    } else {
                      notificationsSkipped++;
                      logger.debug(
                        { eventId: event.id, lastSent: new Date(lastSent).toISOString(), cacheKey },
                        'Skipping duplicate calendar event reminder (already sent recently)'
                      );
                    }
                  }
                } catch (eventError) {
                  logger.error(
                    { error: eventError, eventId: event.id, userId },
                    'Error processing calendar event'
                  );
                  errors.push(`Error processing event ${event.id}`);
                }
              }
            } catch (fetchError: any) {
              logger.error(
                {
                  error: fetchError,
                  userId,
                  calendarId: connection.id,
                  provider: connection.provider,
                },
                'Failed to fetch calendar events'
              );
              errors.push(`Failed to fetch events for calendar ${connection.id}: ${fetchError.message}`);
            }
          } catch (connectionError) {
            logger.error(
              { error: connectionError, calendarId: connection.id, userId },
              'Error processing calendar connection'
            );
            errors.push(`Error processing calendar ${connection.id}`);
          }
        }
      } catch (userError) {
        logger.error({ error: userError, userId }, 'Error processing user calendar connections');
        errors.push(`Error processing calendars for user ${userId}`);
      }
    }

    // Clean up old cache entries
    cleanupNotificationCache(now);

    logger.info(
      {
        connectionsChecked: calendarConnections.length,
        notificationsSent,
        notificationsSkipped,
        errorsCount: errors.length,
        usersProcessed: connectionsByUser.size,
      },
      'Calendar event reminders check completed'
    );

    return NextResponse.json({
      success: true,
      message: 'Calendar event reminders check completed',
      checkedAt: now.toISOString(),
      connectionsChecked: calendarConnections.length,
      notificationsSent,
      notificationsSkipped,
      usersProcessed: connectionsByUser.size,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error({ error }, 'Failed to check calendar event reminders');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Clean up old cache entries
 */
function cleanupNotificationCache(now: Date): void {
  const nowTime = now.getTime();
  for (const [key, timestamp] of notificationCache.entries()) {
    if (nowTime - timestamp > CACHE_TTL) {
      notificationCache.delete(key);
    }
  }
}

/**
 * Send a calendar event reminder via WhatsApp
 */
async function sendEventReminder(
  db: any,
  whatsappService: WhatsAppService,
  whatsappNumber: any,
  event: any,
  userTimezone: string,
  calendarNotificationMinutes: number,
  calendarName: string
) {
  try {
    const eventStart = new Date(event.start);
    
    // Format event time in user's timezone
    const eventTimeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    
    const eventTimeParts = eventTimeFormatter.formatToParts(eventStart);
    const getEventTimePart = (type: string) => eventTimeParts.find(p => p.type === type)?.value || '0';
    
    const eventHours = parseInt(getEventTimePart('hour'), 10);
    const eventMinutes = parseInt(getEventTimePart('minute'), 10);
    
    // Convert 24-hour format to 12-hour format for display
    const formatTime24To12 = (hours: number, minutes: number): string => {
      const hour12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
      const period = hours >= 12 ? 'PM' : 'AM';
      return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
    };
    
    const eventTimeStr = formatTime24To12(eventHours, eventMinutes);

    // Get event date in user's timezone
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const eventDateStr = dateFormatter.format(eventStart);

    // Create calendar event reminder message
    let message = `🗓️ *Calendar Event Reminder*\n\n`;
    message += `*Title:* ${event.title || 'Untitled Event'}\n`;
    message += `*Date:* ${eventDateStr}\n`;
    message += `*Time:* ${eventTimeStr}\n`;
    message += `*Calendar:* ${calendarName}\n`;

    if (event.location) {
      message += `*Location:* ${event.location}\n`;
    }

    if (event.description) {
      message += `\n*Description:*\n${event.description}\n`;
    }

    message += `\n⏰ *${calendarNotificationMinutes} minutes* until your event starts!`;
    message += `\n\n_From your ${calendarName} calendar._`;

    logger.info(
      {
        whatsappNumberId: whatsappNumber.id,
        phoneNumber: whatsappNumber.phoneNumber,
        eventId: event.id,
        eventTitle: event.title,
        eventStart: event.start.toISOString(),
        eventTimeFormatted: eventTimeStr,
        eventDateFormatted: eventDateStr,
        userTimezone,
        calendarNotificationMinutes,
      },
      'Preparing to send calendar event reminder'
    );

    try {
      // Validate phone number format before sending
      const normalizedPhone = whatsappNumber.phoneNumber.replace(/\D/g, '');
      if (!normalizedPhone || normalizedPhone.length < 10) {
        throw new Error(`Invalid phone number format: ${whatsappNumber.phoneNumber}`);
      }

      const result = await whatsappService.sendTextMessage(whatsappNumber.phoneNumber, message);

      logger.info(
        {
          whatsappNumberId: whatsappNumber.id,
          phoneNumber: whatsappNumber.phoneNumber,
          eventId: event.id,
          messageId: result.messages?.[0]?.id,
          success: true,
        },
        'Calendar event reminder sent successfully'
      );

      // Log the message
      await logOutgoingWhatsAppMessage(db, {
        whatsappNumberId: whatsappNumber.id,
        userId: whatsappNumber.userId,
        messageType: 'text',
        messageContent: message,
        isFreeMessage: true,
      });

    } catch (sendError) {
      const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
      const errorStack = sendError instanceof Error ? sendError.stack : undefined;

      logger.error(
        {
          error: sendError,
          errorMessage,
          errorStack,
          whatsappNumberId: whatsappNumber.id,
          phoneNumber: whatsappNumber.phoneNumber,
          normalizedPhone: whatsappNumber.phoneNumber.replace(/\D/g, ''),
          eventId: event.id,
          eventTitle: event.title,
          eventStart: event.start.toISOString(),
        },
        'Failed to send calendar event reminder'
      );

      throw sendError;
    }
  } catch (error) {
    logger.error(
      {
        error,
        eventId: event.id,
        eventTitle: event.title,
        whatsappNumberId: whatsappNumber.id,
      },
      'Error sending calendar event reminder'
    );
    throw error;
  }
}


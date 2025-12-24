// API endpoint for checking and sending calendar event notifications
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

// In-memory cache to prevent duplicate notifications within the same minute
// Key: eventId, Value: timestamp when notification was sent
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
        'WhatsApp service not configured - cannot send calendar notifications'
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

    // Clean up old cache entries
    cleanupNotificationCache(now);

    logger.info(
      {
        timestamp: now.toISOString(),
        localTime: now.toLocaleString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hasWhatsAppConfig: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      },
      'Starting calendar events check cron job'
    );

    // Get all active calendar connections
    const calendarConnections = await getUsersWithCalendarNotifications(db);

    // Filter to only connections where user has calendar notifications enabled
    const filteredConnections = calendarConnections.filter(connection => {
      const userPrefs = (connection as any).user?.preferences?.[0];
      return userPrefs && userPrefs.calendarNotifications === true;
    });

    logger.info(
      {
        totalConnections: calendarConnections.length,
        filteredConnections: filteredConnections.length,
      },
      'Found calendar connections for users with notifications enabled'
    );

    if (filteredConnections.length === 0) {
      logger.info({}, 'No calendar connections found for users with notifications enabled, exiting');
      return NextResponse.json({
        success: true,
        message: 'No calendar connections to check',
        checkedAt: now.toISOString(),
        connectionsChecked: 0,
        notificationsSent: 0,
        notificationsSkipped: 0,
      });
    }

    let notificationsSent = 0;
    let notificationsSkipped = 0;
    const errors: string[] = [];

    // Group connections by user to batch WhatsApp lookups
    const connectionsByUser = new Map<string, typeof filteredConnections>();
    for (const connection of filteredConnections) {
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
          logger.warn({ userId }, 'User not found for calendar notifications');
          continue;
        }

        // Get user's timezone
        const userTimezone = (user as any).timezone;
        if (!userTimezone) {
          logger.warn({ userId }, 'User has no timezone set, skipping calendar notifications');
          continue; // Skip users without timezone set
        }

        // Get user's calendar notification minutes
        const userPreferences = (userConnections[0] as any).user?.preferences?.[0];
        const calendarNotificationMinutes = userPreferences?.calendarNotificationMinutes || 10;

        // Get current time in user's timezone using Intl.DateTimeFormat for accurate conversion
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false,
        });

        const parts = formatter.formatToParts(now);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';

        // Extract user's local time components (these represent the actual time in user's timezone)
        const userLocalTime = {
          year: parseInt(getPart('year'), 10),
          month: parseInt(getPart('month'), 10) - 1, // Convert to 0-11
          day: parseInt(getPart('day'), 10),
          hours: parseInt(getPart('hour'), 10),
          minutes: parseInt(getPart('minute'), 10),
          seconds: parseInt(getPart('second'), 10),
          date: now, // Use server time as base, but components are in user's timezone
        };

        logger.info(
          {
            userId,
            serverTime: now.toISOString(),
            userTimezone,
            userLocalTime: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}:${String(userLocalTime.seconds).padStart(2, '0')} on ${userLocalTime.year}-${userLocalTime.month + 1}-${userLocalTime.day}`,
            calendarNotificationMinutes,
            connectionsCount: userConnections.length,
          },
          'Processing calendar connections for user'
        );

        // Get user's verified WhatsApp numbers (prefer primary, then any verified)
        const whatsappNumbers = await getUserWhatsAppNumbers(db, userId);
        logger.info(
          {
            userId,
            whatsappNumbersCount: whatsappNumbers.length,
            whatsappNumbers: whatsappNumbers.map(n => ({
              phoneNumber: n.phoneNumber,
              isVerified: n.isVerified,
              isActive: n.isActive,
              isPrimary: n.isPrimary,
            })),
          },
          'Checking WhatsApp numbers for user'
        );

        const whatsappNumber = whatsappNumbers.find(n => n.isVerified && n.isActive) ||
                              whatsappNumbers.find(n => n.isVerified);

        if (!whatsappNumber) {
          logger.warn(
            {
              userId,
              whatsappNumbersCount: whatsappNumbers.length,
              availableNumbers: whatsappNumbers.map(n => ({
                phoneNumber: n.phoneNumber,
                isVerified: n.isVerified,
                isActive: n.isActive,
              })),
            },
            'User has no verified WhatsApp number, skipping'
          );
          continue; // Skip users without verified WhatsApp
        }

        logger.info(
          {
            userId,
            whatsappNumberId: whatsappNumber.id,
            phoneNumber: whatsappNumber.phoneNumber,
            isVerified: whatsappNumber.isVerified,
            isActive: whatsappNumber.isActive,
          },
          'Found verified WhatsApp number for user'
        );

        // Check each calendar connection and fetch upcoming events
        for (const connection of userConnections) {
          try {
            if (!connection.accessToken) {
              logger.debug({ userId, calendarId: connection.id }, 'Calendar connection has no access token, skipping');
              continue;
            }

            logger.info(
              {
                userId,
                calendarId: connection.id,
                provider: connection.provider,
                calendarNotificationMinutes,
              },
              'Fetching upcoming events for calendar'
            );

            // Calculate the time window for events (from now + notification minutes to a reasonable future)
            const fromTime = new Date(now.getTime() + (calendarNotificationMinutes * 60 * 1000));
            const toTime = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // Next 24 hours

            const provider = createCalendarProvider(connection.provider);

            try {
              const events = await provider.searchEvents(connection.accessToken, {
                calendarId: connection.calendarId || 'primary',
                timeMin: fromTime,
                timeMax: toTime,
                maxResults: 50, // Limit to prevent too many notifications
              });

              logger.info(
                {
                  userId,
                  calendarId: connection.id,
                  provider: connection.provider,
                  eventsCount: events.length,
                  fromTime: fromTime.toISOString(),
                  toTime: toTime.toISOString(),
                },
                'Fetched upcoming calendar events'
              );

              // Check each event to see if it should be notified about
              for (const event of events) {
                try {
                  const eventStart = new Date(event.start);
                  const timeUntilEvent = eventStart.getTime() - now.getTime();
                  const minutesUntilEvent = Math.floor(timeUntilEvent / (1000 * 60));

                  // Check if this event should trigger a notification (within notification window)
                  if (minutesUntilEvent >= calendarNotificationMinutes - 1 && minutesUntilEvent <= calendarNotificationMinutes + 1) {
                    // Check cache to prevent duplicate notifications
                    const eventDate = new Date(event.start);
                    const dateKey = `${eventDate.getUTCFullYear()}-${eventDate.getUTCMonth() + 1}-${eventDate.getUTCDate()}-${eventDate.getUTCHours()}-${eventDate.getUTCMinutes()}`;
                    const cacheKey = `${event.id}-${dateKey}`;
                    const lastSent = notificationCache.get(cacheKey);

                    if (!lastSent || (now.getTime() - lastSent) >= CACHE_TTL) {
                      // Send notification
                      await sendCalendarEventNotification(
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
                          minutesUntilEvent,
                          calendarNotificationMinutes,
                        },
                        'Calendar event notification sent successfully'
                      );
                    } else {
                      notificationsSkipped++;
                      logger.debug(
                        { eventId: event.id, lastSent: new Date(lastSent).toISOString(), cacheKey },
                        'Skipping duplicate calendar event notification (already sent recently)'
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

    logger.info(
      {
        connectionsChecked: filteredConnections.length,
        notificationsSent,
        notificationsSkipped,
        errorsCount: errors.length,
        usersProcessed: connectionsByUser.size,
      },
      'Calendar events check completed'
    );

    return NextResponse.json({
      success: true,
      message: 'Calendar events check completed',
      checkedAt: now.toISOString(),
      connectionsChecked: filteredConnections.length,
      notificationsSent,
      notificationsSkipped,
      usersProcessed: connectionsByUser.size,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error({ error }, 'Failed to check calendar events');
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
 * Send a calendar event notification via WhatsApp
 */
async function sendCalendarEventNotification(
  db: any,
  whatsappService: WhatsAppService,
  whatsappNumber: any,
  event: any,
  userTimezone: string,
  calendarNotificationMinutes: number,
  calendarName: string
) {
  try {
    // Format event time for message using user's timezone with Intl.DateTimeFormat
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const eventStart = new Date(event.start);
    const eventTimeStr = timeFormatter.format(eventStart);

    // Also get date for full context
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const eventDateStr = dateFormatter.format(eventStart);

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
      'Preparing calendar event notification with user timezone'
    );

    // Create calendar event message in professional format
    let message = `🗓️ *Calendar Event Reminder*\n\n`;
    message += `*Title:* ${event.title}\n`;
    message += `*Date:* ${eventDateStr}\n`;
    message += `*Time:* ${eventTimeStr}\n`;
    message += `*Calendar:* ${calendarName}\n`;

    // Add description if available
    if (event.description) {
      message += `\n*Description:*\n${event.description}\n`;
    }

    // Add location if available
    if (event.location) {
      message += `*Location:* ${event.location}\n`;
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
        messageLength: message.length,
        messagePreview: message.substring(0, 200), // Log first 200 chars
      },
      'Preparing to send calendar event notification'
    );

    try {
      // Validate phone number format before sending
      const normalizedPhone = whatsappNumber.phoneNumber.replace(/\D/g, '');
      if (!normalizedPhone || normalizedPhone.length < 10) {
        throw new Error(`Invalid phone number format: ${whatsappNumber.phoneNumber}`);
      }

      logger.info(
        {
          whatsappNumberId: whatsappNumber.id,
          phoneNumber: whatsappNumber.phoneNumber,
          normalizedPhone,
          eventId: event.id,
        },
        'Sending calendar event notification via WhatsApp'
      );

      const result = await whatsappService.sendTextMessage(whatsappNumber.phoneNumber, message);

      logger.info(
        {
          whatsappNumberId: whatsappNumber.id,
          phoneNumber: whatsappNumber.phoneNumber,
          eventId: event.id,
          messageId: result.messages?.[0]?.id,
          success: true,
        },
        'WhatsApp calendar event message sent successfully'
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

      // Check if it's an axios error with response data
      let apiErrorDetails = null;
      if (sendError && typeof sendError === 'object' && 'response' in sendError) {
        const axiosError = sendError as any;
        apiErrorDetails = {
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data,
        };
      }

      logger.error(
        {
          error: sendError,
          errorMessage,
          errorStack,
          apiErrorDetails,
          whatsappNumberId: whatsappNumber.id,
          phoneNumber: whatsappNumber.phoneNumber,
          normalizedPhone: whatsappNumber.phoneNumber.replace(/\D/g, ''),
          eventId: event.id,
          eventTitle: event.title,
          eventStart: event.start.toISOString(),
        },
        'Failed to send calendar event notification'
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
      'Error sending calendar event notification'
    );
    throw error;
  }
}

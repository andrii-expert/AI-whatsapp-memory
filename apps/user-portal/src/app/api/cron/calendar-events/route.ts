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

    logger.info(
      {
        totalConnections: calendarConnections.length,
        connections: calendarConnections.map((c: any) => ({
          userId: c.userId,
          provider: c.provider,
          email: c.email,
          isActive: c.isActive,
          hasAccessToken: !!c.accessToken,
          userHasPreferences: !!(c as any).user?.preferences?.[0],
          calendarNotifications: (c as any).user?.preferences?.[0]?.calendarNotifications,
        })),
      },
      'Found all calendar connections'
    );

    // Filter to only connections where user has calendar notifications enabled
    const filteredConnections = calendarConnections.filter(connection => {
      const userPrefs = (connection as any).user?.preferences?.[0];
      const hasNotificationsEnabled = userPrefs && userPrefs.calendarNotifications === true;
      
      if (!hasNotificationsEnabled) {
        logger.debug(
          {
            userId: connection.userId,
            calendarId: connection.id,
            hasPreferences: !!userPrefs,
            calendarNotifications: userPrefs?.calendarNotifications,
          },
          'Skipping connection - calendar notifications not enabled'
        );
      }
      
      return hasNotificationsEnabled;
    });

    logger.info(
      {
        totalConnections: calendarConnections.length,
        filteredConnections: filteredConnections.length,
        skippedConnections: calendarConnections.length - filteredConnections.length,
      },
      'Found calendar connections for users with notifications enabled'
    );

    let notificationsSent = 0;
    let notificationsSkipped = 0;
    const errors: string[] = [];

    // Group filtered connections by user (for event reminder notifications)
    const connectionsByUser = new Map<string, typeof filteredConnections>();
    for (const connection of filteredConnections) {
      if (!connectionsByUser.has(connection.userId)) {
        connectionsByUser.set(connection.userId, []);
      }
      connectionsByUser.get(connection.userId)!.push(connection);
    }

    // If no filtered connections, exit early
    if (filteredConnections.length === 0) {
      logger.warn(
        {
          totalConnections: calendarConnections.length,
          reason: 'No users have calendar notifications enabled',
        },
        'No calendar connections found for users with notifications enabled, exiting'
      );
      return NextResponse.json({
        success: true,
        message: 'No calendar connections to check - users may not have calendar notifications enabled',
        checkedAt: now.toISOString(),
        connectionsChecked: 0,
        notificationsSent: 0,
        notificationsSkipped: 0,
        totalConnections: calendarConnections.length,
      });
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

        // Get user's timezone from preferences (preferences.timezone takes precedence over user.timezone)
        const userTimezone = (user as any).preferences?.timezone || (user as any).timezone;
        if (!userTimezone) {
          logger.warn({ 
            userId, 
            hasPreferences: !!(user as any).preferences,
            preferencesTimezone: (user as any).preferences?.timezone,
            userTimezone: (user as any).timezone,
          }, 'User has no timezone set, skipping calendar notifications');
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

        // Collect all upcoming events from all calendar connections
        const allUpcomingEvents: Array<{ event: any; connection: any; eventStart: Date }> = [];
        
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

            // Calculate the time window for events - fetch events in the next 7 days
            const fromTime = new Date(now.getTime());
            const toTime = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // Next 7 days
            
            logger.debug(
              {
                userId,
                calendarId: connection.id,
                fromTime: fromTime.toISOString(),
                toTime: toTime.toISOString(),
                now: now.toISOString(),
                windowDays: 7,
              },
              'Event fetching time window'
            );

            const provider = createCalendarProvider(connection.provider);

            try {
              const events = await provider.searchEvents(connection.accessToken, {
                calendarId: connection.calendarId || 'primary',
                timeMin: fromTime,
                timeMax: toTime,
                maxResults: 50,
              });

              logger.info(
                {
                  userId,
                  calendarId: connection.id,
                  provider: connection.provider,
                  eventsCount: events.length,
                  events: events.map((e: any) => ({
                    id: e.id,
                    title: e.title,
                    start: e.start,
                    end: e.end,
                    isFuture: new Date(e.start).getTime() > now.getTime(),
                  })),
                },
                'Fetched upcoming calendar events'
              );

              // Add all future events to the collection
              let futureEventsCount = 0;
              for (const event of events) {
                const eventStart = new Date(event.start);
                // Only include events in the future
                if (eventStart.getTime() > now.getTime()) {
                  allUpcomingEvents.push({
                    event,
                    connection,
                    eventStart,
                  });
                  futureEventsCount++;
                  logger.debug(
                    {
                      userId,
                      eventId: event.id,
                      eventTitle: event.title,
                      eventStart: eventStart.toISOString(),
                      timeUntilEvent: Math.floor((eventStart.getTime() - now.getTime()) / (1000 * 60)),
                    },
                    'Added future event to collection'
                  );
                } else {
                  logger.debug(
                    {
                      userId,
                      eventId: event.id,
                      eventTitle: event.title,
                      eventStart: eventStart.toISOString(),
                      now: now.toISOString(),
                      isPast: true,
                    },
                    'Skipping past event'
                  );
                }
              }
              
              logger.info(
                {
                  userId,
                  calendarId: connection.id,
                  totalEvents: events.length,
                  futureEvents: futureEventsCount,
                  addedToCollection: futureEventsCount,
                },
                'Processed events for calendar'
              );
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

        logger.info(
          {
            userId,
            totalUpcomingEvents: allUpcomingEvents.length,
            connectionsChecked: userConnections.length,
          },
          'Finished collecting events from all calendars'
        );

        // Find the most recent upcoming event (earliest start time)
        if (allUpcomingEvents.length > 0) {
          // Sort events by start time (earliest first)
          allUpcomingEvents.sort((a, b) => a.eventStart.getTime() - b.eventStart.getTime());
          const mostRecentEvent = allUpcomingEvents[0]!;
          
          // Calculate when the reminder should be sent (event time - notification minutes)
          const reminderTime = new Date(mostRecentEvent.eventStart.getTime() - (calendarNotificationMinutes * 60 * 1000));
          const reminderTimeDiffMs = reminderTime.getTime() - now.getTime();
          const reminderTimeDiffMinutes = Math.floor(reminderTimeDiffMs / (1000 * 60));
          
          logger.info(
            {
              userId,
              eventId: mostRecentEvent.event.id,
              eventTitle: mostRecentEvent.event.title,
              eventStart: mostRecentEvent.eventStart.toISOString(),
              reminderTime: reminderTime.toISOString(),
              reminderTimeDiffMinutes,
              calendarNotificationMinutes,
              totalEventsFound: allUpcomingEvents.length,
            },
            'Found most recent upcoming event - sending alert'
          );

          // Send alert with most recent event information
          try {
            await sendCalendarEventAlert(
              db,
              whatsappService,
              whatsappNumber,
              mostRecentEvent.event,
              mostRecentEvent.connection.calendarName || 'Calendar',
              userTimezone,
              calendarNotificationMinutes,
              reminderTimeDiffMinutes
            );

            notificationsSent++;
            logger.info(
              {
                userId,
                eventId: mostRecentEvent.event.id,
                eventTitle: mostRecentEvent.event.title,
              },
              'Calendar event alert sent successfully'
            );
          } catch (alertError) {
            logger.error(
              {
                error: alertError,
                userId,
                eventId: mostRecentEvent.event.id,
              },
              'Failed to send calendar event alert'
            );
            errors.push(`Failed to send alert for event ${mostRecentEvent.event.id}`);
          }
        } else {
          logger.warn(
            {
              userId,
              connectionsChecked: userConnections.length,
              userTimezone,
              calendarNotificationMinutes,
            },
            'No upcoming events found for user - cannot send alert'
          );
          // Still send a message to inform user there are no upcoming events
          try {
            const noEventsMessage = `🗓️ *Calendar Check*\n\nNo upcoming events found in your calendars for the next 7 days.\n\n_From your calendar system._`;
            
            await whatsappService.sendTextMessage(whatsappNumber.phoneNumber, noEventsMessage);
            
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId: whatsappNumber.userId,
              messageType: 'text',
              messageContent: noEventsMessage,
              isFreeMessage: true,
            });
            
            notificationsSent++;
            logger.info(
              {
                userId,
                phoneNumber: whatsappNumber.phoneNumber,
              },
              'Sent "no events" message to user'
            );
          } catch (noEventsError) {
            logger.error(
              {
                error: noEventsError,
                userId,
                phoneNumber: whatsappNumber.phoneNumber,
              },
              'Failed to send "no events" message'
            );
            errors.push(`Failed to send "no events" message to user ${userId}`);
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
 * Send a calendar event alert via WhatsApp with most recent event
 */
async function sendCalendarEventAlert(
  db: any,
  whatsappService: WhatsAppService,
  whatsappNumber: any,
  event: any,
  calendarName: string,
  userTimezone: string,
  calendarNotificationMinutes: number,
  reminderTimeDiffMinutes: number
) {
  try {
    const eventStart = new Date(event.start);
    
    // Format event time for message - extract time components from event.start in user's timezone
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
        reminderTimeDiffMinutes,
      },
      'Preparing calendar event alert with user timezone'
    );

    // Create calendar event alert message
    let message = `🗓️ *Upcoming Calendar Event*\n\n`;
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

    // Calculate minutes until reminder
    const minutesUntilReminder = Math.max(0, reminderTimeDiffMinutes);
    
    if (minutesUntilReminder > 0) {
      message += `\n⏰ You will get a reminder message in *${minutesUntilReminder} minute${minutesUntilReminder !== 1 ? 's' : ''}*`;
    } else {
      message += `\n⏰ You will get a reminder message *soon* (${calendarNotificationMinutes} minutes before the event)`;
    }
    
    message += `\n\n_From your ${calendarName} calendar._`;

    logger.info(
      {
        whatsappNumberId: whatsappNumber.id,
        phoneNumber: whatsappNumber.phoneNumber,
        eventId: event.id,
        eventTitle: event.title,
        eventStart: event.start.toISOString(),
        messageLength: message.length,
        messagePreview: message.substring(0, 200),
        reminderTimeDiffMinutes,
      },
      'Preparing to send calendar event alert'
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
        'Sending calendar event alert via WhatsApp'
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
        'WhatsApp calendar event alert sent successfully'
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
        'Failed to send calendar event alert'
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
      'Error sending calendar event alert'
    );
    throw error;
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
    const eventStart = new Date(event.start);
    
    // Format event time for message - extract time components from event.start in user's timezone
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

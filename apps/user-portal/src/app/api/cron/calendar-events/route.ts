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

        // Collect all upcoming events for test message
        const allUpcomingEvents: Array<{
          event: any;
          connection: any;
          reminderTime: Date;
          reminderMinutes: number;
        }> = [];

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

            // Calculate the time window for events
            // We want to fetch events that are starting within the next 24 hours
            // This ensures we catch events that need notifications now (calendarNotificationMinutes before start)
            // Start from a bit in the past to catch events that might have started very recently
            // but we haven't notified about yet (in case cron was delayed)
            const fromTime = new Date(now.getTime() - (5 * 60 * 1000)); // 5 minutes ago (to catch any missed events)
            const toTime = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // Next 24 hours
            
            logger.debug(
              {
                userId,
                calendarId: connection.id,
                fromTime: fromTime.toISOString(),
                toTime: toTime.toISOString(),
                now: now.toISOString(),
                windowHours: 24,
              },
              'Event fetching time window'
            );

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
                  events: events.map((e: any) => ({
                    id: e.id,
                    title: e.title,
                    start: e.start,
                    end: e.end,
                  })),
                },
                'Fetched upcoming calendar events'
              );

              // Check each event to see if it should be notified about
              for (const event of events) {
                try {
                  const eventStart = new Date(event.start);
                  
                  // Collect event for test message (all future events within 24 hours)
                  const eventTimeDiff = eventStart.getTime() - now.getTime();
                  const eventTimeDiffMinutes = Math.floor(eventTimeDiff / (1000 * 60));
                  
                  // Collect all events that are in the future (up to 24 hours ahead)
                  if (eventTimeDiffMinutes > 0 && eventTimeDiffMinutes <= (24 * 60)) {
                    // Calculate when reminder will be sent (event time - notification minutes)
                    const reminderTime = new Date(eventStart.getTime() - (calendarNotificationMinutes * 60 * 1000));
                    const reminderTimeDiff = reminderTime.getTime() - now.getTime();
                    const reminderMinutesUntil = Math.floor(reminderTimeDiff / (1000 * 60));
                    
                    // Include all future events (even if reminder time has passed, as long as event is in future)
                    allUpcomingEvents.push({
                      event,
                      connection,
                      reminderTime,
                      reminderMinutes: reminderMinutesUntil,
                    });
                    
                    logger.debug(
                      {
                        userId,
                        eventId: event.id,
                        eventTitle: event.title,
                        eventTimeDiffMinutes,
                        reminderMinutesUntil,
                        eventStart: eventStart.toISOString(),
                      },
                      'Collected event for test message'
                    );
                  }
                  
                  // Get event start time in user's timezone
                  const eventFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: userTimezone,
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric',
                    hour12: false,
                  });
                  
                  const eventParts = eventFormatter.formatToParts(eventStart);
                  const getEventPart = (type: string) => eventParts.find(p => p.type === type)?.value || '0';
                  
                  const eventLocalTime = {
                    year: parseInt(getEventPart('year'), 10),
                    month: parseInt(getEventPart('month'), 10) - 1, // Convert to 0-11
                    day: parseInt(getEventPart('day'), 10),
                    hours: parseInt(getEventPart('hour'), 10),
                    minutes: parseInt(getEventPart('minute'), 10),
                    seconds: parseInt(getEventPart('second'), 10),
                  };
                  
                  // Calculate time difference in minutes more accurately
                  // Use the actual Date objects and calculate difference
                  const timeDiffMs = eventStart.getTime() - now.getTime();
                  const timeDiffMinutes = Math.floor(timeDiffMs / (1000 * 60));
                  
                  // Only process events that are in the future (positive time difference)
                  // But allow a small negative buffer (up to 5 minutes in the past) to catch events
                  // that might have started very recently but we haven't notified about yet
                  if (timeDiffMinutes < -5) {
                    logger.debug(
                      {
                        userId,
                        eventId: event.id,
                        eventTitle: event.title,
                        timeDiffMinutes,
                        eventStart: eventStart.toISOString(),
                        now: now.toISOString(),
                      },
                      'Event is too far in the past, skipping'
                    );
                    continue;
                  }
                  
                  // Check if event is today or tomorrow (to catch early morning events)
                  // For example, if it's 11:50 PM and event is at 12:00 AM (midnight), it's "tomorrow" but we should still notify
                  const isToday = eventLocalTime.year === userLocalTime.year &&
                                  eventLocalTime.month === userLocalTime.month &&
                                  eventLocalTime.day === userLocalTime.day;
                  
                  // Calculate tomorrow's date in user's timezone
                  const tomorrowDate = new Date(userLocalTime.date);
                  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
                  const tomorrowFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: userTimezone,
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                  });
                  const tomorrowParts = tomorrowFormatter.formatToParts(tomorrowDate);
                  const getTomorrowPart = (type: string) => tomorrowParts.find(p => p.type === type)?.value || '0';
                  const tomorrowLocalDate = {
                    year: parseInt(getTomorrowPart('year'), 10),
                    month: parseInt(getTomorrowPart('month'), 10) - 1,
                    day: parseInt(getTomorrowPart('day'), 10),
                  };
                  
                  const isTomorrow = eventLocalTime.year === tomorrowLocalDate.year &&
                                     eventLocalTime.month === tomorrowLocalDate.month &&
                                     eventLocalTime.day === tomorrowLocalDate.day;
                  
                  // Only process events that are today or tomorrow (within our 24-hour window)
                  // This prevents processing events that are too far in the future
                  if (!isToday && !isTomorrow) {
                    logger.debug(
                      {
                        userId,
                        eventId: event.id,
                        eventTitle: event.title,
                        eventDate: `${eventLocalTime.year}-${String(eventLocalTime.month + 1).padStart(2, '0')}-${String(eventLocalTime.day).padStart(2, '0')}`,
                        todayDate: `${userLocalTime.year}-${String(userLocalTime.month + 1).padStart(2, '0')}-${String(userLocalTime.day).padStart(2, '0')}`,
                        tomorrowDate: `${tomorrowLocalDate.year}-${String(tomorrowLocalDate.month + 1).padStart(2, '0')}-${String(tomorrowLocalDate.day).padStart(2, '0')}`,
                        timeDiffMinutes,
                      },
                      'Event is not today or tomorrow, skipping'
                    );
                    continue;
                  }
                  
                  // Check if this event should trigger a notification
                  // We want to send notification when: currentTime ≈ eventTime - calendarNotificationMinutes
                  // Use a range to account for cron timing (allow ±1 minute tolerance for cron execution timing)
                  // This ensures we catch notifications even if cron runs slightly early or late
                  const minMinutes = Math.max(0, calendarNotificationMinutes - 1);
                  const maxMinutes = calendarNotificationMinutes + 1;
                  
                  logger.info(
                    {
                      userId,
                      eventId: event.id,
                      eventTitle: event.title,
                      eventStart: eventStart.toISOString(),
                      now: now.toISOString(),
                      timeDiffMinutes,
                      calendarNotificationMinutes,
                      minMinutes,
                      maxMinutes,
                      isToday,
                      isTomorrow,
                      eventLocalTime: `${eventLocalTime.hours}:${String(eventLocalTime.minutes).padStart(2, '0')}`,
                      currentLocalTime: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}`,
                      willTrigger: timeDiffMinutes >= minMinutes && timeDiffMinutes <= maxMinutes,
                    },
                    'Checking if event should trigger notification'
                  );
                  
                  if (timeDiffMinutes >= minMinutes && timeDiffMinutes <= maxMinutes) {
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
                          eventLocalTime: `${eventLocalTime.hours}:${String(eventLocalTime.minutes).padStart(2, '0')}`,
                          currentLocalTime: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}`,
                          timeDiffMinutes,
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

        // Send test message with next 3 upcoming events
        logger.info(
          {
            userId,
            phoneNumber: whatsappNumber.phoneNumber,
            totalEventsCollected: allUpcomingEvents.length,
            events: allUpcomingEvents.map(e => ({
              title: e.event.title,
              start: e.event.start,
              reminderMinutes: e.reminderMinutes,
            })),
          },
          'Preparing to send test message'
        );
        
        if (allUpcomingEvents.length > 0) {
          try {
            // Sort events by event start time (soonest first), not reminder time
            allUpcomingEvents.sort((a, b) => {
              const aStart = new Date(a.event.start).getTime();
              const bStart = new Date(b.event.start).getTime();
              return aStart - bStart;
            });
            
            // Get top 3 events
            const top3Events = allUpcomingEvents.slice(0, 3);
            
            logger.info(
              {
                userId,
                top3Events: top3Events.map(e => ({
                  title: e.event.title,
                  start: e.event.start,
                  reminderMinutes: e.reminderMinutes,
                })),
              },
              'Selected top 3 events for test message'
            );
            
            // Build test message
            let testMessage = `*test*\n\n`;
            
            for (const { event, connection, reminderMinutes } of top3Events) {
              const eventStart = new Date(event.start);
              
              testMessage += `*${event.title || 'Untitled Event'}*\n`;
              if (reminderMinutes > 0) {
                testMessage += `it will send you remind message in ${reminderMinutes} ${reminderMinutes === 1 ? 'min' : 'mins'}\n`;
              } else if (reminderMinutes === 0) {
                testMessage += `it will send you remind message now\n`;
              } else {
                // Reminder time has passed but event hasn't started yet
                const eventTimeDiff = eventStart.getTime() - now.getTime();
                const eventMinutesUntil = Math.floor(eventTimeDiff / (1000 * 60));
                testMessage += `reminder already sent, event starts in ${eventMinutesUntil} ${eventMinutesUntil === 1 ? 'min' : 'mins'}\n`;
              }
              testMessage += `\n`;
            }
            
            logger.info(
              {
                userId,
                phoneNumber: whatsappNumber.phoneNumber,
                eventsCount: top3Events.length,
                totalEvents: allUpcomingEvents.length,
                messageLength: testMessage.length,
                messagePreview: testMessage.substring(0, 200),
              },
              'Sending test message with upcoming events'
            );
            
            // Send test message
            const result = await whatsappService.sendTextMessage(whatsappNumber.phoneNumber, testMessage);
            
            // Log the message
            await logOutgoingWhatsAppMessage(db, {
              whatsappNumberId: whatsappNumber.id,
              userId: whatsappNumber.userId,
              messageType: 'text',
              messageContent: testMessage,
              isFreeMessage: true,
            });
            
            logger.info(
              {
                userId,
                phoneNumber: whatsappNumber.phoneNumber,
                messageId: result.messages?.[0]?.id,
                messageSent: true,
              },
              'Test message sent successfully'
            );
          } catch (testError) {
            logger.error(
              {
                error: testError,
                errorMessage: testError instanceof Error ? testError.message : String(testError),
                errorStack: testError instanceof Error ? testError.stack : undefined,
                userId,
                phoneNumber: whatsappNumber.phoneNumber,
              },
              'Failed to send test message'
            );
            // Don't add to errors array - test message failure shouldn't fail the cron job
          }
        } else {
          logger.info(
            {
              userId,
              phoneNumber: whatsappNumber.phoneNumber,
            },
            'No upcoming events found to send test message'
          );
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

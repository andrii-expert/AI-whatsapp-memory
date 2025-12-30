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
      const hasNotificationsEnabled = userPrefs && userPrefs.calendarNotifications === true;
      
      if (!hasNotificationsEnabled) {
        logger.debug(
          {
            userId: connection.userId,
            calendarId: connection.id,
            hasPreferences: !!userPrefs,
            calendarNotifications: userPrefs?.calendarNotifications,
          },
          'Calendar connection filtered out - notifications not enabled'
        );
      }
      
      return hasNotificationsEnabled;
    });

    logger.info(
      {
        totalConnections: calendarConnections.length,
        filteredConnections: filteredConnections.length,
        filteredOut: calendarConnections.length - filteredConnections.length,
      },
      'Found calendar connections for users with notifications enabled'
    );

    let notificationsSent = 0;
    let notificationsSkipped = 0;
    let alertsSent = 0;
    const errors: string[] = [];

    // Group ALL connections by user (for sending alert messages to all users with calendars)
    const allConnectionsByUser = new Map<string, typeof calendarConnections>();
    for (const connection of calendarConnections) {
      if (!allConnectionsByUser.has(connection.userId)) {
        allConnectionsByUser.set(connection.userId, []);
      }
      allConnectionsByUser.get(connection.userId)!.push(connection);
    }

    // Send "Alert received" message to all users with calendar connections
    for (const [userId, userConnections] of allConnectionsByUser.entries()) {
      try {
        // Get user info
        const user = await getUserById(db, userId);
        if (!user) {
          logger.warn({ userId }, 'User not found for alert message');
          continue;
        }

        // Get user's timezone from database - handle both array and object formats for preferences
        const userPrefsRawForAlert = (user as any).preferences;
        const userPreferencesForAlert = Array.isArray(userPrefsRawForAlert) 
          ? userPrefsRawForAlert[0] 
          : userPrefsRawForAlert;
        // Priority: user.timezone > userPreferences.timezone > default "Africa/Johannesburg"
        const userTimezone = (user as any).timezone || userPreferencesForAlert?.timezone || 'Africa/Johannesburg';
        
        logger.debug(
          {
            userId,
            timezoneSource: (user as any).timezone ? 'user' : userPreferencesForAlert?.timezone ? 'userPreferences' : 'default',
            userTimezone,
            userTableTimezone: (user as any).timezone,
            preferencesTimezone: userPreferencesForAlert?.timezone,
          },
          'User timezone from database (for alert)'
        );

        // Get user's verified WhatsApp numbers
        const whatsappNumbers = await getUserWhatsAppNumbers(db, userId);
        const whatsappNumber = whatsappNumbers.find(n => n.isVerified && n.isActive) ||
                              whatsappNumbers.find(n => n.isVerified);

        if (!whatsappNumber) {
          logger.debug({ userId }, 'User has no verified WhatsApp number, skipping alert');
          continue;
        }

        // Collect all events from all calendar connections for the alert message
        const allEventsForAlert: Array<{ event: any; connection: any; eventStart: Date }> = [];

        // Fetch events from all calendar connections
        for (const connection of userConnections) {
          try {
            if (!connection.accessToken) {
              logger.debug({ userId, calendarId: connection.id }, 'Calendar connection has no access token, skipping for alert');
              continue;
            }

            const provider = createCalendarProvider(connection.provider);
            const fromTime = new Date(now.getTime());
            const toTime = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // Next 24 hours

            try {
              const events = await provider.searchEvents(connection.accessToken, {
                calendarId: connection.calendarId || 'primary',
                timeMin: fromTime,
                timeMax: toTime,
                maxResults: 50,
              });

              // Collect future events for alert
              for (const event of events) {
                const eventStart = new Date(event.start);
                if (eventStart.getTime() > now.getTime()) {
                  allEventsForAlert.push({
                    event,
                    connection,
                    eventStart,
                  });
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
                'Failed to fetch calendar events for alert'
              );
            }
          } catch (connectionError) {
            logger.error(
              { error: connectionError, calendarId: connection.id, userId },
              'Error processing calendar connection for alert'
            );
          }
        }

        // Get current time in user's timezone for alert message
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

        const userLocalTime = {
          year: parseInt(getPart('year'), 10),
          month: parseInt(getPart('month'), 10) - 1,
          day: parseInt(getPart('day'), 10),
          hours: parseInt(getPart('hour'), 10),
          minutes: parseInt(getPart('minute'), 10),
          seconds: parseInt(getPart('second'), 10),
        };

        // Send alert message with all events data
        try {
          // Sort events by start time (earliest first)
          allEventsForAlert.sort((a, b) => a.eventStart.getTime() - b.eventStart.getTime());
          
          // Format current time for alert
          const currentTimeStr = `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}:${String(userLocalTime.seconds).padStart(2, '0')}`;
          const currentDateStr = `${userLocalTime.year}-${String(userLocalTime.month + 1).padStart(2, '0')}-${String(userLocalTime.day).padStart(2, '0')}`;
          
          let alertMessage = `*Alert received*\n\n`;
          alertMessage += `*Cron job executed at:* ${now.toISOString()}\n`;
          alertMessage += `*Your local time:* ${currentTimeStr} on ${currentDateStr}\n`;
          alertMessage += `*Timezone:* ${userTimezone}\n\n`;
          
          if (allEventsForAlert.length > 0) {
            alertMessage += `*Upcoming Events (${allEventsForAlert.length}):*\n\n`;
            
            allEventsForAlert.forEach((eventData, index) => {
              const event = eventData.event;
              const eventStart = new Date(event.start);
              
              // Format event time in user's timezone
              const eventTimeFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: userTimezone,
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                hour12: true,
              });
              const eventTimeStr = eventTimeFormatter.format(eventStart);
              
              // Calculate time until event
              const timeDiffMs = eventStart.getTime() - now.getTime();
              const timeDiffMinutes = Math.floor(timeDiffMs / (1000 * 60));
              const timeDiffHours = Math.floor(timeDiffMinutes / 60);
              const timeDiffDays = Math.floor(timeDiffHours / 24);
              
              let timeUntilEvent = '';
              if (timeDiffDays > 0) {
                timeUntilEvent = `(${timeDiffDays} day${timeDiffDays > 1 ? 's' : ''} ${timeDiffHours % 24} hour${(timeDiffHours % 24) !== 1 ? 's' : ''})`;
              } else if (timeDiffHours > 0) {
                timeUntilEvent = `(${timeDiffHours} hour${timeDiffHours > 1 ? 's' : ''} ${timeDiffMinutes % 60} minute${(timeDiffMinutes % 60) !== 1 ? 's' : ''})`;
              } else {
                timeUntilEvent = `(${timeDiffMinutes} minute${timeDiffMinutes !== 1 ? 's' : ''})`;
              }
              
              alertMessage += `${index + 1}. *${event.title || 'Untitled Event'}*\n`;
              alertMessage += `   📅 *Time:* ${eventTimeStr} ${timeUntilEvent}\n`;
              alertMessage += `   📋 *Calendar:* ${eventData.connection.calendarName || 'Calendar'}\n`;
              
              if (event.location) {
                alertMessage += `   📍 *Location:* ${event.location}\n`;
              }
              
              if (event.description) {
                const description = event.description.length > 100 
                  ? event.description.substring(0, 100) + '...' 
                  : event.description;
                alertMessage += `   📝 *Description:* ${description}\n`;
              }
              
              alertMessage += `\n`;
            });
          } else {
            alertMessage += `*No upcoming events found* in the next 24 hours.\n`;
          }
          
          alertMessage += `\n_Processed ${userConnections.length} calendar connection${userConnections.length !== 1 ? 's' : ''}._`;
          
          logger.info(
            {
              userId,
              phoneNumber: whatsappNumber.phoneNumber,
              eventsCount: allEventsForAlert.length,
              connectionsCount: userConnections.length,
            },
            'Sending alert message with all events data'
          );
          
          await whatsappService.sendTextMessage(whatsappNumber.phoneNumber, alertMessage);
          
          // Log the message
          await logOutgoingWhatsAppMessage(db, {
            whatsappNumberId: whatsappNumber.id,
            userId: whatsappNumber.userId,
            messageType: 'text',
            messageContent: alertMessage,
            isFreeMessage: true,
          });

          alertsSent++;
          logger.info(
            {
              userId,
              phoneNumber: whatsappNumber.phoneNumber,
              messageSent: true,
              eventsIncluded: allEventsForAlert.length,
            },
            'Alert message with events data sent successfully'
          );
        } catch (alertError) {
          logger.error(
            {
              error: alertError,
              userId,
              phoneNumber: whatsappNumber.phoneNumber,
            },
            'Failed to send alert message'
          );
          errors.push(`Failed to send alert message to user ${userId}`);
        }
      } catch (userError) {
        logger.error({ error: userError, userId }, 'Error sending alert message to user');
        errors.push(`Error sending alert to user ${userId}`);
      }
    }

    // Group filtered connections by user (for event reminder notifications)
    const connectionsByUser = new Map<string, typeof filteredConnections>();
    for (const connection of filteredConnections) {
      if (!connectionsByUser.has(connection.userId)) {
        connectionsByUser.set(connection.userId, []);
      }
      connectionsByUser.get(connection.userId)!.push(connection);
    }

    // If no filtered connections, exit early after sending alerts
    if (filteredConnections.length === 0) {
      logger.info({}, 'No calendar connections found for users with notifications enabled, exiting');
      return NextResponse.json({
        success: true,
        message: 'No calendar connections to check',
        checkedAt: now.toISOString(),
        connectionsChecked: 0,
        notificationsSent: 0,
        notificationsSkipped: 0,
        alertsSent: allConnectionsByUser.size,
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

        // Get user's preferences - handle both array and object formats
        const userPrefsRaw = (user as any).preferences;
        const userPreferences = Array.isArray(userPrefsRaw) 
          ? userPrefsRaw[0] 
          : userPrefsRaw;
        
        // Get user's timezone from database
        // Priority: user.timezone > userPreferences.timezone > default "Africa/Johannesburg"
        // The timezone MUST come from the database, not from server settings
        const userTimezone = (user as any).timezone || userPreferences?.timezone || 'Africa/Johannesburg';
        
        logger.info(
          {
            userId,
            timezoneSource: (user as any).timezone ? 'user' : userPreferences?.timezone ? 'userPreferences' : 'default',
            userTimezone,
            userTableTimezone: (user as any).timezone,
            preferencesTimezone: userPreferences?.timezone,
            hasPreferences: !!userPreferences,
            preferencesIsArray: Array.isArray(userPrefsRaw),
          },
          'User timezone from database'
        );
        
        if (!userTimezone || userTimezone === 'UTC') {
          logger.warn({ 
            userId, 
            hasPreferences: !!userPreferences,
            userTableTimezone: (user as any).timezone,
            preferencesTimezone: userPreferences?.timezone,
            preferencesIsArray: Array.isArray(userPrefsRaw),
          }, 'User has no valid timezone set, using default');
        }

        // Get user's calendar notification minutes from user preferences
        const calendarNotificationMinutes = userPreferences?.calendarNotificationMinutes || 10;
        
        // Verify calendar notifications are enabled
        const calendarNotificationsEnabled = userPreferences?.calendarNotifications === true;
        
        logger.info(
          {
            userId,
            calendarNotificationMinutes,
            calendarNotificationsEnabled,
            hasPreferences: !!userPreferences,
            preferencesIsArray: Array.isArray(userPrefsRaw),
            preferencesSource: 'user object',
            userPreferencesData: userPreferences,
          },
          'User calendar notification settings'
        );
        
        if (!calendarNotificationsEnabled) {
          logger.warn(
            {
              userId,
              calendarNotifications: userPreferences?.calendarNotifications,
              userPreferencesData: userPreferences,
            },
            'User has calendar notifications disabled, skipping event reminders'
          );
          continue; // Skip users with notifications disabled
        }

        // Get current time in user's timezone using Intl.DateTimeFormat for accurate conversion
        // CRITICAL: All time calculations MUST use the user's timezone from the database
        // The userTimezone variable contains the timezone string from userPreferences.timezone or user.timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone, // This MUST be from the database, not server timezone
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

        // Extract user's local time components (these represent the actual time in user's timezone from database)
        // These components are calculated using the user's timezone, not the server timezone
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
            userTimezone,
            serverTimeUTC: now.toISOString(),
            userLocalTime: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}:${String(userLocalTime.seconds).padStart(2, '0')} on ${userLocalTime.year}-${String(userLocalTime.month + 1).padStart(2, '0')}-${String(userLocalTime.day).padStart(2, '0')}`,
            timezoneSource: (user as any).timezone ? 'user' : userPreferences?.timezone ? 'userPreferences' : 'default',
          },
          'Current time in user timezone (from database)'
        );

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
                  
                  // Get event start time in user's timezone from database
                  // CRITICAL: This MUST use the userTimezone from the database, not server timezone
                  const eventFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: userTimezone, // This MUST be from the database (userPreferences.timezone or user.timezone)
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
                  
                  // Extract event time components in user's timezone from database
                  const eventLocalTime = {
                    year: parseInt(getEventPart('year'), 10),
                    month: parseInt(getEventPart('month'), 10) - 1, // Convert to 0-11
                    day: parseInt(getEventPart('day'), 10),
                    hours: parseInt(getEventPart('hour'), 10),
                    minutes: parseInt(getEventPart('minute'), 10),
                    seconds: parseInt(getEventPart('second'), 10),
                  };
                  
                  // Calculate time difference in minutes more accurately
                  // Both eventStart and now are UTC timestamps, so the difference is correct
                  // This gives us the actual time until the event in milliseconds
                  const timeDiffMs = eventStart.getTime() - now.getTime();
                  const timeDiffMinutes = Math.floor(timeDiffMs / (1000 * 60));
                  const timeDiffSeconds = Math.floor(timeDiffMs / 1000);
                  
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
                  // For example: if event is at 2:00 PM and notification is 10 minutes before,
                  // we want to send at 1:50 PM, which means timeDiffMinutes should be 10
                  // 
                  // The key insight: timeDiffMinutes is the actual time until the event (in UTC milliseconds)
                  // So if timeDiffMinutes is approximately equal to calendarNotificationMinutes, we should notify
                  // 
                  // Use a wider range to account for cron timing (allow ±10 minute tolerance for cron execution timing)
                  // This ensures we catch notifications even if cron runs slightly early or late
                  // This is important because cron jobs may not run exactly on time
                  const minMinutes = Math.max(0, calendarNotificationMinutes - 10);
                  const maxMinutes = calendarNotificationMinutes + 10;
                  
                  // Primary check: Is the time until the event approximately equal to the notification minutes?
                  // This is the most reliable check because it directly compares the time difference
                  // We want to trigger if we're within the notification window (e.g., 0-20 minutes for a 10-minute notification)
                  const shouldTriggerByTimeDiff = timeDiffMinutes >= minMinutes && timeDiffMinutes <= maxMinutes;
                  
                  // Secondary check: Calculate when the notification should be sent and check if we're at that time
                  // This is a backup check for edge cases
                  const notificationTime = new Date(eventStart.getTime() - (calendarNotificationMinutes * 60 * 1000));
                  const notificationTimeDiffMs = notificationTime.getTime() - now.getTime();
                  const notificationTimeDiffMinutes = Math.floor(notificationTimeDiffMs / (1000 * 60));
                  const shouldTriggerByNotificationTime = Math.abs(notificationTimeDiffMinutes) <= 10 && timeDiffMinutes > 0;
                  
                  // Also check if we're very close to the notification time (within 5 minutes past the notification time)
                  // This catches cases where the cron runs slightly after the exact notification time
                  const isJustPastNotificationTime = notificationTimeDiffMinutes < 0 && Math.abs(notificationTimeDiffMinutes) <= 5 && timeDiffMinutes > 0;
                  
                  // Additional check: If the event is very close (within 1 minute of notification time), always trigger
                  // This is a safety net to ensure we don't miss notifications
                  const isVeryCloseToNotificationTime = timeDiffMinutes > 0 && timeDiffMinutes <= (calendarNotificationMinutes + 2);
                  
                  // Final decision: trigger if any of the conditions are met
                  const finalShouldTrigger = shouldTriggerByTimeDiff || shouldTriggerByNotificationTime || isJustPastNotificationTime || isVeryCloseToNotificationTime;
                  
                  logger.info(
                    {
                      userId,
                      eventId: event.id,
                      eventTitle: event.title,
                      eventStart: eventStart.toISOString(),
                      eventStartLocal: `${eventLocalTime.hours}:${String(eventLocalTime.minutes).padStart(2, '0')}:${String(eventLocalTime.seconds).padStart(2, '0')} on ${eventLocalTime.year}-${String(eventLocalTime.month + 1).padStart(2, '0')}-${String(eventLocalTime.day).padStart(2, '0')}`,
                      now: now.toISOString(),
                      nowLocal: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}:${String(userLocalTime.seconds).padStart(2, '0')} on ${userLocalTime.year}-${String(userLocalTime.month + 1).padStart(2, '0')}-${String(userLocalTime.day).padStart(2, '0')}`,
                      userTimezone,
                      timeDiffMs,
                      timeDiffMinutes,
                      timeDiffSeconds,
                      calendarNotificationMinutes,
                      notificationTime: notificationTime.toISOString(),
                      notificationTimeDiffMinutes,
                      minMinutes,
                      maxMinutes,
                      isToday,
                      isTomorrow,
                      shouldTriggerByTimeDiff,
                      shouldTriggerByNotificationTime,
                      isJustPastNotificationTime,
                      isVeryCloseToNotificationTime,
                      finalShouldTrigger,
                      triggerReasons: {
                        byTimeDiff: shouldTriggerByTimeDiff,
                        byNotificationTime: shouldTriggerByNotificationTime,
                        justPast: isJustPastNotificationTime,
                        veryClose: isVeryCloseToNotificationTime,
                      },
                      reason: finalShouldTrigger 
                        ? `✅ Event matches notification criteria - timeDiffMinutes (${timeDiffMinutes}) is in range [${minMinutes}, ${maxMinutes}] or notification time diff (${notificationTimeDiffMinutes}) is within ±10 minutes or very close (${isVeryCloseToNotificationTime})` 
                        : `❌ Time difference ${timeDiffMinutes} not in range [${minMinutes}, ${maxMinutes}] and notification time diff ${notificationTimeDiffMinutes} not within ±10 minutes and not very close`,
                    },
                    'Checking if event should trigger notification'
                  );
                  
                  if (finalShouldTrigger) {
                    // Check cache to prevent duplicate notifications
                    const eventDate = new Date(event.start);
                    const dateKey = `${eventDate.getUTCFullYear()}-${eventDate.getUTCMonth() + 1}-${eventDate.getUTCDate()}-${eventDate.getUTCHours()}-${eventDate.getUTCMinutes()}`;
                    const cacheKey = `${event.id}-${dateKey}`;
                    const lastSent = notificationCache.get(cacheKey);
                    
                    logger.info(
                      {
                        userId,
                        eventId: event.id,
                        eventTitle: event.title,
                        cacheKey,
                        lastSent: lastSent ? new Date(lastSent).toISOString() : null,
                        cacheAge: lastSent ? Math.floor((now.getTime() - lastSent) / 1000) : null,
                        willSend: !lastSent || (now.getTime() - lastSent) >= CACHE_TTL,
                      },
                      'Event matches notification criteria - checking cache'
                    );

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
                  } else {
                    // Log why event didn't trigger with detailed information
                    logger.warn(
                      {
                        userId,
                        eventId: event.id,
                        eventTitle: event.title,
                        eventStart: eventStart.toISOString(),
                        eventStartLocal: `${eventLocalTime.hours}:${String(eventLocalTime.minutes).padStart(2, '0')}:${String(eventLocalTime.seconds).padStart(2, '0')} on ${eventLocalTime.year}-${String(eventLocalTime.month + 1).padStart(2, '0')}-${String(eventLocalTime.day).padStart(2, '0')}`,
                        now: now.toISOString(),
                        nowLocal: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}:${String(userLocalTime.seconds).padStart(2, '0')} on ${userLocalTime.year}-${String(userLocalTime.month + 1).padStart(2, '0')}-${String(userLocalTime.day).padStart(2, '0')}`,
                        userTimezone,
                        timeDiffMs,
                        timeDiffMinutes,
                        timeDiffSeconds,
                        calendarNotificationMinutes,
                        minMinutes,
                        maxMinutes,
                        notificationTime: notificationTime.toISOString(),
                        notificationTimeDiffMinutes,
                        shouldTriggerByTimeDiff,
                        shouldTriggerByNotificationTime,
                        isJustPastNotificationTime,
                        reason: !shouldTriggerByTimeDiff && !shouldTriggerByNotificationTime && !isJustPastNotificationTime && !isVeryCloseToNotificationTime
                          ? `Time difference ${timeDiffMinutes} is not in range [${minMinutes}, ${maxMinutes}] and notification time diff ${notificationTimeDiffMinutes} is not within ±10 minutes and not very close`
                          : 'Unknown reason',
                      },
                      'Event did not match notification criteria - skipping'
                    );
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
        alertsSent,
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
      alertsSent,
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

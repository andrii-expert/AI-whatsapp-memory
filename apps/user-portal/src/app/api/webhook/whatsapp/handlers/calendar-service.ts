// Calendar service - wraps calendar providers with user's stored connections and handles all calendar operations
// Copied from voice-worker for use in text message handling

import type { Database } from '@imaginecalendar/database/client';
import { getPrimaryCalendar, updateCalendarTokens, getWhatsAppCalendars, getCalendarsByIds, getCalendarsByProviderCalendarIds, getUserSubscription, getPlanById, getPlanTier, getUserCalendars } from '@imaginecalendar/database/queries';
import { createCalendarProvider } from '@imaginecalendar/calendar-integrations/factory';
import type { Contact, CalendarProvider } from '@imaginecalendar/calendar-integrations/types';
import type { ICalendarService, CalendarIntent } from '@imaginecalendar/ai-services';
import { logger } from '@imaginecalendar/logger';
import { startOfWeek, endOfWeek } from 'date-fns';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  provider: 'google' | 'microsoft';
  htmlLink?: string;
  webLink?: string;
}

export interface CalendarOperationResult {
  success: boolean;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'QUERY';
  event?: CalendarEvent;
  events?: CalendarEvent[]; // For QUERY operations
  message?: string;
  requiresConfirmation?: boolean; // If true, user needs to confirm before proceeding
  conflictEvents?: CalendarEvent[]; // Conflicting events if requiresConfirmation is true
}

export class CalendarService implements ICalendarService {
  constructor(private db: Database) {}

  /**
   * Execute provider method with automatic token refresh on auth failure
   */
  private async withTokenRefresh<T>(
    connectionId: string,
    accessToken: string,
    refreshToken: string | null,
    provider: CalendarProvider,
    operation: (token: string) => Promise<T>
  ): Promise<T> {
    try {
      // Try with current access token
      return await operation(accessToken);
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      const errorCode = error.code || error.statusCode || error.status;
      
      logger.warn({ 
        connectionId, 
        errorMessage, 
        errorCode,
        errorName: error.name
      }, 'Calendar operation failed, checking if auth error');

      // Check if it's an authentication error
      const isAuthError =
        errorCode === 401 ||
        errorCode === '401' ||
        errorMessage?.toLowerCase().includes('authentication') ||
        errorMessage?.toLowerCase().includes('invalid_grant') ||
        errorMessage?.toLowerCase().includes('token has been expired') ||
        errorMessage?.toLowerCase().includes('invalid token') ||
        errorMessage?.toLowerCase().includes('invalid credentials') ||
        errorMessage?.toLowerCase().includes('unauthorized') ||
        errorMessage?.includes('401');

      if (isAuthError && refreshToken) {
        logger.info({ connectionId }, 'Access token expired, attempting refresh');

        try {
          // Refresh the token
          const refreshedTokens = await provider.refreshTokens(refreshToken);

          // Update database with new tokens
          await updateCalendarTokens(this.db, connectionId, {
            accessToken: refreshedTokens.accessToken,
            refreshToken: refreshedTokens.refreshToken,
            expiresAt: refreshedTokens.expiresAt,
          });

          logger.info({ connectionId }, 'Token refreshed successfully, retrying operation');

          // Retry the operation with the new token
          return await operation(refreshedTokens.accessToken);
        } catch (refreshError: any) {
          logger.error({
            connectionId,
            error: refreshError.message,
            errorStack: refreshError.stack,
            originalError: error.message
          }, 'Token refresh failed - refresh token may be expired or revoked');

          throw new Error('Calendar authentication expired. Please reconnect your calendar in settings.');
        }
      }

      // If not an auth error or no refresh token, re-throw original error
      if (!refreshToken && isAuthError) {
        logger.error({ connectionId }, 'Auth error but no refresh token available');
        throw new Error('Calendar authentication expired. Please reconnect your calendar in settings.');
      }

      throw error;
    }
  }

  /**
   * Execute calendar operation based on intent action
   */
  async execute(userId: string, intent: CalendarIntent): Promise<CalendarOperationResult> {
    const action = intent.action;

    logger.info(
      {
        userId,
        action,
        intentAttendees: intent.attendees,
        intentAttendeesCount: intent.attendees?.length || 0,
        intentAttendeesType: Array.isArray(intent.attendees) ? 'array' : typeof intent.attendees,
        intentAttendeesArray: Array.isArray(intent.attendees) ? intent.attendees : undefined,
      },
      '📋 CalendarService.execute - received intent with attendees'
    );

    switch (action) {
      case 'CREATE':
        logger.info(
          {
            userId,
            intentAttendeesBeforeCreate: intent.attendees,
            intentAttendeesCountBeforeCreate: intent.attendees?.length || 0,
          },
          '📤 About to call this.create() with intent.attendees'
        );
        return await this.create(userId, intent);
      case 'UPDATE':
        return await this.update(userId, intent);
      case 'DELETE':
        return await this.delete(userId, intent);
      case 'QUERY':
        return await this.query(userId, intent);
      default:
        throw new Error(`Unknown calendar action: ${action}`);
    }
  }

  /**
   * Get calendar's timezone from the connected calendar
   * Falls back to user preferences, then to default
   */
  private async getUserTimezone(userId: string, calendarConnection?: any): Promise<string> {
    // First, try to get timezone from the calendar itself
    if (calendarConnection && calendarConnection.accessToken) {
      try {
        const provider = createCalendarProvider(calendarConnection.provider);
        const calendarId = calendarConnection.calendarId || 'primary';
        
        // Use withTokenRefresh to handle token expiration
        const calendar = await this.withTokenRefresh(
          calendarConnection.id,
          calendarConnection.accessToken,
          calendarConnection.refreshToken || null,
          provider,
          async (token) => provider.getCalendarById(token, calendarId)
        );
        
        if (calendar.timeZone) {
          logger.info(
            {
              userId,
              calendarId: calendarConnection.calendarId,
              timezone: calendar.timeZone,
            },
            'Using calendar timezone from provider'
          );
          return calendar.timeZone;
        }
      } catch (error) {
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            userId,
            calendarId: calendarConnection.calendarId,
          },
          'Failed to get calendar timezone from provider, falling back to user timezone'
        );
      }
    }
    
    // Fallback to user timezone from users table
    try {
      const { getUserById } = await import("@imaginecalendar/database/queries");
      const user = await getUserById(this.db, userId);
      if (user?.timezone) {
        logger.info(
          {
            userId,
            timezone: user.timezone,
            source: 'users.timezone',
          },
          'Using timezone from users table'
        );
        return user.timezone;
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get user timezone from users table');
    }
    
    // Final fallback to default
    logger.warn({ userId }, 'Using default timezone (Africa/Johannesburg)');
    return 'Africa/Johannesburg';
  }

  /**
   * Get timezone offset in hours for a given timezone at a specific date
   * Returns positive for timezones ahead of UTC (e.g., +2 for Africa/Johannesburg)
   * 
   * This calculates: offset = local_time - utc_time
   * So if UTC is 12:00 and local is 14:00, offset = +2
   */
  private getTimezoneOffset(timezone: string, date: Date): number {
    try {
      // Get the same moment in time represented in both UTC and the target timezone
      // The offset is the difference: local_time - utc_time
      
      // Format the date in UTC
      const utcString = date.toLocaleString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      
      // Format the same date in the target timezone
      const tzString = date.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      
      // Parse both strings to get time components
      const parseTime = (str: string) => {
        // Format: "MM/DD/YYYY, HH:MM:SS"
        const parts = str.split(', ');
        const timePart = parts[1] || '';
        const [hours, minutes, seconds] = timePart.split(':').map(s => parseInt(s, 10));
        return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
      };
      
      const utcSeconds = parseTime(utcString);
      const tzSeconds = parseTime(tzString);
      
      // Calculate offset: local - UTC
      // If UTC is 12:00 (43200 seconds) and local is 14:00 (50400 seconds)
      // Offset = 50400 - 43200 = 7200 seconds = 2 hours
      const offsetSeconds = tzSeconds - utcSeconds;
      const offsetHours = offsetSeconds / 3600;
      
      logger.info(
        {
          timezone,
          utcString,
          tzString,
          offsetHours: offsetHours.toFixed(2),
        },
        'Calculated timezone offset'
      );
      
      return offsetHours;
    } catch (error) {
      logger.warn({ error, timezone }, 'Failed to calculate timezone offset, using fallback');
      // Fallback: use a known offset for common timezones
      const knownOffsets: Record<string, number> = {
        'Africa/Johannesburg': 2,
        'America/New_York': -5, // EST, will vary with DST
        'America/Los_Angeles': -8, // PST, will vary with DST
        'Europe/London': 0, // GMT, will vary with DST
      };
      
      return knownOffsets[timezone] ?? 2; // Default to GMT+2
    }
  }

  /**
   * Create calendar event from resolved intent
   */
  async create(userId: string, intent: CalendarIntent): Promise<CalendarOperationResult> {
    try {
      logger.info({ userId }, 'Creating calendar event');

      // First, get the user's actual primary calendar
      const userPrimaryCalendar = await getPrimaryCalendar(this.db, userId);
      logger.info({ 
        userId, 
        hasPrimaryCalendar: !!userPrimaryCalendar,
        primaryCalendarId: userPrimaryCalendar?.id,
        primaryCalendarName: userPrimaryCalendar?.calendarName || userPrimaryCalendar?.email,
        primaryIsActive: userPrimaryCalendar?.isActive
      }, 'Retrieved user primary calendar');

      // Get user's selected WhatsApp calendars
      const whatsappCalendarIds = await getWhatsAppCalendars(this.db, userId);
      logger.info({ userId, whatsappCalendarIds }, 'Retrieved WhatsApp calendar IDs');

      // Determine which calendar to use:
      // 1. If user has a primary calendar that is active, use it (regardless of WhatsApp selection)
      // 2. If no primary calendar but WhatsApp calendars are selected, use the first active from WhatsApp selected
      // 3. If neither, throw an error
      let calendarConnection: any | undefined;
      
      // First priority: Use primary calendar if it exists and is active
      if (userPrimaryCalendar && userPrimaryCalendar.isActive) {
        calendarConnection = userPrimaryCalendar;
        logger.info({ 
          userId, 
          reason: 'using_primary_calendar',
          calendarId: calendarConnection.id,
          calendarName: calendarConnection.calendarName || calendarConnection.email,
          hasWhatsAppSelection: !!(whatsappCalendarIds && whatsappCalendarIds.length > 0)
        }, 'Using primary calendar for event creation');
      } 
      // Second priority: If no primary calendar, check WhatsApp selected calendars
      else if (whatsappCalendarIds && whatsappCalendarIds.length > 0) {
        // Get the selected calendar connections by provider calendar IDs
        // whatsappCalendarIds contains provider calendar IDs (like email addresses or Google calendar IDs),
        // not database connection IDs, so we need to match against the calendarId field
        const calendarConnections = await getCalendarsByProviderCalendarIds(this.db, userId, whatsappCalendarIds);
        logger.info({ userId, calendarConnectionsCount: calendarConnections.length, calendarConnections: calendarConnections.map(c => ({ id: c.id, calendarId: c.calendarId, isActive: c.isActive, provider: c.provider })) }, 'Retrieved calendar connections from WhatsApp selection');

        if (calendarConnections.length === 0) {
          throw new Error('Selected calendars not found. Please check your calendar connections.');
        }

        // Filter to only active calendars
        const activeCalendarConnections = calendarConnections.filter(cal => cal.isActive);
        logger.info({ userId, activeCalendarConnectionsCount: activeCalendarConnections.length }, 'Filtered to active calendars');

        if (activeCalendarConnections.length === 0) {
          throw new Error('None of the selected calendars are active. Please check your calendar connections and ensure at least one selected calendar is active.');
        }

        // Use the first active calendar from WhatsApp selected
        calendarConnection = activeCalendarConnections[0];
        logger.info({ 
          userId, 
          reason: 'using_first_active_from_whatsapp_selected',
          calendarId: calendarConnection.id,
          calendarName: calendarConnection.calendarName || calendarConnection.email
        }, 'Using first active calendar from WhatsApp selected (no primary calendar)');
      }
      // No primary calendar and no WhatsApp selection - error
      else {
        throw new Error('No calendar available. Please set a primary calendar or select calendars for WhatsApp in your settings.');
      }
      
      // Ensure we have a valid calendar connection
      if (!calendarConnection) {
        throw new Error('No valid calendar found. Please check your calendar connections and ensure at least one calendar is active.');
      }

      logger.info({ 
        userId, 
        usingPrimary: calendarConnection.isPrimary || false,
        calendarId: calendarConnection.id,
        calendarName: calendarConnection.calendarName || calendarConnection.email,
        isPrimary: calendarConnection.isPrimary,
        calendarProvider: calendarConnection.provider
      }, 'Selected calendar for event creation');

      if (!calendarConnection.isActive) {
        throw new Error('Selected calendar is inactive. Please reconnect your calendar.');
      }

      // Get calendar's timezone (from calendar, not user preferences)
      const calendarTimezone = await this.getUserTimezone(userId, calendarConnection);
      logger.info({ userId, timezone: calendarTimezone, source: 'calendar' }, 'Using calendar timezone for event creation');

      // Validate intent has required fields
      if (!intent.title) {
        throw new Error('Event title is required');
      }

      if (!intent.startDate) {
        throw new Error('Event start date is required');
      }

      // Check for existing events with the same title and add indexing if needed
      let finalEventTitle = intent.title.trim();
      try {
        // Query calendar for events with the same title
        const searchIntent: CalendarIntent = {
          action: 'QUERY',
          confidence: 0.9,
          title: finalEventTitle,
          queryTimeframe: 'all',
        };
        
        const queryResult = await this.query(userId, searchIntent);
        const baseTitle = intent.title.trim();
        
        if (queryResult.success && queryResult.events) {
          // Find all events that start with the base title (exact match or with -N suffix)
          const matchingEvents = queryResult.events.filter(e => {
            const eventTitle = e.title.trim();
            // Exact match
            if (eventTitle === baseTitle) return true;
            // Match with -N suffix (e.g., "Meeting-1", "Meeting-2")
            const suffixMatch = eventTitle.match(new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`));
            return !!suffixMatch;
          });
          
          if (matchingEvents.length > 0) {
            // Extract all index numbers from matching events
            const indices: number[] = [];
            matchingEvents.forEach(e => {
              const eventTitle = e.title.trim();
              if (eventTitle === baseTitle) {
                // Exact match counts as index 0 (no suffix)
                indices.push(0);
              } else {
                const suffixMatch = eventTitle.match(new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`));
                if (suffixMatch && suffixMatch[1]) {
                  indices.push(parseInt(suffixMatch[1], 10));
                }
              }
            });
            
            // Find the next available index
            const maxIndex = Math.max(...indices, -1);
            const nextIndex = maxIndex + 1;
            
            if (nextIndex === 0) {
              // First duplicate - add -1 to the new one
              finalEventTitle = `${baseTitle}-1`;
            } else {
              finalEventTitle = `${baseTitle}-${nextIndex}`;
            }
            
            logger.info(
              {
                userId,
                originalTitle: intent.title,
                finalTitle: finalEventTitle,
                matchingCount: matchingEvents.length,
                indices,
                nextIndex,
              },
              'Added indexing to event title due to duplicates'
            );
          }
        }
      } catch (error) {
        logger.warn({ error, userId, title: intent.title }, 'Failed to check for duplicate event titles, using original title');
      }
      
      // Update intent title with indexed version
      intent.title = finalEventTitle;

      // Parse dates with calendar's timezone
      const startDateTime = this.parseDateTime(
        intent.startDate,
        intent.startTime || undefined,
        intent.isAllDay || false,
        calendarTimezone
      );

      const endDateTime = this.parseEndDateTime(
        startDateTime,
        intent.endDate,
        intent.endTime,
        intent.duration,
        intent.isAllDay,
        calendarTimezone
      );

      // Log date/time parsing for debugging
      logger.info(
        {
          userId,
          timezone: calendarTimezone,
          intentDate: intent.startDate,
          intentTime: intent.startTime,
          parsedStartISO: startDateTime.toISOString(),
          parsedStartLocal: startDateTime.toLocaleString('en-US', { timeZone: calendarTimezone }),
          parsedEndISO: endDateTime.toISOString(),
        },
        'Parsed event date/time using calendar timezone'
      );

      // Check for conflicting events before creating (unless bypassConflictCheck flag is set)
      const bypassConflictCheck = (intent as any).bypassConflictCheck === true;
      
      if (!bypassConflictCheck) {
        const conflicts = await this.checkEventConflicts(
          userId,
          calendarConnection,
          startDateTime,
          endDateTime
        );
        
        if (conflicts.length > 0) {
          // Format conflict message with meeting titles in bold
          const conflictDetails = conflicts.map((conflict, index) => {
            const conflictDate = new Date(conflict.start);
            const conflictTime = conflictDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: calendarTimezone,
            });
            const conflictDateStr = conflictDate.toLocaleDateString('en-US', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              timeZone: calendarTimezone,
            });
            return `*${conflict.title || 'Untitled Event'}* on ${conflictDateStr} at ${conflictTime}`;
          }).join('\n');
          
          const conflictMessage = conflicts.length === 1
            ? `Ahh, you are double booked. You already have *${conflicts[0].title || 'a meeting'}* at that time. Should we leave it as is? Or would you like to change the date or time. Let us know and we will adjust where needed.`
            : `Ahh, you are double booked. You already have ${conflicts.length} meetings at that time:\n\n${conflictDetails}\n\nShould we leave it as is? Or would you like to change the date or time. Let us know and we will adjust where needed.`;
          
          // Return special response asking for confirmation
          return {
            success: false,
            action: 'CREATE',
            requiresConfirmation: true,
            conflictEvents: conflicts,
            message: conflictMessage,
          };
        }
      }
      
      // Create event via provider with token refresh
      const provider = createCalendarProvider(calendarConnection.provider);
      
      // Log the exact values being sent to the calendar provider
      logger.info(
        {
          userId,
          timezone: calendarTimezone,
          startDateTimeISO: startDateTime.toISOString(),
          startDateTimeLocal: startDateTime.toLocaleString('en-US', { timeZone: calendarTimezone }),
          endDateTimeISO: endDateTime.toISOString(),
          intentTime: intent.startTime,
          intentDate: intent.startDate,
        },
        'Sending event to calendar provider with calendar timezone'
      );
      
      // Check event limit for free users (max 15 events)
      try {
        const subscription = await getUserSubscription(this.db, userId);
        if (subscription?.plan) {
          const plan = await getPlanById(this.db, subscription.plan);
          const metadata = (plan?.metadata as Record<string, unknown> | null) || null;
          const tier = getPlanTier(metadata);
          
          if (tier === 'free') {
            const MAX_EVENTS_FREE = 15;
            
            // Query all events from all user's calendars to count them
            const userCalendars = await getUserCalendars(this.db, userId);
            const activeCalendars = userCalendars.filter(cal => cal.isActive);
            
            let totalEventCount = 0;
            const now = new Date();
            const oneYearAgo = new Date(now);
            oneYearAgo.setFullYear(now.getFullYear() - 1);
            const oneYearAhead = new Date(now);
            oneYearAhead.setFullYear(now.getFullYear() + 1);
            
            // Count events from all active calendars
            for (const cal of activeCalendars) {
              try {
                const calProvider = createCalendarProvider(cal.provider);
                const accessToken = cal.accessToken;
                if (!accessToken) continue;
                
                const events = await this.withTokenRefresh(
                  cal.id,
                  accessToken,
                  cal.refreshToken || null,
                  calProvider,
                  async (token) => {
                    try {
                      return await calProvider.searchEvents(token, {
                        calendarId: cal.calendarId || 'primary',
                        timeMin: oneYearAgo,
                        timeMax: oneYearAhead,
                        maxResults: 10000,
                      });
                    } catch (error) {
                      logger.warn({ error, calendarId: cal.id, userId }, 'Failed to search events for limit check');
                      return [];
                    }
                  }
                );
                
                totalEventCount += events.length || 0;
              } catch (error) {
                logger.warn({ error, calendarId: cal.id, userId }, 'Failed to query calendar for event limit check');
                // Continue with other calendars
              }
            }
            
            if (totalEventCount >= MAX_EVENTS_FREE) {
              logger.info(
                {
                  userId,
                  tier,
                  eventCount: totalEventCount,
                  limit: MAX_EVENTS_FREE,
                },
                'Event creation blocked - free plan limit reached'
              );
              
              return {
                success: false,
                action: 'CREATE',
                message: `📅 *Event Limit Reached*\n\nOn the Free plan you can create up to 15 events. Upgrade to Pro to create more events.\n\nUpgrade at: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.imaginecalendar.com'}/billing`,
              };
            }
          }
        }
      } catch (error) {
        logger.error(
          {
            error,
            userId,
          },
          'Failed to check plan limits for event creation'
        );
        // Continue with event creation if plan check fails (fail open)
      }

      // Check if user wants Google Meet (check description and location for keywords)
      // Also create Google Meet if no location is provided
      const descriptionLower = intent.description?.toLowerCase() || '';
      const locationLower = intent.location?.toLowerCase() || '';
      const hasLocation = !!intent.location && intent.location.trim().length > 0;
      const wantsGoogleMeet = 
        (descriptionLower.includes('google meet') ||
         descriptionLower.includes('meet link') ||
         descriptionLower.includes('video call') ||
         descriptionLower.includes('video meeting') ||
         descriptionLower.includes('meet requested') ||
         locationLower.includes('google meet') ||
         locationLower.includes('meet link') ||
         locationLower === 'meet') &&
        calendarConnection.provider === 'google'; // Only for Google Calendar
      
      // If no location provided OR Google Meet is requested, create Google Meet
      const shouldCreateGoogleMeet = (!hasLocation || wantsGoogleMeet) && calendarConnection.provider === 'google';
      
      logger.info(
        {
          userId,
          wantsGoogleMeet,
          hasLocation,
          shouldCreateGoogleMeet,
          hasDescription: !!intent.description,
          description: intent.description,
          location: intent.location,
          provider: calendarConnection.provider,
        },
        'Google Meet detection for event creation'
      );

      const createParams = {
        calendarId: calendarConnection.calendarId || 'primary',
        title: intent.title!,
        description: intent.description,
        start: startDateTime,
        end: endDateTime,
        allDay: intent.isAllDay ?? false,
        location: intent.location,
        attendees: intent.attendees,
        timeZone: calendarTimezone, // Use calendar's timezone
        createGoogleMeet: shouldCreateGoogleMeet, // Create Google Meet if no location or if requested
      };
      
      logger.info(
        {
          userId,
          createParams: {
            ...createParams,
            start: createParams.start.toISOString(),
            end: createParams.end.toISOString(),
            attendees: createParams.attendees,
            attendeesCount: createParams.attendees?.length || 0,
            attendeesType: Array.isArray(createParams.attendees) ? 'array' : typeof createParams.attendees,
            attendeesArray: Array.isArray(createParams.attendees) ? createParams.attendees : undefined,
          },
        },
        'Calendar createEvent parameters - VERIFYING ATTENDEES'
      );
      
      // Critical check: ensure attendees is an array
      if (createParams.attendees && !Array.isArray(createParams.attendees)) {
        logger.error(
          {
            userId,
            attendees: createParams.attendees,
            attendeesType: typeof createParams.attendees,
          },
          'CRITICAL ERROR: attendees is not an array!'
        );
        createParams.attendees = Array.isArray(createParams.attendees) ? createParams.attendees : [createParams.attendees].filter(Boolean);
      }
      
      // Log each attendee individually
      if (createParams.attendees && Array.isArray(createParams.attendees)) {
        createParams.attendees.forEach((attendee, index) => {
          logger.info(
            {
              userId,
              attendeeIndex: index,
              attendee: attendee,
              attendeeType: typeof attendee,
              attendeeLength: typeof attendee === 'string' ? attendee.length : 'N/A',
            },
            `Attendee ${index + 1} being sent to calendar provider`
          );
        });
      }
      
      const createdEvent = await this.withTokenRefresh(
        calendarConnection.id,
        calendarConnection.accessToken!,
        calendarConnection.refreshToken || null,
        provider,
        (token) => provider.createEvent(token, createParams)
      );

      const event: CalendarEvent = {
        id: createdEvent.id,
        title: createdEvent.title,
        description: createdEvent.description,
        start: createdEvent.start,
        end: createdEvent.end,
        location: createdEvent.location,
        provider: calendarConnection.provider as 'google' | 'microsoft',
        htmlLink: createdEvent.htmlLink,
        webLink: createdEvent.webLink,
      };

      // Add conferenceUrl and attendees if available
      if (createdEvent.conferenceUrl) {
        (event as any).conferenceUrl = createdEvent.conferenceUrl;
      }
      if (createdEvent.attendees && createdEvent.attendees.length > 0) {
        (event as any).attendees = createdEvent.attendees;
        logger.info(
          {
            userId,
            eventId: event.id,
            attendeesFromProvider: createdEvent.attendees,
            attendeesCountFromProvider: createdEvent.attendees.length,
          },
          '✅ Calendar event created - attendees returned from provider'
        );
      } else {
        logger.warn(
          {
            userId,
            eventId: event.id,
            attendeesSentToProvider: createParams.attendees,
            attendeesCountSentToProvider: createParams.attendees?.length || 0,
            attendeesReturnedFromProvider: createdEvent.attendees,
            attendeesCountReturnedFromProvider: createdEvent.attendees?.length || 0,
          },
          '⚠️ WARNING: No attendees returned from provider, but attendees were sent!'
        );
      }

      logger.info(
        {
          userId,
          eventId: event.id,
          eventAttendees: (event as any).attendees,
          eventAttendeesCount: (event as any).attendees?.length || 0,
        },
        '📋 Calendar event created - final event object with attendees'
      );

      return {
        success: true,
        action: 'CREATE',
        event,
        message: `Event "${event.title}" created successfully`,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to create calendar event');
      throw error;
    }
  }

  /**
   * Update existing calendar event
   */
  async update(userId: string, intent: CalendarIntent): Promise<CalendarOperationResult> {
    try {
      logger.info({ userId }, 'Updating calendar event');

      // First, get the user's actual primary calendar
      const userPrimaryCalendar = await getPrimaryCalendar(this.db, userId);
      logger.info({ 
        userId, 
        hasPrimaryCalendar: !!userPrimaryCalendar,
        primaryCalendarId: userPrimaryCalendar?.id,
        primaryCalendarName: userPrimaryCalendar?.calendarName || userPrimaryCalendar?.email,
        primaryIsActive: userPrimaryCalendar?.isActive
      }, 'Retrieved user primary calendar');

      // Get user's selected WhatsApp calendars
      const whatsappCalendarIds = await getWhatsAppCalendars(this.db, userId);
      logger.info({ userId, whatsappCalendarIds }, 'Retrieved WhatsApp calendar IDs');

      // Determine which calendar to use (same logic as create):
      // 1. If user has a primary calendar that is active, use it (regardless of WhatsApp selection)
      // 2. If no primary calendar but WhatsApp calendars are selected, use the first active from WhatsApp selected
      // 3. If neither, throw an error
      let calendarConnection: any | undefined;
      
      // First priority: Use primary calendar if it exists and is active
      if (userPrimaryCalendar && userPrimaryCalendar.isActive) {
        calendarConnection = userPrimaryCalendar;
        logger.info({ 
          userId, 
          reason: 'using_primary_calendar',
          calendarId: calendarConnection.id,
          calendarName: calendarConnection.calendarName || calendarConnection.email,
          hasWhatsAppSelection: !!(whatsappCalendarIds && whatsappCalendarIds.length > 0)
        }, 'Using primary calendar for event update');
      } 
      // Second priority: If no primary calendar, check WhatsApp selected calendars
      else if (whatsappCalendarIds && whatsappCalendarIds.length > 0) {
        // Get the selected calendar connections by provider calendar IDs
        const calendarConnections = await getCalendarsByProviderCalendarIds(this.db, userId, whatsappCalendarIds);
        logger.info({ userId, calendarConnectionsCount: calendarConnections.length, calendarConnections: calendarConnections.map(c => ({ id: c.id, calendarId: c.calendarId, isActive: c.isActive, provider: c.provider })) }, 'Retrieved calendar connections from WhatsApp selection');

        if (calendarConnections.length === 0) {
          throw new Error('Selected calendars not found. Please check your calendar connections.');
        }

        // Filter to only active calendars
        const activeCalendarConnections = calendarConnections.filter(cal => cal.isActive);
        logger.info({ userId, activeCalendarConnectionsCount: activeCalendarConnections.length }, 'Filtered to active calendars');

        if (activeCalendarConnections.length === 0) {
          throw new Error('None of the selected calendars are active. Please check your calendar connections and ensure at least one selected calendar is active.');
        }

        // Use the first active calendar from WhatsApp selected
        calendarConnection = activeCalendarConnections[0];
        logger.info({ 
          userId, 
          reason: 'using_first_active_from_whatsapp_selected',
          calendarId: calendarConnection.id,
          calendarName: calendarConnection.calendarName || calendarConnection.email
        }, 'Using first active calendar from WhatsApp selected (no primary calendar)');
      }
      // No primary calendar and no WhatsApp selection - error
      else {
        throw new Error('No calendar available. Please set a primary calendar or select calendars for WhatsApp in your settings.');
      }
      
      // Ensure we have a valid calendar connection
      if (!calendarConnection) {
        throw new Error('No valid calendar found. Please check your calendar connections and ensure at least one calendar is active.');
      }

      if (!calendarConnection.isActive) {
        throw new Error('Selected calendar is inactive. Please reconnect your calendar.');
      }

      // First, search for the event to update
      const targetEvents = await this.findTargetEvent(
        userId,
        calendarConnection.provider as 'google' | 'microsoft',
        calendarConnection.accessToken!,
        calendarConnection.calendarId || 'primary',
        intent
      );

      if (targetEvents.length === 0) {
        throw new Error('Event not found. Please provide more details about which event to update.');
      }

      // Check if the event title is generic/ambiguous
      const eventTitle = (intent.targetEventTitle || intent.title || '').toLowerCase().trim();
      const genericTitles = ['event', 'meeting', 'meeting with', 'appointment', 'call', 'call with'];
      const isGenericTitle = genericTitles.some(generic => 
        eventTitle === generic || 
        eventTitle === `${generic} ` ||
        eventTitle.startsWith(`${generic} `) ||
        eventTitle === generic.replace(' with', '')
      );

      // If multiple events found AND title is generic, ask user to clarify
      if (targetEvents.length > 1 && isGenericTitle) {
        logger.warn(
          {
            userId,
            eventCount: targetEvents.length,
            eventTitles: targetEvents.map(e => e.title),
            intentTitle: intent.targetEventTitle || intent.title,
            isGenericTitle,
          },
          'Multiple events found with generic title - asking user to clarify'
        );

        // Get calendar timezone for formatting
        const calendarTimezone = await this.getUserTimezone(userId, calendarConnection);

        // Format upcoming events for the user message
        const now = new Date();
        const upcomingEvents = targetEvents
          .filter(e => new Date(e.start) >= now)
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
          .slice(0, 5); // Limit to 5 most relevant

        // Format date for display
        const formatEventDate = (date: Date) => {
          const eventDate = new Date(date);
          const dateStr = eventDate.toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            timeZone: calendarTimezone,
          });
          const timeStr = eventDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: calendarTimezone,
          });
          return `${dateStr} at ${timeStr}`;
        };

        if (upcomingEvents.length > 0) {
          const eventsList = upcomingEvents
            .map((e, idx) => `${idx + 1}. ${e.title} - ${formatEventDate(e.start)}`)
            .join('\n');
          
          throw new Error(
            `I found multiple meetings matching "${intent.targetEventTitle || intent.title || 'your request'}". ` +
            `Could you please specify which meeting you'd like to move? Here are your upcoming meetings:\n\n${eventsList}\n\n` +
            `Please reply with the meeting name or number (e.g., "Meeting with Drala" or "1").`
          );
        } else {
          // All events are in the past, show recent ones
          const recentEvents = targetEvents
            .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
            .slice(0, 5);
          
          const eventsList = recentEvents
            .map((e, idx) => `${idx + 1}. ${e.title} - ${formatEventDate(e.start)}`)
            .join('\n');
          
          throw new Error(
            `I found multiple meetings matching "${intent.targetEventTitle || intent.title || 'your request'}". ` +
            `Could you please specify which meeting you'd like to move? Here are your recent meetings:\n\n${eventsList}\n\n` +
            `Please reply with the meeting name or number (e.g., "Meeting with Drala" or "1").`
          );
        }
      }

      // Check if found events don't match the title well (when title is not generic)
      if (!isGenericTitle && targetEvents.length > 0 && eventTitle) {
        // Check if any of the found events actually match the title closely
        const titleWords = eventTitle.split(/\s+/).filter(w => w.length > 2); // Filter out short words
        const hasGoodMatch = targetEvents.some(event => {
          const eventTitleLower = event.title.toLowerCase();
          // Check if all significant words from intent title appear in event title
          return titleWords.every(word => eventTitleLower.includes(word)) ||
                 eventTitleLower.includes(eventTitle) ||
                 eventTitle.includes(eventTitleLower);
        });

        // If no good match found and we have multiple events, ask for clarification
        if (!hasGoodMatch && targetEvents.length > 1) {
          logger.warn(
            {
              userId,
              eventCount: targetEvents.length,
              eventTitles: targetEvents.map(e => e.title),
              intentTitle: intent.targetEventTitle || intent.title,
              hasGoodMatch,
            },
            'Found events do not match title well - asking user to clarify'
          );

          const now = new Date();
          const upcomingEvents = targetEvents
            .filter(e => new Date(e.start) >= now)
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
            .slice(0, 5);

          // Get calendar timezone for formatting
          const calendarTimezone = await this.getUserTimezone(userId, calendarConnection);

          const formatEventDate = (date: Date) => {
            const eventDate = new Date(date);
            const dateStr = eventDate.toLocaleDateString('en-US', {
              day: 'numeric',
              month: 'short',
              timeZone: calendarTimezone,
            });
            const timeStr = eventDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: calendarTimezone,
            });
            return `${dateStr} at ${timeStr}`;
          };

          if (upcomingEvents.length > 0) {
            const eventsList = upcomingEvents
              .map((e, idx) => `${idx + 1}. ${e.title} - ${formatEventDate(e.start)}`)
              .join('\n');
            
            throw new Error(
              `I couldn't find a meeting that exactly matches "${intent.targetEventTitle || intent.title}". ` +
              `Could you please specify which meeting you'd like to move? Here are your upcoming meetings:\n\n${eventsList}\n\n` +
              `Please reply with the meeting name or number (e.g., "Meeting with Drala" or "1").`
            );
          }
        }
      }

      // If multiple events found, try to select the most relevant one
      let targetEvent: CalendarEvent;
      if (targetEvents.length > 1) {
        logger.warn(
          {
            userId,
            eventCount: targetEvents.length,
            eventTitles: targetEvents.map(e => e.title),
            intentTitle: intent.targetEventTitle || intent.title,
          },
          'Multiple events found, selecting most relevant one'
        );
        
        // For updates, prefer the most recent upcoming event (or closest to now if all are past)
        const now = new Date();
        const upcomingEvents = targetEvents.filter(e => new Date(e.start) >= now);
        
        if (upcomingEvents.length > 0) {
          // Select the earliest upcoming event
          targetEvent = upcomingEvents.sort((a, b) => 
            new Date(a.start).getTime() - new Date(b.start).getTime()
          )[0]!;
        } else {
          // All events are in the past, select the most recent one
          targetEvent = targetEvents.sort((a, b) => 
            new Date(b.start).getTime() - new Date(a.start).getTime()
          )[0]!;
        }
        
        logger.info(
          {
            userId,
            selectedEventId: targetEvent.id,
            selectedEventTitle: targetEvent.title,
            selectedEventDate: targetEvent.start,
            totalMatches: targetEvents.length,
          },
          'Selected event from multiple matches'
        );
      } else {
        targetEvent = targetEvents[0]!;
      }

      // Build update parameters
      const provider = createCalendarProvider(calendarConnection.provider);

      // Fetch full event details to get allDay property
      let fullEventDetails: any = null;
      try {
        fullEventDetails = await this.withTokenRefresh(
          calendarConnection.id,
          calendarConnection.accessToken!,
          calendarConnection.refreshToken || null,
          provider,
          (token) => provider.getEvent(token, {
            calendarId: calendarConnection.calendarId || 'primary',
            eventId: targetEvent.id,
          })
        );
      } catch (error) {
        logger.warn({ error, userId, eventId: targetEvent.id }, 'Failed to fetch full event details, will infer allDay from start/end times');
      }

      const updates: any = {
        calendarId: calendarConnection.calendarId || 'primary',
        eventId: targetEvent.id,
      };

      // Update fields that are provided
      if (intent.title) updates.title = intent.title;
      if (intent.description) updates.description = intent.description;
      
      // Handle location updates - check if location is being removed (empty string) or updated
      let shouldCreateGoogleMeet = false;
      if (intent.location !== undefined) {
        // If location is empty string, it means user wants to remove location
        if (intent.location === '') {
          updates.location = ''; // Explicitly set to empty string to remove location
          logger.info(
            {
              userId,
              reason: 'location_removal_requested',
            },
            'Location removal detected - setting location to empty string'
          );
          // Check if Google Meet should be created when location is removed
          // This handles "remove location and add google meet" pattern
          const descriptionLower = intent.description?.toLowerCase() || '';
          const wantsGoogleMeet = 
            descriptionLower.includes('google meet') ||
            descriptionLower.includes('meet link') ||
            descriptionLower.includes('add google meet') ||
            descriptionLower.includes('add meet');
          
          if (wantsGoogleMeet && calendarConnection.provider === 'google') {
            shouldCreateGoogleMeet = true;
            logger.info(
              {
                userId,
                reason: 'google_meet_requested_with_location_removal',
              },
              'Google Meet requested when removing location'
            );
          }
        } else {
          updates.location = intent.location;
        }
      }
      
      // Also check if Google Meet is requested in description even if location is not being removed
      if (!shouldCreateGoogleMeet && intent.description) {
        const descriptionLower = intent.description.toLowerCase();
        const wantsGoogleMeet = 
          descriptionLower.includes('google meet') ||
          descriptionLower.includes('meet link') ||
          descriptionLower.includes('add google meet') ||
          descriptionLower.includes('add meet');
        
        if (wantsGoogleMeet && calendarConnection.provider === 'google') {
          shouldCreateGoogleMeet = true;
          logger.info(
            {
              userId,
              reason: 'google_meet_requested_in_description',
            },
            'Google Meet requested in description'
          );
        }
      }
      if (intent.attendees) {
        // When updating attendees, merge with existing attendees to avoid removing existing ones
        // This handles "invite" functionality where we want to add attendees, not replace them
        let mergedAttendees: string[] = [];
        
        // Get existing attendees from the full event details
        if (fullEventDetails && fullEventDetails.attendees && Array.isArray(fullEventDetails.attendees)) {
          // Extract email addresses from existing attendees (they may be objects or strings)
          const existingAttendeeEmails = fullEventDetails.attendees
            .map((a: any) => {
              if (typeof a === 'string') return a;
              if (a && typeof a === 'object' && a.email) return a.email;
              return null;
            })
            .filter((email: string | null): email is string => email !== null && email.trim().length > 0);
          
          logger.info(
            {
              userId,
              existingAttendees: existingAttendeeEmails,
              newAttendees: intent.attendees,
            },
            'Merging new attendees with existing attendees'
          );
          
          // Combine existing and new attendees, removing duplicates by email (case-insensitive)
          const allAttendees = [...existingAttendeeEmails, ...intent.attendees];
          const seenEmails = new Set<string>();
          mergedAttendees = [];
          
          // First, add existing attendees (to preserve their order and case)
          for (const email of existingAttendeeEmails) {
            const normalized = email.toLowerCase().trim();
            if (!seenEmails.has(normalized)) {
              seenEmails.add(normalized);
              mergedAttendees.push(email);
            }
          }
          
          // Then, add new attendees that aren't already in the list
          for (const email of intent.attendees) {
            const normalized = email.toLowerCase().trim();
            if (!seenEmails.has(normalized)) {
              seenEmails.add(normalized);
              mergedAttendees.push(email);
            }
          }
          
          logger.info(
            {
              userId,
              mergedAttendees,
              mergedCount: mergedAttendees.length,
              existingCount: existingAttendeeEmails.length,
              newCount: intent.attendees.length,
            },
            'Merged attendees list (existing + new, deduplicated)'
          );
        } else {
          // No existing attendees, just use the new ones
          mergedAttendees = intent.attendees;
          logger.info(
            {
              userId,
              newAttendees: intent.attendees,
              reason: 'No existing attendees found',
            },
            'Using only new attendees (no existing attendees to merge)'
          );
        }
        
        updates.attendees = mergedAttendees;
      }

      // Get calendar's timezone (from calendar, not user preferences)
      const calendarTimezone = await this.getUserTimezone(userId, calendarConnection);
      logger.info({ userId, timezone: calendarTimezone, source: 'calendar' }, 'Using calendar timezone for event update');
      
      // Track if we're updating dates (needed for allDay flag logic)
      let isUpdatingDates = false;
      
      // Update dates if provided
      if (intent.startDate) {
        isUpdatingDates = true;
        
        // Log the intent values before parsing
        logger.info(
          {
            userId,
            intentStartDate: intent.startDate,
            intentStartTime: intent.startTime,
            intentIsAllDay: intent.isAllDay,
            calendarTimezone,
            originalEventStart: targetEvent.start,
            originalEventAllDay: fullEventDetails?.allDay,
          },
          'Parsing start date/time for event update'
        );
        
        // CRITICAL: If only date is provided (no time), preserve the original event's time
        // This handles cases like "change date to Jan 10th" where user wants to keep the same time
        let timeToUse: string | undefined = intent.startTime;
        let allDayToUse: boolean | undefined = intent.isAllDay;
        
        if (!intent.startTime && intent.isAllDay === undefined) {
          // Only date provided, no time - preserve original event's time and allDay status
          const originalStart = new Date(targetEvent.start);
          
          // Check if original event was all-day
          // Try to get from full event details first, then infer from start/end times
          let originalIsAllDay = false;
          if (fullEventDetails && fullEventDetails.allDay !== undefined) {
            originalIsAllDay = fullEventDetails.allDay;
          } else {
            // Infer from start/end times: if start is at midnight UTC and duration is 24 hours, it's likely all-day
            const originalEnd = new Date(targetEvent.end);
            const startUTC = originalStart.toISOString();
            const endUTC = originalEnd.toISOString();
            // Check if start is at midnight UTC (00:00:00.000Z)
            const isStartMidnightUTC = startUTC.endsWith('T00:00:00.000Z');
            // Check if duration is approximately 24 hours (all-day events are typically 24 hours)
            const durationMs = originalEnd.getTime() - originalStart.getTime();
            const durationHours = durationMs / (1000 * 60 * 60);
            const is24Hours = Math.abs(durationHours - 24) < 0.1; // Allow small margin for rounding
            originalIsAllDay = isStartMidnightUTC && is24Hours;
            
            logger.info(
              {
                userId,
                startUTC,
                endUTC,
                durationHours,
                isStartMidnightUTC,
                is24Hours,
                inferredAllDay: originalIsAllDay,
              },
              'Inferred allDay status from event times'
            );
          }
          
          if (!originalIsAllDay) {
            // Original event had a time - extract it and preserve it
            // Format the original time as HH:MM in the calendar's timezone
            const timeFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: calendarTimezone,
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
            const originalTimeString = timeFormatter.format(originalStart);
            timeToUse = originalTimeString;
            allDayToUse = false; // Keep it as a timed event
            
            logger.info(
              {
                userId,
                originalDate: intent.startDate,
                preservedTime: timeToUse,
                originalEventAllDay: originalIsAllDay,
                newAllDay: allDayToUse,
              },
              'Date-only update: Preserving original event time'
            );
          } else {
            // Original event was all-day - keep it all-day
            allDayToUse = true;
            logger.info(
              {
                userId,
                originalDate: intent.startDate,
                originalEventAllDay: originalIsAllDay,
                newAllDay: allDayToUse,
              },
              'Date-only update: Original event was all-day, keeping it all-day'
            );
          }
        }
        
        updates.start = this.parseDateTime(intent.startDate, timeToUse, allDayToUse, calendarTimezone);
        
        // Log the parsed result
        logger.info(
          {
            userId,
            parsedStartUTC: updates.start.toISOString(),
            parsedStartLocal: updates.start.toLocaleString('en-US', { timeZone: calendarTimezone }),
            expectedLocalTime: timeToUse ? `${intent.startDate} ${timeToUse}` : intent.startDate,
            usedTime: timeToUse,
            usedAllDay: allDayToUse,
          },
          'Parsed start date/time for update'
        );
        
        // If start is updated, we must also update end to maintain a valid time range
        // Use the new start date for calculating end
        const newStartDate = updates.start;
        
        // If explicit end date/time/duration is provided, use it
        if (intent.endDate || intent.endTime || intent.duration) {
          updates.end = this.parseEndDateTime(
            newStartDate,
            intent.endDate,
            intent.endTime,
            intent.duration,
            allDayToUse,
            calendarTimezone
          );
        } else {
          // Calculate end based on the original event's duration
          const originalStart = new Date(targetEvent.start);
          const originalEnd = new Date(targetEvent.end);
          const durationMs = originalEnd.getTime() - originalStart.getTime();
          
          // Apply the same duration to the new start time
          updates.end = new Date(newStartDate.getTime() + durationMs);
          
          logger.info(
            {
              userId,
              originalStart: originalStart.toISOString(),
              originalEnd: originalEnd.toISOString(),
              durationMs,
              newStart: newStartDate.toISOString(),
              newEnd: updates.end.toISOString(),
            },
            'Calculated end date based on original event duration'
          );
        }
      } else if (intent.startTime) {
        isUpdatingDates = true;
        // Only time is being updated (date stays the same)
        // Use the original event's date and combine it with the new time
        const originalStart = new Date(targetEvent.start);
        
        // Format the original date as YYYY-MM-DD in the calendar's timezone
        // This ensures we get the correct local date even if the event is stored in UTC
        const dateFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: calendarTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const originalDateString = dateFormatter.format(originalStart);
        
        logger.info(
          {
            userId,
            originalDateString,
            newTime: intent.startTime,
            originalStartISO: originalStart.toISOString(),
            originalStartLocal: originalStart.toLocaleString('en-US', { timeZone: calendarTimezone }),
            calendarTimezone,
          },
          'Updating only time, preserving original date'
        );
        
        // Parse the new date/time combination (original date + new time)
        updates.start = this.parseDateTime(originalDateString, intent.startTime, intent.isAllDay, calendarTimezone);
        
        // Log the parsed result
        logger.info(
          {
            userId,
            parsedStartUTC: updates.start.toISOString(),
            parsedStartLocal: updates.start.toLocaleString('en-US', { timeZone: calendarTimezone }),
            expectedLocalTime: `${originalDateString} ${intent.startTime}`,
          },
          'Parsed start date/time for time-only update'
        );
        
        // Calculate end based on the original event's duration
        const originalEnd = new Date(targetEvent.end);
        const durationMs = originalEnd.getTime() - originalStart.getTime();
        
        // Apply the same duration to the new start time
        updates.end = new Date(updates.start.getTime() + durationMs);
        
        logger.info(
          {
            userId,
            originalStart: originalStart.toISOString(),
            originalEnd: originalEnd.toISOString(),
            durationMs,
            newStart: updates.start.toISOString(),
            newEnd: updates.end.toISOString(),
          },
          'Calculated end date based on original event duration (time-only update)'
        );
      } else if (intent.endDate || intent.endTime || intent.duration) {
        isUpdatingDates = true;
        // Only end is being updated (start stays the same)
        const startDate = new Date(targetEvent.start);
        updates.end = this.parseEndDateTime(
          startDate,
          intent.endDate,
          intent.endTime,
          intent.duration,
          intent.isAllDay,
          calendarTimezone
        );
      }
      
      // Handle allDay flag - ONLY set it if we're updating dates
      // This prevents issues when only updating location, title, etc.
      if (isUpdatingDates) {
        if (intent.isAllDay !== undefined && intent.isAllDay !== null) {
          // Explicit allDay flag provided - use it
          updates.allDay = intent.isAllDay;
        } else if (intent.startDate && (intent.startTime === undefined || intent.startTime === null)) {
          // Date-only update: preserve original event's allDay status
          // We already handled this above by preserving the time and setting allDayToUse
          // The allDay flag should already be set in updates.allDay from the date parsing logic above
          // But if it wasn't set (shouldn't happen), use the value we determined
          if (updates.allDay === undefined) {
            // Get from full event details or infer
            let originalIsAllDayValue = false;
            if (fullEventDetails && fullEventDetails.allDay !== undefined) {
              originalIsAllDayValue = fullEventDetails.allDay;
            } else {
              // Infer from start/end times
              const originalStart = new Date(targetEvent.start);
              const originalEnd = new Date(targetEvent.end);
              const startUTC = originalStart.toISOString();
              const isStartMidnightUTC = startUTC.endsWith('T00:00:00.000Z');
              const durationMs = originalEnd.getTime() - originalStart.getTime();
              const durationHours = durationMs / (1000 * 60 * 60);
              const is24Hours = Math.abs(durationHours - 24) < 0.1;
              originalIsAllDayValue = isStartMidnightUTC && is24Hours;
            }
            updates.allDay = originalIsAllDayValue;
          }
          
          logger.info(
            {
              userId,
              intentStartDate: intent.startDate,
              intentStartTime: intent.startTime,
              originalEventAllDay: fullEventDetails?.allDay,
              setAllDay: updates.allDay,
            },
            'Date-only update: Preserving original event allDay status'
          );
        } else if (intent.startDate && intent.startTime) {
          // If both date and time are provided, it's a timed event
          updates.allDay = false;
        } else if (intent.startTime) {
          // If only time is provided (date preserved), it's a timed event
          updates.allDay = false;
        }
      }
      
      // Validate that end is after start (only if we're updating dates)
      if (isUpdatingDates && updates.start && updates.end) {
        if (updates.end <= updates.start) {
          logger.warn(
            {
              userId,
              start: updates.start.toISOString(),
              end: updates.end.toISOString(),
            },
            'End date is before or equal to start date, adjusting end date'
          );
          // If end is not after start, add 1 hour to end
          updates.end = new Date(updates.start.getTime() + 60 * 60 * 1000);
        }
      }
      
      // Clean up the updates object - remove undefined values to avoid issues
      // Always include required fields: calendarId and eventId
      const cleanUpdates: any = {
        calendarId: updates.calendarId,
        eventId: updates.eventId,
      };
      
      // Add optional fields only if they are defined and valid
      if (updates.title !== undefined && updates.title !== null) cleanUpdates.title = updates.title;
      if (updates.description !== undefined && updates.description !== null) cleanUpdates.description = updates.description;
      if (updates.location !== undefined && updates.location !== null) cleanUpdates.location = updates.location;
      if (updates.attendees !== undefined && updates.attendees !== null) cleanUpdates.attendees = updates.attendees;
      
      // CRITICAL: Only include start/end/allDay/timeZone if we're actually updating dates
      // When only updating location, title, description, or attendees, we must NOT include any date fields
      // This prevents Google Calendar API from throwing "Invalid start time" errors
      if (isUpdatingDates) {
        // Validate and include start date
        if (updates.start !== undefined && updates.start !== null) {
          const startDate = updates.start instanceof Date ? updates.start : new Date(updates.start);
          if (!isNaN(startDate.getTime())) {
            cleanUpdates.start = startDate;
          } else {
            logger.warn({ userId, invalidStart: updates.start }, 'Skipping invalid start date in update');
          }
        }
        
        // Validate and include end date
        if (updates.end !== undefined && updates.end !== null) {
          const endDate = updates.end instanceof Date ? updates.end : new Date(updates.end);
          if (!isNaN(endDate.getTime())) {
            cleanUpdates.end = endDate;
          } else {
            logger.warn({ userId, invalidEnd: updates.end }, 'Skipping invalid end date in update');
          }
        }
        
        // Include allDay and timeZone only when updating dates
        if (updates.allDay !== undefined && updates.allDay !== null) cleanUpdates.allDay = updates.allDay;
        if (updates.timeZone !== undefined && updates.timeZone !== null) {
          cleanUpdates.timeZone = updates.timeZone;
        } else if (cleanUpdates.start || cleanUpdates.end) {
          // If we have dates but no timezone set, use calendar timezone
          cleanUpdates.timeZone = calendarTimezone;
        }
      }
      
      // Explicitly ensure start/end are NOT in cleanUpdates when not updating dates
      // This is a safety check to prevent any accidental inclusion
      if (!isUpdatingDates) {
        delete cleanUpdates.start;
        delete cleanUpdates.end;
        delete cleanUpdates.allDay;
        delete cleanUpdates.timeZone;
      }
      
      // Final safety check: ensure no date fields are present when not updating dates
      if (!isUpdatingDates) {
        // Double-check that date fields are not accidentally included
        if ('start' in cleanUpdates) {
          logger.warn({ userId }, 'WARNING: start field found in cleanUpdates when isUpdatingDates is false - removing it');
          delete cleanUpdates.start;
        }
        if ('end' in cleanUpdates) {
          logger.warn({ userId }, 'WARNING: end field found in cleanUpdates when isUpdatingDates is false - removing it');
          delete cleanUpdates.end;
        }
        if ('allDay' in cleanUpdates) {
          logger.warn({ userId }, 'WARNING: allDay field found in cleanUpdates when isUpdatingDates is false - removing it');
          delete cleanUpdates.allDay;
        }
        if ('timeZone' in cleanUpdates) {
          logger.warn({ userId }, 'WARNING: timeZone field found in cleanUpdates when isUpdatingDates is false - removing it');
          delete cleanUpdates.timeZone;
        }
      }
      
      // Final verification: Create a completely clean object with only allowed fields
      // This ensures no accidental date fields slip through
      const finalUpdates: any = {
        calendarId: cleanUpdates.calendarId,
        eventId: cleanUpdates.eventId,
      };
      
      // Only include non-date fields
      if (cleanUpdates.title !== undefined) finalUpdates.title = cleanUpdates.title;
      if (cleanUpdates.description !== undefined) finalUpdates.description = cleanUpdates.description;
      if (cleanUpdates.location !== undefined) finalUpdates.location = cleanUpdates.location;
      if (cleanUpdates.attendees !== undefined) finalUpdates.attendees = cleanUpdates.attendees;
      
      // Add Google Meet flag if requested
      if (shouldCreateGoogleMeet) {
        finalUpdates.createGoogleMeet = true;
        logger.info(
          {
            userId,
            eventId: targetEvent.id,
            reason: 'google_meet_requested',
            locationRemoved: updates.location === '',
          },
          'Adding createGoogleMeet flag to update request'
        );
      }
      
      // Only include date fields if we're updating dates
      if (isUpdatingDates) {
        if (cleanUpdates.start !== undefined) finalUpdates.start = cleanUpdates.start;
        if (cleanUpdates.end !== undefined) finalUpdates.end = cleanUpdates.end;
        if (cleanUpdates.allDay !== undefined) finalUpdates.allDay = cleanUpdates.allDay;
        if (cleanUpdates.timeZone !== undefined) finalUpdates.timeZone = cleanUpdates.timeZone;
      }
      
      // Log the update parameters for debugging
      logger.info(
        {
          userId,
          isUpdatingDates,
          finalUpdatesKeys: Object.keys(finalUpdates),
          finalUpdates: {
            ...finalUpdates,
            start: finalUpdates.start?.toISOString?.() || finalUpdates.start,
            end: finalUpdates.end?.toISOString?.() || finalUpdates.end,
          },
          originalEvent: {
            start: targetEvent.start,
            end: targetEvent.end,
          },
          hasStart: 'start' in finalUpdates,
          hasEnd: 'end' in finalUpdates,
          hasAllDay: 'allDay' in finalUpdates,
          hasTimeZone: 'timeZone' in finalUpdates,
        },
        'Preparing event update parameters (final verified)'
      );
      
      // Final check: if not updating dates, verify no date fields exist
      if (!isUpdatingDates) {
        const dateFields = ['start', 'end', 'allDay', 'timeZone'];
        const foundDateFields = dateFields.filter(field => field in finalUpdates);
        if (foundDateFields.length > 0) {
          logger.error(
            {
              userId,
              foundDateFields,
              finalUpdatesKeys: Object.keys(finalUpdates),
            },
            'CRITICAL ERROR: Date fields found in finalUpdates when isUpdatingDates is false!'
          );
          // Remove any date fields that shouldn't be there
          foundDateFields.forEach(field => delete finalUpdates[field]);
        }
      }
      
      // CRITICAL: Only check for conflicts when dates/time are being updated
      // When updating only location, title, description, or attendees (without changing date/time),
      // automatically allow overlap - don't show conflict message
      const bypassConflictCheck = (intent as any).bypassConflictCheck === true;
      
      // Only check conflicts if:
      // 1. Dates are being updated (isUpdatingDates is true)
      // 2. Start and end dates are in the update
      // 3. Conflict check is not explicitly bypassed
      if (isUpdatingDates && finalUpdates.start && finalUpdates.end && !bypassConflictCheck) {
        logger.info(
          {
            userId,
            isUpdatingDates,
            hasStart: !!finalUpdates.start,
            hasEnd: !!finalUpdates.end,
            bypassConflictCheck,
          },
          'Checking for event conflicts (dates are being updated)'
        );
        
        // Exclude the event being updated from conflict check
        const conflicts = await this.checkEventConflicts(
          userId,
          calendarConnection,
          finalUpdates.start,
          finalUpdates.end
        );
        
        // Filter out the event being updated itself
        const otherConflicts = conflicts.filter(c => c.id !== targetEvent.id);
        
        if (otherConflicts.length > 0) {
          // Format conflict message with meeting titles in bold
          const conflictDetails = otherConflicts.map((conflict, index) => {
            const conflictDate = new Date(conflict.start);
            const conflictTime = conflictDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: calendarTimezone,
            });
            const conflictDateStr = conflictDate.toLocaleDateString('en-US', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              timeZone: calendarTimezone,
            });
            return `*${conflict.title || 'Untitled Event'}* on ${conflictDateStr} at ${conflictTime}`;
          }).join('\n');
          
          const conflictMessage = otherConflicts.length === 1
            ? `Ahh, you are double booked. You already have *${otherConflicts[0].title || 'a meeting'}* at that time. Should we leave it as is? Or would you like to change the date or time. Let us know and we will adjust where needed.`
            : `Ahh, you are double booked. You already have ${otherConflicts.length} meetings at that time:\n\n${conflictDetails}\n\nShould we leave it as is? Or would you like to change the date or time. Let us know and we will adjust where needed.`;
          
          // Return special response asking for confirmation
          return {
            success: false,
            action: 'UPDATE',
            requiresConfirmation: true,
            conflictEvents: otherConflicts,
            message: conflictMessage,
          };
        }
      } else {
        // Not updating dates - skip conflict check and allow auto-overlap
        logger.info(
          {
            userId,
            isUpdatingDates,
            hasStart: !!finalUpdates.start,
            hasEnd: !!finalUpdates.end,
            bypassConflictCheck,
            reason: 'not_updating_dates_or_bypassed',
          },
          'Skipping conflict check - not updating dates/time, allowing auto-overlap'
        );
      }
      
      const updatedEvent = await this.withTokenRefresh(
        calendarConnection.id,
        calendarConnection.accessToken!,
        calendarConnection.refreshToken || null,
        provider,
        (token) => provider.updateEvent(token, finalUpdates)
      );

      const event: CalendarEvent = {
        id: updatedEvent.id,
        title: updatedEvent.title,
        description: updatedEvent.description,
        start: updatedEvent.start,
        end: updatedEvent.end,
        location: updatedEvent.location,
        provider: calendarConnection.provider as 'google' | 'microsoft',
        htmlLink: updatedEvent.htmlLink,
        webLink: updatedEvent.webLink,
      };

      // Add conferenceUrl and attendees if available
      if (updatedEvent.conferenceUrl) {
        (event as any).conferenceUrl = updatedEvent.conferenceUrl;
      }
      if (updatedEvent.attendees && updatedEvent.attendees.length > 0) {
        (event as any).attendees = updatedEvent.attendees;
      }

      logger.info({ userId, eventId: event.id }, 'Calendar event updated');

      return {
        success: true,
        action: 'UPDATE',
        event,
        message: `Event "${event.title}" updated successfully`,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update calendar event');
      throw error;
    }
  }

  /**
   * Delete calendar event
   */
  async delete(userId: string, intent: CalendarIntent): Promise<CalendarOperationResult> {
    try {
      logger.info({ userId }, 'Deleting calendar event');

      const calendarConnection = await getPrimaryCalendar(this.db, userId);

      if (!calendarConnection) {
        throw new Error('No calendar connected');
      }

      // Search for the event to delete
      const targetEvents = await this.findTargetEvent(
        userId,
        calendarConnection.provider as 'google' | 'microsoft',
        calendarConnection.accessToken!,
        calendarConnection.calendarId || 'primary',
        intent
      );

      if (targetEvents.length === 0) {
        throw new Error('Event not found. Please provide more details about which event to delete.');
      }

      // If multiple events found, try to select the most relevant one
      let targetEvent: CalendarEvent;
      if (targetEvents.length > 1) {
        logger.warn(
          {
            userId,
            eventCount: targetEvents.length,
            eventTitles: targetEvents.map(e => e.title),
            intentTitle: intent.targetEventTitle || intent.title,
          },
          'Multiple events found, selecting most relevant one'
        );
        
        // For deletes, prefer the most recent upcoming event (or closest to now if all are past)
        const now = new Date();
        const upcomingEvents = targetEvents.filter(e => new Date(e.start) >= now);
        
        if (upcomingEvents.length > 0) {
          // Select the earliest upcoming event
          targetEvent = upcomingEvents.sort((a, b) => 
            new Date(a.start).getTime() - new Date(b.start).getTime()
          )[0]!;
        } else {
          // All events are in the past, select the most recent one
          targetEvent = targetEvents.sort((a, b) => 
            new Date(b.start).getTime() - new Date(a.start).getTime()
          )[0]!;
        }
        
        logger.info(
          {
            userId,
            selectedEventId: targetEvent.id,
            selectedEventTitle: targetEvent.title,
            selectedEventDate: targetEvent.start,
            totalMatches: targetEvents.length,
          },
          'Selected event from multiple matches'
        );
      } else {
        targetEvent = targetEvents[0]!;
      }

      // Fetch full event details before deleting (for response message)
      const provider = createCalendarProvider(calendarConnection.provider);
      let fullEventDetails: any = null;
      try {
        fullEventDetails = await this.withTokenRefresh(
          calendarConnection.id,
          calendarConnection.accessToken!,
          calendarConnection.refreshToken || null,
          provider,
          (token) => provider.getEvent(token, {
            calendarId: calendarConnection.calendarId || 'primary',
            eventId: targetEvent.id,
          })
        );
      } catch (error) {
        logger.warn({ error, userId, eventId: targetEvent.id }, 'Failed to fetch full event details before delete, using basic event info');
      }

      // Delete the event
      await this.withTokenRefresh(
        calendarConnection.id,
        calendarConnection.accessToken!,
        calendarConnection.refreshToken || null,
        provider,
        (token) => provider.deleteEvent(token, {
          calendarId: calendarConnection.calendarId || 'primary',
          eventId: targetEvent.id,
        })
      );

      // Use full event details if available, otherwise use targetEvent
      const eventToReturn = fullEventDetails || targetEvent;
      const event: CalendarEvent = {
        id: eventToReturn.id,
        title: eventToReturn.title,
        description: eventToReturn.description,
        start: eventToReturn.start,
        end: eventToReturn.end,
        location: eventToReturn.location,
        provider: calendarConnection.provider as 'google' | 'microsoft',
        htmlLink: eventToReturn.htmlLink,
        webLink: eventToReturn.webLink,
      };

      // Add conferenceUrl and attendees if available
      if (eventToReturn.conferenceUrl) {
        (event as any).conferenceUrl = eventToReturn.conferenceUrl;
      }
      if (eventToReturn.attendees && eventToReturn.attendees.length > 0) {
        (event as any).attendees = eventToReturn.attendees;
      }

      logger.info({ userId, eventId: event.id }, 'Calendar event deleted');

      return {
        success: true,
        action: 'DELETE',
        event,
        message: `⛔ Event "${event.title}" deleted successfully`,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to delete calendar event');
      throw error;
    }
  }

  /**
   * Query/search calendar events
   */
  async query(userId: string, intent: CalendarIntent): Promise<CalendarOperationResult> {
    try {
      logger.info({ userId }, 'Querying calendar events');

      const calendarConnection = await getPrimaryCalendar(this.db, userId);

      if (!calendarConnection) {
        throw new Error('No calendar connected');
      }

      const provider = createCalendarProvider(calendarConnection.provider);

      // Build search parameters
      const searchParams: any = {
        calendarId: calendarConnection.calendarId || 'primary',
        maxResults: 50, // Increased for better coverage
      };

      // Add query text if available
      if (intent.title || intent.targetEventTitle) {
        searchParams.query = intent.title || intent.targetEventTitle;
      }

      // Handle time range based on queryTimeframe or startDate
      const now = new Date();
      let timeMin: Date | undefined;
      let timeMax: Date | undefined;

      // Check for queryTimeframe first (preferred method)
      if ('queryTimeframe' in intent && intent.queryTimeframe) {
        switch (intent.queryTimeframe) {
          case 'today':
            timeMin = new Date(now);
            timeMin.setHours(0, 0, 0, 0);
            timeMax = new Date(now);
            timeMax.setHours(23, 59, 59, 999);
            break;
          case 'tomorrow':
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            timeMin = new Date(tomorrow);
            timeMin.setHours(0, 0, 0, 0);
            timeMax = new Date(tomorrow);
            timeMax.setHours(23, 59, 59, 999);
            break;
          case 'this_week':
            // Week starts on Monday and ends on Sunday
            timeMin = startOfWeek(now, { weekStartsOn: 1 }); // Monday
            timeMax = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
            break;
          case 'this_month':
            // Start of current month
            timeMin = new Date(now.getFullYear(), now.getMonth(), 1);
            timeMin.setHours(0, 0, 0, 0);
            // End of current month
            timeMax = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            timeMax.setHours(23, 59, 59, 999);
            break;
          case 'all':
            // "Show all meetings" = upcoming events only (exclude past)
            timeMin = new Date(now);
            timeMin.setHours(0, 0, 0, 0);
            timeMax = new Date(now);
            timeMax.setDate(timeMax.getDate() + 30);
            timeMax.setHours(23, 59, 59, 999);
            break;
        }
      } else if (intent.startDate || intent.targetEventDate) {
        // Fallback to parsing startDate if queryTimeframe not provided
        const dateString = intent.startDate || intent.targetEventDate!;
        
        // Parse YYYY-MM-DD format correctly (avoid timezone issues)
        const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
          const year = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1; // JavaScript months are 0-indexed
          const day = parseInt(dateMatch[3], 10);
          
          // Create date in UTC to avoid timezone issues
          timeMin = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
          timeMax = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
          
          logger.info(
            {
              userId,
              dateString,
              timeMin: timeMin.toISOString(),
              timeMax: timeMax.toISOString(),
            },
            'Parsed specific date for event query'
          );
        } else {
          // Try parsing as regular date string
          const searchDate = new Date(dateString);
          
          // Check if the date string is valid
          if (isNaN(searchDate.getTime())) {
            logger.warn({ userId, dateString }, 'Invalid date string, defaulting to today');
            timeMin = new Date(now);
            timeMin.setHours(0, 0, 0, 0);
            timeMax = new Date(now);
            timeMax.setHours(23, 59, 59, 999);
          } else {
            timeMin = new Date(searchDate);
            timeMin.setHours(0, 0, 0, 0);
            timeMax = new Date(searchDate);
            timeMax.setHours(23, 59, 59, 999);
          }
        }
      } else {
        // No timeframe specified - default to showing upcoming events (next 30 days)
        timeMin = new Date(now);
        timeMin.setHours(0, 0, 0, 0);
        timeMax = new Date(now);
        timeMax.setDate(timeMax.getDate() + 30);
        timeMax.setHours(23, 59, 59, 999);
      }

      if (timeMin) {
        searchParams.timeMin = timeMin;
      }
      if (timeMax) {
        searchParams.timeMax = timeMax;
      }

      logger.info(
        {
          userId,
          queryTimeframe: intent.queryTimeframe,
          startDate: intent.startDate,
          targetEventDate: intent.targetEventDate,
          timeMin: timeMin?.toISOString(),
          timeMax: timeMax?.toISOString(),
          searchParams: {
            ...searchParams,
            timeMin: searchParams.timeMin?.toISOString(),
            timeMax: searchParams.timeMax?.toISOString(),
          },
        },
        'Calendar query parameters'
      );

      const foundEvents = await this.withTokenRefresh(
        calendarConnection.id,
        calendarConnection.accessToken!,
        calendarConnection.refreshToken || null,
        provider,
        (token) => provider.searchEvents(token, searchParams)
      );

      const events: CalendarEvent[] = foundEvents.map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        start: e.start,
        end: e.end,
        location: e.location,
        provider: calendarConnection.provider as 'google' | 'microsoft',
        htmlLink: e.htmlLink,
        webLink: e.webLink,
      }));

      // If we queried for a specific date, filter events to ensure they're on that date
      // (calendar APIs sometimes return events slightly outside the range due to timezone issues)
      let filteredEvents = events;
      if (intent.startDate || intent.targetEventDate) {
        const dateString = intent.startDate || intent.targetEventDate!;
        const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
          const year = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1;
          const day = parseInt(dateMatch[3], 10);
          
          // Check if this is a year-only query (day is 1 and month is 0 (January) and endDate is set to December 31)
          // When user says "this year", we set startDate to January 1st and endDate to December 31st
          const isYearOnlyQuery = intent.endDate && day === 1 && month === 0;
          
          // Check if this is a month-only query (day is 1, which means user asked for entire month)
          // When user says "February" or "february", we set startDate to the 1st of that month
          const isMonthOnlyQuery = !isYearOnlyQuery && day === 1;
          
          let targetDateStart: Date;
          let targetDateEnd: Date;
          
          if (isYearOnlyQuery && intent.endDate) {
            // Filter for entire year
            const endDateMatch = intent.endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (endDateMatch) {
              const endYear = parseInt(endDateMatch[1], 10);
              const endMonth = parseInt(endDateMatch[2], 10) - 1;
              const endDay = parseInt(endDateMatch[3], 10);
              
              targetDateStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)); // January 1st
              targetDateEnd = new Date(Date.UTC(endYear, endMonth, endDay, 23, 59, 59, 999)); // December 31st
              
              logger.info(
                {
                  userId,
                  targetDate: dateString,
                  endDate: intent.endDate,
                  isYearOnlyQuery: true,
                  year,
                  targetDateStart: targetDateStart.toISOString(),
                  targetDateEnd: targetDateEnd.toISOString(),
                },
                'Detected year-only query, filtering for entire year'
              );
            } else {
              // Fallback: if endDate format is invalid, just use startDate logic
              targetDateStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
              targetDateEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
            }
          } else if (isMonthOnlyQuery) {
            // Filter for entire month
            targetDateStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
            // Get last day of the month
            const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getDate();
            targetDateEnd = new Date(Date.UTC(year, month, lastDayOfMonth, 23, 59, 59, 999));
            
            logger.info(
              {
                userId,
                targetDate: dateString,
                isMonthOnlyQuery: true,
                month: month + 1,
                year,
                lastDayOfMonth,
                targetDateStart: targetDateStart.toISOString(),
                targetDateEnd: targetDateEnd.toISOString(),
              },
              'Detected month-only query, filtering for entire month'
            );
          } else {
            // Filter for specific date only
            targetDateStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
            targetDateEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
          }
          
          // Filter events to only include those that fall within the date range
          // Check if the event start date (in UTC) falls within the target date range
          filteredEvents = events.filter(event => {
            const eventStart = new Date(event.start);
            return eventStart >= targetDateStart && eventStart <= targetDateEnd;
          });
          
          logger.info(
            {
              userId,
              targetDate: dateString,
              isYearOnlyQuery,
              isMonthOnlyQuery,
              totalEvents: events.length,
              filteredEvents: filteredEvents.length,
              targetDateStart: targetDateStart.toISOString(),
              targetDateEnd: targetDateEnd.toISOString(),
            },
            isYearOnlyQuery ? 'Filtered events to year range' : (isMonthOnlyQuery ? 'Filtered events to month range' : 'Filtered events to specific date')
          );
        }
      }

      logger.info(
        {
          userId,
          count: filteredEvents.length,
          timeframe: intent.queryTimeframe || 'default',
          hasStartDate: !!(intent.startDate || intent.targetEventDate),
        },
        'Calendar events found'
      );

      return {
        success: true,
        action: 'QUERY',
        events: filteredEvents,
        message: `Found ${filteredEvents.length} event${filteredEvents.length !== 1 ? 's' : ''}`,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to query calendar events');
      throw error;
    }
  }

  /**
   * Get a single event by ID with full details
   */
  async getEvent(userId: string, calendarId: string, eventId: string): Promise<CalendarOperationResult> {
    try {
      logger.info({ userId, calendarId, eventId }, 'Getting event details');

      // Get calendar connection
      const calendarConnection = await getPrimaryCalendar(this.db, userId);
      if (!calendarConnection) {
        throw new Error('No calendar connected');
      }

      if (!calendarConnection.isActive) {
        throw new Error('Calendar connection is inactive');
      }

      const provider = createCalendarProvider(calendarConnection.provider);

      // Get event details from provider
      const event = await provider.getEvent(calendarConnection.accessToken!, {
        calendarId: calendarId || calendarConnection.calendarId || 'primary',
        eventId: eventId,
      });

      const calendarEvent: CalendarEvent = {
        id: event.id,
        title: event.title,
        description: event.description,
        start: event.start,
        end: event.end,
        location: event.location,
        provider: calendarConnection.provider as 'google' | 'microsoft',
        htmlLink: event.htmlLink,
        webLink: event.webLink,
      };

      // Add conference URL and attendees if available
      const result: CalendarOperationResult = {
        success: true,
        action: 'QUERY',
        event: calendarEvent,
        message: 'Event retrieved successfully',
      };

      // Add extended fields if available
      if (event.conferenceUrl) {
        (result.event as any).conferenceUrl = event.conferenceUrl;
      }
      if (event.attendees && event.attendees.length > 0) {
        (result.event as any).attendees = event.attendees;
      }

      return result;
    } catch (error) {
      logger.error({ error, userId, calendarId, eventId }, 'Failed to get event details');
      throw error;
    }
  }

  /**
   * Find target event for UPDATE/DELETE operations
   * When multiple events are found, tries to narrow down by:
   * 1. Using date/time information if available
   * 2. Selecting the most relevant event (upcoming, or most recent)
   * 3. For updates: if new date is provided, prefer events that don't match the new date
   */
  private async findTargetEvent(
    _userId: string,
    provider: 'google' | 'microsoft',
    accessToken: string,
    calendarId: string,
    intent: CalendarIntent
  ): Promise<CalendarEvent[]> {
    const calendarProvider = createCalendarProvider(provider);

    const searchParams: any = {
      calendarId,
      maxResults: 20, // Increased to get more results for better filtering
    };

    // Use targetEventTitle or regular title as search query
    if (intent.targetEventTitle || intent.title) {
      searchParams.query = intent.targetEventTitle || intent.title;
    }

    // For UPDATE operations, we want to search more broadly first
    // Then filter based on the new date/time provided
    const now = new Date();
    // Increase search window to 365 days (past and future) to find events from any time
    // This ensures we can find events like "aaaa" from November even if it's now January
    const searchWindowDays = 365;
    
    // Set a wider time range to find all matching events
    const timeMin = new Date(now);
    timeMin.setDate(timeMin.getDate() - searchWindowDays);
    timeMin.setHours(0, 0, 0, 0);
    
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + searchWindowDays);
    timeMax.setHours(23, 59, 59, 999);
    
    searchParams.timeMin = timeMin;
    searchParams.timeMax = timeMax;

    const foundEvents = await calendarProvider.searchEvents(accessToken, searchParams);

    let events: CalendarEvent[] = foundEvents.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      start: e.start,
      end: e.end,
      location: e.location,
      provider: provider as 'google' | 'microsoft',
      htmlLink: e.htmlLink,
      webLink: e.webLink,
    }));

    // If we have a specific target date, try to narrow down
    if (intent.targetEventDate) {
      const targetDate = new Date(intent.targetEventDate);
      targetDate.setHours(0, 0, 0, 0);
      const targetDateEnd = new Date(targetDate);
      targetDateEnd.setHours(23, 59, 59, 999);
      
      // Filter events that match the target date
      const dateMatched = events.filter(e => {
        const eventDate = new Date(e.start);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= targetDate && eventDate <= targetDateEnd;
      });
      
      if (dateMatched.length > 0) {
        events = dateMatched;
      }
    }

    // For UPDATE operations with a new date/time, prefer events that DON'T match the new date
    // (since we're rescheduling FROM the old date TO the new date)
    if (intent.action === 'UPDATE' && intent.startDate) {
      const newDate = new Date(intent.startDate);
      newDate.setHours(0, 0, 0, 0);
      const newDateEnd = new Date(newDate);
      newDateEnd.setHours(23, 59, 59, 999);
      
      // Filter out events that already match the new date
      const notMatchingNewDate = events.filter(e => {
        const eventDate = new Date(e.start);
        eventDate.setHours(0, 0, 0, 0);
        return !(eventDate >= newDate && eventDate <= newDateEnd);
      });
      
      // If we still have events after filtering, use those
      // Otherwise, use all events (maybe user wants to update an event that's already on that date)
      if (notMatchingNewDate.length > 0) {
        events = notMatchingNewDate;
      }
    }

    // Sort events: upcoming events first, then by date
    events.sort((a, b) => {
      const aDate = new Date(a.start);
      const bDate = new Date(b.start);
      const now = new Date();
      
      // If both are in the past or both are in the future, sort by date
      if ((aDate < now && bDate < now) || (aDate >= now && bDate >= now)) {
        return aDate.getTime() - bDate.getTime();
      }
      
      // Prefer upcoming events over past events
      if (aDate >= now && bDate < now) return -1;
      if (aDate < now && bDate >= now) return 1;
      
      return 0;
    });

    return events;
  }

  /**
   * Parse start date and time into Date object
   * Creates a Date that represents the UTC time which, when displayed in the calendar's timezone,
   * equals the desired local time.
   * 
   * Google Calendar API expects:
   * - dateTime: UTC time in ISO 8601 format
   * - timeZone: IANA timezone identifier
   * 
   * The dateTime should be the UTC equivalent of the desired local time.
   * Example: User wants 14:00 in America/Los_Angeles (UTC-8 in winter)
   * - 14:00 PST = 22:00 UTC (same day)
   * - Send: dateTime: "2025-12-02T22:00:00.000Z", timeZone: "America/Los_Angeles"
   * - Google displays: 22:00 UTC converted to PST = 14:00 ✓
   * 
   * The correct approach: Create a date string representing the local time in the timezone,
   * then find what UTC time that corresponds to.
   */
  private parseDateTime(
    dateString: string,
    timeString?: string,
    isAllDay?: boolean,
    timezone: string = 'Africa/Johannesburg'
  ): Date {
    // Parse the date string (YYYY-MM-DD format)
    const dateParts = dateString.split('-');
    if (dateParts.length !== 3) {
      logger.error({ dateString, timezone }, 'Invalid date format in parseDateTime');
      throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD`);
    }
    
    const year = parseInt(dateParts[0] || '0', 10);
    const month = parseInt(dateParts[1] || '0', 10);
    const day = parseInt(dateParts[2] || '0', 10);
    
    // Validate parsed values
    if (isNaN(year) || isNaN(month) || isNaN(day) || year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
      logger.error({ dateString, year, month, day, timezone }, 'Invalid date values in parseDateTime');
      throw new Error(`Invalid date values: year=${year}, month=${month}, day=${day}`);
    }
    
    logger.info(
      {
        dateString,
        parsedYear: year,
        parsedMonth: month,
        parsedDay: day,
        timeString,
        timezone,
      },
      'Parsing date/time in parseDateTime'
    );
    
    if (isAllDay || !timeString) {
      // For all-day events, use UTC midnight
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    // Parse time string (HH:MM format) - this is local time in the calendar's timezone
    const timeParts = timeString.split(':');
    const localHours = parseInt(timeParts[0] || '0', 10);
    const localMinutes = parseInt(timeParts[1] || '0', 10);
    
    if (isNaN(localHours) || isNaN(localMinutes) || localHours < 0 || localHours > 23 || localMinutes < 0 || localMinutes > 59) {
      logger.error({ timeString, localHours, localMinutes, timezone }, 'Invalid time values in parseDateTime');
      throw new Error(`Invalid time values: hours=${localHours}, minutes=${localMinutes}`);
    }

    // Simplified approach: Use a more direct method to find the UTC time
    // We'll create a date representing the local time in the timezone, then find its UTC equivalent
    // 
    // Strategy: Create a date string that represents the local time, then use Intl to convert it
    // We'll use the fact that we can construct a date and check what UTC time it represents
    
    // Create a date string in ISO format: YYYY-MM-DDTHH:mm:00
    // This represents the desired local time
    const localDateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}:00`;
    
    // Now we need to find what UTC time corresponds to this local time in the given timezone
    // We'll use an iterative approach: try different UTC times until we find one that displays correctly
    
    // Start with a reasonable guess: assume timezone offset is between -12 and +14 hours
    // Calculate approximate offset (this is just a starting point)
    const now = new Date();
    const utcTime = now.getTime();
    const localTime = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);
    
    // Get the timezone offset in minutes (approximate, for initial guess)
    // We'll use a more reliable method: binary search or iterative refinement
    
    // Start with the local time as if it were UTC (this will be wrong, but gives us a starting point)
    let candidateUTC = new Date(Date.UTC(year, month - 1, day, localHours, localMinutes, 0, 0));
    
    // Create formatters for checking
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    // Iteratively refine the UTC time until it displays correctly in the timezone
    const maxIterations = 10;
    for (let i = 0; i < maxIterations; i++) {
      // Check what the candidate displays as
      const displayedTime = timeFormatter.format(candidateUTC);
      const displayedDate = dateFormatter.format(candidateUTC);
      const [displayedHour, displayedMinute] = displayedTime.split(':').map(Number);
      
      // Check if date matches
      const displayedDateParts = displayedDate.split('/');
      const displayedMonth = parseInt(displayedDateParts[0] || '0', 10);
      const displayedDay = parseInt(displayedDateParts[1] || '0', 10);
      const displayedYear = parseInt(displayedDateParts[2] || '0', 10);
      
      // If date doesn't match, adjust
      if (displayedYear !== year || displayedMonth !== month || displayedDay !== day) {
        const dateDiff = (year * 365 + month * 30 + day) - (displayedYear * 365 + displayedMonth * 30 + displayedDay);
        candidateUTC = new Date(candidateUTC.getTime() + dateDiff * 24 * 60 * 60 * 1000);
        continue;
      }
      
      // If time matches, we're done
      if (displayedHour === localHours && displayedMinute === localMinutes) {
        break;
      }
      
      // Calculate the difference in minutes
      const desiredMinutes = localHours * 60 + localMinutes;
      const displayedMinutes = displayedHour * 60 + displayedMinute;
      let diffMinutes = desiredMinutes - displayedMinutes;
      
      // Handle wraparound (if difference is more than 12 hours, we might need to adjust by a day)
      if (Math.abs(diffMinutes) > 12 * 60) {
        if (diffMinutes > 12 * 60) {
          diffMinutes -= 24 * 60; // Go back a day
        } else {
          diffMinutes += 24 * 60; // Go forward a day
        }
      }
      
      // Adjust the candidate by the difference
      candidateUTC = new Date(candidateUTC.getTime() + diffMinutes * 60 * 1000);
    }
    
    // Final verification
    const finalDisplayedTime = timeFormatter.format(candidateUTC);
    const finalDisplayedDate = dateFormatter.format(candidateUTC);
    const [finalHour, finalMinute] = finalDisplayedTime.split(':').map(Number);
    const finalDateParts = finalDisplayedDate.split('/');
    const finalMonth = parseInt(finalDateParts[0] || '0', 10);
    const finalDay = parseInt(finalDateParts[1] || '0', 10);
    const finalYear = parseInt(finalDateParts[2] || '0', 10);
    
    logger.info(
      {
        timezone,
        inputDate: dateString,
        inputTime: timeString,
        desiredLocalTime: `${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`,
        desiredDate: `${year}-${month}-${day}`,
        finalUTC: candidateUTC.toISOString(),
        finalUTCTime: `${String(candidateUTC.getUTCHours()).padStart(2, '0')}:${String(candidateUTC.getUTCMinutes()).padStart(2, '0')}`,
        verificationTime: `${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`,
        verificationDate: `${finalYear}-${finalMonth}-${finalDay}`,
        timeCorrect: finalHour === localHours && finalMinute === localMinutes,
        dateCorrect: finalYear === year && finalMonth === month && finalDay === day,
      },
      'Timezone conversion for date parsing'
    );
    
    return candidateUTC;
  }

  /**
   * Parse end date and time, with fallbacks
   */
  private parseEndDateTime(
    startDate: Date,
    endDateString?: string,
    endTimeString?: string,
    duration?: number,
    isAllDay?: boolean,
    timezone?: string
  ): Date {
    // If all-day event, end is next day at midnight
    if (isAllDay) {
      const end = new Date(startDate);
      end.setDate(end.getDate() + 1);
      end.setHours(0, 0, 0, 0);
      return end;
    }

    // If end date provided, use it (with optional end time)
    if (endDateString) {
      return this.parseDateTime(endDateString, endTimeString, false, timezone || 'Africa/Johannesburg');
    }

    // If end time provided (but no end date), use same date as start with the end time
    // CRITICAL: Must use timezone-aware parsing to match the start time's timezone
    if (endTimeString) {
      if (timezone) {
        // Extract the date from startDate in the target timezone
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const dateParts = dateFormatter.formatToParts(startDate);
        const year = parseInt(dateParts.find(p => p.type === 'year')?.value || '0', 10);
        const month = parseInt(dateParts.find(p => p.type === 'month')?.value || '0', 10);
        const day = parseInt(dateParts.find(p => p.type === 'day')?.value || '0', 10);
        
        // Parse the end time
        const [hours, minutes] = endTimeString.split(':').map(Number);
        if (!isNaN(hours) && !isNaN(minutes) && year > 0 && month > 0 && day > 0) {
          // Use parseDateTime to ensure timezone-aware parsing
          const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const end = this.parseDateTime(dateString, endTimeString, false, timezone);
          logger.info(
            {
              startDate: startDate.toISOString(),
              endTimeString,
              timezone,
              dateString,
              parsedEnd: end.toISOString(),
              parsedEndLocal: end.toLocaleString('en-US', { timeZone: timezone }),
            },
            'Parsed end time on same date as start (timezone-aware)'
          );
          return end;
        }
      } else {
        // Fallback: use direct time setting (not timezone-aware, but better than nothing)
        const end = new Date(startDate);
        const [hours, minutes] = endTimeString.split(':').map(Number);
        if (!isNaN(hours) && !isNaN(minutes)) {
          end.setHours(hours, minutes, 0, 0);
          logger.info(
            {
              startDate: startDate.toISOString(),
              endTimeString,
              parsedEnd: end.toISOString(),
              warning: 'No timezone provided, using direct time setting',
            },
            'Parsed end time on same date as start (no timezone)'
          );
          return end;
        }
      }
    }

    // If duration provided, add to start time
    if (duration !== undefined && duration !== null) {
      const end = new Date(startDate);
      end.setMinutes(end.getMinutes() + duration);
      return end;
    }

    // Default: 1 hour after start (only if no time was provided)
    const end = new Date(startDate);
    end.setHours(end.getHours() + 1);
    return end;
  }

  async getRecentEvents(
    userId: string,
    options: { days?: number; limit?: number } = {}
  ): Promise<CalendarEvent[]> {
    const days = options.days ?? 7;
    const limit = options.limit ?? 25;

    try {
      const calendarConnection = await getPrimaryCalendar(this.db, userId);

      if (!calendarConnection || !calendarConnection.isActive || !calendarConnection.accessToken) {
        logger.warn({ userId }, 'No active calendar connection for recent events');
        return [];
      }

      const provider = createCalendarProvider(calendarConnection.provider);

      const now = new Date();
      const timeMin = new Date(now);
      timeMin.setDate(timeMin.getDate() - days);
      const timeMax = new Date(now);
      timeMax.setDate(timeMax.getDate() + days);

      const events = await this.withTokenRefresh(
        calendarConnection.id,
        calendarConnection.accessToken,
        calendarConnection.refreshToken || null,
        provider,
        (token) =>
          provider.searchEvents(token, {
            calendarId: calendarConnection.calendarId || 'primary',
            timeMin,
            timeMax,
            maxResults: limit,
          })
      );

      return events.map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        start: event.start,
        end: event.end,
        location: event.location,
        provider: calendarConnection.provider as 'google' | 'microsoft',
        htmlLink: event.htmlLink,
        webLink: event.webLink,
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch recent events');
      return [];
    }
  }

  async getContacts(userId: string): Promise<Array<{ name: string; email: string; source: 'google' | 'microsoft' }>> {
    try {
      // Get user's primary calendar connection
      const connection = await getPrimaryCalendar(this.db, userId);

      if (!connection || !connection.isActive) {
        logger.warn({ userId }, 'No active calendar connection found');
        return [];
      }

      if (!connection.accessToken) {
        logger.warn({ userId, provider: connection.provider }, 'No access token found');
        return [];
      }

      // Create provider instance
      const provider = createCalendarProvider(connection.provider);

      // Fetch contacts from the provider with token refresh
      const contacts = await this.withTokenRefresh(
        connection.id,
        connection.accessToken,
        connection.refreshToken || null,
        provider,
        (token) => provider.getContacts(token)
      );

      // Filter only google/microsoft and map to include source
      if (connection.provider === 'google' || connection.provider === 'microsoft') {
        return contacts.map(contact => ({
          ...contact,
          source: connection.provider,
        }));
      }

      // For apple/caldav, return empty for now
      logger.warn({ provider: connection.provider }, 'Contacts not supported for this provider');
      return [];
    } catch (error: any) {
      logger.error({
        error: error.message || String(error),
        errorName: error.name,
        errorStack: error.stack,
        userId
      }, 'Failed to fetch contacts');
      return [];
    }
  }

  /**
   * Check for conflicting events in the given time range
   * Returns array of conflicting events
   */
  private async checkEventConflicts(
    userId: string,
    calendarConnection: any,
    startDateTime: Date,
    endDateTime: Date
  ): Promise<CalendarEvent[]> {
    try {
      const provider = createCalendarProvider(calendarConnection.provider);
      
      // Query events in the time range (with some buffer to catch overlapping events)
      const bufferMinutes = 5; // Small buffer to catch events that start/end close to our event
      const timeMin = new Date(startDateTime);
      timeMin.setMinutes(timeMin.getMinutes() - bufferMinutes);
      
      const timeMax = new Date(endDateTime);
      timeMax.setMinutes(timeMax.getMinutes() + bufferMinutes);
      
      const searchParams: any = {
        calendarId: calendarConnection.calendarId || 'primary',
        timeMin: timeMin,
        timeMax: timeMax,
        maxResults: 50,
      };
      
      const foundEvents = await this.withTokenRefresh(
        calendarConnection.id,
        calendarConnection.accessToken!,
        calendarConnection.refreshToken || null,
        provider,
        (token) => provider.searchEvents(token, searchParams)
      );
      
      // Check for overlapping events
      // Two events overlap if: (start1 < end2) && (start2 < end1)
      const conflicts: CalendarEvent[] = [];
      
      for (const event of foundEvents) {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        
        // Check if events overlap (excluding exact boundaries for same-time events)
        const overlaps = 
          (startDateTime < eventEnd) && 
          (eventStart < endDateTime);
        
        if (overlaps) {
          conflicts.push({
            id: event.id,
            title: event.title,
            description: event.description,
            start: eventStart,
            end: eventEnd,
            location: event.location,
            provider: calendarConnection.provider as 'google' | 'microsoft',
            htmlLink: event.htmlLink,
            webLink: event.webLink,
          });
        }
      }
      
      logger.info(
        {
          userId,
          startDateTime: startDateTime.toISOString(),
          endDateTime: endDateTime.toISOString(),
          conflictsFound: conflicts.length,
          conflictTitles: conflicts.map(c => c.title),
        },
        'Checked for event conflicts'
      );
      
      return conflicts;
    } catch (error) {
      logger.error(
        { error, userId, startDateTime: startDateTime.toISOString(), endDateTime: endDateTime.toISOString() },
        'Failed to check for event conflicts'
      );
      // On error, don't block event creation - just log and continue
      return [];
    }
  }
}
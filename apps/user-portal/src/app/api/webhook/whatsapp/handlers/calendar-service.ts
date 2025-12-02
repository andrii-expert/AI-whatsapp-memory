// Calendar service - wraps calendar providers with user's stored connections and handles all calendar operations
// Copied from voice-worker for use in text message handling

import type { Database } from '@imaginecalendar/database/client';
import { getPrimaryCalendar, updateCalendarTokens, getUserPreferences } from '@imaginecalendar/database/queries';
import { createCalendarProvider } from '@imaginecalendar/calendar-integrations/factory';
import type { Contact, CalendarProvider } from '@imaginecalendar/calendar-integrations/types';
import type { ICalendarService, CalendarIntent } from '@imaginecalendar/ai-services';
import { logger } from '@imaginecalendar/logger';

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

    logger.info({ userId, action }, 'Executing calendar operation');

    switch (action) {
      case 'CREATE':
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
          'Failed to get calendar timezone from provider, falling back to preferences'
        );
      }
    }
    
    // Fallback to user preferences
    try {
      const preferences = await getUserPreferences(this.db, userId);
      if (preferences?.timezone) {
        logger.info(
          {
            userId,
            timezone: preferences.timezone,
            source: 'user_preferences',
          },
          'Using timezone from user preferences'
        );
        return preferences.timezone;
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get user timezone from preferences');
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

      // Get user's primary calendar connection
      const calendarConnection = await getPrimaryCalendar(this.db, userId);

      if (!calendarConnection) {
        throw new Error('No calendar connected. Please connect a calendar first.');
      }

      if (!calendarConnection.isActive) {
        throw new Error('Calendar connection is inactive. Please reconnect your calendar.');
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
        intent.isAllDay
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
      };
      
      logger.info(
        {
          userId,
          createParams: {
            ...createParams,
            start: createParams.start.toISOString(),
            end: createParams.end.toISOString(),
          },
        },
        'Calendar createEvent parameters'
      );
      
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

      logger.info({ userId, eventId: event.id }, 'Calendar event created');

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

      const calendarConnection = await getPrimaryCalendar(this.db, userId);

      if (!calendarConnection) {
        throw new Error('No calendar connected');
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

      const updates: any = {
        calendarId: calendarConnection.calendarId || 'primary',
        eventId: targetEvent.id,
      };

      // Update fields that are provided
      if (intent.title) updates.title = intent.title;
      if (intent.description) updates.description = intent.description;
      if (intent.location) updates.location = intent.location;
      if (intent.attendees) updates.attendees = intent.attendees;

      // Get calendar's timezone (from calendar, not user preferences)
      const calendarTimezone = await this.getUserTimezone(userId, calendarConnection);
      logger.info({ userId, timezone: calendarTimezone, source: 'calendar' }, 'Using calendar timezone for event update');
      
      // Update dates if provided
      if (intent.startDate) {
        updates.start = this.parseDateTime(intent.startDate, intent.startTime, intent.isAllDay, calendarTimezone);
      }

      if (intent.endDate || intent.endTime || intent.duration) {
        const startDate = updates.start || targetEvent.start;
        updates.end = this.parseEndDateTime(
          startDate,
          intent.endDate,
          intent.endTime,
          intent.duration,
          intent.isAllDay
        );
      }
      
      // Add timezone to updates if dates are being changed
      if (updates.start || updates.end) {
        updates.timeZone = calendarTimezone;
      }
      
      const updatedEvent = await this.withTokenRefresh(
        calendarConnection.id,
        calendarConnection.accessToken!,
        calendarConnection.refreshToken || null,
        provider,
        (token) => provider.updateEvent(token, updates)
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

      // Delete the event
      const provider = createCalendarProvider(calendarConnection.provider);
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

      logger.info({ userId, eventId: targetEvent.id }, 'Calendar event deleted');

      return {
        success: true,
        action: 'DELETE',
        event: targetEvent,
        message: `Event "${targetEvent.title}" deleted successfully`,
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
            // Start of current week (Sunday)
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            timeMin = new Date(weekStart);
            timeMin.setHours(0, 0, 0, 0);
            // End of current week (Saturday)
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            timeMax = new Date(weekEnd);
            timeMax.setHours(23, 59, 59, 999);
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
            // No time range - get all events
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
          
          // Create date boundaries in UTC for the specific date
          const targetDateStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
          const targetDateEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
          
          // Filter events to only include those that fall on the target date
          // Check if the event start date (in UTC) falls within the target date
          filteredEvents = events.filter(event => {
            const eventStart = new Date(event.start);
            return eventStart >= targetDateStart && eventStart <= targetDateEnd;
          });
          
          logger.info(
            {
              userId,
              targetDate: dateString,
              totalEvents: events.length,
              filteredEvents: filteredEvents.length,
              targetDateStart: targetDateStart.toISOString(),
              targetDateEnd: targetDateEnd.toISOString(),
            },
            'Filtered events to specific date'
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
    const searchWindowDays = 60; // Search within 60 days (past and future)
    
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
    const [year, month, day] = dateString.split('-').map(Number);
    
    if (isAllDay || !timeString) {
      // For all-day events, use UTC midnight
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    // Parse time string (HH:MM format) - this is local time in the calendar's timezone
    const timeParts = timeString.split(':');
    const localHours = parseInt(timeParts[0] || '0', 10);
    const localMinutes = parseInt(timeParts[1] || '0', 10);

    // The correct approach: We need to find the UTC time that, when converted to the target timezone,
    // displays as the desired local time.
    // 
    // Method: Create a date string in ISO format with the local time, then use Intl to find
    // what UTC time that corresponds to. We'll use an iterative approach.
    
    // Start with a reasonable guess: assume the timezone offset is between -12 and +14 hours
    // We'll create a date representing the local time and then find the UTC equivalent
    
    // Create a date string in the format that represents local time in the timezone
    // We'll use a trick: create multiple candidate UTC times and check which one displays correctly
    
    // Strategy: Use the fact that we can check what a UTC time displays as in a timezone
    // We want: UTC_time such that when displayed in timezone, it shows as localHours:localMinutes
    
    // Start with the local time as UTC (initial guess)
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
    
    // Check what the candidate displays as
    let displayedTime = timeFormatter.format(candidateUTC);
    let displayedDate = dateFormatter.format(candidateUTC);
    let [displayedHour, displayedMinute] = displayedTime.split(':').map(Number);
    
    // Calculate the difference
    const desiredMinutes = localHours * 60 + localMinutes;
    let displayedMinutes = displayedHour * 60 + displayedMinute;
    let diffMinutes = desiredMinutes - displayedMinutes;
    
    // Handle day rollover - if the difference is more than 12 hours, we might be on the wrong day
    if (Math.abs(diffMinutes) > 12 * 60) {
      // Try adjusting by a day
      if (diffMinutes > 12 * 60) {
        candidateUTC = new Date(candidateUTC.getTime() - 24 * 60 * 60 * 1000);
        displayedTime = timeFormatter.format(candidateUTC);
        [displayedHour, displayedMinute] = displayedTime.split(':').map(Number);
        displayedMinutes = displayedHour * 60 + displayedMinute;
        diffMinutes = desiredMinutes - displayedMinutes;
      } else if (diffMinutes < -12 * 60) {
        candidateUTC = new Date(candidateUTC.getTime() + 24 * 60 * 60 * 1000);
        displayedTime = timeFormatter.format(candidateUTC);
        [displayedHour, displayedMinute] = displayedTime.split(':').map(Number);
        displayedMinutes = displayedHour * 60 + displayedMinute;
        diffMinutes = desiredMinutes - displayedMinutes;
      }
    }
    
    // Adjust the candidate by the difference
    // If displayed time is ahead of desired time, we need to go back in UTC
    // If displayed time is behind desired time, we need to go forward in UTC
    // diffMinutes = desired - displayed
    // If diffMinutes is negative (displayed > desired), we need to subtract from UTC
    // If diffMinutes is positive (displayed < desired), we need to add to UTC
    candidateUTC = new Date(candidateUTC.getTime() + diffMinutes * 60 * 1000);
    
    // Verify the result
    displayedTime = timeFormatter.format(candidateUTC);
    [displayedHour, displayedMinute] = displayedTime.split(':').map(Number);
    
    // If still not correct, do one more iteration
    if (displayedHour !== localHours || displayedMinute !== localMinutes) {
      displayedMinutes = displayedHour * 60 + displayedMinute;
      diffMinutes = desiredMinutes - displayedMinutes;
      
      // Handle day rollover again
      if (Math.abs(diffMinutes) > 12 * 60) {
        if (diffMinutes > 12 * 60) {
          candidateUTC = new Date(candidateUTC.getTime() - 24 * 60 * 60 * 1000);
        } else {
          candidateUTC = new Date(candidateUTC.getTime() + 24 * 60 * 60 * 1000);
        }
        displayedTime = timeFormatter.format(candidateUTC);
        [displayedHour, displayedMinute] = displayedTime.split(':').map(Number);
        displayedMinutes = displayedHour * 60 + displayedMinute;
        diffMinutes = desiredMinutes - displayedMinutes;
      }
      
      candidateUTC = new Date(candidateUTC.getTime() + diffMinutes * 60 * 1000);
      
      // Final verification
      displayedTime = timeFormatter.format(candidateUTC);
      [displayedHour, displayedMinute] = displayedTime.split(':').map(Number);
    }
    
    logger.info(
      {
        timezone,
        inputDate: dateString,
        inputTime: timeString,
        desiredLocalTime: `${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`,
        finalUTC: candidateUTC.toISOString(),
        finalUTCTime: `${String(candidateUTC.getUTCHours()).padStart(2, '0')}:${String(candidateUTC.getUTCMinutes()).padStart(2, '0')}`,
        verification: `${String(displayedHour).padStart(2, '0')}:${String(displayedMinute).padStart(2, '0')}`,
        verificationDate: dateFormatter.format(candidateUTC),
        correct: displayedHour === localHours && displayedMinute === localMinutes,
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
    isAllDay?: boolean
  ): Date {
    // If all-day event, end is next day at midnight
    if (isAllDay) {
      const end = new Date(startDate);
      end.setDate(end.getDate() + 1);
      end.setHours(0, 0, 0, 0);
      return end;
    }

    // If end date/time provided, use it
    if (endDateString) {
      return this.parseDateTime(endDateString, endTimeString);
    }

    // If duration provided, add to start time
    if (duration !== undefined && duration !== null) {
      const end = new Date(startDate);
      end.setMinutes(end.getMinutes() + duration);
      return end;
    }

    // Default: 1 hour after start
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
}


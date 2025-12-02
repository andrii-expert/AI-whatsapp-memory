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
   * Get user's timezone from preferences
   */
  private async getUserTimezone(userId: string): Promise<string> {
    try {
      const preferences = await getUserPreferences(this.db, userId);
      return preferences?.timezone || 'Africa/Johannesburg';
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get user timezone, using default');
      return 'Africa/Johannesburg';
    }
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

      // Get user's timezone
      const userTimezone = await this.getUserTimezone(userId);
      logger.info({ userId, timezone: userTimezone }, 'Using user timezone for event creation');

      // Validate intent has required fields
      if (!intent.title) {
        throw new Error('Event title is required');
      }

      if (!intent.startDate) {
        throw new Error('Event start date is required');
      }

      // Parse dates with user's timezone
      const startDateTime = this.parseDateTime(
        intent.startDate,
        intent.startTime || undefined,
        intent.isAllDay || false,
        userTimezone
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
          timezone: userTimezone,
          intentDate: intent.startDate,
          intentTime: intent.startTime,
          parsedStartISO: startDateTime.toISOString(),
          parsedStartLocal: startDateTime.toLocaleString('en-US', { timeZone: userTimezone }),
          parsedEndISO: endDateTime.toISOString(),
        },
        'Parsed event date/time'
      );

      // Create event via provider with token refresh
      const provider = createCalendarProvider(calendarConnection.provider);
      
      // Log the exact values being sent to the calendar provider
      logger.info(
        {
          userId,
          timezone: userTimezone,
          startDateTimeISO: startDateTime.toISOString(),
          startDateTimeLocal: startDateTime.toLocaleString('en-US', { timeZone: userTimezone }),
          endDateTimeISO: endDateTime.toISOString(),
          intentTime: intent.startTime,
          intentDate: intent.startDate,
        },
        'Sending event to calendar provider'
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
        timeZone: userTimezone, // Use user's actual timezone
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

      // Get user's timezone
      const userTimezone = await this.getUserTimezone(userId);
      
      // Update dates if provided
      if (intent.startDate) {
        updates.start = this.parseDateTime(intent.startDate, intent.startTime, intent.isAllDay, userTimezone);
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
        updates.timeZone = userTimezone;
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
        const searchDate = new Date(intent.startDate || intent.targetEventDate!);
        
        // Check if the date string looks like "today" or "tomorrow" (shouldn't happen but handle gracefully)
        if (isNaN(searchDate.getTime())) {
          logger.warn({ userId, dateString: intent.startDate || intent.targetEventDate }, 'Invalid date string, defaulting to today');
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

      logger.info({ userId, count: events.length, timeframe: intent.queryTimeframe || 'default' }, 'Calendar events found');

      return {
        success: true,
        action: 'QUERY',
        events,
        message: `Found ${events.length} event${events.length !== 1 ? 's' : ''}`,
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
   * Creates a Date that represents the local time in the user's timezone
   * The calendar provider will use the timeZone parameter to interpret it correctly
   */
  private parseDateTime(
    dateString: string,
    timeString?: string,
    isAllDay?: boolean,
    timezone: string = 'Africa/Johannesburg'
  ): Date {
    // Parse the date string (YYYY-MM-DD format)
    const date = new Date(dateString + 'T00:00:00Z'); // Parse as UTC to avoid timezone issues
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();

    if (isAllDay || !timeString) {
      // For all-day events, create date at midnight UTC
      // The calendar provider will interpret this correctly with the timeZone parameter
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    }

    // Parse time string (HH:MM format) - this is local time in the user's timezone
    const timeParts = timeString.split(':');
    const localHours = parseInt(timeParts[0] || '0', 10);
    const localMinutes = parseInt(timeParts[1] || '0', 10);

    // Google Calendar API expects:
    // - dateTime: ISO 8601 string in UTC (from toISOString())
    // - timeZone: IANA timezone identifier
    // 
    // The dateTime represents the UTC time that, when displayed in the specified timeZone,
    // equals the desired local time.
    //
    // Example: User wants 2 PM (14:00) in Africa/Johannesburg (UTC+2)
    // - Local time: 14:00
    // - UTC time needed: 14:00 - 2 hours = 12:00 UTC
    // - Send: dateTime: "2025-12-01T12:00:00.000Z", timeZone: "Africa/Johannesburg"
    // - Google displays: 12:00 UTC + 2 hours = 14:00 local ✓
    
    // The most reliable way: Create a date string with the local time and timezone offset,
    // then let JavaScript convert it to UTC automatically
    // Format: YYYY-MM-DDTHH:mm:ss+HH:mm or YYYY-MM-DDTHH:mm:ss-HH:mm
    
    // First, get the timezone offset for this specific date (accounts for DST)
    const tempDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    const offsetHours = this.getTimezoneOffset(timezone, tempDate);
    
    // Format the offset as +HH:mm or -HH:mm
    const offsetSign = offsetHours >= 0 ? '+' : '-';
    const offsetAbs = Math.abs(offsetHours);
    const offsetHoursInt = Math.floor(offsetAbs);
    const offsetMinutesInt = Math.round((offsetAbs - offsetHoursInt) * 60);
    const offsetStr = `${offsetSign}${String(offsetHoursInt).padStart(2, '0')}:${String(offsetMinutesInt).padStart(2, '0')}`;
    
    // Create the date string with timezone offset
    // JavaScript will automatically convert this to UTC when we create the Date object
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}:00${offsetStr}`;
    
    // Create the Date object - JavaScript will convert the timezone-aware string to UTC
    const utcDate = new Date(dateStr);
    
    logger.info(
      {
        timezone,
        localTime: `${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`,
        offsetHours: offsetHours.toFixed(2),
        offsetStr,
        dateStr,
        utcDateISO: utcDate.toISOString(),
        utcTimeFormatted: `${String(utcDate.getUTCHours()).padStart(2, '0')}:${String(utcDate.getUTCMinutes()).padStart(2, '0')}`,
        expectedLocalTime: utcDate.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }),
      },
      'Timezone conversion for date parsing'
    );
    
    return utcDate;
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


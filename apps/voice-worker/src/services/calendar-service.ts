// Calendar service - wraps calendar providers with user's stored connections and handles all calendar operations

import type { Database } from '@imaginecalendar/database/client';
import { getPrimaryCalendar, updateCalendarTokens } from '@imaginecalendar/database/queries';
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

      // Log token status for debugging
      logger.info({
        connectionId: calendarConnection.id,
        provider: calendarConnection.provider,
        hasAccessToken: !!calendarConnection.accessToken,
        hasRefreshToken: !!calendarConnection.refreshToken,
        expiresAt: calendarConnection.expiresAt,
        isExpired: calendarConnection.expiresAt ? new Date(calendarConnection.expiresAt) < new Date() : 'unknown',
      }, 'Calendar connection token status');

      if (!calendarConnection.isActive) {
        throw new Error('Calendar connection is inactive. Please reconnect your calendar.');
      }

      // Validate intent has required fields
      if (!intent.title) {
        throw new Error('Event title is required');
      }

      if (!intent.startDate) {
        throw new Error('Event start date is required');
      }

      // Parse dates
      const startDateTime = this.parseDateTime(
        intent.startDate,
        intent.startTime || undefined,
        intent.isAllDay || false
      );

      const endDateTime = this.parseEndDateTime(
        startDateTime,
        intent.endDate,
        intent.endTime,
        intent.duration,
        intent.isAllDay
      );

      // Create event via provider with token refresh
      const provider = createCalendarProvider(calendarConnection.provider);
      const createdEvent = await this.withTokenRefresh(
        calendarConnection.id,
        calendarConnection.accessToken!,
        calendarConnection.refreshToken || null,
        provider,
        (token) => provider.createEvent(token, {
          calendarId: calendarConnection.calendarId || 'primary',
          title: intent.title!,
          description: intent.description,
          start: startDateTime,
          end: endDateTime,
          allDay: intent.isAllDay ?? false,
          location: intent.location,
          attendees: intent.attendees,
        })
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

      if (targetEvents.length > 1) {
        throw new Error('Multiple events found. Please be more specific about which event to update.');
      }

      const targetEvent = targetEvents[0]!;

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

      // Update dates if provided
      if (intent.startDate) {
        updates.start = this.parseDateTime(intent.startDate, intent.startTime, intent.isAllDay);
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

      if (targetEvents.length > 1) {
        throw new Error('Multiple events found. Please be more specific about which event to delete.');
      }

      const targetEvent = targetEvents[0]!;

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
        maxResults: 10,
      };

      // Add query text if available
      if (intent.title || intent.targetEventTitle) {
        searchParams.query = intent.title || intent.targetEventTitle;
      }

      // Add time range if provided
      if (intent.startDate || intent.targetEventDate) {
        const searchDate = new Date(intent.startDate || intent.targetEventDate!);
        searchParams.timeMin = new Date(searchDate.setHours(0, 0, 0, 0));
        searchParams.timeMax = new Date(searchDate.setHours(23, 59, 59, 999));
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

      logger.info({ userId, count: events.length }, 'Calendar events found');

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

  /**
   * Find target event for UPDATE/DELETE operations
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
      maxResults: 5,
    };

    // Use targetEventTitle or regular title as search query
    if (intent.targetEventTitle || intent.title) {
      searchParams.query = intent.targetEventTitle || intent.title;
    }

    // Add time range if target date provided
    if (intent.targetEventDate || intent.startDate) {
      const searchDate = new Date(intent.targetEventDate || intent.startDate!);
      searchParams.timeMin = new Date(searchDate.setHours(0, 0, 0, 0));
      searchParams.timeMax = new Date(searchDate.setHours(23, 59, 59, 999));
    }

    const foundEvents = await calendarProvider.searchEvents(accessToken, searchParams);

    return foundEvents.map(e => ({
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
  }

  /**
   * Parse start date and time into Date object (GMT+2 / Africa/Johannesburg timezone)
   */
  private parseDateTime(
    dateString: string,
    timeString?: string,
    isAllDay?: boolean
  ): Date {
    // Parse the date string and create a Date object in GMT+2
    const date = new Date(dateString);

    if (isAllDay || !timeString) {
      // For all-day events, set to midnight GMT+2
      // Create date string in GMT+2 format
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return new Date(`${year}-${month}-${day}T00:00:00+02:00`);
    }

    // Parse time string (HH:MM format)
    const timeParts = timeString.split(':');
    const hours = parseInt(timeParts[0] || '0', 10);
    const minutes = parseInt(timeParts[1] || '0', 10);

    // Create date string in GMT+2 format
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hourStr = String(hours).padStart(2, '0');
    const minuteStr = String(minutes).padStart(2, '0');

    return new Date(`${year}-${month}-${day}T${hourStr}:${minuteStr}:00+02:00`);
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

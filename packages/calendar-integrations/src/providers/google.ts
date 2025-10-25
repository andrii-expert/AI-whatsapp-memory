import { google } from "googleapis";
import type {
  CalendarProvider,
  OAuthTokens,
  Calendar,
  ConnectionTestResult,
  UserInfo,
  Contact,
  CreateEventParams,
  UpdateEventParams,
  DeleteEventParams,
  SearchEventsParams,
  CreatedEvent
} from "../types";
import {
  oauthTokensSchema,
  calendarSchema,
  googleCalendarListSchema,
  googleCalendarDetailSchema,
  connectionTestResultSchema
} from "../types";
import { GOOGLE_OAUTH_CONFIG } from "../oauth";

export class GoogleCalendarProvider implements CalendarProvider {
  private oauth2Client: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      GOOGLE_OAUTH_CONFIG.clientId,
      GOOGLE_OAUTH_CONFIG.clientSecret,
      GOOGLE_OAUTH_CONFIG.redirectUri
    );
  }

  getAuthUrl(redirectUri: string, state?: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // Force refresh token
      scope: GOOGLE_OAUTH_CONFIG.scopes,
      redirect_uri: redirectUri,
      state,
    });
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens> {
    try {
      const { tokens } = await this.oauth2Client.getToken({
        code,
        redirect_uri: redirectUri,
      });

      if (!tokens.access_token) {
        throw new Error("No access token received from Google");
      }

      const expiresAt = new Date();
      if (tokens.expiry_date) {
        expiresAt.setTime(tokens.expiry_date);
      } else {
        // Default to 1 hour if no expiry provided
        expiresAt.setHours(expiresAt.getHours() + 1);
      }

      const tokenData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt,
        scope: tokens.scope,
      };

      return oauthTokensSchema.parse(tokenData);
    } catch (error) {
      throw new Error(`Google OAuth token exchange failed: ${error}`);
    }
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      if (!userInfo.data.email || !userInfo.data.id) {
        throw new Error("Required user information not available from Google");
      }

      return {
        email: userInfo.data.email,
        name: userInfo.data.name || undefined,
        id: userInfo.data.id,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch Google user info: ${error.message}`);
    }
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("No access token received from Google refresh");
      }

      const expiresAt = new Date();
      if (credentials.expiry_date) {
        expiresAt.setTime(credentials.expiry_date);
      } else {
        expiresAt.setHours(expiresAt.getHours() + 1);
      }

      const tokenData = {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || refreshToken, // Keep original if new one not provided
        expiresAt,
        scope: credentials.scope,
      };

      return oauthTokensSchema.parse(tokenData);
    } catch (error: any) {
      // Extract more detailed error information
      const errorMessage = error.message || String(error);
      const errorCode = error.code || error.response?.data?.error;
      
      // Common Google OAuth error codes:
      // - invalid_grant: refresh token expired/revoked
      // - invalid_client: OAuth client credentials issue
      // - unauthorized_client: App not authorized
      
      if (errorCode === 'invalid_grant' || errorMessage.includes('invalid_grant')) {
        throw new Error('Refresh token expired or revoked. User must reconnect their calendar.');
      }
      
      throw new Error(`Google token refresh failed: ${errorMessage} (code: ${errorCode || 'unknown'})`);
    }
  }

  async getCalendars(accessToken: string): Promise<Calendar[]> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });
      const response = await calendar.calendarList.list();

      // Validate the response using Zod
      const validatedResponse = googleCalendarListSchema.parse(response.data);
      
      if (!validatedResponse.items) {
        return [];
      }

      // Transform and validate each calendar
      const calendars = validatedResponse.items.map((item) => {
        const calendarData = {
          id: item.id || "",
          name: item.summary || "Unnamed Calendar",
          description: item.description,
          primary: item.primary || false,
          canEdit: item.accessRole === "writer" || item.accessRole === "owner",
          timeZone: item.timeZone,
          color: item.backgroundColor || item.colorId,
        };

        return calendarSchema.parse(calendarData);
      });

      return calendars;
    } catch (error) {
      throw new Error(`Failed to fetch Google calendars: ${error}`);
    }
  }

  async getCalendarById(accessToken: string, calendarId: string): Promise<Calendar> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });
      const response = await calendar.calendars.get({
        calendarId,
      });

      // Validate the response using Zod
      const validatedResponse = googleCalendarDetailSchema.parse(response.data);
      
      const calendarData = {
        id: validatedResponse.id || "",
        name: validatedResponse.summary || "Unnamed Calendar",
        description: validatedResponse.description,
        timeZone: validatedResponse.timeZone,
        canEdit: true, // If we can fetch it, we likely have edit access
      };

      return calendarSchema.parse(calendarData);
    } catch (error) {
      throw new Error(`Failed to fetch Google calendar ${calendarId}: ${error}`);
    }
  }

  async testConnection(accessToken: string): Promise<ConnectionTestResult> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });
      
      // Simple test: fetch the primary calendar
      await calendar.calendars.get({
        calendarId: "primary",
      });

      const result = {
        success: true,
        message: "Google Calendar connection is working",
      };

      return connectionTestResultSchema.parse(result);
    } catch (error: any) {
      const result = {
        success: false,
        message: `Google Calendar connection failed: ${error.message}`,
      };

      return connectionTestResultSchema.parse(result);
    }
  }

  async createEvent(accessToken: string, params: CreateEventParams): Promise<CreatedEvent> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });

      // Format attendees for Google Calendar API
      const attendees = params.attendees?.map((email: string) => ({ email }));

      // Build event object
      const event: any = {
        summary: params.title,
        description: params.description,
        location: params.location,
        attendees,
      };

      // Handle all-day vs timed events
      if (params.allDay) {
        event.start = {
          date: params.start.toISOString().split('T')[0], // YYYY-MM-DD
          timeZone: params.timeZone || 'UTC',
        };
        event.end = {
          date: params.end.toISOString().split('T')[0],
          timeZone: params.timeZone || 'UTC',
        };
      } else {
        event.start = {
          dateTime: params.start.toISOString(),
          timeZone: params.timeZone || 'UTC',
        };
        event.end = {
          dateTime: params.end.toISOString(),
          timeZone: params.timeZone || 'UTC',
        };
      }

      const response = await calendar.events.insert({
        calendarId: params.calendarId,
        requestBody: event,
        sendUpdates: 'all', // Send email notifications to attendees
      });

      if (!response.data.id || !response.data.summary) {
        throw new Error('Invalid response from Google Calendar API');
      }

      return {
        id: response.data.id,
        title: response.data.summary,
        description: response.data.description || undefined,
        start: params.start,
        end: params.end,
        location: response.data.location || undefined,
        attendees: response.data.attendees?.map(a => a.email || '') || undefined,
        htmlLink: response.data.htmlLink || undefined,
      };
    } catch (error: any) {
      // Preserve error code/status for auth error detection
      const apiError = new Error(`Failed to create Google Calendar event: ${error.message}`);
      (apiError as any).code = error.code;
      (apiError as any).status = error.response?.status || error.status;
      (apiError as any).statusCode = error.response?.status || error.status;
      throw apiError;
    }
  }

  async updateEvent(accessToken: string, params: UpdateEventParams): Promise<CreatedEvent> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });

      // Fetch existing event first
      const existing = await calendar.events.get({
        calendarId: params.calendarId,
        eventId: params.eventId,
      });

      if (!existing.data) {
        throw new Error(`Event ${params.eventId} not found`);
      }

      // Build update object with only changed fields
      const updates: any = {};

      if (params.title !== undefined) updates.summary = params.title;
      if (params.description !== undefined) updates.description = params.description;
      if (params.location !== undefined) updates.location = params.location;

      if (params.attendees !== undefined) {
        updates.attendees = params.attendees.map((email: string) => ({ email }));
      }

      // Update date/time if provided
      if (params.start || params.end) {
        const startDate = params.start || new Date(existing.data.start?.dateTime || existing.data.start?.date || '');
        const endDate = params.end || new Date(existing.data.end?.dateTime || existing.data.end?.date || '');

        if (params.allDay) {
          updates.start = {
            date: startDate.toISOString().split('T')[0],
            timeZone: params.timeZone || existing.data.start?.timeZone || 'UTC',
          };
          updates.end = {
            date: endDate.toISOString().split('T')[0],
            timeZone: params.timeZone || existing.data.end?.timeZone || 'UTC',
          };
        } else {
          updates.start = {
            dateTime: startDate.toISOString(),
            timeZone: params.timeZone || existing.data.start?.timeZone || 'UTC',
          };
          updates.end = {
            dateTime: endDate.toISOString(),
            timeZone: params.timeZone || existing.data.end?.timeZone || 'UTC',
          };
        }
      }

      const response = await calendar.events.patch({
        calendarId: params.calendarId,
        eventId: params.eventId,
        requestBody: updates,
        sendUpdates: 'all', // Notify attendees of changes
      });

      if (!response.data.id || !response.data.summary) {
        throw new Error('Invalid response from Google Calendar API');
      }

      return {
        id: response.data.id,
        title: response.data.summary,
        description: response.data.description || undefined,
        start: new Date(response.data.start?.dateTime || response.data.start?.date || ''),
        end: new Date(response.data.end?.dateTime || response.data.end?.date || ''),
        location: response.data.location || undefined,
        attendees: response.data.attendees?.map(a => a.email || '') || undefined,
        htmlLink: response.data.htmlLink || undefined,
      };
    } catch (error: any) {
      throw new Error(`Failed to update Google Calendar event: ${error.message}`);
    }
  }

  async deleteEvent(accessToken: string, params: DeleteEventParams): Promise<void> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });

      await calendar.events.delete({
        calendarId: params.calendarId,
        eventId: params.eventId,
        sendUpdates: 'all', // Notify attendees of cancellation
      });
    } catch (error: any) {
      throw new Error(`Failed to delete Google Calendar event: ${error.message}`);
    }
  }

  async searchEvents(accessToken: string, params: SearchEventsParams): Promise<CreatedEvent[]> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });

      const response = await calendar.events.list({
        calendarId: params.calendarId,
        q: params.query, // Free text search
        timeMin: params.timeMin?.toISOString(),
        timeMax: params.timeMax?.toISOString(),
        maxResults: params.maxResults || 10,
        singleEvents: true, // Expand recurring events
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      return events.map(event => ({
        id: event.id || '',
        title: event.summary || 'Untitled Event',
        description: event.description || undefined,
        start: new Date(event.start?.dateTime || event.start?.date || ''),
        end: new Date(event.end?.dateTime || event.end?.date || ''),
        location: event.location || undefined,
        attendees: event.attendees?.map(a => a.email || '') || undefined,
        htmlLink: event.htmlLink || undefined,
      }));
    } catch (error: any) {
      throw new Error(`Failed to search Google Calendar events: ${error.message}`);
    }
  }

  async getContacts(accessToken: string): Promise<Contact[]> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const people = google.people({ version: "v1", auth: this.oauth2Client });

      // Fetch contacts with email addresses
      const response = await people.people.connections.list({
        resourceName: "people/me",
        pageSize: 1000, // Max contacts to fetch
        personFields: "names,emailAddresses",
      });

      const connections = response.data.connections || [];
      const contacts: Contact[] = [];

      for (const person of connections) {
        const name = person.names?.[0]?.displayName;
        const email = person.emailAddresses?.[0]?.value;

        if (name && email) {
          contacts.push({ name, email });
        }
      }

      return contacts;
    } catch (error) {
      throw new Error(`Failed to fetch Google contacts: ${error}`);
    }
  }
}
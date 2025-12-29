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

      let conferenceUrl: string | undefined;

      // If Google Meet was requested, add conference via patch
      if (params.createGoogleMeet) {
        try {
          // Generate unique request ID
          const requestId = `meet-${response.data.id}-${Date.now()}`;

          await calendar.events.patch({
            calendarId: params.calendarId,
            eventId: response.data.id,
            requestBody: {
              conferenceData: {
                createRequest: {
                  requestId: requestId,
                  conferenceSolutionKey: {
                    type: "hangoutsMeet"
                  }
                }
              }
            },
            conferenceDataVersion: 1,
            sendUpdates: 'all',
          });

          // Wait for conference creation and fetch the URL
          await new Promise(resolve => setTimeout(resolve, 5000));

          const eventDetails = await calendar.events.get({
            calendarId: params.calendarId,
            eventId: response.data.id,
            conferenceDataVersion: 1,
            fields: 'id,summary,description,start,end,location,attendees,htmlLink,conferenceData',
          });

          if (eventDetails.data.conferenceData?.entryPoints && Array.isArray(eventDetails.data.conferenceData.entryPoints)) {
            // Look for video conference entry point (Google Meet)
            const meetEntryPoint = eventDetails.data.conferenceData.entryPoints.find(
              (entry: any) => entry.entryPointType === 'video' || entry.entryPointType === 'hangoutsMeet'
            );
            if (meetEntryPoint?.uri && typeof meetEntryPoint.uri === 'string' && meetEntryPoint.uri.trim()) {
              conferenceUrl = meetEntryPoint.uri.trim();
            } else {
              // Fallback: check all entry points for any URI that looks like a Meet link
              for (const entryPoint of eventDetails.data.conferenceData.entryPoints) {
                if (entryPoint.uri && typeof entryPoint.uri === 'string' && entryPoint.uri.includes('meet.google.com') && entryPoint.uri.trim()) {
                  conferenceUrl = entryPoint.uri.trim();
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.warn('Failed to create Google Meet conference:', error);
          // Try alternative approach - check if conference was created anyway
          try {
            const eventDetails = await calendar.events.get({
              calendarId: params.calendarId,
              eventId: response.data.id,
              conferenceDataVersion: 1,
            });

            if (eventDetails.data.conferenceData?.entryPoints && Array.isArray(eventDetails.data.conferenceData.entryPoints)) {
              // Look for video conference entry point (Google Meet)
              const meetEntryPoint = eventDetails.data.conferenceData.entryPoints.find(
                (entry: any) => entry.entryPointType === 'video' || entry.entryPointType === 'hangoutsMeet'
              );
              if (meetEntryPoint?.uri && typeof meetEntryPoint.uri === 'string' && meetEntryPoint.uri.trim()) {
                conferenceUrl = meetEntryPoint.uri.trim();
              } else {
                // Fallback: check all entry points for any URI that looks like a Meet link
                for (const entryPoint of eventDetails.data.conferenceData.entryPoints) {
                  if (entryPoint.uri && typeof entryPoint.uri === 'string' && entryPoint.uri.includes('meet.google.com') && entryPoint.uri.trim()) {
                    conferenceUrl = entryPoint.uri.trim();
                    break;
                  }
                }
              }
            }
          } catch (retryError) {
            console.warn('Failed to fetch conference data on retry:', retryError);
          }
        }
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
        conferenceUrl,
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

  async getEvent(accessToken: string, params: { calendarId: string; eventId: string }): Promise<CreatedEvent> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });

      const response = await calendar.events.get({
        calendarId: params.calendarId,
        eventId: params.eventId,
        conferenceDataVersion: 1,
        fields: 'id,summary,description,start,end,location,attendees,htmlLink,conferenceData',
      });

      if (!response.data.id || !response.data.summary) {
        throw new Error('Invalid response from Google Calendar API');
      }

      // Extract Google Meet URL from conference data
      let conferenceUrl: string | undefined;
      if (response.data.conferenceData?.entryPoints && Array.isArray(response.data.conferenceData.entryPoints)) {
        // Look for video conference entry point (Google Meet)
        const meetEntryPoint = response.data.conferenceData.entryPoints.find(
          (entry: any) => entry.entryPointType === 'video' || entry.entryPointType === 'hangoutsMeet'
        );
        if (meetEntryPoint?.uri && typeof meetEntryPoint.uri === 'string' && meetEntryPoint.uri.trim()) {
          conferenceUrl = meetEntryPoint.uri.trim();
        } else {
          // Fallback: check all entry points for any URI that looks like a Meet link
          for (const entryPoint of response.data.conferenceData.entryPoints) {
            if (entryPoint.uri && typeof entryPoint.uri === 'string' && entryPoint.uri.includes('meet.google.com') && entryPoint.uri.trim()) {
              conferenceUrl = entryPoint.uri.trim();
              break;
            }
          }
        }
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
        conferenceUrl,
      };
    } catch (error: any) {
      throw new Error(`Failed to get Google Calendar event: ${error.message}`);
    }
  }

  async updateEvent(accessToken: string, params: UpdateEventParams): Promise<CreatedEvent> {
    try {
      // Validate required parameters
      if (!params.calendarId || !params.eventId) {
        throw new Error('Missing required parameters: calendarId and eventId');
      }

      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });

      // Fetch existing event first
      let existing;
      try {
        existing = await calendar.events.get({
          calendarId: params.calendarId,
          eventId: params.eventId,
        });
      } catch (fetchError: any) {
        throw new Error(`Failed to fetch existing event: ${fetchError.message}`);
      }

      if (!existing.data) {
        throw new Error(`Event ${params.eventId} not found`);
      }

      // Build update object with only changed fields
      const updates: any = {};

      if (params.title !== undefined) updates.summary = params.title;
      if (params.description !== undefined) updates.description = params.description;
      if (params.location !== undefined) updates.location = params.location;

      // Handle Google Meet creation/removal
      if (params.createGoogleMeet === true) {
        // Add Google Meet conference
        const requestId = `meet-${params.eventId}-${Date.now()}`;
        updates.conferenceData = {
          createRequest: {
            requestId: requestId,
            conferenceSolutionKey: {
              type: "hangoutsMeet"
            }
          }
        };
      }

      if (params.attendees !== undefined) {
        updates.attendees = params.attendees.map((email: string) => ({ email }));
      }

      // Update date/time if provided
      if (params.start || params.end) {
        // Safely parse existing dates
        const existingStart = existing.data.start?.dateTime || existing.data.start?.date;
        const existingEnd = existing.data.end?.dateTime || existing.data.end?.date;

        const startDate = params.start || (existingStart ? new Date(existingStart) : new Date());
        const endDate = params.end || (existingEnd ? new Date(existingEnd) : new Date());

        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error('Invalid date values provided');
        }

        // Use the existing event's time zone if available, otherwise use the provided timeZone
        const eventTimeZone = existing.data.start?.timeZone || existing.data.end?.timeZone || params.timeZone || 'UTC';

        if (params.allDay) {
          // For all-day events, use date format without time zone
          updates.start = {
            date: startDate.toISOString().split('T')[0],
          };
          updates.end = {
            date: endDate.toISOString().split('T')[0],
          };
        } else {
          // For timed events, use dateTime with time zone
          updates.start = {
            dateTime: startDate.toISOString(),
            timeZone: eventTimeZone,
          };
          updates.end = {
            dateTime: endDate.toISOString(),
            timeZone: eventTimeZone,
          };
        }
      }

      // Only proceed if we have updates to make
      const hasUpdates = Object.keys(updates).length > 0;

      if (!hasUpdates) {
        // No updates needed, return existing event data
        return {
          id: existing.data.id,
          title: existing.data.summary || '',
          description: existing.data.description || undefined,
          start: new Date(existing.data.start?.dateTime || existing.data.start?.date || ''),
          end: new Date(existing.data.end?.dateTime || existing.data.end?.date || ''),
          location: existing.data.location || undefined,
          attendees: existing.data.attendees?.map(a => a.email || '') || undefined,
          htmlLink: existing.data.htmlLink || undefined,
          conferenceUrl: existing.data.conferenceData?.entryPoints?.find(
            (entry: any) => entry.entryPointType === 'video' || entry.entryPointType === 'hangoutsMeet'
          )?.uri || undefined,
        };
      }

      // Validate that we have some updates to make
      if (Object.keys(updates).length === 0) {
        // No updates needed, return existing event data
        return {
          id: existing.data.id,
          title: existing.data.summary || '',
          description: existing.data.description || undefined,
          start: new Date(existing.data.start?.dateTime || existing.data.start?.date || ''),
          end: new Date(existing.data.end?.dateTime || existing.data.end?.date || ''),
          location: existing.data.location || undefined,
          attendees: existing.data.attendees?.map(a => a.email || '') || undefined,
          htmlLink: existing.data.htmlLink || undefined,
          conferenceUrl: existing.data.conferenceData?.entryPoints?.find(
            (entry: any) => entry.entryPointType === 'video' || entry.entryPointType === 'hangoutsMeet'
          )?.uri || undefined,
        };
      }

      let patchOptions: any = {
        calendarId: params.calendarId,
        eventId: params.eventId,
        requestBody: updates,
        sendUpdates: 'all', // Notify attendees of changes
      };

      if (updates.conferenceData) {
        patchOptions.conferenceDataVersion = 1;
      }

      const response = await calendar.events.patch(patchOptions);

      if (!response.data.id || !response.data.summary) {
        throw new Error('Invalid response from Google Calendar API');
      }

      // Extract Google Meet URL from conference data
      let conferenceUrl: string | undefined;
      if (response.data.conferenceData?.entryPoints && Array.isArray(response.data.conferenceData.entryPoints)) {
        // Look for video conference entry point (Google Meet)
        const meetEntryPoint = response.data.conferenceData.entryPoints.find(
          (entry: any) => entry.entryPointType === 'video' || entry.entryPointType === 'hangoutsMeet'
        );
        if (meetEntryPoint?.uri && typeof meetEntryPoint.uri === 'string' && meetEntryPoint.uri.trim()) {
          conferenceUrl = meetEntryPoint.uri.trim();
        } else {
          // Fallback: check all entry points for any URI that looks like a Meet link
          for (const entryPoint of response.data.conferenceData.entryPoints) {
            if (entryPoint.uri && typeof entryPoint.uri === 'string' && entryPoint.uri.includes('meet.google.com') && entryPoint.uri.trim()) {
              conferenceUrl = entryPoint.uri.trim();
              break;
            }
          }
        }
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
        conferenceUrl,
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
        conferenceDataVersion: 1, // Include conference data
        fields: 'items(id,summary,description,start,end,location,attendees,htmlLink,conferenceData),nextPageToken', // Explicitly request conference data
      });

      const events = response.data.items || [];

      return events.map(event => {
        // Extract Google Meet URL from conference data
        let conferenceUrl: string | undefined;
        if (event.conferenceData?.entryPoints && Array.isArray(event.conferenceData.entryPoints)) {
          // Look for video conference entry point (Google Meet)
          const meetEntryPoint = event.conferenceData.entryPoints.find(
            (entry: any) => entry.entryPointType === 'video' || entry.entryPointType === 'hangoutsMeet'
          );
          if (meetEntryPoint?.uri && typeof meetEntryPoint.uri === 'string' && meetEntryPoint.uri.trim()) {
            conferenceUrl = meetEntryPoint.uri.trim();
          } else {
            // Fallback: check all entry points for any URI that looks like a Meet link
            for (const entryPoint of event.conferenceData.entryPoints) {
              if (entryPoint.uri && typeof entryPoint.uri === 'string' && entryPoint.uri.includes('meet.google.com') && entryPoint.uri.trim()) {
                conferenceUrl = entryPoint.uri.trim();
                break;
              }
            }
          }
        }

        return {
          id: event.id || '',
          title: event.summary || 'Untitled Event',
          description: event.description || undefined,
          start: new Date(event.start?.dateTime || event.start?.date || ''),
          end: new Date(event.end?.dateTime || event.end?.date || ''),
          location: event.location || undefined,
          attendees: event.attendees?.map(a => a.email || '') || undefined,
          htmlLink: event.htmlLink || undefined,
          conferenceUrl,
        };
      });
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
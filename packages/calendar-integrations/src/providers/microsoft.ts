import { Client } from "@microsoft/microsoft-graph-client";
import { ConfidentialClientApplication } from "@azure/msal-node";
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
  microsoftCalendarListSchema,
  microsoftCalendarSchema,
  connectionTestResultSchema
} from "../types";
import { MICROSOFT_OAUTH_CONFIG, OAUTH_ENDPOINTS } from "../oauth";

export class MicrosoftCalendarProvider implements CalendarProvider {
  private msalConfig: any;

  constructor() {
    this.msalConfig = {
      auth: {
        clientId: MICROSOFT_OAUTH_CONFIG.clientId,
        clientSecret: MICROSOFT_OAUTH_CONFIG.clientSecret,
        authority: "https://login.microsoftonline.com/common",
      },
    };
  }

  getAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: MICROSOFT_OAUTH_CONFIG.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: MICROSOFT_OAUTH_CONFIG.scopes.join(" "),
      response_mode: "query",
      ...(state && { state }),
    });

    return `${OAUTH_ENDPOINTS.microsoft.auth}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens> {
    try {

      const cca = new ConfidentialClientApplication(this.msalConfig);
      
      const tokenRequest = {
        code,
        scopes: MICROSOFT_OAUTH_CONFIG.scopes,
        redirectUri,
      };

      const response = await cca.acquireTokenByCode(tokenRequest);

      if (!response || !response.accessToken) {
        throw new Error("No access token received from Microsoft");
      }

      const expiresAt = new Date();
      if (response.expiresOn) {
        expiresAt.setTime(response.expiresOn.getTime());
      } else {
        // Default to 1 hour if no expiry provided
        expiresAt.setHours(expiresAt.getHours() + 1);
      }

      const tokenData = {
        accessToken: response.accessToken,
        refreshToken: response.account?.localAccountId || undefined, // MSAL doesn't provide refresh tokens directly
        expiresAt,
        scope: response.scopes?.join(" "),
      };

      return oauthTokensSchema.parse(tokenData);
    } catch (error) {
      throw new Error(`Microsoft OAuth token exchange failed: ${error}`);
    }
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const userInfo = await graphClient
        .api("/me")
        .select("id,mail,userPrincipalName,displayName")
        .get();

      // Microsoft may use either 'mail' or 'userPrincipalName' for email
      const email = userInfo.mail || userInfo.userPrincipalName;

      if (!email || !userInfo.id) {
        throw new Error("Required user information not available from Microsoft");
      }

      return {
        email: email,
        name: userInfo.displayName || undefined,
        id: userInfo.id,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch Microsoft user info: ${error.message}`);
    }
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    try {
      const cca = new ConfidentialClientApplication(this.msalConfig);
      
      const refreshTokenRequest = {
        refreshToken,
        scopes: MICROSOFT_OAUTH_CONFIG.scopes,
      };

      const response = await cca.acquireTokenByRefreshToken(refreshTokenRequest);

      if (!response || !response.accessToken) {
        throw new Error("No access token received from Microsoft refresh");
      }

      const expiresAt = new Date();
      if (response.expiresOn) {
        expiresAt.setTime(response.expiresOn.getTime());
      } else {
        expiresAt.setHours(expiresAt.getHours() + 1);
      }

      const tokenData = {
        accessToken: response.accessToken,
        refreshToken: refreshToken, // Keep original refresh token
        expiresAt,
        scope: response.scopes?.join(" "),
      };

      return oauthTokensSchema.parse(tokenData);
    } catch (error) {
      throw new Error(`Microsoft token refresh failed: ${error}`);
    }
  }

  async getCalendars(accessToken: string): Promise<Calendar[]> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const response = await graphClient
        .api("/me/calendars")
        .select("id,name,isDefaultCalendar,canEdit,color")
        .get();

      if (!response.value) {
        return [];
      }

      // Validate the response using Zod
      const validatedResponse = microsoftCalendarListSchema.parse(response);
      
      if (!validatedResponse.value) {
        return [];
      }

      // Transform and validate each calendar
      const calendars = validatedResponse.value.map((item) => {
        const calendarData = {
          id: item.id || "",
          name: item.name || "Unnamed Calendar",
          description: undefined,
          primary: item.isDefaultCalendar || false,
          canEdit: item.canEdit !== false, // Default to true if not specified
          color: item.color,
        };

        return calendarSchema.parse(calendarData);
      });

      return calendars;
    } catch (error) {
      throw new Error(`Failed to fetch Microsoft calendars: ${error}`);
    }
  }

  async getCalendarById(accessToken: string, calendarId: string): Promise<Calendar> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const response = await graphClient
        .api(`/me/calendars/${calendarId}`)
        .select("id,name,isDefaultCalendar,canEdit,color")
        .get();

      // Validate the response using Zod
      const validatedResponse = microsoftCalendarSchema.parse(response);
      
      const calendarData = {
        id: validatedResponse.id || "",
        name: validatedResponse.name || "Unnamed Calendar",
        description: undefined,
        primary: validatedResponse.isDefaultCalendar || false,
        canEdit: validatedResponse.canEdit !== false,
        color: validatedResponse.color,
      };

      return calendarSchema.parse(calendarData);
    } catch (error) {
      throw new Error(`Failed to fetch Microsoft calendar ${calendarId}: ${error}`);
    }
  }

  async testConnection(accessToken: string): Promise<ConnectionTestResult> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      // Simple test: fetch user info and primary calendar
      await graphClient.api("/me").select("id,mail,displayName").get();
      
      await graphClient
        .api("/me/calendar")
        .select("id,name")
        .get();

      const result = {
        success: true,
        message: "Microsoft Calendar connection is working",
      };

      return connectionTestResultSchema.parse(result);
    } catch (error: any) {
      const result = {
        success: false,
        message: `Microsoft Calendar connection failed: ${error.message}`,
      };

      return connectionTestResultSchema.parse(result);
    }
  }

  async createEvent(accessToken: string, params: CreateEventParams): Promise<CreatedEvent> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      // Format attendees for Microsoft Graph API
      const attendees = params.attendees?.map((email: string) => ({
        emailAddress: { address: email },
        type: "required"
      }));

      // Build event object
      const event: any = {
        subject: params.title,
        body: {
          contentType: "HTML",
          content: params.description || "",
        },
        location: params.location ? {
          displayName: params.location
        } : undefined,
        attendees,
      };

      // Handle all-day vs timed events
      if (params.allDay) {
        event.isAllDay = true;
        event.start = {
          dateTime: params.start.toISOString().split('T')[0], // YYYY-MM-DD
          timeZone: params.timeZone || 'UTC',
        };
        event.end = {
          dateTime: params.end.toISOString().split('T')[0],
          timeZone: params.timeZone || 'UTC',
        };
      } else {
        event.isAllDay = false;
        event.start = {
          dateTime: params.start.toISOString(),
          timeZone: params.timeZone || 'UTC',
        };
        event.end = {
          dateTime: params.end.toISOString(),
          timeZone: params.timeZone || 'UTC',
        };
      }

      const response = await graphClient
        .api(`/me/calendars/${params.calendarId}/events`)
        .post(event);

      if (!response.id || !response.subject) {
        throw new Error('Invalid response from Microsoft Graph API');
      }

      return {
        id: response.id,
        title: response.subject,
        description: response.body?.content || undefined,
        start: params.start,
        end: params.end,
        location: response.location?.displayName || undefined,
        attendees: response.attendees?.map((a: any) => a.emailAddress?.address || '') || undefined,
        webLink: response.webLink || undefined,
      };
    } catch (error: any) {
      throw new Error(`Failed to create Microsoft Calendar event: ${error.message}`);
    }
  }

  async updateEvent(accessToken: string, params: UpdateEventParams): Promise<CreatedEvent> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      // Fetch existing event first
      const existing = await graphClient
        .api(`/me/calendars/${params.calendarId}/events/${params.eventId}`)
        .get();

      if (!existing) {
        throw new Error(`Event ${params.eventId} not found`);
      }

      // Build update object with only changed fields
      const updates: any = {};

      if (params.title !== undefined) updates.subject = params.title;
      if (params.description !== undefined) {
        updates.body = {
          contentType: "HTML",
          content: params.description,
        };
      }
      if (params.location !== undefined) {
        updates.location = {
          displayName: params.location
        };
      }

      if (params.attendees !== undefined) {
        updates.attendees = params.attendees.map((email: string) => ({
          emailAddress: { address: email },
          type: "required"
        }));
      }

      // Update date/time if provided
      if (params.start || params.end) {
        const startDate = params.start || new Date(existing.start?.dateTime || '');
        const endDate = params.end || new Date(existing.end?.dateTime || '');

        if (params.allDay) {
          updates.isAllDay = true;
          updates.start = {
            dateTime: startDate.toISOString().split('T')[0],
            timeZone: params.timeZone || existing.start?.timeZone || 'UTC',
          };
          updates.end = {
            dateTime: endDate.toISOString().split('T')[0],
            timeZone: params.timeZone || existing.end?.timeZone || 'UTC',
          };
        } else {
          updates.isAllDay = false;
          updates.start = {
            dateTime: startDate.toISOString(),
            timeZone: params.timeZone || existing.start?.timeZone || 'UTC',
          };
          updates.end = {
            dateTime: endDate.toISOString(),
            timeZone: params.timeZone || existing.end?.timeZone || 'UTC',
          };
        }
      }

      const response = await graphClient
        .api(`/me/calendars/${params.calendarId}/events/${params.eventId}`)
        .patch(updates);

      if (!response.id || !response.subject) {
        throw new Error('Invalid response from Microsoft Graph API');
      }

      return {
        id: response.id,
        title: response.subject,
        description: response.body?.content || undefined,
        start: new Date(response.start?.dateTime || ''),
        end: new Date(response.end?.dateTime || ''),
        location: response.location?.displayName || undefined,
        attendees: response.attendees?.map((a: any) => a.emailAddress?.address || '') || undefined,
        webLink: response.webLink || undefined,
      };
    } catch (error: any) {
      throw new Error(`Failed to update Microsoft Calendar event: ${error.message}`);
    }
  }

  async deleteEvent(accessToken: string, params: DeleteEventParams): Promise<void> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      await graphClient
        .api(`/me/calendars/${params.calendarId}/events/${params.eventId}`)
        .delete();
    } catch (error: any) {
      throw new Error(`Failed to delete Microsoft Calendar event: ${error.message}`);
    }
  }

  async searchEvents(accessToken: string, params: SearchEventsParams): Promise<CreatedEvent[]> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      let request = graphClient
        .api(`/me/calendars/${params.calendarId}/events`)
        .select("id,subject,body,start,end,location,attendees,webLink")
        .orderby("start/dateTime");

      // Add search query if provided
      if (params.query) {
        request = request.filter(`contains(subject,'${params.query}')`);
      }

      // Add time range if provided
      if (params.timeMin && params.timeMax) {
        const filterParts = [];
        if (params.query) {
          filterParts.push(`contains(subject,'${params.query}')`);
        }
        filterParts.push(`start/dateTime ge '${params.timeMin.toISOString()}'`);
        filterParts.push(`end/dateTime le '${params.timeMax.toISOString()}'`);
        request = request.filter(filterParts.join(' and '));
      }

      // Add limit
      if (params.maxResults) {
        request = request.top(params.maxResults);
      }

      const response = await request.get();
      const events = response.value || [];

      return events.map((event: any) => ({
        id: event.id || '',
        title: event.subject || 'Untitled Event',
        description: event.body?.content || undefined,
        start: new Date(event.start?.dateTime || ''),
        end: new Date(event.end?.dateTime || ''),
        location: event.location?.displayName || undefined,
        attendees: event.attendees?.map((a: any) => a.emailAddress?.address || '') || undefined,
        webLink: event.webLink || undefined,
      }));
    } catch (error: any) {
      throw new Error(`Failed to search Microsoft Calendar events: ${error.message}`);
    }
  }

  async getContacts(accessToken: string): Promise<Contact[]> {
    try {
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      // Fetch contacts from Microsoft Graph
      const response = await graphClient
        .api("/me/contacts")
        .select("displayName,emailAddresses")
        .top(1000) // Max contacts to fetch
        .get();

      const contacts: Contact[] = [];

      for (const contact of response.value || []) {
        const name = contact.displayName;
        const email = contact.emailAddresses?.[0]?.address;

        if (name && email) {
          contacts.push({ name, email });
        }
      }

      return contacts;
    } catch (error) {
      throw new Error(`Failed to fetch Microsoft contacts: ${error}`);
    }
  }
}
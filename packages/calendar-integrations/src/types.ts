import { z } from "zod";

// Zod schemas for validation and type safety
export const oauthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.date(),
  scope: z.string().optional(),
});

export const calendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  primary: z.boolean().optional().default(false),
  canEdit: z.boolean().optional().default(true),
  timeZone: z.string().optional(),
  color: z.string().optional(),
});

export const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  start: z.date(),
  end: z.date(),
  allDay: z.boolean().optional().default(false),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional().default([]),
  calendarId: z.string(),
});

export const connectionTestResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export const calendarProviderTypeSchema = z.enum(["google", "microsoft"]);

export const oauthConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string(),
  scopes: z.array(z.string()),
});

// Google API response schemas
export const googleCalendarItemSchema = z.object({
  id: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  primary: z.boolean().optional(),
  accessRole: z.enum(["owner", "writer", "reader"]).optional(),
  timeZone: z.string().optional(),
  backgroundColor: z.string().optional(),
  colorId: z.string().optional(),
});

export const googleCalendarListSchema = z.object({
  items: z.array(googleCalendarItemSchema).optional(),
});

export const googleCalendarDetailSchema = z.object({
  id: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  timeZone: z.string().optional(),
});

// Microsoft API response schemas
export const microsoftCalendarSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isDefaultCalendar: z.boolean().optional(),
  canEdit: z.boolean().optional(),
  color: z.string().optional(),
});

export const microsoftCalendarListSchema = z.object({
  value: z.array(microsoftCalendarSchema).optional(),
});

// Type exports from schemas
export type OAuthTokens = z.infer<typeof oauthTokensSchema>;
export type Calendar = z.infer<typeof calendarSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type ConnectionTestResult = z.infer<typeof connectionTestResultSchema>;
export type CalendarProviderType = z.infer<typeof calendarProviderTypeSchema>;
export type OAuthConfig = z.infer<typeof oauthConfigSchema>;

// Provider interface with proper types
export interface UserInfo {
  email: string;
  name?: string;
  id: string;
}

export interface Contact {
  name: string;
  email: string;
}

// Event operation parameters
export interface CreateEventParams {
  calendarId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string;
  attendees?: string[]; // Array of email addresses
  timeZone?: string;
}

export interface UpdateEventParams {
  calendarId: string;
  eventId: string;
  title?: string;
  description?: string;
  start?: Date;
  end?: Date;
  allDay?: boolean;
  location?: string;
  attendees?: string[];
  timeZone?: string;
}

export interface DeleteEventParams {
  calendarId: string;
  eventId: string;
}

export interface SearchEventsParams {
  calendarId: string;
  query?: string; // Free text search
  timeMin?: Date; // Start of time range
  timeMax?: Date; // End of time range
  maxResults?: number;
}

export interface CreatedEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: string[];
  htmlLink?: string;
  webLink?: string;
}

export interface CalendarProvider {
  // OAuth methods
  getAuthUrl(redirectUri: string, state?: string): string;
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens>;
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;

  // User methods
  getUserInfo(accessToken: string): Promise<UserInfo>;

  // Calendar methods
  getCalendars(accessToken: string): Promise<Calendar[]>;
  getCalendarById(accessToken: string, calendarId: string): Promise<Calendar>;
  testConnection(accessToken: string): Promise<ConnectionTestResult>;

  // Event methods
  createEvent(accessToken: string, params: CreateEventParams): Promise<CreatedEvent>;
  updateEvent(accessToken: string, params: UpdateEventParams): Promise<CreatedEvent>;
  deleteEvent(accessToken: string, params: DeleteEventParams): Promise<void>;
  searchEvents(accessToken: string, params: SearchEventsParams): Promise<CreatedEvent[]>;

  // Contact methods
  getContacts(accessToken: string): Promise<Contact[]>;
}
// Intent analysis types and Zod schemas
// AI extracts ONLY the raw intent - resolvers handle the rest

import { z } from 'zod';

// Action types based on client requirements
export const intentActionEnum = z.enum(['CREATE', 'UPDATE', 'DELETE', 'QUERY']);
export const calendarIntentSchema = z.object({
  // Primary action: CREATE, UPDATE, DELETE, QUERY
  action: intentActionEnum.describe('The intended action'),

  // Event details (for CREATE)
  title: z.string().optional().describe('Event title/summary'),
  description: z.string().optional().describe('Event description/notes'),

  // Date/Time information (AI extracts, resolvers validate)
  startDate: z.string().optional().describe('Start date in YYYY-MM-DD format'),
  startTime: z.string().optional().describe('Start time in HH:MM format (24-hour)'),
  endDate: z.string().optional().describe('End date for multi-day events'),
  endTime: z.string().optional().describe('End time in HH:MM format (24-hour)'),
  duration: z.number().optional().describe('Duration in minutes if no end time'),

  // Additional details
  location: z.string().optional().describe('Event location (just the text, not resolved)'),
  attendees: z.array(z.string()).optional().describe('Attendee NAMES only (not emails)'),
  isAllDay: z.boolean().optional().describe('Whether it is an all-day event'),

  // For UPDATE/DELETE: identification of existing event
  targetEventTitle: z.string().optional().describe('Title of event to update/delete'),
  targetEventDate: z.string().optional().describe('Date of event to update/delete'),
  targetEventTime: z.string().optional().describe('Time of event to update/delete'),

  // Recurrence
  recurrence: z.object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
    interval: z.number().optional(),
    until: z.string().optional(),
    count: z.number().optional(),
    byDay: z.array(z.string()).optional(),
  }).optional().describe('Recurrence pattern'),

  // Metadata
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),

  // What AI detected as missing (before resolvers run)
  missingFields: z.array(z.enum([
    'title',
    'startDate',
    'startTime',
    'endTime',
    'duration',
    'attendees',
    'location'
  ])).optional().describe('Fields that AI could not extract from the message'),
});

export type CalendarIntent = z.infer<typeof calendarIntentSchema>;
export type IntentAction = z.infer<typeof intentActionEnum>;

export interface IntentContext {
  userId?: string;
  timezone?: string;
  currentDate?: Date;
}

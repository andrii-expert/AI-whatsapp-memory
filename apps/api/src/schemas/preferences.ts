import { z } from "zod";

export const updatePreferencesSchema = z.object({
  notifications: z.object({
    marketingEmails: z.boolean().optional(),
    productUpdates: z.boolean().optional(),
    reminderNotifications: z.boolean().optional(),
    calendarNotifications: z.boolean().optional(),
  }).optional(),

  reminders: z.object({
    reminderMinutes: z.number().min(0).max(1440).optional(),
    defaultCalendarId: z.string().nullable().optional(),
    whatsappCalendarIds: z.array(z.string()).optional(),
    defaultReminderTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).nullable().optional(),
    defaultDelayMinutes: z.number().min(1).max(1440).nullable().optional(),
    defaultLaterMinutes: z.number().min(1).max(1440).nullable().optional(),
  }).optional(),

  calendar: z.object({
    calendarNotificationMinutes: z.number().min(0).max(1440).optional(),
  }).optional(),

  locale: z.object({
    dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]).optional(),
    timeFormat: z.enum(["12h", "24h"]).optional(),
  }).optional(),
});

export const preferencesSchema = z.object({
  userId: z.string(),
  marketingEmails: z.boolean(),
  productUpdates: z.boolean(),
  reminderNotifications: z.boolean(),
  calendarNotifications: z.boolean(),
  reminderMinutes: z.number(),
  calendarNotificationMinutes: z.number(),
  defaultCalendarId: z.string().nullable(),
  whatsappCalendarIds: z.array(z.string()).nullable(),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
  timeFormat: z.enum(["12h", "24h"]),
});
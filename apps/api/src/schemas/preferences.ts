import { z } from "zod";

export const updatePreferencesSchema = z.object({
  notifications: z.object({
    marketingEmails: z.boolean().optional(),
    productUpdates: z.boolean().optional(),
    reminderNotifications: z.boolean().optional(),
  }).optional(),

  reminders: z.object({
    reminderMinutes: z.number().min(0).max(1440).optional(),
    defaultCalendarId: z.string().nullable().optional(),
  }).optional(),

  locale: z.object({
    timezone: z.string().optional(),
    dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]).optional(),
    timeFormat: z.enum(["12h", "24h"]).optional(),
  }).optional(),
});

export const preferencesSchema = z.object({
  userId: z.string(),
  marketingEmails: z.boolean(),
  productUpdates: z.boolean(),
  reminderNotifications: z.boolean(),
  reminderMinutes: z.number(),
  defaultCalendarId: z.string().nullable(),
  timezone: z.string(),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
  timeFormat: z.enum(["12h", "24h"]),
});
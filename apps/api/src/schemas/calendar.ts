import { z } from "zod";

export const connectCalendarSchema = z.object({
  provider: z.enum(["google", "microsoft"]),
  code: z.string(),
  redirectUri: z.string().url(),
});

export const updateCalendarSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  color: z.string().optional(),
  isPrimary: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
});

export const calendarSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.enum(["google", "microsoft"]),
  providerId: z.string(),
  email: z.string().email(),
  name: z.string(),
  color: z.string().nullable(),
  isPrimary: z.boolean(),
  syncEnabled: z.boolean(),
  lastSyncAt: z.date().nullable(),
  lastError: z.string().nullable(),
});
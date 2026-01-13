import { z } from "zod";

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  name: z.string().min(2).max(100).optional(), // DEPRECATED
  country: z.string().optional(),
  ageGroup: z.enum(["18-25", "26-35", "36-45", "46 and over"]).optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  birthday: z.coerce.date().optional(),
  mainUse: z.string().optional(),
  howHeardAboutUs: z.string().optional(),
  phone: z.string().optional(),
  phoneVerified: z.boolean().optional(),
  company: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  timezone: z.string().optional(),
  utcOffset: z.string().optional(),
  setupStep: z.number().int().min(1).max(3).optional(), // 1 = WhatsApp setup, 2 = Calendar setup, 3 = Complete
  showWelcomeModal: z.boolean().optional(),
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  phoneVerified: z.boolean(),
  company: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
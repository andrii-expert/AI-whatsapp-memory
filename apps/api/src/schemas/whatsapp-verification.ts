import { z } from "zod";

export const generateVerificationCodeSchema = z.object({
  phoneNumber: z.string().optional(),
});

export const verifyCodeSchema = z.object({
  phoneNumber: z.string().min(10),
  verificationCode: z.string().length(6),
});

export const whatsappNumberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  phoneNumber: z.string(),
  displayName: z.string().nullable(),
  isVerified: z.boolean(),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
  verifiedAt: z.date().nullable(),
  messageCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const verificationResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.date(),
});

export const verifyResponseSchema = z.object({
  success: z.boolean(),
  userId: z.string(),
  phoneNumber: z.string(),
});
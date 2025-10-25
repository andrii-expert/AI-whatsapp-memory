import { z } from "zod";

const planIdSchema = z.string().min(1).max(128);

// Ensure user exists schema (JIT creation from session)
export const ensureUserExistsSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
});

// User sync schema (from Clerk webhook or manual sync)
export const syncUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

// Onboarding completion schema
export const completeOnboardingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(10, "Valid phone number required"),
  country: z.string().min(1, "Country is required"),
  ageGroup: z.enum(["18-25", "26-35", "36-45", "46 and over"]),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  birthday: z.coerce.date().optional(),
  mainUse: z.string().min(1, "Please select your main use"),
  howHeardAboutUs: z.string().min(1, "Please let us know how you heard about us"),
  company: z.string().optional(),
  timezone: z.string().default("Africa/Johannesburg"),
  plan: planIdSchema.default("trial"),
});

// Phone verification schema
export const verifyPhoneSchema = z.object({
  phone: z.string().min(10),
  code: z.string().length(6).optional(), // For OTP verification if needed
});

// Update profile schema
export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().optional(),
  phone: z.string().min(10).optional(),
  avatarUrl: z.string().url().optional(),
});
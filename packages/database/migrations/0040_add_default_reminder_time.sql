-- Add default_reminder_time column to user_preferences table
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "default_reminder_time" text;


-- Add default_delay_minutes column to user_preferences table
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "default_delay_minutes" integer;


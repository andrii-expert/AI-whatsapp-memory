-- Add default_later_minutes column to user_preferences table (default 60 minutes / 1 hour)
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "default_later_minutes" integer DEFAULT 60;


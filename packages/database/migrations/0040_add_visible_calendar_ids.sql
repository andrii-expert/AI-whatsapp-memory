-- Add visible_calendar_ids field to user_preferences table
-- This stores database connection IDs for calendars that should be visible on the web calendar page

ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "visible_calendar_ids" jsonb;


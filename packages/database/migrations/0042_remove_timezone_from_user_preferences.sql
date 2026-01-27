-- Remove timezone column from user_preferences table (timezone is now in users table)
ALTER TABLE "user_preferences" DROP COLUMN IF EXISTS "timezone";


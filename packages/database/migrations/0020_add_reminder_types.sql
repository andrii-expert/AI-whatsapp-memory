-- Add new reminder frequency types
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'once' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reminder_frequency')
  ) THEN
    ALTER TYPE "reminder_frequency" ADD VALUE 'once';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'monthly' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reminder_frequency')
  ) THEN
    ALTER TYPE "reminder_frequency" ADD VALUE 'monthly';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'yearly' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reminder_frequency')
  ) THEN
    ALTER TYPE "reminder_frequency" ADD VALUE 'yearly';
  END IF;
END $$;

-- Add new columns for reminder types
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "days_from_now" integer;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "target_date" timestamp with time zone;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "day_of_month" integer;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "month" integer;


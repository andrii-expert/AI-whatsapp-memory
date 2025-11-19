-- Add 'weekly' to reminder_frequency enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'weekly' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'reminder_frequency')
  ) THEN
    ALTER TYPE "reminder_frequency" ADD VALUE 'weekly';
  END IF;
END $$;

-- Add days_of_week column for weekly reminders (array of integers 0-6, where 0=Sunday, 1=Monday, ..., 6=Saturday)
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "days_of_week" integer[];


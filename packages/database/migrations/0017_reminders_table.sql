-- Create reminder frequency enum
DO $$ BEGIN
  CREATE TYPE "reminder_frequency" AS ENUM('daily', 'hourly', 'minutely');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create reminders table
CREATE TABLE IF NOT EXISTS "reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "frequency" "reminder_frequency" NOT NULL,
  "time" text,
  "minute_of_hour" integer,
  "interval_minutes" integer,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "reminders_user_id_idx" ON "reminders" ("user_id");
CREATE INDEX IF NOT EXISTS "reminders_active_idx" ON "reminders" ("active");
CREATE INDEX IF NOT EXISTS "reminders_frequency_idx" ON "reminders" ("frequency");


-- Create system_settings table for admin-configurable system defaults
CREATE TABLE IF NOT EXISTS "system_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL UNIQUE,
  "value" text NOT NULL,
  "description" text,
  "updated_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_key_idx" ON "system_settings"("key");

-- Insert default "later" delay setting (1 hour = 60 minutes)
INSERT INTO "system_settings" ("key", "value", "description")
VALUES ('default_later_delay_minutes', '60', 'Default delay in minutes when user says "later" without specifying time')
ON CONFLICT ("key") DO NOTHING;


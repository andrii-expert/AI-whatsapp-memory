-- Add show_welcome_modal field to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "show_welcome_modal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint


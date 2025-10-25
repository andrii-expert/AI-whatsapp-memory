ALTER TABLE "calendar_connections" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."calendar_provider";--> statement-breakpoint
CREATE TYPE "public"."calendar_provider" AS ENUM('google', 'microsoft');--> statement-breakpoint
ALTER TABLE "calendar_connections" ALTER COLUMN "provider" SET DATA TYPE "public"."calendar_provider" USING "provider"::"public"."calendar_provider";--> statement-breakpoint
ALTER TABLE "conversation_states" ADD COLUMN "is_test_conversation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_message_jobs" ADD COLUMN "is_test_job" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_message_jobs" ADD COLUMN "test_configuration" jsonb;--> statement-breakpoint
ALTER TABLE "voice_message_jobs" ADD COLUMN "paused_at_stage" text;--> statement-breakpoint
ALTER TABLE "voice_message_jobs" ADD COLUMN "test_notes" text;--> statement-breakpoint
CREATE INDEX "voice_jobs_is_test_job_idx" ON "voice_message_jobs" USING btree ("is_test_job");
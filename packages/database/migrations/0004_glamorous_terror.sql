CREATE TABLE "intent_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_job_id" uuid,
	"transcribed_text" text NOT NULL,
	"original_intent" jsonb NOT NULL,
	"was_correct" boolean,
	"user_feedback" text,
	"corrected_intent" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feedback_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stt_provider_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_name" text NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"successful_requests" integer DEFAULT 0 NOT NULL,
	"failed_requests" integer DEFAULT 0 NOT NULL,
	"fallback_count" integer DEFAULT 0 NOT NULL,
	"avg_duration_ms" real,
	"total_audio_minutes" real DEFAULT 0 NOT NULL,
	"total_cost" numeric(12, 4) DEFAULT '0' NOT NULL,
	"date" date NOT NULL,
	"hour" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_message_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"whatsapp_number_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"media_id" text NOT NULL,
	"sender_phone" text NOT NULL,
	"mime_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"stt_provider" text,
	"stt_provider_fallback" text,
	"intent_provider" text,
	"audio_file_path" text,
	"audio_duration_seconds" real,
	"audio_file_size_bytes" integer,
	"transcribed_text" text,
	"transcription_language" text,
	"transcription_segments" jsonb,
	"transcription_cost" numeric(10, 6),
	"intent_analysis" jsonb,
	"calendar_event_id" text,
	"calendar_provider" text,
	"error_message" text,
	"error_stage" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_message_jobs_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "intent_feedback" ADD CONSTRAINT "intent_feedback_voice_job_id_voice_message_jobs_id_fk" FOREIGN KEY ("voice_job_id") REFERENCES "public"."voice_message_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_message_jobs" ADD CONSTRAINT "voice_message_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_message_jobs" ADD CONSTRAINT "voice_message_jobs_whatsapp_number_id_whatsapp_numbers_id_fk" FOREIGN KEY ("whatsapp_number_id") REFERENCES "public"."whatsapp_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intent_feedback_voice_job_id_idx" ON "intent_feedback" USING btree ("voice_job_id");--> statement-breakpoint
CREATE INDEX "intent_feedback_was_correct_idx" ON "intent_feedback" USING btree ("was_correct");--> statement-breakpoint
CREATE INDEX "stt_stats_provider_date_idx" ON "stt_provider_stats" USING btree ("provider_name","date");--> statement-breakpoint
CREATE INDEX "voice_jobs_status_idx" ON "voice_message_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "voice_jobs_user_id_idx" ON "voice_message_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "voice_jobs_created_at_idx" ON "voice_message_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "voice_jobs_whatsapp_number_id_idx" ON "voice_message_jobs" USING btree ("whatsapp_number_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_jobs_message_id_idx" ON "voice_message_jobs" USING btree ("message_id");
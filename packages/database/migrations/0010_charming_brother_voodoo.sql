CREATE TABLE "intent_pipeline_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"payload_type" text NOT NULL,
	"provider" text,
	"metadata" jsonb,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_job_timings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"stage_group" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intent_pipeline_payloads" ADD CONSTRAINT "intent_pipeline_payloads_job_id_voice_message_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."voice_message_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_job_timings" ADD CONSTRAINT "voice_job_timings_job_id_voice_message_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."voice_message_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intent_payloads_job_id_idx" ON "intent_pipeline_payloads" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "intent_payloads_job_sequence_idx" ON "intent_pipeline_payloads" USING btree ("job_id","sequence");--> statement-breakpoint
CREATE INDEX "intent_payloads_type_idx" ON "intent_pipeline_payloads" USING btree ("payload_type");--> statement-breakpoint
CREATE INDEX "voice_job_timings_job_id_idx" ON "voice_job_timings" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "voice_job_timings_stage_idx" ON "voice_job_timings" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "voice_job_timings_job_sequence_idx" ON "voice_job_timings" USING btree ("job_id","sequence");
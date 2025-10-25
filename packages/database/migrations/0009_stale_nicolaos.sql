CREATE TABLE "flow_sessions" (
	"flow_token" text PRIMARY KEY NOT NULL,
	"pending_intent_id" uuid NOT NULL,
	"fields_requested" jsonb NOT NULL,
	"response_data" jsonb,
	"response_received" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactive_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pending_intent_id" uuid NOT NULL,
	"whatsapp_message_id" text,
	"field_key" text NOT NULL,
	"options" jsonb NOT NULL,
	"selected_value" text,
	"response_received" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"whatsapp_number_id" uuid NOT NULL,
	"intent_snapshot" jsonb NOT NULL,
	"clarification_plan" jsonb NOT NULL,
	"status" text DEFAULT 'awaiting_clarification' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_message_jobs" ADD COLUMN "intent_job_id" uuid;--> statement-breakpoint
ALTER TABLE "voice_message_jobs" ADD COLUMN "intent_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "voice_message_jobs" ADD COLUMN "clarification_status" text;--> statement-breakpoint
ALTER TABLE "flow_sessions" ADD CONSTRAINT "flow_sessions_pending_intent_id_pending_intents_id_fk" FOREIGN KEY ("pending_intent_id") REFERENCES "public"."pending_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactive_prompts" ADD CONSTRAINT "interactive_prompts_pending_intent_id_pending_intents_id_fk" FOREIGN KEY ("pending_intent_id") REFERENCES "public"."pending_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_intents" ADD CONSTRAINT "pending_intents_job_id_voice_message_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."voice_message_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_intents" ADD CONSTRAINT "pending_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_intents" ADD CONSTRAINT "pending_intents_whatsapp_number_id_whatsapp_numbers_id_fk" FOREIGN KEY ("whatsapp_number_id") REFERENCES "public"."whatsapp_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_sessions_pending_intent_id_idx" ON "flow_sessions" USING btree ("pending_intent_id");--> statement-breakpoint
CREATE INDEX "flow_sessions_expires_at_idx" ON "flow_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "interactive_prompts_pending_intent_id_idx" ON "interactive_prompts" USING btree ("pending_intent_id");--> statement-breakpoint
CREATE INDEX "interactive_prompts_field_key_idx" ON "interactive_prompts" USING btree ("field_key");--> statement-breakpoint
CREATE INDEX "interactive_prompts_expires_at_idx" ON "interactive_prompts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_intents_job_id_idx" ON "pending_intents" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pending_intents_user_id_idx" ON "pending_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pending_intents_whatsapp_number_id_idx" ON "pending_intents" USING btree ("whatsapp_number_id");--> statement-breakpoint
CREATE INDEX "pending_intents_status_idx" ON "pending_intents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pending_intents_expires_at_idx" ON "pending_intents" USING btree ("expires_at");
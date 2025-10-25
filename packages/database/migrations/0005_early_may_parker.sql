CREATE TABLE "conversation_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"whatsapp_number_id" uuid NOT NULL,
	"voice_job_id" uuid,
	"status" text DEFAULT 'waiting_for_input' NOT NULL,
	"partial_intent" jsonb NOT NULL,
	"pending_resolutions" jsonb NOT NULL,
	"last_question_asked" text,
	"last_message_id" text,
	"expected_response_type" text,
	"resolved_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_whatsapp_number_id_whatsapp_numbers_id_fk" FOREIGN KEY ("whatsapp_number_id") REFERENCES "public"."whatsapp_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_voice_job_id_voice_message_jobs_id_fk" FOREIGN KEY ("voice_job_id") REFERENCES "public"."voice_message_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_states_user_id_idx" ON "conversation_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversation_states_whatsapp_number_id_idx" ON "conversation_states" USING btree ("whatsapp_number_id");--> statement-breakpoint
CREATE INDEX "conversation_states_status_idx" ON "conversation_states" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversation_states_expires_at_idx" ON "conversation_states" USING btree ("expires_at");
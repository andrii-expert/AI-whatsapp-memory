CREATE TABLE "event_verification_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"whatsapp_number_id" uuid NOT NULL,
	"voice_job_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"operation_type" text NOT NULL,
	"intent_to_verify" jsonb NOT NULL,
	"target_event_id" text,
	"verification_message_id" text,
	"user_response" text,
	"response_received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_verification_states" ADD CONSTRAINT "event_verification_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_verification_states" ADD CONSTRAINT "event_verification_states_whatsapp_number_id_whatsapp_numbers_id_fk" FOREIGN KEY ("whatsapp_number_id") REFERENCES "public"."whatsapp_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_verification_states" ADD CONSTRAINT "event_verification_states_voice_job_id_voice_message_jobs_id_fk" FOREIGN KEY ("voice_job_id") REFERENCES "public"."voice_message_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_verification_states_user_id_idx" ON "event_verification_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_verification_states_whatsapp_number_id_idx" ON "event_verification_states" USING btree ("whatsapp_number_id");--> statement-breakpoint
CREATE INDEX "event_verification_states_voice_job_id_idx" ON "event_verification_states" USING btree ("voice_job_id");--> statement-breakpoint
CREATE INDEX "event_verification_states_status_idx" ON "event_verification_states" USING btree ("status");--> statement-breakpoint
CREATE INDEX "event_verification_states_operation_type_idx" ON "event_verification_states" USING btree ("operation_type");--> statement-breakpoint
CREATE INDEX "event_verification_states_expires_at_idx" ON "event_verification_states" USING btree ("expires_at");
CREATE TABLE "whatsapp_message_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whatsapp_number_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"message_id" text,
	"direction" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"exchange_rate_usd_to_zar" numeric(10, 4),
	"processed" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_numbers" ADD COLUMN "outgoing_message_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_numbers" ADD COLUMN "last_outgoing_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_numbers" ADD COLUMN "total_cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_numbers" ADD COLUMN "current_month_cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_numbers" ADD COLUMN "cost_tracking_start_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_message_logs" ADD CONSTRAINT "whatsapp_message_logs_whatsapp_number_id_whatsapp_numbers_id_fk" FOREIGN KEY ("whatsapp_number_id") REFERENCES "public"."whatsapp_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message_logs" ADD CONSTRAINT "whatsapp_message_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_message_logs_number_id_idx" ON "whatsapp_message_logs" USING btree ("whatsapp_number_id");--> statement-breakpoint
CREATE INDEX "whatsapp_message_logs_user_id_idx" ON "whatsapp_message_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "whatsapp_message_logs_direction_idx" ON "whatsapp_message_logs" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "whatsapp_message_logs_created_at_idx" ON "whatsapp_message_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_message_logs_processed_idx" ON "whatsapp_message_logs" USING btree ("processed");
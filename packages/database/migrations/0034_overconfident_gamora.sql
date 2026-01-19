CREATE TABLE "temporary_signup_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"device_fingerprint" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"current_step" text NOT NULL,
	"step_data" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "temporary_signup_credentials" ADD CONSTRAINT "temporary_signup_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "temporary_signup_credentials_user_id_idx" ON "temporary_signup_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "temporary_signup_credentials_device_fingerprint_idx" ON "temporary_signup_credentials" USING btree ("device_fingerprint");--> statement-breakpoint
CREATE INDEX "temporary_signup_credentials_expires_at_idx" ON "temporary_signup_credentials" USING btree ("expires_at");
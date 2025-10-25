CREATE TYPE "public"."activity_action" AS ENUM('user.created', 'user.updated', 'user.deleted', 'subscription.created', 'subscription.upgraded', 'subscription.downgraded', 'subscription.cancelled', 'subscription.renewed', 'payment.completed', 'payment.failed', 'payment.refunded', 'calendar.connected', 'calendar.disconnected', 'whatsapp.verified', 'whatsapp.disconnected');--> statement-breakpoint
CREATE TYPE "public"."calendar_provider" AS ENUM('google', 'microsoft', 'apple', 'caldav');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('ZAR', 'USD', 'EUR', 'GBP');--> statement-breakpoint
CREATE TYPE "public"."date_format" AS ENUM('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('user', 'subscription', 'payment', 'calendar_connection', 'whatsapp_number');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'eft', 'instant_eft', 'debit_order');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('trial', 'monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'cancelled', 'expired', 'past_due', 'paused');--> statement-breakpoint
CREATE TYPE "public"."time_format" AS ENUM('12h', '24h');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"action" "activity_action" NOT NULL,
	"entity_type" "entity_type",
	"entity_id" text,
	"metadata" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"email" text NOT NULL,
	"calendar_id" text,
	"calendar_name" text,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"sync_failure_count" integer DEFAULT 0 NOT NULL,
	"provider_account_id" text,
	"provider_data" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" uuid,
	"amount" integer NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '15.00' NOT NULL,
	"vat_amount" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" "currency" DEFAULT 'ZAR' NOT NULL,
	"invoice_number" text NOT NULL,
	"description" text NOT NULL,
	"billing_period_start" timestamp with time zone,
	"billing_period_end" timestamp with time zone,
	"payment_method" "payment_method",
	"status" "payment_status" NOT NULL,
	"payfast_payment_id" text,
	"payfast_payment_uuid" text,
	"refund_amount" integer,
	"refund_reason" text,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"payfast_subscription_id" text,
	"payfast_token" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"marketing_emails" boolean DEFAULT true NOT NULL,
	"product_updates" boolean DEFAULT true NOT NULL,
	"reminder_notifications" boolean DEFAULT true NOT NULL,
	"reminder_minutes" integer DEFAULT 10 NOT NULL,
	"default_calendar_id" text,
	"timezone" text DEFAULT 'Africa/Johannesburg' NOT NULL,
	"date_format" date_format DEFAULT 'DD/MM/YYYY' NOT NULL,
	"time_format" time_format DEFAULT '24h' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"company" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"phone_number" text NOT NULL,
	"display_name" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"verification_code" text,
	"verification_expires_at" timestamp with time zone,
	"verification_attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"whatsapp_id" text,
	"last_message_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_numbers_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_numbers" ADD CONSTRAINT "whatsapp_numbers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_user_id_idx" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_logs_action_idx" ON "activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "activity_logs_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "calendar_connections_user_id_idx" ON "calendar_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_connections_provider_idx" ON "calendar_connections" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "calendar_connections_user_provider_idx" ON "calendar_connections" USING btree ("user_id","provider","email");--> statement-breakpoint
CREATE INDEX "calendar_connections_is_active_idx" ON "calendar_connections" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "payments_user_id_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_subscription_id_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_invoice_number_idx" ON "payments" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payments_payfast_payment_idx" ON "payments" USING btree ("payfast_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_payfast_subscription_idx" ON "subscriptions" USING btree ("payfast_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_user_id_idx" ON "user_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "whatsapp_numbers_user_id_idx" ON "whatsapp_numbers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_numbers_phone_idx" ON "whatsapp_numbers" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "whatsapp_numbers_is_active_idx" ON "whatsapp_numbers" USING btree ("is_active");
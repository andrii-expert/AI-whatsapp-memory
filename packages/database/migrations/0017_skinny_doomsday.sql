CREATE TYPE "public"."reminder_frequency" AS ENUM('daily', 'hourly', 'minutely');--> statement-breakpoint
CREATE TYPE "public"."share_permission" AS ENUM('view', 'edit');--> statement-breakpoint
CREATE TYPE "public"."share_resource_type" AS ENUM('task', 'task_folder', 'note', 'note_folder');--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"frequency" "reminder_frequency" NOT NULL,
	"time" text,
	"minute_of_hour" integer,
	"interval_minutes" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"shared_with_user_id" text NOT NULL,
	"resource_type" "share_resource_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"permission" "share_permission" DEFAULT 'view' NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_shares" ADD CONSTRAINT "task_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_shares" ADD CONSTRAINT "task_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_user_id_idx" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_active_idx" ON "reminders" USING btree ("active");--> statement-breakpoint
CREATE INDEX "reminders_frequency_idx" ON "reminders" USING btree ("frequency");--> statement-breakpoint
CREATE INDEX "task_shares_owner_id_idx" ON "task_shares" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "task_shares_shared_with_user_id_idx" ON "task_shares" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "task_shares_resource_idx" ON "task_shares" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_shares_unique_share_idx" ON "task_shares" USING btree ("owner_id","shared_with_user_id","resource_type","resource_id");
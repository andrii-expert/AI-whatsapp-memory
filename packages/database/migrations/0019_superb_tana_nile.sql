ALTER TYPE "public"."reminder_frequency" ADD VALUE 'once';--> statement-breakpoint
ALTER TYPE "public"."reminder_frequency" ADD VALUE 'weekly';--> statement-breakpoint
ALTER TYPE "public"."reminder_frequency" ADD VALUE 'monthly';--> statement-breakpoint
ALTER TYPE "public"."reminder_frequency" ADD VALUE 'yearly';--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "days_from_now" integer;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "target_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "day_of_month" integer;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "month" integer;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "days_of_week" integer[];--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "utc_offset" text;
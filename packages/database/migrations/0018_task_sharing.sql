-- Create enums for sharing
CREATE TYPE "public"."share_permission" AS ENUM('view', 'edit');
--> statement-breakpoint
CREATE TYPE "public"."share_resource_type" AS ENUM('task', 'task_folder');
--> statement-breakpoint

-- Create task_shares table
CREATE TABLE IF NOT EXISTS "task_shares" (
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

-- Add foreign keys
DO $$ BEGIN
 ALTER TABLE "task_shares" ADD CONSTRAINT "task_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_shares" ADD CONSTRAINT "task_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Create indexes
CREATE INDEX IF NOT EXISTS "task_shares_owner_id_idx" ON "task_shares" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_shares_shared_with_user_id_idx" ON "task_shares" USING btree ("shared_with_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_shares_resource_idx" ON "task_shares" USING btree ("resource_type","resource_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_shares_unique_share_idx" ON "task_shares" USING btree ("owner_id","shared_with_user_id","resource_type","resource_id");


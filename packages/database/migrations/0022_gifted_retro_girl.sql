ALTER TYPE "public"."share_resource_type" ADD VALUE 'file';--> statement-breakpoint
ALTER TYPE "public"."share_resource_type" ADD VALUE 'file_folder';--> statement-breakpoint
CREATE TABLE "file_shares" (
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
CREATE TABLE "user_file_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_extension" text,
	"cloudflare_id" text NOT NULL,
	"cloudflare_key" text,
	"cloudflare_url" text NOT NULL,
	"thumbnail_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_file_folders" ADD CONSTRAINT "user_file_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_folder_id_user_file_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."user_file_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_shares_owner_id_idx" ON "file_shares" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "file_shares_shared_with_user_id_idx" ON "file_shares" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "file_shares_resource_idx" ON "file_shares" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_shares_unique_share_idx" ON "file_shares" USING btree ("owner_id","shared_with_user_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "user_file_folders_user_id_idx" ON "user_file_folders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_file_folders_unique_per_user" ON "user_file_folders" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "user_files_user_id_idx" ON "user_files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_files_folder_id_idx" ON "user_files" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "user_files_file_type_idx" ON "user_files" USING btree ("file_type");--> statement-breakpoint
CREATE INDEX "user_files_created_at_idx" ON "user_files" USING btree ("created_at");
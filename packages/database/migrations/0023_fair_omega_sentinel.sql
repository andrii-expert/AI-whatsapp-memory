ALTER TYPE "public"."share_resource_type" ADD VALUE 'address';--> statement-breakpoint
ALTER TYPE "public"."share_resource_type" ADD VALUE 'address_folder';--> statement-breakpoint
CREATE TABLE "address_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "address_shares" (
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
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"connected_user_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "address_folders" ADD CONSTRAINT "address_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_shares" ADD CONSTRAINT "address_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_shares" ADD CONSTRAINT "address_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_folder_id_address_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."address_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_connected_user_id_users_id_fk" FOREIGN KEY ("connected_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "address_folders_user_id_idx" ON "address_folders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "address_folders_unique_per_user" ON "address_folders" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "address_shares_owner_id_idx" ON "address_shares" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "address_shares_shared_with_user_id_idx" ON "address_shares" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "address_shares_resource_idx" ON "address_shares" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "address_shares_unique_share_idx" ON "address_shares" USING btree ("owner_id","shared_with_user_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "addresses_user_id_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "addresses_folder_id_idx" ON "addresses" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "addresses_connected_user_id_idx" ON "addresses" USING btree ("connected_user_id");--> statement-breakpoint
CREATE INDEX "addresses_sort_order_idx" ON "addresses" USING btree ("sort_order");
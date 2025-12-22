ALTER TYPE "public"."share_resource_type" ADD VALUE 'shopping_list_folder' BEFORE 'note';--> statement-breakpoint
CREATE TABLE "shopping_list_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_expanded" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "shopping_list_folders" ADD CONSTRAINT "shopping_list_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_folders" ADD CONSTRAINT "shopping_list_folders_parent_id_shopping_list_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shopping_list_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_list_folders_user_id_idx" ON "shopping_list_folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopping_list_folders_parent_id_idx" ON "shopping_list_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "shopping_list_folders_sort_order_idx" ON "shopping_list_folders" USING btree ("sort_order");--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_folder_id_shopping_list_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."shopping_list_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_list_items_folder_id_idx" ON "shopping_list_items" USING btree ("folder_id");
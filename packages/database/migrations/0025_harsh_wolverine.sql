CREATE TABLE "friend_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address_type" "address_type",
	"street" text,
	"city" text,
	"state" text,
	"zip" text,
	"country" text,
	"latitude" real,
	"longitude" real,
	"connected_user_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_folders" ADD CONSTRAINT "friend_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_folder_id_friend_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."friend_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_connected_user_id_users_id_fk" FOREIGN KEY ("connected_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_folders_user_id_idx" ON "friend_folders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_folders_unique_per_user" ON "friend_folders" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "friends_user_id_idx" ON "friends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "friends_folder_id_idx" ON "friends" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "friends_connected_user_id_idx" ON "friends" USING btree ("connected_user_id");--> statement-breakpoint
CREATE INDEX "friends_sort_order_idx" ON "friends" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "friends_address_type_idx" ON "friends" USING btree ("address_type");
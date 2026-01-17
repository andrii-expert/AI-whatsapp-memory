ALTER TABLE "shopping_list_folders" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "shopping_list_folders_is_primary_idx" ON "shopping_list_folders" USING btree ("is_primary");


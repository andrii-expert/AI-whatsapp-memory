ALTER TABLE "shopping_list_items" ADD COLUMN "category" text;--> statement-breakpoint
CREATE INDEX "shopping_list_items_category_idx" ON "shopping_list_items" USING btree ("category");
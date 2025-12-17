-- Create shopping_list_items table
CREATE TABLE IF NOT EXISTS "shopping_list_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "status" "task_status" DEFAULT 'open' NOT NULL,
  "completed_at" timestamp with time zone,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create indexes
CREATE INDEX IF NOT EXISTS "shopping_list_items_user_id_idx" ON "shopping_list_items" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_list_items_status_idx" ON "shopping_list_items" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_list_items_sort_order_idx" ON "shopping_list_items" USING btree ("sort_order");


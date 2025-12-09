-- User Files / Storage table
CREATE TABLE IF NOT EXISTS "user_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  
  -- File metadata
  "title" text NOT NULL,
  "description" text,
  
  -- File info
  "file_name" text NOT NULL,
  "file_type" text NOT NULL,
  "file_size" integer NOT NULL,
  "file_extension" text,
  
  -- Cloudflare storage
  "cloudflare_id" text NOT NULL,
  "cloudflare_url" text NOT NULL,
  "thumbnail_url" text,
  
  -- Organization
  "sort_order" integer DEFAULT 0 NOT NULL,
  
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "user_files_user_id_idx" ON "user_files" ("user_id");
CREATE INDEX IF NOT EXISTS "user_files_file_type_idx" ON "user_files" ("file_type");
CREATE INDEX IF NOT EXISTS "user_files_created_at_idx" ON "user_files" ("created_at");


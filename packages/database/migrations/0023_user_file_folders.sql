-- User file folders (single level)
CREATE TABLE IF NOT EXISTS "user_file_folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_file_folders_unique_per_user UNIQUE ("user_id", "name")
);

CREATE INDEX IF NOT EXISTS "user_file_folders_user_id_idx" ON "user_file_folders" ("user_id");

-- Link files to folders (optional)
ALTER TABLE "user_files" ADD COLUMN IF NOT EXISTS "folder_id" uuid REFERENCES "user_file_folders"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "user_files_folder_id_idx" ON "user_files" ("folder_id");


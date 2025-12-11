-- Add file and file_folder to share_resource_type enum
ALTER TYPE "share_resource_type" ADD VALUE IF NOT EXISTS 'file';
ALTER TYPE "share_resource_type" ADD VALUE IF NOT EXISTS 'file_folder';

-- Create file_shares table
CREATE TABLE IF NOT EXISTS "file_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  
  -- Owner who is sharing
  "owner_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  
  -- User being shared with
  "shared_with_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  
  -- Resource being shared
  "resource_type" share_resource_type NOT NULL,
  "resource_id" uuid NOT NULL, -- Can be user_files.id or user_file_folders.id
  
  -- Permission level
  "permission" share_permission DEFAULT 'view' NOT NULL,
  
  -- Metadata
  "shared_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "file_shares_owner_id_idx" ON "file_shares" ("owner_id");
CREATE INDEX IF NOT EXISTS "file_shares_shared_with_user_id_idx" ON "file_shares" ("shared_with_user_id");
CREATE INDEX IF NOT EXISTS "file_shares_resource_idx" ON "file_shares" ("resource_type", "resource_id");
CREATE UNIQUE INDEX IF NOT EXISTS "file_shares_unique_share_idx" ON "file_shares" ("owner_id", "shared_with_user_id", "resource_type", "resource_id");


-- Add 'note' and 'note_folder' to share_resource_type enum
-- Note: PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE ADD VALUE
-- If the values already exist, this will error, which is safe to ignore
DO $$ BEGIN
  ALTER TYPE "public"."share_resource_type" ADD VALUE 'note';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."share_resource_type" ADD VALUE 'note_folder';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


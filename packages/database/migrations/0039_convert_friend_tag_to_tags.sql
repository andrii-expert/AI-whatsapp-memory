-- Convert single tag column to tags JSONB array
-- Step 1: Add new tags column
ALTER TABLE "friends" ADD COLUMN "tags" jsonb;

-- Step 2: Migrate existing tag values to tags array
-- Convert single tag to array format: ["tag"] or null
UPDATE "friends" 
SET "tags" = CASE 
  WHEN "tag" IS NOT NULL AND "tag" != '' THEN jsonb_build_array("tag")
  ELSE NULL
END;

-- Step 3: Drop old tag column
ALTER TABLE "friends" DROP COLUMN "tag";


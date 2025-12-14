-- Add address type enum
CREATE TYPE "public"."address_type" AS ENUM('home', 'office', 'parents_house');
--> statement-breakpoint

-- Add new address fields to addresses table
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "address_type" "address_type";
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "street" text;
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "city" text;
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "state" text;
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "zip" text;
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "country" text;
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "latitude" real;
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "longitude" real;
--> statement-breakpoint

-- Create index for address_type
CREATE INDEX IF NOT EXISTS "addresses_address_type_idx" ON "addresses" USING btree ("address_type");
--> statement-breakpoint

-- Update the normalize function to handle new text fields
CREATE OR REPLACE FUNCTION normalize_addresses_empty_strings()
RETURNS TRIGGER AS $$
BEGIN
  -- Convert empty strings to NULL for connected_user_id (text column)
  IF NEW.connected_user_id = '' THEN
    NEW.connected_user_id := NULL;
  END IF;
  
  -- Convert empty strings to NULL for new address text fields
  IF NEW.street = '' THEN
    NEW.street := NULL;
  END IF;
  
  IF NEW.city = '' THEN
    NEW.city := NULL;
  END IF;
  
  IF NEW.state = '' THEN
    NEW.state := NULL;
  END IF;
  
  IF NEW.zip = '' THEN
    NEW.zip := NULL;
  END IF;
  
  IF NEW.country = '' THEN
    NEW.country := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

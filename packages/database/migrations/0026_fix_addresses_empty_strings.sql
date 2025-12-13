-- Fix empty strings in addresses table
-- This trigger converts empty strings to NULL for text columns before insertion/update

-- Function to normalize empty strings to NULL for addresses table
CREATE OR REPLACE FUNCTION normalize_addresses_empty_strings()
RETURNS TRIGGER AS $$
BEGIN
  -- Convert empty strings to NULL for connected_user_id (text column)
  IF NEW.connected_user_id = '' THEN
    NEW.connected_user_id := NULL;
  END IF;
  
  -- Note: folder_id is a UUID column, so empty strings will be rejected
  -- at the type level before this trigger runs. The application layer
  -- should handle converting empty strings to NULL for UUID fields.
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT
DROP TRIGGER IF EXISTS addresses_normalize_empty_strings_insert ON addresses;
CREATE TRIGGER addresses_normalize_empty_strings_insert
  BEFORE INSERT ON addresses
  FOR EACH ROW
  EXECUTE FUNCTION normalize_addresses_empty_strings();

-- Create trigger for UPDATE
DROP TRIGGER IF EXISTS addresses_normalize_empty_strings_update ON addresses;
CREATE TRIGGER addresses_normalize_empty_strings_update
  BEFORE UPDATE ON addresses
  FOR EACH ROW
  EXECUTE FUNCTION normalize_addresses_empty_strings();

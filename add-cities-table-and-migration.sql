-- SQL script to create cities table and migrate places to use city_id
-- Execute this script in Supabase Dashboard > SQL Editor

-- ============================================
-- 1. Create cities table
-- ============================================
CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  state TEXT,
  country TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint to prevent duplicates
-- Using functional unique index for case-insensitive matching
CREATE UNIQUE INDEX IF NOT EXISTS cities_unique_name_state_country_idx 
ON cities (
  LOWER(TRIM(name)), 
  COALESCE(state, ''), 
  COALESCE(country, '')
);

-- Note: The RPC function handles duplicates by checking before insert
-- The unique index prevents duplicates at the database level
-- If a race condition occurs, the EXCEPTION handler in the function will catch it

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS cities_name_idx ON cities(LOWER(name));
CREATE INDEX IF NOT EXISTS cities_slug_idx ON cities(slug) WHERE slug IS NOT NULL;

-- Add comments
COMMENT ON TABLE cities IS 'Cities table for place location references';
COMMENT ON COLUMN cities.name IS 'City name (normalized, case-insensitive)';
COMMENT ON COLUMN cities.slug IS 'URL-friendly city identifier';
COMMENT ON COLUMN cities.state IS 'State or province';
COMMENT ON COLUMN cities.country IS 'Country name';
COMMENT ON COLUMN cities.lat IS 'City center latitude';
COMMENT ON COLUMN cities.lng IS 'City center longitude';

-- ============================================
-- 2. Add city_id and city_name_cached to places
-- ============================================

-- Add city_id column (nullable initially for migration)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'places' 
        AND column_name = 'city_id'
    ) THEN
        ALTER TABLE places ADD COLUMN city_id UUID REFERENCES cities(id) ON DELETE SET NULL;
        COMMENT ON COLUMN places.city_id IS 'Foreign key to cities table';
    END IF;
END $$;

-- Add city_name_cached column for display (optional, for backward compatibility)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'places' 
        AND column_name = 'city_name_cached'
    ) THEN
        ALTER TABLE places ADD COLUMN city_name_cached TEXT;
        COMMENT ON COLUMN places.city_name_cached IS 'Cached city name for display (denormalized from cities.name)';
    END IF;
END $$;

-- Add index for city_id lookups
CREATE INDEX IF NOT EXISTS places_city_id_idx ON places(city_id) WHERE city_id IS NOT NULL;

-- ============================================
-- 3. Create RPC function: get_or_create_city
-- ============================================
CREATE OR REPLACE FUNCTION get_or_create_city(
  p_name TEXT,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_city_id UUID;
  v_normalized_name TEXT;
  v_slug TEXT;
BEGIN
  -- Normalize city name: trim, collapse spaces, title case
  v_normalized_name := TRIM(REGEXP_REPLACE(p_name, '\s+', ' ', 'g'));
  
  -- Generate slug from normalized name
  v_slug := LOWER(REGEXP_REPLACE(v_normalized_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);
  
  -- Try to find existing city (case-insensitive)
  SELECT id INTO v_city_id
  FROM cities
  WHERE LOWER(TRIM(name)) = LOWER(v_normalized_name)
    AND COALESCE(state, '') = COALESCE(p_state, '')
    AND COALESCE(country, '') = COALESCE(p_country, '')
  LIMIT 1;
  
  -- If not found, create new city
  -- Handle potential race condition: another process might create it between SELECT and INSERT
  IF v_city_id IS NULL THEN
    BEGIN
      INSERT INTO cities (name, slug, state, country, lat, lng)
      VALUES (v_normalized_name, v_slug, p_state, p_country, p_lat, p_lng)
      RETURNING id INTO v_city_id;
    EXCEPTION WHEN unique_violation THEN
      -- If insert fails due to unique constraint (race condition or duplicate),
      -- try to find the existing city again
      SELECT id INTO v_city_id
      FROM cities
      WHERE LOWER(TRIM(name)) = LOWER(v_normalized_name)
        AND COALESCE(state, '') = COALESCE(p_state, '')
        AND COALESCE(country, '') = COALESCE(p_country, '')
      LIMIT 1;
    END;
  END IF;
  
  RETURN v_city_id;
END;
$$;

COMMENT ON FUNCTION get_or_create_city IS 'Gets existing city or creates new one. Returns city_id UUID. Idempotent.';

-- ============================================
-- 4. Migrate existing places.city to cities and link city_id
-- ============================================
DO $$
DECLARE
  place_record RECORD;
  city_id_val UUID;
BEGIN
  -- Process places that have city but no city_id
  FOR place_record IN 
    SELECT id, city, country 
    FROM places 
    WHERE city IS NOT NULL 
      AND TRIM(city) != '' 
      AND city_id IS NULL
  LOOP
    -- Get or create city
    SELECT get_or_create_city(
      p_name := place_record.city,
      p_country := place_record.country
    ) INTO city_id_val;
    
    -- Update place with city_id and cache city name
    UPDATE places
    SET 
      city_id = city_id_val,
      city_name_cached = place_record.city
    WHERE id = place_record.id;
  END LOOP;
END $$;

-- ============================================
-- 5. Create trigger to update city_name_cached when city changes
-- ============================================
CREATE OR REPLACE FUNCTION update_place_city_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update city_name_cached from cities.name when city_id changes
  IF NEW.city_id IS NOT NULL AND (OLD.city_id IS NULL OR OLD.city_id != NEW.city_id) THEN
    SELECT name INTO NEW.city_name_cached
    FROM cities
    WHERE id = NEW.city_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_update_place_city_cache ON places;
CREATE TRIGGER trigger_update_place_city_cache
  BEFORE INSERT OR UPDATE OF city_id ON places
  FOR EACH ROW
  EXECUTE FUNCTION update_place_city_cache();

-- ============================================
-- 6. RLS Policies for cities table
-- ============================================

-- Enable RLS
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read cities (for filters, autocomplete, etc.)
CREATE POLICY "Cities are readable by everyone"
ON cities
FOR SELECT
TO public
USING (true);

-- Policy: Only authenticated users can insert cities (via RPC function)
-- Note: RPC function uses SECURITY DEFINER, so it bypasses RLS
-- This policy is for direct inserts (if needed)
CREATE POLICY "Authenticated users can insert cities"
ON cities
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Only service role can update/delete cities
-- Regular users should not modify cities directly
CREATE POLICY "Only service role can update cities"
ON cities
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Only service role can delete cities"
ON cities
FOR DELETE
TO service_role
USING (true);

-- ============================================
-- 7. Verify migration
-- ============================================
SELECT 
  'Cities table' as check_item,
  COUNT(*) as count
FROM cities;

SELECT 
  'Places with city_id' as check_item,
  COUNT(*) as count
FROM places
WHERE city_id IS NOT NULL;

SELECT 
  'Places without city_id' as check_item,
  COUNT(*) as count
FROM places
WHERE city_id IS NULL AND city IS NOT NULL AND TRIM(city) != '';

-- Show sample cities
SELECT id, name, state, country, created_at
FROM cities
ORDER BY created_at DESC
LIMIT 10;

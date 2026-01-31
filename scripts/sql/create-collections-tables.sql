-- Collections and Place_Collections tables for Maporia
-- Run in Supabase Dashboard > SQL Editor

-- 1. Create access_type enum for collections
DO $$ BEGIN
  CREATE TYPE collection_access_type AS ENUM ('free', 'premium');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Collections table
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  access_type collection_access_type NOT NULL DEFAULT 'free',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

COMMENT ON TABLE collections IS 'Curated collections of places';
COMMENT ON COLUMN collections.access_type IS 'free = open to all; premium = requires premium subscription';
COMMENT ON COLUMN collections.cover_image IS 'URL to cover image (e.g. Supabase Storage)';

-- 3. Place_Collections join table (many-to-many with sort_order; avoid reserved word "order")
CREATE TABLE IF NOT EXISTS place_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(place_id, collection_id)
);

CREATE INDEX IF NOT EXISTS idx_place_collections_collection_id ON place_collections(collection_id);
CREATE INDEX IF NOT EXISTS idx_place_collections_place_id ON place_collections(place_id);
CREATE INDEX IF NOT EXISTS idx_place_collections_sort_order ON place_collections(collection_id, sort_order);

COMMENT ON TABLE place_collections IS 'Join table: places in collections with display order';
COMMENT ON COLUMN place_collections.sort_order IS 'Display order within the collection (lower = first)';

-- 4. RLS for collections
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active collections" ON collections;
DROP POLICY IF EXISTS "Admins can view all collections" ON collections;
DROP POLICY IF EXISTS "Admins can insert collections" ON collections;
DROP POLICY IF EXISTS "Admins can update collections" ON collections;
DROP POLICY IF EXISTS "Admins can delete collections" ON collections;

-- Everyone can read active collections (for public list and detail)
CREATE POLICY "Anyone can view active collections"
ON collections
FOR SELECT
USING (is_active = true);

-- Admins can view all collections (including inactive)
CREATE POLICY "Admins can view all collections"
ON collections
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

-- Admins can insert/update/delete collections
CREATE POLICY "Admins can insert collections"
ON collections
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

CREATE POLICY "Admins can update collections"
ON collections
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

CREATE POLICY "Admins can delete collections"
ON collections
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

-- 5. RLS for place_collections
ALTER TABLE place_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view place_collections" ON place_collections;
DROP POLICY IF EXISTS "Admins can insert place_collections" ON place_collections;
DROP POLICY IF EXISTS "Admins can update place_collections" ON place_collections;
DROP POLICY IF EXISTS "Admins can delete place_collections" ON place_collections;

-- Everyone can read place_collections (to show which places are in a collection)
CREATE POLICY "Anyone can view place_collections"
ON place_collections
FOR SELECT
USING (true);

-- Admins can manage place_collections
CREATE POLICY "Admins can insert place_collections"
ON place_collections
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

CREATE POLICY "Admins can update place_collections"
ON place_collections
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

CREATE POLICY "Admins can delete place_collections"
ON place_collections
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

-- 6. Trigger to set updated_at on collections
CREATE OR REPLACE FUNCTION set_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS collections_updated_at ON collections;
CREATE TRIGGER collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW
  EXECUTE PROCEDURE set_collections_updated_at();

-- Verify
SELECT 'collections' AS table_name, count(*) AS policies FROM pg_policies WHERE tablename = 'collections'
UNION ALL
SELECT 'place_collections', count(*) FROM pg_policies WHERE tablename = 'place_collections';

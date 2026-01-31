-- Rename place_collections."order" to sort_order (reserved word causes issues in PostgREST/Supabase)
-- Run in Supabase Dashboard > SQL Editor (run this ONCE if you already have place_collections with "order")

DO $$
BEGIN
  -- Column "order" (reserved word) may appear as 'order' in information_schema
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'place_collections' AND LOWER(column_name) = 'order'
  ) THEN
    ALTER TABLE place_collections RENAME COLUMN "order" TO sort_order;
    DROP INDEX IF EXISTS idx_place_collections_order;
    CREATE INDEX IF NOT EXISTS idx_place_collections_sort_order ON place_collections(collection_id, sort_order);
    COMMENT ON COLUMN place_collections.sort_order IS 'Display order within the collection (lower = first)';
  END IF;
END $$;

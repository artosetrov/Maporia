-- SQL script to optimize pagination and filtering performance
-- Execute this script in Supabase Dashboard > SQL Editor
-- These indexes will improve query performance for paginated place listings

-- ============================================
-- 1. Index for sorting by created_at (most common sort)
-- ============================================
CREATE INDEX IF NOT EXISTS places_created_at_desc_idx 
ON places(created_at DESC) 
WHERE created_at IS NOT NULL;

COMMENT ON INDEX places_created_at_desc_idx IS 'Optimizes sorting by created_at DESC for pagination';

-- ============================================
-- 2. Composite index for city filtering + sorting
-- ============================================
-- This helps when filtering by city_name_cached and sorting by created_at
CREATE INDEX IF NOT EXISTS places_city_name_cached_created_at_idx 
ON places(city_name_cached, created_at DESC) 
WHERE city_name_cached IS NOT NULL;

COMMENT ON INDEX places_city_name_cached_created_at_idx IS 'Optimizes city filtering with created_at sorting';

-- ============================================
-- 3. Composite index for city filtering (backward compatibility)
-- ============================================
CREATE INDEX IF NOT EXISTS places_city_created_at_idx 
ON places(city, created_at DESC) 
WHERE city IS NOT NULL;

COMMENT ON INDEX places_city_created_at_idx IS 'Optimizes legacy city field filtering with created_at sorting';

-- ============================================
-- 4. GIN index for categories array filtering
-- ============================================
-- This is crucial for filtering by categories (overlaps operator)
CREATE INDEX IF NOT EXISTS places_categories_gin_idx 
ON places USING GIN(categories) 
WHERE categories IS NOT NULL AND array_length(categories, 1) > 0;

COMMENT ON INDEX places_categories_gin_idx IS 'GIN index for efficient array overlap queries on categories';

-- ============================================
-- 5. GIN index for tags array filtering
-- ============================================
CREATE INDEX IF NOT EXISTS places_tags_gin_idx 
ON places USING GIN(tags) 
WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

COMMENT ON INDEX places_tags_gin_idx IS 'GIN index for efficient array contains queries on tags';

-- ============================================
-- 6. Enable pg_trgm extension for text search (if available)
-- ============================================
-- This extension enables trigram indexes for efficient ilike queries
-- Note: This may require superuser privileges in some databases
DO $$
BEGIN
  -- Try to create extension if it doesn't exist
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN insufficient_privilege THEN
    -- Extension creation requires superuser, skip if not available
    RAISE NOTICE 'pg_trgm extension cannot be created (requires superuser). Skipping trigram indexes.';
  WHEN OTHERS THEN
    -- Other errors - log and continue
    RAISE NOTICE 'Could not enable pg_trgm extension: %', SQLERRM;
END $$;

-- ============================================
-- 7. Index for text search (title, description) - only if pg_trgm is available
-- ============================================
-- Full-text search indexes for ilike queries using trigrams
-- These indexes significantly improve performance of ilike queries
DO $$
BEGIN
  -- Check if pg_trgm extension is available
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
  ) THEN
    -- Create trigram indexes for text search
    CREATE INDEX IF NOT EXISTS places_title_trgm_idx 
    ON places USING GIN(title gin_trgm_ops) 
    WHERE title IS NOT NULL;

    CREATE INDEX IF NOT EXISTS places_description_trgm_idx 
    ON places USING GIN(description gin_trgm_ops) 
    WHERE description IS NOT NULL;
    
    RAISE NOTICE 'Trigram indexes created successfully';
  ELSE
    RAISE NOTICE 'pg_trgm extension not available. Skipping trigram indexes. Text search will work but may be slower.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not create trigram indexes: %. Text search will work but may be slower.', SQLERRM;
END $$;

-- ============================================
-- 8. Composite index for common filter combinations
-- ============================================
-- Optimizes queries that filter by city AND sort by created_at
CREATE INDEX IF NOT EXISTS places_city_id_created_at_idx 
ON places(city_id, created_at DESC) 
WHERE city_id IS NOT NULL;

COMMENT ON INDEX places_city_id_created_at_idx IS 'Optimizes city_id filtering with created_at sorting';

-- ============================================
-- 9. Verify indexes were created
-- ============================================
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'places'
  AND indexname IN (
    'places_created_at_desc_idx',
    'places_city_name_cached_created_at_idx',
    'places_city_created_at_idx',
    'places_categories_gin_idx',
    'places_tags_gin_idx',
    'places_city_id_created_at_idx'
  )
ORDER BY indexname;

-- ============================================
-- 10. Analyze table to update statistics
-- ============================================
ANALYZE places;

-- ============================================
-- Summary
-- ============================================
-- This script creates indexes to optimize:
-- 1. Sorting by created_at (pagination)
-- 2. Filtering by city/city_name_cached + sorting
-- 3. Filtering by categories (array overlaps)
-- 4. Filtering by tags (array contains)
-- 5. Text search (if pg_trgm extension is available)
--
-- Note: If pg_trgm extension is not available, text search will still work
-- but may be slower on large datasets. Contact your database administrator
-- to enable pg_trgm extension for optimal performance.

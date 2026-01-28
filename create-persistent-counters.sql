-- ============================================
-- Persistent Counters for Places
-- ============================================
-- This script creates persistent counters for:
-- 1. Number of places per city (in cities.places_count)
-- 2. Number of places per category (in category_counts table)
--
-- Counters are automatically maintained via triggers on INSERT/UPDATE/DELETE
-- No runtime COUNT queries needed in the frontend!
-- ============================================

-- ============================================
-- 1. Add places_count column to cities table
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'cities' 
        AND column_name = 'places_count'
    ) THEN
        ALTER TABLE cities ADD COLUMN places_count INTEGER NOT NULL DEFAULT 0;
        COMMENT ON COLUMN cities.places_count IS 'Cached count of places in this city. Updated automatically via triggers.';
        
        -- Create index for faster filtering/sorting
        CREATE INDEX IF NOT EXISTS cities_places_count_idx ON cities(places_count);
    END IF;
END $$;

-- ============================================
-- 2. Create category_counts table
-- ============================================
CREATE TABLE IF NOT EXISTS category_counts (
    category TEXT PRIMARY KEY,
    places_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE category_counts IS 'Cached count of places per category. Updated automatically via triggers.';
COMMENT ON COLUMN category_counts.category IS 'Category name (e.g., "🍽 Food & Drinks")';
COMMENT ON COLUMN category_counts.places_count IS 'Number of places with this category';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS category_counts_places_count_idx ON category_counts(places_count);

-- ============================================
-- 3. Initialize category_counts with all known categories
-- ============================================
INSERT INTO category_counts (category, places_count)
VALUES 
    ('🍽 Food & Drinks', 0),
    ('🍸 Bars & Wine', 0),
    ('🌅 Scenic & Rooftop Views', 0),
    ('🌳 Nature & Walks', 0),
    ('🎭 Culture & History', 0),
    ('🛍 Shops & Markets', 0),
    ('🤫 Hidden & Unique', 0),
    ('✨ Vibe & Atmosphere', 0),
    ('👻 Crime & Haunted Spots', 0)
ON CONFLICT (category) DO NOTHING;

-- ============================================
-- 4. Function: Update city counter
-- ============================================
CREATE OR REPLACE FUNCTION update_city_places_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    old_city_id UUID;
    new_city_id UUID;
BEGIN
    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        old_city_id := OLD.city_id;
        IF old_city_id IS NOT NULL THEN
            UPDATE cities 
            SET places_count = GREATEST(0, places_count - 1)
            WHERE id = old_city_id;
        END IF;
        RETURN OLD;
    END IF;
    
    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        new_city_id := NEW.city_id;
        IF new_city_id IS NOT NULL THEN
            UPDATE cities 
            SET places_count = places_count + 1
            WHERE id = new_city_id;
        END IF;
        RETURN NEW;
    END IF;
    
    -- Handle UPDATE
    IF TG_OP = 'UPDATE' THEN
        old_city_id := OLD.city_id;
        new_city_id := NEW.city_id;
        
        -- City changed: decrement old, increment new
        IF old_city_id IS DISTINCT FROM new_city_id THEN
            -- Decrement old city (if exists)
            IF old_city_id IS NOT NULL THEN
                UPDATE cities 
                SET places_count = GREATEST(0, places_count - 1)
                WHERE id = old_city_id;
            END IF;
            
            -- Increment new city (if exists)
            IF new_city_id IS NOT NULL THEN
                UPDATE cities 
                SET places_count = places_count + 1
                WHERE id = new_city_id;
            END IF;
        END IF;
        
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION update_city_places_count IS 'Updates cities.places_count when places are inserted/updated/deleted. Prevents negative counts.';

-- ============================================
-- 5. Function: Update category counters
-- ============================================
CREATE OR REPLACE FUNCTION update_category_places_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    old_categories TEXT[];
    new_categories TEXT[];
    category_item TEXT;
BEGIN
    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        old_categories := COALESCE(OLD.categories, ARRAY[]::TEXT[]);
        
        -- Decrement count for each category
        FOREACH category_item IN ARRAY old_categories
        LOOP
            IF category_item IS NOT NULL AND TRIM(category_item) != '' THEN
                INSERT INTO category_counts (category, places_count)
                VALUES (category_item, 0)
                ON CONFLICT (category) DO UPDATE
                SET places_count = GREATEST(0, category_counts.places_count - 1),
                    updated_at = NOW();
            END IF;
        END LOOP;
        
        RETURN OLD;
    END IF;
    
    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        new_categories := COALESCE(NEW.categories, ARRAY[]::TEXT[]);
        
        -- Increment count for each category
        FOREACH category_item IN ARRAY new_categories
        LOOP
            IF category_item IS NOT NULL AND TRIM(category_item) != '' THEN
                INSERT INTO category_counts (category, places_count)
                VALUES (category_item, 1)
                ON CONFLICT (category) DO UPDATE
                SET places_count = category_counts.places_count + 1,
                    updated_at = NOW();
            END IF;
        END LOOP;
        
        RETURN NEW;
    END IF;
    
    -- Handle UPDATE
    IF TG_OP = 'UPDATE' THEN
        old_categories := COALESCE(OLD.categories, ARRAY[]::TEXT[]);
        new_categories := COALESCE(NEW.categories, ARRAY[]::TEXT[]);
        
        -- Only update if categories actually changed
        IF old_categories IS DISTINCT FROM new_categories THEN
            -- Decrement counts for removed categories
            FOREACH category_item IN ARRAY old_categories
            LOOP
                IF category_item IS NOT NULL 
                   AND TRIM(category_item) != '' 
                   AND NOT (category_item = ANY(new_categories)) THEN
                    INSERT INTO category_counts (category, places_count)
                    VALUES (category_item, 0)
                    ON CONFLICT (category) DO UPDATE
                    SET places_count = GREATEST(0, category_counts.places_count - 1),
                        updated_at = NOW();
                END IF;
            END LOOP;
            
            -- Increment counts for added categories
            FOREACH category_item IN ARRAY new_categories
            LOOP
                IF category_item IS NOT NULL 
                   AND TRIM(category_item) != '' 
                   AND NOT (category_item = ANY(old_categories)) THEN
                    INSERT INTO category_counts (category, places_count)
                    VALUES (category_item, 1)
                    ON CONFLICT (category) DO UPDATE
                    SET places_count = category_counts.places_count + 1,
                        updated_at = NOW();
                END IF;
            END LOOP;
        END IF;
        
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION update_category_places_count IS 'Updates category_counts when places categories are inserted/updated/deleted. Handles array diff correctly.';

-- ============================================
-- 6. Create triggers
-- ============================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_city_places_count ON places;
DROP TRIGGER IF EXISTS trigger_update_category_places_count ON places;

-- Create trigger for city counter
CREATE TRIGGER trigger_update_city_places_count
    AFTER INSERT OR UPDATE OF city_id OR DELETE ON places
    FOR EACH ROW
    EXECUTE FUNCTION update_city_places_count();

-- Create trigger for category counter
CREATE TRIGGER trigger_update_category_places_count
    AFTER INSERT OR UPDATE OF categories OR DELETE ON places
    FOR EACH ROW
    EXECUTE FUNCTION update_category_places_count();

-- ============================================
-- 7. Initialize counters from existing data
-- ============================================
-- This one-time operation populates counters with current data

-- Initialize city counters
UPDATE cities
SET places_count = (
    SELECT COUNT(*)
    FROM places
    WHERE places.city_id = cities.id
);

-- Initialize category counters
WITH category_occurrences AS (
    SELECT unnest(categories) AS category
    FROM places
    WHERE categories IS NOT NULL AND array_length(categories, 1) > 0
)
INSERT INTO category_counts (category, places_count)
SELECT category, COUNT(*)::INTEGER
FROM category_occurrences
WHERE category IS NOT NULL AND TRIM(category) != ''
GROUP BY category
ON CONFLICT (category) DO UPDATE
SET places_count = EXCLUDED.places_count,
    updated_at = NOW();

-- ============================================
-- 8. RLS Policies for category_counts
-- ============================================
ALTER TABLE category_counts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read category counts
CREATE POLICY "Category counts are readable by everyone"
ON category_counts
FOR SELECT
TO public
USING (true);

-- Policy: Only system (via triggers) can update category counts
-- Regular users should not modify counts directly
CREATE POLICY "Only system can update category counts"
ON category_counts
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Only system can insert category counts
CREATE POLICY "Only system can insert category counts"
ON category_counts
FOR INSERT
TO service_role
WITH CHECK (true);

-- ============================================
-- 9. Verification queries
-- ============================================
-- Run these to verify counters are correct:

-- Check city counts
SELECT 
    c.id,
    c.name,
    c.places_count,
    (SELECT COUNT(*) FROM places WHERE city_id = c.id) AS actual_count,
    c.places_count - (SELECT COUNT(*) FROM places WHERE city_id = c.id) AS difference
FROM cities c
WHERE c.places_count != (SELECT COUNT(*) FROM places WHERE city_id = c.id)
ORDER BY difference DESC;

-- Check category counts
SELECT 
    cc.category,
    cc.places_count,
    (SELECT COUNT(*) 
     FROM places 
     WHERE categories IS NOT NULL 
       AND category = ANY(categories)
    ) AS actual_count,
    cc.places_count - (
        SELECT COUNT(*) 
        FROM places 
        WHERE categories IS NOT NULL 
          AND category = ANY(categories)
    ) AS difference
FROM category_counts cc
WHERE cc.places_count != (
    SELECT COUNT(*) 
    FROM places 
    WHERE categories IS NOT NULL 
      AND category = ANY(categories)
)
ORDER BY difference DESC;

-- Summary
SELECT 
    'Cities with counters' AS metric,
    COUNT(*) AS count
FROM cities
WHERE places_count >= 0;

SELECT 
    'Categories with counters' AS metric,
    COUNT(*) AS count
FROM category_counts
WHERE places_count >= 0;

SELECT 
    'Total places in cities counters' AS metric,
    SUM(places_count) AS total
FROM cities;

SELECT 
    'Total category occurrences' AS metric,
    SUM(places_count) AS total
FROM category_counts;

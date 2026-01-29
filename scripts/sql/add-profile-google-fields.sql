-- SQL script to add Google Maps integration fields to profiles table
-- Execute this script in Supabase Dashboard > SQL Editor

-- 1. Add google_place_id field (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'google_place_id'
    ) THEN
        ALTER TABLE profiles ADD COLUMN google_place_id TEXT;
        COMMENT ON COLUMN profiles.google_place_id IS 'Google Places API place_id';
    END IF;
END $$;

-- 2. Add google_maps_url field (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'google_maps_url'
    ) THEN
        ALTER TABLE profiles ADD COLUMN google_maps_url TEXT;
        COMMENT ON COLUMN profiles.google_maps_url IS 'Original Google Maps URL used for import';
    END IF;
END $$;

-- 3. Add google_rating field (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'google_rating'
    ) THEN
        ALTER TABLE profiles ADD COLUMN google_rating NUMERIC(3, 2);
        COMMENT ON COLUMN profiles.google_rating IS 'Google Places rating (0-5)';
    END IF;
END $$;

-- 4. Add google_reviews_count field (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'google_reviews_count'
    ) THEN
        ALTER TABLE profiles ADD COLUMN google_reviews_count INTEGER;
        COMMENT ON COLUMN profiles.google_reviews_count IS 'Number of Google reviews';
    END IF;
END $$;

-- 5. Add google_opening_hours field (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'google_opening_hours'
    ) THEN
        ALTER TABLE profiles ADD COLUMN google_opening_hours JSONB;
        COMMENT ON COLUMN profiles.google_opening_hours IS 'Google Places opening hours (JSON)';
    END IF;
END $$;

-- 6. Add website field (if it doesn't exist) - for business websites
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'website'
    ) THEN
        ALTER TABLE profiles ADD COLUMN website TEXT;
        COMMENT ON COLUMN profiles.website IS 'Business website URL';
    END IF;
END $$;

-- 7. Add phone field (if it doesn't exist) - for business phone numbers
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'phone'
    ) THEN
        ALTER TABLE profiles ADD COLUMN phone TEXT;
        COMMENT ON COLUMN profiles.phone IS 'Business phone number';
    END IF;
END $$;

-- 8. Add address field (if it doesn't exist) - for business address
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'address'
    ) THEN
        ALTER TABLE profiles ADD COLUMN address TEXT;
        COMMENT ON COLUMN profiles.address IS 'Business address';
    END IF;
END $$;

-- 9. Verify the changes
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN (
    'google_place_id',
    'google_maps_url',
    'google_rating',
    'google_reviews_count',
    'google_opening_hours',
    'website',
    'phone',
    'address'
)
ORDER BY column_name;

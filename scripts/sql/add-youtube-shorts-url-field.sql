-- Add youtube_shorts_url field to places table for YouTube Shorts support
-- Execute this script in Supabase Dashboard > SQL Editor

-- ============================================
-- Add youtube_shorts_url field (if it doesn't exist)
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'places' 
        AND column_name = 'youtube_shorts_url'
    ) THEN
        ALTER TABLE places ADD COLUMN youtube_shorts_url TEXT;
        COMMENT ON COLUMN places.youtube_shorts_url IS 'YouTube Shorts URL (https://www.youtube.com/shorts/...)';
    END IF;
END $$;

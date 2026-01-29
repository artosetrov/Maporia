-- Add video_url field to places table for Instagram Reel support
-- Execute this script in Supabase Dashboard > SQL Editor

-- ============================================
-- Add video_url field (if it doesn't exist)
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'places' 
        AND column_name = 'video_url'
    ) THEN
        ALTER TABLE places ADD COLUMN video_url TEXT;
        COMMENT ON COLUMN places.video_url IS 'Instagram Reel URL (https://www.instagram.com/reel/...)';
    END IF;
END $$;

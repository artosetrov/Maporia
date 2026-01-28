-- Add status field to places table for draft/published states
-- Execute this script in Supabase Dashboard > SQL Editor

DO $$ 
BEGIN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'places' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE places 
        ADD COLUMN status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published'));
        
        -- Create index for faster queries
        CREATE INDEX IF NOT EXISTS places_status_idx ON places(status);
        
        -- Update existing places to 'published' status
        UPDATE places SET status = 'published' WHERE status IS NULL;
        
        -- Make status NOT NULL after setting defaults
        ALTER TABLE places ALTER COLUMN status SET NOT NULL;
        
        COMMENT ON COLUMN places.status IS 'Place status: draft (not published) or published (visible to users)';
    END IF;
END $$;

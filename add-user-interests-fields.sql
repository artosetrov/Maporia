-- Add favorite_categories and favorite_tags fields to profiles table
-- These fields store user interests for personalized recommendations

-- Add favorite_categories field (array of category strings)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS favorite_categories TEXT[] DEFAULT '{}';

-- Add favorite_tags field (array of tag strings)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS favorite_tags TEXT[] DEFAULT '{}';

-- Add comments
COMMENT ON COLUMN profiles.favorite_categories IS 'Array of category names that user is interested in (e.g., ["🍽 Food & Drinks", "🌅 Scenic & Rooftop Views"])';
COMMENT ON COLUMN profiles.favorite_tags IS 'Array of tag names that user is interested in (e.g., ["romantic", "sunset"])';

-- Create indexes for faster queries when filtering by interests
CREATE INDEX IF NOT EXISTS profiles_favorite_categories_idx ON profiles USING GIN(favorite_categories);
CREATE INDEX IF NOT EXISTS profiles_favorite_tags_idx ON profiles USING GIN(favorite_tags);

-- Create tags table for storing all available tags
-- This allows tags to exist independently of places

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS tags_name_idx ON tags(name);

-- Create index for case-insensitive lookups (useful for duplicate checking)
CREATE INDEX IF NOT EXISTS tags_name_lower_idx ON tags(LOWER(name));

-- Add comment
COMMENT ON TABLE tags IS 'Stores all available tags that can be assigned to places';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON tags
  FOR EACH ROW
  EXECUTE FUNCTION update_tags_updated_at();

-- Enable RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read tags (for selecting when editing places)
CREATE POLICY "Tags are readable by everyone"
  ON tags FOR SELECT
  USING (true);

-- RLS Policy: Only admins can insert/update/delete tags
CREATE POLICY "Tags are manageable by admins only"
  ON tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

-- Add optional emoji column to tags table (for custom emoji per tag)
ALTER TABLE tags ADD COLUMN IF NOT EXISTS emoji TEXT;
COMMENT ON COLUMN tags.emoji IS 'Optional emoji for the tag; used in UI when set, otherwise fallback from app constants';

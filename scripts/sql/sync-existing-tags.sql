-- Sync existing tags from places.tags to tags table
-- This should be run after creating the tags table

-- Insert all unique tags from places.tags into tags table
-- Ignore duplicates (ON CONFLICT DO NOTHING)
INSERT INTO tags (name)
SELECT DISTINCT unnest(tags)::text as tag_name
FROM places
WHERE tags IS NOT NULL
  AND array_length(tags, 1) > 0
ON CONFLICT (name) DO NOTHING;

-- Verify the sync
SELECT COUNT(*) as total_tags FROM tags;
SELECT name FROM tags ORDER BY name;

-- Add category_ids column to tags table for tag-to-category mapping
ALTER TABLE tags ADD COLUMN IF NOT EXISTS category_ids TEXT[] DEFAULT '{}';

-- GIN index for fast overlaps/contains queries
CREATE INDEX IF NOT EXISTS tags_category_ids_idx ON tags USING GIN (category_ids);

COMMENT ON COLUMN tags.category_ids IS 'Array of category names this tag belongs to, derived from places data';

-- Initial sync: populate category_ids from places data
UPDATE tags t
SET category_ids = COALESCE(sub.cats, '{}')
FROM (
  SELECT tag_name, ARRAY_AGG(DISTINCT cat ORDER BY cat) AS cats
  FROM places p,
       LATERAL unnest(p.tags) AS tag_name,
       LATERAL unnest(p.categories) AS cat
  WHERE p.tags IS NOT NULL AND p.categories IS NOT NULL
  GROUP BY tag_name
) sub
WHERE t.name = sub.tag_name;

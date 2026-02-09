-- Trigger function to auto-sync tags.category_ids when places change
CREATE OR REPLACE FUNCTION sync_tag_categories()
RETURNS TRIGGER AS $$
DECLARE
  affected_tags TEXT[];
BEGIN
  affected_tags := '{}';

  -- Collect tags from OLD record (UPDATE/DELETE)
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    affected_tags := affected_tags || COALESCE(OLD.tags, '{}');
  END IF;

  -- Collect tags from NEW record (INSERT/UPDATE)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    affected_tags := affected_tags || COALESCE(NEW.tags, '{}');
  END IF;

  -- Remove duplicates and update category_ids for affected tags
  IF array_length(affected_tags, 1) > 0 THEN
    UPDATE tags t
    SET category_ids = COALESCE((
      SELECT ARRAY_AGG(DISTINCT cat ORDER BY cat)
      FROM places p, LATERAL unnest(p.categories) AS cat
      WHERE t.name = ANY(p.tags)
        AND p.categories IS NOT NULL
    ), '{}')
    WHERE t.name = ANY(affected_tags);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on places table
DROP TRIGGER IF EXISTS sync_tag_categories_on_places_change ON places;
CREATE TRIGGER sync_tag_categories_on_places_change
  AFTER INSERT OR UPDATE OF tags, categories OR DELETE ON places
  FOR EACH ROW EXECUTE FUNCTION sync_tag_categories();

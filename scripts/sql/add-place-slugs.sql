-- Add stable public slugs for creator-facing listing links.
-- Enables URLs like https://www.maporia.co/little-havana-food-walk
-- while keeping /id/<uuid> as the canonical fallback.

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE OR REPLACE FUNCTION public.maporia_slugify(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  slug TEXT;
BEGIN
  slug := lower(coalesce(input, ''));
  slug := regexp_replace(slug, '[^a-z0-9]+', '-', 'g');
  slug := trim(both '-' from slug);
  slug := regexp_replace(slug, '-{2,}', '-', 'g');
  slug := left(slug, 80);
  slug := trim(both '-' from slug);

  IF length(slug) < 3 THEN
    RETURN NULL;
  END IF;

  RETURN slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.maporia_next_place_slug(input TEXT, place_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  base TEXT;
  candidate TEXT;
  suffix TEXT;
  counter INTEGER := 2;
BEGIN
  base := public.maporia_slugify(input);

  IF base IS NULL THEN
    base := 'listing';
  END IF;

  candidate := base;

  WHILE EXISTS (
    SELECT 1
    FROM public.places
    WHERE slug = candidate
      AND (place_id IS NULL OR id <> place_id)
  ) LOOP
    suffix := '-' || counter::TEXT;
    candidate := left(base, 80 - length(suffix)) || suffix;
    counter := counter + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.maporia_set_place_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.slug := public.maporia_next_place_slug(NEW.title, NEW.id);
    ELSIF OLD.slug IS NULL THEN
      NEW.slug := public.maporia_next_place_slug(NEW.title, NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  normalized := public.maporia_slugify(NEW.slug);
  IF normalized IS NULL THEN
    RAISE EXCEPTION 'Invalid place slug. Use at least 3 letters/numbers with optional hyphens.';
  END IF;

  NEW.slug := public.maporia_next_place_slug(normalized, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS places_set_slug ON public.places;
CREATE TRIGGER places_set_slug
BEFORE INSERT OR UPDATE OF slug, title
ON public.places
FOR EACH ROW
EXECUTE FUNCTION public.maporia_set_place_slug();

UPDATE public.places
SET slug = public.maporia_next_place_slug(title, id)
WHERE slug IS NULL
  AND title IS NOT NULL
  AND btrim(title) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS places_slug_unique_idx
  ON public.places (slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS places_slug_lookup_idx
  ON public.places (slug)
  WHERE slug IS NOT NULL
    AND coalesce(is_hidden, false) = false;

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_slug_format_check;

ALTER TABLE public.places
  ADD CONSTRAINT places_slug_format_check
  CHECK (
    slug IS NULL
    OR slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'
  );

COMMENT ON COLUMN public.places.slug IS 'Stable creator-facing public URL slug. Root route /<slug> redirects to /id/<uuid>.';

-- Add configurable public detail page layouts for places.
-- Default remains the current standard layout. Use `story` for read/photo-led
-- locations such as Devil's Tree.

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS place_page_layout TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_place_page_layout_check;

ALTER TABLE public.places
  ADD CONSTRAINT places_place_page_layout_check
  CHECK (place_page_layout IN ('standard', 'story'));

CREATE INDEX IF NOT EXISTS places_place_page_layout_idx
  ON public.places (place_page_layout)
  WHERE coalesce(is_hidden, false) = false;

COMMENT ON COLUMN public.places.place_page_layout IS
  'Public detail page layout: standard for regular listings, story for photo/read-led locations.';

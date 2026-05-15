-- Fix place editor schema drift and admin edit access.
--
-- Run in Supabase SQL Editor for the active Maporia project.
-- Safe to rerun: column/constraint/policy operations are idempotent.

-- 1. Pricing-menu schema expected by service/experience editors.
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS price_options jsonb;

COMMENT ON COLUMN public.places.price_options IS
  'Optional array of service/experience pricing menu options. Supports legacy {label, amount, currency, unit, note} plus group_label, compare_at_amount, duration_minutes, badge, is_featured, and sort_order. Primary summary price remains price_amount/price_currency/price_unit.';

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_price_options_array_check;

ALTER TABLE public.places
  ADD CONSTRAINT places_price_options_array_check
  CHECK (
    price_options IS NULL OR jsonb_typeof(price_options) = 'array'
  );

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_price_unit_check;

ALTER TABLE public.places
  ADD CONSTRAINT places_price_unit_check
  CHECK (
    price_unit IS NULL OR
    price_unit IN (
      'fixed',
      'from',
      'per_hour',
      'per_person',
      'per_day',
      'per_month',
      'per_session'
    )
  );

-- 2. Private admin helper for RLS policies.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND (p.is_admin = true OR p.role = 'admin')
  );
$$;

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO service_role;

-- 3. Places: admin can see, update, and delete any listing.
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view any place" ON public.places;
CREATE POLICY "Admins can view any place"
ON public.places
FOR SELECT
TO authenticated
USING ((SELECT private.is_admin()) = true);

DROP POLICY IF EXISTS "Admins can update any place" ON public.places;
CREATE POLICY "Admins can update any place"
ON public.places
FOR UPDATE
TO authenticated
USING ((SELECT private.is_admin()) = true)
WITH CHECK ((SELECT private.is_admin()) = true);

DROP POLICY IF EXISTS "Admins can delete any place" ON public.places;
CREATE POLICY "Admins can delete any place"
ON public.places
FOR DELETE
TO authenticated
USING ((SELECT private.is_admin()) = true);

-- 4. Place photos: admin can manage photos for any listing.
ALTER TABLE public.place_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can insert any place photos" ON public.place_photos;
CREATE POLICY "Admins can insert any place photos"
ON public.place_photos
FOR INSERT
TO authenticated
WITH CHECK ((SELECT private.is_admin()) = true);

DROP POLICY IF EXISTS "Admins can update any place photos" ON public.place_photos;
CREATE POLICY "Admins can update any place photos"
ON public.place_photos
FOR UPDATE
TO authenticated
USING ((SELECT private.is_admin()) = true)
WITH CHECK ((SELECT private.is_admin()) = true);

DROP POLICY IF EXISTS "Admins can delete any place photos" ON public.place_photos;
CREATE POLICY "Admins can delete any place photos"
ON public.place_photos
FOR DELETE
TO authenticated
USING ((SELECT private.is_admin()) = true);

-- 5. Place links: admin can manage host/link relationships for any listing.
ALTER TABLE public.place_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view any place links" ON public.place_links;
CREATE POLICY "Admins can view any place links"
ON public.place_links
FOR SELECT
TO authenticated
USING ((SELECT private.is_admin()) = true);

DROP POLICY IF EXISTS "Admins can insert any place links" ON public.place_links;
CREATE POLICY "Admins can insert any place links"
ON public.place_links
FOR INSERT
TO authenticated
WITH CHECK ((SELECT private.is_admin()) = true);

DROP POLICY IF EXISTS "Admins can update any place links" ON public.place_links;
CREATE POLICY "Admins can update any place links"
ON public.place_links
FOR UPDATE
TO authenticated
USING ((SELECT private.is_admin()) = true)
WITH CHECK ((SELECT private.is_admin()) = true);

DROP POLICY IF EXISTS "Admins can delete any place links" ON public.place_links;
CREATE POLICY "Admins can delete any place links"
ON public.place_links
FOR DELETE
TO authenticated
USING ((SELECT private.is_admin()) = true);

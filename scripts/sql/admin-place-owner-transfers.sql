-- Audit table for admin owner transfers.
--
-- Run in Supabase SQL Editor. Safe to rerun.

CREATE TABLE IF NOT EXISTS public.admin_place_owner_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  old_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_place_owner_transfers_place_id_idx
  ON public.admin_place_owner_transfers(place_id);

CREATE INDEX IF NOT EXISTS admin_place_owner_transfers_admin_id_idx
  ON public.admin_place_owner_transfers(admin_id);

ALTER TABLE public.admin_place_owner_transfers ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Admins can view owner transfer audit" ON public.admin_place_owner_transfers;
CREATE POLICY "Admins can view owner transfer audit"
ON public.admin_place_owner_transfers
FOR SELECT
TO authenticated
USING ((SELECT private.is_admin()) = true);

DROP POLICY IF EXISTS "Service role can write owner transfer audit" ON public.admin_place_owner_transfers;
CREATE POLICY "Service role can write owner transfer audit"
ON public.admin_place_owner_transfers
FOR INSERT
TO service_role
WITH CHECK (true);

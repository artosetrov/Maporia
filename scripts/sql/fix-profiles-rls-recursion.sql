-- Fix profiles UPDATE RLS recursion.
--
-- Problem:
--   A profiles policy must not read public.profiles directly. When Postgres
--   evaluates that policy, reading the same RLS-protected relation can recurse:
--   "infinite recursion detected in policy for relation \"profiles\"".
--
-- This keeps the existing protection that users cannot change their own
-- role/is_admin fields, but moves the current-value lookup into a private
-- SECURITY DEFINER helper as recommended by Supabase RLS docs.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.current_profile_role_guard()
RETURNS TABLE(role text, is_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role, p.is_admin
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.current_profile_role_guard() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_profile_role_guard() TO authenticated;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK (
  ((SELECT auth.uid()) = id)
  AND role IS NOT DISTINCT FROM (
    SELECT guard.role
    FROM private.current_profile_role_guard() AS guard
  )
  AND is_admin IS NOT DISTINCT FROM (
    SELECT guard.is_admin
    FROM private.current_profile_role_guard() AS guard
  )
);

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY policyname, cmd;

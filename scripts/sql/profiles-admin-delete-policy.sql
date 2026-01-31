-- Allow admins to delete user profiles (fix: admin delete user not working)
-- Run this in Supabase SQL Editor if admin delete fails with RLS.

-- Ensure is_admin() exists (from setup-admin / rls-role-based-policies)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  );
$$;

-- Drop if already added (idempotent)
DROP POLICY IF EXISTS "Admins can delete any profile" ON profiles;

-- Admins can delete any profile
CREATE POLICY "Admins can delete any profile"
ON profiles
FOR DELETE
USING (is_admin() = TRUE);

-- Verify
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'DELETE';

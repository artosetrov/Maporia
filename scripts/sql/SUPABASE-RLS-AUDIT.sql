-- ============================================
-- Supabase RLS Policy Audit Queries
-- ============================================
-- Run these queries in Supabase Dashboard → SQL Editor
-- to verify Row-Level Security policies for all tables

-- 1. Check RLS status for all public tables
-- ============================================
SELECT 
  schemaname,
  tablename,
  rowsecurity as "RLS Enabled",
  CASE 
    WHEN rowsecurity THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as "Status"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. List all policies for each table
-- ============================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as "Command",
  qual as "USING Expression",
  with_check as "WITH CHECK Expression"
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Check policies for PLACES table
-- ============================================
SELECT 
  policyname,
  cmd,
  CASE cmd
    WHEN 'SELECT' THEN 'Read access'
    WHEN 'INSERT' THEN 'Create access'
    WHEN 'UPDATE' THEN 'Update access'
    WHEN 'DELETE' THEN 'Delete access'
    ELSE cmd
  END as "Access Type",
  qual as "Policy Condition"
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'places'
ORDER BY cmd, policyname;

-- 4. Check policies for PROFILES table
-- ============================================
SELECT 
  policyname,
  cmd,
  CASE cmd
    WHEN 'SELECT' THEN 'Read access'
    WHEN 'INSERT' THEN 'Create access'
    WHEN 'UPDATE' THEN 'Update access'
    WHEN 'DELETE' THEN 'Delete access'
    ELSE cmd
  END as "Access Type",
  qual as "Policy Condition"
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'profiles'
ORDER BY cmd, policyname;

-- 5. Check policies for CITIES table
-- ============================================
SELECT 
  policyname,
  cmd,
  qual as "Policy Condition"
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'cities'
ORDER BY cmd, policyname;

-- 6. Check policies for COMMENTS table
-- ============================================
SELECT 
  policyname,
  cmd,
  qual as "Policy Condition"
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'comments'
ORDER BY cmd, policyname;

-- 7. Check policies for REACTIONS table
-- ============================================
SELECT 
  policyname,
  cmd,
  qual as "Policy Condition"
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'reactions'
ORDER BY cmd, policyname;

-- 8. Check policies for PLACE_PHOTOS table
-- ============================================
SELECT 
  policyname,
  cmd,
  qual as "Policy Condition"
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'place_photos'
ORDER BY cmd, policyname;

-- 9. Check policies for APP_SETTINGS table
-- ============================================
SELECT 
  policyname,
  cmd,
  qual as "Policy Condition"
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'app_settings'
ORDER BY cmd, policyname;

-- 10. Verify helper functions exist
-- ============================================
SELECT 
  routine_name as "Function Name",
  routine_type as "Type",
  CASE 
    WHEN security_type = 'DEFINER' THEN '✅ SECURITY DEFINER'
    ELSE security_type
  END as "Security Type"
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'is_admin',
    'has_premium_access',
    'get_user_role',
    'get_or_create_city',
    'update_premium_modal_settings'
  )
ORDER BY routine_name;

-- 11. Check for tables without RLS enabled
-- ============================================
SELECT 
  tablename,
  '❌ RLS NOT ENABLED' as "Warning"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
      AND rowsecurity = true
  )
ORDER BY tablename;

-- 12. Check for tables without any policies
-- ============================================
SELECT 
  t.tablename,
  '⚠️ NO POLICIES' as "Warning"
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND NOT EXISTS (
    SELECT 1 
    FROM pg_policies p 
    WHERE p.schemaname = 'public' 
      AND p.tablename = t.tablename
  )
ORDER BY t.tablename;

-- ============================================
-- Expected Policies Summary
-- ============================================
-- 
-- PLACES table should have:
--   SELECT: Public places (everyone), Premium places (premium users/admins), Own places (owners)
--   INSERT: Authenticated users (public), Premium users/admins (premium)
--   UPDATE: Owners, Admins
--   DELETE: Owners, Admins
--
-- PROFILES table should have:
--   SELECT: Public profiles (everyone), Own profile (user)
--   INSERT: Authenticated users (own profile)
--   UPDATE: Own profile, Admins
--   DELETE: Own profile, Admins
--
-- CITIES table should have:
--   SELECT: Public (everyone)
--   INSERT: Authenticated users (via RPC function)
--   UPDATE: Admins only
--   DELETE: Admins only
--
-- COMMENTS table should have:
--   SELECT: Public (everyone)
--   INSERT: Authenticated users
--   UPDATE: Own comments, Admins
--   DELETE: Own comments, Admins
--
-- REACTIONS table should have:
--   SELECT: Public (everyone)
--   INSERT: Authenticated users
--   UPDATE: Own reactions
--   DELETE: Own reactions
--
-- PLACE_PHOTOS table should have:
--   SELECT: Public (everyone)
--   INSERT: Place owners, Admins
--   UPDATE: Place owners, Admins
--   DELETE: Place owners, Admins
--
-- APP_SETTINGS table should have:
--   SELECT: Public (everyone) - or Admins only
--   INSERT: Admins only (via RPC function)
--   UPDATE: Admins only (via RPC function)
--   DELETE: Admins only

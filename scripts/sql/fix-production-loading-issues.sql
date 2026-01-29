-- SQL script to fix production loading issues
-- Execute this script in Supabase Dashboard > SQL Editor
-- This ensures that public places are readable by everyone (including unauthenticated users)

-- ============================================
-- 1. Check current RLS policies for places
-- ============================================
SELECT 
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'places' AND cmd = 'SELECT'
ORDER BY policyname;

-- ============================================
-- 2. Ensure RLS is enabled
-- ============================================
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. Drop existing SELECT policies that might be too restrictive
-- ============================================
DROP POLICY IF EXISTS "Public places are viewable by everyone" ON places;
DROP POLICY IF EXISTS "Places are viewable by everyone" ON places;
DROP POLICY IF EXISTS "Anyone can view public places" ON places;

-- ============================================
-- 4. Create a simple policy: Everyone can view all places
-- ============================================
-- This is the most permissive policy for SELECT
-- Adjust later if you need to restrict premium places
CREATE POLICY "Anyone can view all places"
ON places
FOR SELECT
TO public
USING (true);

-- ============================================
-- 5. Also ensure cities table is readable
-- ============================================
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cities are readable by everyone" ON cities;
CREATE POLICY "Cities are readable by everyone"
ON cities
FOR SELECT
TO public
USING (true);

-- ============================================
-- 6. Ensure place_photos is readable
-- ============================================
ALTER TABLE place_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Place photos are viewable by everyone" ON place_photos;
CREATE POLICY "Place photos are viewable by everyone"
ON place_photos
FOR SELECT
TO public
USING (true);

-- ============================================
-- 7. Verify policies
-- ============================================
SELECT 
  'places' as table_name,
  policyname,
  cmd,
  roles
FROM pg_policies 
WHERE tablename = 'places' AND cmd = 'SELECT';

SELECT 
  'cities' as table_name,
  policyname,
  cmd,
  roles
FROM pg_policies 
WHERE tablename = 'cities' AND cmd = 'SELECT';

SELECT 
  'place_photos' as table_name,
  policyname,
  cmd,
  roles
FROM pg_policies 
WHERE tablename = 'place_photos' AND cmd = 'SELECT';

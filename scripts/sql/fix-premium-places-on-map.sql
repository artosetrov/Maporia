-- SQL script to ensure premium places are loaded for list view
-- Execute this script in Supabase Dashboard > SQL Editor
-- This ensures that ALL places (including premium) are visible to everyone in queries
-- Premium places will be shown in list view as locked with pseudo names
-- Premium places will be filtered out on the map for non-premium users (client-side filtering)

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
-- 3. Drop existing SELECT policies that filter premium places
-- ============================================
DROP POLICY IF EXISTS "Public places are viewable by everyone" ON places;
DROP POLICY IF EXISTS "Premium places viewable by premium users and admins" ON places;
DROP POLICY IF EXISTS "Users can view their own places" ON places;
DROP POLICY IF EXISTS "Anyone can view all places" ON places;
DROP POLICY IF EXISTS "Places are viewable by everyone" ON places;
DROP POLICY IF EXISTS "Anyone can view public places" ON places;

-- ============================================
-- 4. Create a policy: Everyone can view ALL places (including premium)
-- ============================================
-- This allows all users (including guests) to see all places
-- Premium places will be shown as locked with "Haunted Gem #..." names on the client side
CREATE POLICY "Anyone can view all places including premium"
ON places
FOR SELECT
TO public
USING (true);

-- ============================================
-- 5. Verify the policy was created
-- ============================================
SELECT 
  policyname,
  cmd,
  roles,
  qual
FROM pg_policies 
WHERE tablename = 'places' AND cmd = 'SELECT'
ORDER BY policyname;

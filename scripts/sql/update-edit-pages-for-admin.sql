-- SQL script to verify admin can edit/delete any place
-- The RLS policies should already allow this, but this script verifies them

-- Check UPDATE policies for places
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'places' 
AND cmd = 'UPDATE'
ORDER BY policyname;

-- Check DELETE policies for places
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'places' 
AND cmd = 'DELETE'
ORDER BY policyname;

-- Verify is_admin() function exists
SELECT 
    proname,
    prosrc
FROM pg_proc 
WHERE proname = 'is_admin';

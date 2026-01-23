-- SQL script for role-based RLS policies
-- Execute this script in Supabase Dashboard > SQL Editor
-- This implements access control based on user roles: guest, standard, premium, admin

-- 0. Ensure access_level column exists in places table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'places' 
        AND column_name = 'access_level'
    ) THEN
        ALTER TABLE places ADD COLUMN access_level TEXT DEFAULT 'public' CHECK (access_level IN ('public', 'premium'));
        COMMENT ON COLUMN places.access_level IS 'Access level: public or premium';
    END IF;
END $$;

-- 1. Ensure helper functions exist
-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM profiles 
        WHERE id = auth.uid() 
        AND (is_admin = TRUE OR role = 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has premium access
CREATE OR REPLACE FUNCTION has_premium_access()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM profiles 
        WHERE id = auth.uid() 
        AND (
            role IN ('premium', 'admin')
            OR subscription_status = 'active'
            OR is_admin = TRUE
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM profiles
    WHERE id = auth.uid();
    
    RETURN COALESCE(user_role, 'guest');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. PLACES TABLE - SELECT policies
-- Drop existing SELECT policies if they exist
DROP POLICY IF EXISTS "Public places are viewable by everyone" ON places;
DROP POLICY IF EXISTS "Premium places viewable by premium users and admins" ON places;
DROP POLICY IF EXISTS "Users can view their own places" ON places;

-- Policy: Everyone (including guests) can view public places
CREATE POLICY "Public places are viewable by everyone"
ON places
FOR SELECT
USING (
    (access_level IS NULL OR access_level != 'premium')
);

-- Policy: Premium places viewable by premium users, admins, and place owners
CREATE POLICY "Premium places viewable by premium users and admins"
ON places
FOR SELECT
USING (
    access_level = 'premium'
    AND (
        has_premium_access() = TRUE
        OR auth.uid() = created_by
    )
);

-- Policy: Users can always view their own places (regardless of access level)
CREATE POLICY "Users can view their own places"
ON places
FOR SELECT
USING (auth.uid() = created_by);

-- 3. PLACES TABLE - INSERT policies
DROP POLICY IF EXISTS "Authenticated users can create public places" ON places;
DROP POLICY IF EXISTS "Premium users and admins can create premium places" ON places;

-- Policy: Authenticated users (standard, premium, admin) can create public places
CREATE POLICY "Authenticated users can create public places"
ON places
FOR INSERT
WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
        access_level IS NULL
        OR access_level != 'premium'
    )
);

-- Policy: Premium users and admins can create premium places
CREATE POLICY "Premium users and admins can create premium places"
ON places
FOR INSERT
WITH CHECK (
    auth.uid() IS NOT NULL
    AND has_premium_access() = TRUE
    AND access_level = 'premium'
);

-- 4. PLACES TABLE - UPDATE policies
DROP POLICY IF EXISTS "Users can update their own places" ON places;
DROP POLICY IF EXISTS "Admins can update any place" ON places;
DROP POLICY IF EXISTS "Standard users cannot upgrade to premium" ON places;

-- Policy: Users can update their own places
CREATE POLICY "Users can update their own places"
ON places
FOR UPDATE
USING (auth.uid() = created_by)
WITH CHECK (
    auth.uid() = created_by
    AND (
        -- Standard users cannot change public places to premium
        (
            get_user_role() != 'standard'
            OR (
                access_level IS NULL OR access_level != 'premium'
            )
        )
        -- Or if already premium, only premium/admin can keep it premium
        OR (
            access_level = 'premium'
            AND has_premium_access() = TRUE
        )
    )
);

-- Policy: Admins can update any place
CREATE POLICY "Admins can update any place"
ON places
FOR UPDATE
USING (is_admin() = TRUE)
WITH CHECK (is_admin() = TRUE);

-- 5. PLACES TABLE - DELETE policies
DROP POLICY IF EXISTS "Users can delete their own places" ON places;
DROP POLICY IF EXISTS "Admins can delete any place" ON places;

-- Policy: Users can delete their own places
CREATE POLICY "Users can delete their own places"
ON places
FOR DELETE
USING (auth.uid() = created_by);

-- Policy: Admins can delete any place
CREATE POLICY "Admins can delete any place"
ON places
FOR DELETE
USING (is_admin() = TRUE);

-- 6. REACTIONS TABLE (likes/favorites) - Only authenticated users
DROP POLICY IF EXISTS "Authenticated users can like places" ON reactions;
DROP POLICY IF EXISTS "Users can view their own reactions" ON reactions;
DROP POLICY IF EXISTS "Users can delete their own reactions" ON reactions;

-- Policy: Authenticated users can create reactions (likes)
CREATE POLICY "Authenticated users can like places"
ON reactions
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Policy: Users can view their own reactions
CREATE POLICY "Users can view their own reactions"
ON reactions
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can delete their own reactions
CREATE POLICY "Users can delete their own reactions"
ON reactions
FOR DELETE
USING (auth.uid() = user_id);

-- 7. COMMENTS TABLE - Only authenticated users
DROP POLICY IF EXISTS "Authenticated users can comment" ON comments;
DROP POLICY IF EXISTS "Everyone can view comments on public places" ON comments;
DROP POLICY IF EXISTS "Premium users can view comments on premium places" ON comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;
DROP POLICY IF EXISTS "Admins can delete any comment" ON comments;

-- Policy: Authenticated users can create comments (only if comments are enabled for the place)
CREATE POLICY "Authenticated users can comment"
ON comments
FOR INSERT
WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
    AND EXISTS (
        SELECT 1 FROM places
        WHERE places.id = comments.place_id
        AND (places.comments_enabled IS NULL OR places.comments_enabled = TRUE)
    )
);

-- Policy: Everyone can view comments on public places
CREATE POLICY "Everyone can view comments on public places"
ON comments
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM places
        WHERE places.id = comments.place_id
        AND (
            places.access_level IS NULL OR places.access_level != 'premium'
        )
    )
);

-- Policy: Premium users and admins can view comments on premium places
CREATE POLICY "Premium users can view comments on premium places"
ON comments
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM places
        WHERE places.id = comments.place_id
        AND places.access_level = 'premium'
        AND (
            has_premium_access() = TRUE
            OR places.created_by = auth.uid()
        )
    )
);

-- Policy: Users can update their own comments
CREATE POLICY "Users can update their own comments"
ON comments
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own comments
CREATE POLICY "Users can delete their own comments"
ON comments
FOR DELETE
USING (auth.uid() = user_id);

-- Policy: Admins can delete any comment
CREATE POLICY "Admins can delete any comment"
ON comments
FOR DELETE
USING (is_admin() = TRUE);

-- 8. PROFILES TABLE - Users can view public profile info
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Policy: Everyone can view profiles (for public profile pages)
CREATE POLICY "Users can view profiles"
ON profiles
FOR SELECT
USING (true);

-- Policy: Users can update their own profile (but not role/is_admin)
CREATE POLICY "Users can update their own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    -- Prevent users from changing their own role or is_admin
    AND (
        role IS NULL OR role = (SELECT role FROM profiles WHERE id = auth.uid())
    )
    AND (
        is_admin IS NULL OR is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid())
    )
);

-- Policy: Admins can update any profile (including role and is_admin)
CREATE POLICY "Admins can update any profile"
ON profiles
FOR UPDATE
USING (is_admin() = TRUE)
WITH CHECK (is_admin() = TRUE);

-- 9. Ensure RLS is enabled on all tables
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 10. Verify policies
SELECT 
    tablename,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename IN ('places', 'reactions', 'comments', 'profiles')
ORDER BY tablename, cmd, policyname;

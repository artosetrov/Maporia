-- SQL script to add user role and subscription fields to profiles table
-- Execute this script in Supabase Dashboard > SQL Editor

-- 1. Add role field to profiles table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'role'
    ) THEN
        ALTER TABLE profiles ADD COLUMN role TEXT DEFAULT 'standard' CHECK (role IN ('guest', 'standard', 'premium', 'admin'));
        COMMENT ON COLUMN profiles.role IS 'User role: guest, standard, premium, or admin';
    END IF;
END $$;

-- 2. Add subscription_status field to profiles table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'subscription_status'
    ) THEN
        ALTER TABLE profiles ADD COLUMN subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive'));
        COMMENT ON COLUMN profiles.subscription_status IS 'Subscription status: active or inactive';
    END IF;
END $$;

-- 3. Ensure is_admin field exists (from setup-admin.sql)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'is_admin'
    ) THEN
        ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN profiles.is_admin IS 'Indicates if user is an administrator';
    END IF;
END $$;

-- 4. Update existing profiles to have correct role based on is_admin and subscription_status
-- Set role to 'admin' for existing admins
UPDATE profiles 
SET role = 'admin' 
WHERE is_admin = TRUE AND (role IS NULL OR role != 'admin');

-- Set role to 'premium' for users with active subscription (if subscription_status exists)
UPDATE profiles 
SET role = 'premium' 
WHERE subscription_status = 'active' 
  AND is_admin = FALSE 
  AND (role IS NULL OR role NOT IN ('admin', 'premium'));

-- Set role to 'standard' for authenticated users who are not admin or premium
UPDATE profiles 
SET role = 'standard' 
WHERE role IS NULL 
  AND is_admin = FALSE 
  AND (subscription_status IS NULL OR subscription_status != 'active');

-- 5. Create helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM profiles
    WHERE id = user_id;
    
    RETURN COALESCE(user_role, 'guest');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create helper function to check if user has premium access
CREATE OR REPLACE FUNCTION has_premium_access(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM profiles 
        WHERE id = user_id 
        AND (
            role IN ('premium', 'admin')
            OR subscription_status = 'active'
            OR is_admin = TRUE
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Verify the changes
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('role', 'subscription_status', 'is_admin')
ORDER BY column_name;

-- 8. Show current role distribution
SELECT 
    role,
    subscription_status,
    is_admin,
    COUNT(*) as user_count
FROM profiles
GROUP BY role, subscription_status, is_admin
ORDER BY role, subscription_status;

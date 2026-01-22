-- SQL скрипт для назначения администратором пользователя с email xdegonx@gmail.com
-- Выполните этот скрипт в Supabase Dashboard > SQL Editor

-- 1. Убеждаемся, что поле is_admin существует
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'is_admin'
    ) THEN
        ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN profiles.is_admin IS 'Указывает, является ли пользователь администратором';
    END IF;
END $$;

-- 2. Убеждаемся, что поле role существует
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

-- 3. Назначаем пользователя администратором по email
UPDATE profiles 
SET 
    is_admin = TRUE,
    role = 'admin'
WHERE id IN (
    SELECT id FROM auth.users 
    WHERE email = 'xdegonx@gmail.com'
);

-- 4. Проверяем результат
SELECT 
    p.id,
    u.email,
    p.username,
    p.display_name,
    p.is_admin,
    p.role,
    p.subscription_status
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'xdegonx@gmail.com';

-- Если пользователь не найден, проверьте, что он зарегистрирован:
-- SELECT id, email, created_at FROM auth.users WHERE email = 'xdegonx@gmail.com';

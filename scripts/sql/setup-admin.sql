-- SQL скрипт для настройки администраторов
-- Выполните этот скрипт в Supabase Dashboard > SQL Editor

-- 1. Добавляем поле is_admin в таблицу profiles (если его еще нет)
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

-- 2. Создаем функцию для проверки, является ли пользователь администратором
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM profiles 
        WHERE id = auth.uid() 
        AND is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Обновляем политику удаления мест
-- Теперь администраторы могут удалять любые места, а обычные пользователи - только свои
DROP POLICY IF EXISTS "Users can delete their own places" ON places;

CREATE POLICY "Users can delete their own places"
ON places
FOR DELETE
USING (
    auth.uid() = created_by 
    OR is_admin() = TRUE
);

-- 4. Назначаем пользователя администратором
-- Замените 'USER_EMAIL_OR_USERNAME' на email или username пользователя, которого хотите сделать администратором
-- Например, если пользователь с email "admin@maporia.com" или username "maporia"

-- Вариант A: По email
UPDATE profiles 
SET is_admin = TRUE 
WHERE id IN (
    SELECT id FROM auth.users 
    WHERE email = 'admin@maporia.com'  -- ЗАМЕНИТЕ на нужный email
);

-- Вариант B: По username (если у вас есть username в profiles)
UPDATE profiles 
SET is_admin = TRUE 
WHERE username = 'maporia';  -- ЗАМЕНИТЕ на нужный username

-- Вариант C: По user ID (если знаете точный ID)
-- UPDATE profiles 
-- SET is_admin = TRUE 
-- WHERE id = 'USER_ID_HERE';  -- ЗАМЕНИТЕ на нужный ID

-- 5. Проверяем, кто является администратором
SELECT 
    p.id,
    p.username,
    p.display_name,
    u.email,
    p.is_admin
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_admin = TRUE;

-- 6. Проверяем политики DELETE для places
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'places' AND cmd = 'DELETE';

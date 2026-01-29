-- SQL скрипт для исправления RLS политик для удаления мест
-- Выполните этот скрипт в Supabase Dashboard > SQL Editor

-- 1. Проверяем текущие RLS политики для таблицы places
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'places';

-- 2. Добавляем поле is_admin в таблицу profiles (если его еще нет)
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

-- 3. Создаем функцию для проверки, является ли пользователь администратором
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

-- 4. Создаем или заменяем политику для удаления мест
-- Политика позволяет пользователям удалять свои места ИЛИ администраторам удалять любые места
DROP POLICY IF EXISTS "Users can delete their own places" ON places;

CREATE POLICY "Users can delete their own places"
ON places
FOR DELETE
USING (
    auth.uid() = created_by 
    OR is_admin() = TRUE
);

-- 5. Проверяем, что RLS включен для таблицы places
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

-- 6. Проверяем политики после создания
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'places' AND cmd = 'DELETE';

-- Примечание: Если у вас уже есть политика для DELETE, она может конфликтовать.
-- В этом случае удалите старую политику перед созданием новой:
-- DROP POLICY IF EXISTS "old_policy_name" ON places;

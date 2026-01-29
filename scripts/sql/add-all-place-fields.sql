-- SQL скрипт для добавления всех необходимых полей в таблицу places
-- Выполните этот скрипт в Supabase Dashboard > SQL Editor
-- Это объединяет все необходимые миграции в один файл

-- ============================================
-- 1. Добавляем поле is_hidden (если его еще нет)
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'places' 
        AND column_name = 'is_hidden'
    ) THEN
        ALTER TABLE places ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN places.is_hidden IS 'If true, place is hidden from public view';
    END IF;
END $$;

-- ============================================
-- 2. Добавляем поле visibility (если его еще нет)
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'places' 
        AND column_name = 'visibility'
    ) THEN
        ALTER TABLE places ADD COLUMN visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'hidden', 'private'));
        COMMENT ON COLUMN places.visibility IS 'Visibility level: public, hidden, or private';
    END IF;
END $$;

-- ============================================
-- 3. Добавляем поле comments_enabled (если его еще нет)
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'places' 
        AND column_name = 'comments_enabled'
    ) THEN
        ALTER TABLE places ADD COLUMN comments_enabled BOOLEAN DEFAULT TRUE;
        COMMENT ON COLUMN places.comments_enabled IS 'If false, comments are disabled for this place';
    END IF;
END $$;

-- ============================================
-- 4. Проверяем все добавленные поля
-- ============================================
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'places' 
AND column_name IN ('is_hidden', 'visibility', 'comments_enabled')
ORDER BY column_name;

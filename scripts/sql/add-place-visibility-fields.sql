-- SQL скрипт для добавления полей видимости мест
-- Выполните этот скрипт в Supabase Dashboard > SQL Editor

-- 1. Добавляем поле is_hidden (если его еще нет)
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

-- 2. Добавляем поле visibility (если его еще нет и если нужно)
-- Можно использовать либо is_hidden, либо visibility
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

-- 3. Проверяем добавленные поля
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'places' 
AND column_name IN ('is_hidden', 'visibility')
ORDER BY column_name;

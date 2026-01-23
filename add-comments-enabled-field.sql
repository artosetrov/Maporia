-- SQL скрипт для добавления поля comments_enabled в таблицу places
-- Выполните этот скрипт в Supabase Dashboard > SQL Editor

-- Добавляем поле comments_enabled (если его еще нет)
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

-- Проверяем добавленное поле
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'places' 
AND column_name = 'comments_enabled'
ORDER BY column_name;

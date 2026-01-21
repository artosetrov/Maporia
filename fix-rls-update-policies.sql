-- SQL скрипт для исправления RLS политик для обновления мест (UPDATE)
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
WHERE tablename = 'places' AND cmd = 'UPDATE';

-- 2. Проверяем и создаем политику INSERT для создания мест
DROP POLICY IF EXISTS "Users can create places" ON places;
CREATE POLICY "Users can create places"
ON places
FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- 3. Удаляем старую политику UPDATE, если она существует
DROP POLICY IF EXISTS "Users can update their own places" ON places;

-- 4. Создаем политику для обновления мест
-- Политика позволяет пользователям обновлять свои места
-- USING проверяет, может ли пользователь видеть строку для обновления
-- WITH CHECK проверяет, может ли пользователь видеть строку после обновления (для RETURNING)
CREATE POLICY "Users can update their own places"
ON places
FOR UPDATE
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Также убедимся, что есть политика SELECT для владельцев мест
DROP POLICY IF EXISTS "Users can view their own places" ON places;
CREATE POLICY "Users can view their own places"
ON places
FOR SELECT
USING (auth.uid() = created_by);

-- 5. Проверяем, что RLS включен для таблицы places
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

-- 6. Проверяем политики после создания
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'places' AND cmd = 'UPDATE';

-- 7. Также проверяем политики для place_photos (для редактора фото)
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'place_photos';

-- 8. Создаем политики для place_photos, если их нет
-- Политика для SELECT
DROP POLICY IF EXISTS "Users can view place photos" ON place_photos;
CREATE POLICY "Users can view place photos"
ON place_photos
FOR SELECT
USING (true); -- Все могут видеть фото мест

-- Политика для INSERT
DROP POLICY IF EXISTS "Users can insert place photos" ON place_photos;
CREATE POLICY "Users can insert place photos"
ON place_photos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM places 
    WHERE places.id = place_photos.place_id 
    AND places.created_by = auth.uid()
  )
);

-- Политика для UPDATE
DROP POLICY IF EXISTS "Users can update place photos" ON place_photos;
CREATE POLICY "Users can update place photos"
ON place_photos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM places 
    WHERE places.id = place_photos.place_id 
    AND places.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM places 
    WHERE places.id = place_photos.place_id 
    AND places.created_by = auth.uid()
  )
);

-- Политика для DELETE
DROP POLICY IF EXISTS "Users can delete place photos" ON place_photos;
CREATE POLICY "Users can delete place photos"
ON place_photos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM places 
    WHERE places.id = place_photos.place_id 
    AND places.created_by = auth.uid()
  )
);

-- 9. Включаем RLS для place_photos
ALTER TABLE place_photos ENABLE ROW LEVEL SECURITY;

-- 10. Финальная проверка всех политик
SELECT 
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('places', 'place_photos')
ORDER BY tablename, cmd;

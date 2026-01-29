-- SQL запрос для удаления "Test place"
-- Выполните этот запрос в Supabase Dashboard > SQL Editor

-- Шаг 1: Найдем ID места (выполните отдельно для проверки)
SELECT id, title, created_at 
FROM places 
WHERE title ILIKE '%Test place%';

-- Шаг 2: Удаление (замените 'PLACE_ID' на реальный ID из шага 1, или удалите все сразу)

-- Вариант A: Удалить все места с названием "Test place"
DELETE FROM place_photos 
WHERE place_id IN (SELECT id FROM places WHERE title ILIKE '%Test place%');

DELETE FROM comments 
WHERE place_id IN (SELECT id FROM places WHERE title ILIKE '%Test place%');

DELETE FROM reactions 
WHERE place_id IN (SELECT id FROM places WHERE title ILIKE '%Test place%');

DELETE FROM places 
WHERE title ILIKE '%Test place%';

-- Вариант B: Удалить конкретное место по ID (замените 'your-place-id')
-- DELETE FROM place_photos WHERE place_id = 'your-place-id';
-- DELETE FROM comments WHERE place_id = 'your-place-id';
-- DELETE FROM reactions WHERE place_id = 'your-place-id';
-- DELETE FROM places WHERE id = 'your-place-id';

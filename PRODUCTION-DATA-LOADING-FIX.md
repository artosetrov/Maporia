# Исправление: Данные не грузятся из Supabase на проде

## Проблема
На продакшене (maporia.co) данные из Supabase не загружаются:
- Страница показывает только скелетоны (skeleton loaders)
- В консоли есть `AbortError` при проверке сессии
- Переменные окружения установлены правильно

## Возможные причины

### 1. RLS политики блокируют запросы
Самая вероятная причина - RLS политики в Supabase блокируют чтение для неавторизованных пользователей.

**Решение:**
Выполните в Supabase Dashboard → SQL Editor:

```sql
-- Проверьте текущие политики
SELECT policyname, cmd, roles, qual
FROM pg_policies 
WHERE tablename = 'places' AND cmd = 'SELECT';

-- Создайте простую политику: все могут читать все места
DROP POLICY IF EXISTS "Anyone can view all places" ON places;
CREATE POLICY "Anyone can view all places"
ON places
FOR SELECT
TO public
USING (true);

-- Также для cities
DROP POLICY IF EXISTS "Cities are readable by everyone" ON cities;
CREATE POLICY "Cities are readable by everyone"
ON cities
FOR SELECT
TO public
USING (true);

-- И для place_photos
DROP POLICY IF EXISTS "Place photos are viewable by everyone" ON place_photos;
CREATE POLICY "Place photos are viewable by everyone"
ON place_photos
FOR SELECT
TO public
USING (true);
```

Или выполните готовый скрипт: `fix-production-loading-issues.sql`

### 2. Переменные окружения не установлены на деплое
Проверьте в настройках Vercel/другого хостинга:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. CORS проблемы
Проверьте в Supabase Dashboard → Settings → API:
- В "Allowed Origins" должен быть добавлен `https://maporia.co`
- Также добавьте `https://www.maporia.co` если используется

## Диагностика

После деплоя откройте консоль браузера (F12) на десктопе в продакшене и проверьте:

1. **Инициализация Supabase:**
   - Должен быть лог: `[Supabase] Client initialized:`
   - `hasValidConfig: true`

2. **Тестовый запрос:**
   - Должен быть лог: `[Supabase] Test query success:` с count > 0
   - Если есть ошибка, будет показан код ошибки (например, PGRST301 = RLS блокирует)

3. **Загрузка секций:**
   - Должны быть логи: `[HomeSection] Loading places:` для каждой секции
   - Затем: `[HomeSection] Query success:` с count > 0
   - Если есть ошибки, будут показаны детали

4. **Bootstrap:**
   - Должен быть лог: `[HomePage] Bootstrap ready:` когда данные готовы к загрузке

## Что было исправлено в коде

1. ✅ Добавлена глобальная обработка `unhandledrejection` - AbortError больше не будут показываться
2. ✅ Улучшена обработка AbortError в `supabase.ts` - игнорируются тихо
3. ✅ Добавлен тестовый запрос к places при инициализации - проверяет RLS политики
4. ✅ Добавлено детальное логирование в `HomeSection` - показывает успешные/неуспешные запросы
5. ✅ Улучшена обработка ошибок во всех местах подсчета мест

## Следующие шаги

1. Выполните SQL скрипт для RLS политик (см. выше)
2. Проверьте переменные окружения на деплое
3. Проверьте CORS настройки в Supabase
4. Деплойте изменения
5. Проверьте консоль браузера - должны появиться детальные логи

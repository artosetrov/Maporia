# Быстрое исправление: ничего не грузится на продакшене

## Шаг 1: Проверьте переменные окружения

В настройках вашего хостинга (Vercel/Netlify) убедитесь, что установлены:

```
NEXT_PUBLIC_SUPABASE_URL=ваш_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_anon_key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=ваш_api_key
```

## Шаг 2: Исправьте RLS политики (ВАЖНО!)

Выполните в Supabase Dashboard → SQL Editor:

```sql
-- Разрешить всем читать места
DROP POLICY IF EXISTS "Anyone can view all places" ON places;
CREATE POLICY "Anyone can view all places"
ON places FOR SELECT TO public USING (true);

-- Разрешить читать города
DROP POLICY IF EXISTS "Cities are readable by everyone" ON cities;
CREATE POLICY "Cities are readable by everyone"
ON cities FOR SELECT TO public USING (true);

-- Разрешить читать фотографии
DROP POLICY IF EXISTS "Place photos are viewable by everyone" ON place_photos;
CREATE POLICY "Place photos are viewable by everyone"
ON place_photos FOR SELECT TO public USING (true);
```

Или выполните полный файл: `fix-production-loading-issues.sql`

## Шаг 3: Проверьте Google Maps API

1. Google Cloud Console → APIs & Services → Credentials
2. Откройте ваш API ключ
3. В "Application restrictions" → "HTTP referrers" добавьте:
   - `https://yourdomain.com/*`
   - `https://*.vercel.app/*` (если Vercel)

## Шаг 4: Перезапустите деплой

После изменений перезапустите деплой на вашем хостинге.

## Проверка

Откройте консоль браузера (F12) на продакшене и проверьте:
- Нет ошибок `Missing NEXT_PUBLIC_...`
- Нет ошибок RLS (401/403)
- Нет ошибок Google Maps API

Подробнее: см. `PRODUCTION-TROUBLESHOOTING.md`

# Troubleshooting Production Loading Issues

Если на продакшене ничего не грузится (места, карта), проверьте следующие пункты:

## 1. Переменные окружения на продакшене

Убедитесь, что в настройках вашего хостинга (Vercel, Netlify и т.д.) установлены следующие переменные:

### Обязательные переменные:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### Опциональные (для серверных функций):
```bash
GOOGLE_MAPS_API_KEY=your_google_maps_api_key  # Для /api/google/place-import
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Для /api/cities/resolve
```

**Где найти:**
- **Supabase URL и ключи**: Supabase Dashboard → Settings → API
- **Google Maps API Key**: Google Cloud Console → APIs & Services → Credentials

## 2. RLS (Row Level Security) политики

Если места не загружаются, возможно, RLS политики блокируют чтение для неавторизованных пользователей.

### Решение:
Выполните SQL скрипт в Supabase Dashboard → SQL Editor:

```sql
-- Разрешить всем (включая неавторизованных) читать все места
DROP POLICY IF EXISTS "Anyone can view all places" ON places;
CREATE POLICY "Anyone can view all places"
ON places
FOR SELECT
TO public
USING (true);

-- Разрешить читать города
DROP POLICY IF EXISTS "Cities are readable by everyone" ON cities;
CREATE POLICY "Cities are readable by everyone"
ON cities
FOR SELECT
TO public
USING (true);

-- Разрешить читать фотографии мест
DROP POLICY IF EXISTS "Place photos are viewable by everyone" ON place_photos;
CREATE POLICY "Place photos are viewable by everyone"
ON place_photos
FOR SELECT
TO public
USING (true);
```

Или выполните полный скрипт: `fix-production-loading-issues.sql`

## 3. Google Maps API - ограничения по домену

Если карта не загружается, проверьте ограничения API ключа:

1. Откройте [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Credentials
3. Откройте ваш API ключ
4. В разделе **Application restrictions** → **HTTP referrers** добавьте:
   ```
   https://yourdomain.com/*
   https://*.vercel.app/*  # Если используете Vercel
   https://*.netlify.app/*  # Если используете Netlify
   ```

## 4. Проверка подключения к Supabase

Откройте консоль браузера (F12) и проверьте:

1. **Ошибки подключения к Supabase:**
   - Если видите `Missing NEXT_PUBLIC_SUPABASE_URL` → переменная не установлена
   - Если видите ошибки RLS → выполните скрипт из пункта 2

2. **Ошибки загрузки мест:**
   - Проверьте Network tab → ищите запросы к `supabase.co`
   - Если статус 401/403 → проблема с RLS политиками
   - Если статус 500 → проблема на стороне Supabase

## 5. Проверка Google Maps

1. **Ошибки загрузки карты:**
   - Если видите `RefererNotAllowedMapError` → добавьте домен в ограничения API ключа (пункт 3)
   - Если видите `ApiNotActivatedMapError` → включите Maps JavaScript API в Google Cloud Console

2. **Проверка API:**
   - Google Cloud Console → APIs & Services → Enabled APIs
   - Убедитесь, что включены:
     - Maps JavaScript API
     - Places API (New)

## 6. Диагностика в коде

Код теперь логирует подробные ошибки в консоль браузера. Откройте консоль (F12) и проверьте:

- `Error loading places:` - ошибки загрузки мест
- `Google Maps load error:` - ошибки загрузки карты
- `Missing NEXT_PUBLIC_...` - отсутствующие переменные окружения

## 7. Быстрая проверка

Выполните в консоли браузера на продакшене:

```javascript
// Проверка переменных окружения (только NEXT_PUBLIC_)
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
console.log('Google Maps Key:', process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? '✅ Set' : '❌ Missing');
```

## 8. Частые проблемы

### Проблема: "0 places" показывается, но в базе есть места
**Решение:** Выполните `fix-production-loading-issues.sql` для исправления RLS политик

### Проблема: "Loading map..." не исчезает
**Решение:** 
1. Проверьте `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` в переменных окружения
2. Добавьте домен в ограничения API ключа Google Maps
3. Убедитесь, что Maps JavaScript API включен

### Проблема: Ошибки в консоли про RLS
**Решение:** Выполните SQL скрипт из пункта 2

## 9. Проверка после исправления

1. Очистите кеш браузера (Ctrl+Shift+R или Cmd+Shift+R)
2. Откройте консоль браузера (F12)
3. Проверьте, что нет ошибок
4. Убедитесь, что места загружаются
5. Убедитесь, что карта отображается

## 10. Если ничего не помогло

1. Проверьте логи на хостинге (Vercel → Deployments → Logs)
2. Проверьте логи Supabase (Dashboard → Logs)
3. Проверьте квоты API в Google Cloud Console
4. Убедитесь, что база данных доступна (Supabase Dashboard → Database → Connection Pooling)

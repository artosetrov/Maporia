# Исправление ошибки Google Maps на продакшене

## Проблема
Ошибка: `Google Maps JavaScript API error: RefererNotAllowedMapError`

Это означает, что продакшн URL не добавлен в список разрешенных HTTP referrers для API ключа Google Maps.

## Решение

### Шаг 1: Откройте Google Cloud Console
1. Перейдите на https://console.cloud.google.com/
2. Выберите проект, в котором создан API ключ

### Шаг 2: Найдите API ключ
1. Перейдите в **APIs & Services** → **Credentials**
2. Найдите ваш API ключ (тот, который используется в `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
3. Нажмите на него для редактирования

### Шаг 3: Добавьте разрешенные HTTP referrers

В разделе **Application restrictions** → **HTTP referrers (web sites)** добавьте следующие URL:

```
https://maporia-l8bg-git-main-arts-projects-9e2117f8.vercel.app/*
https://*.vercel.app/*
```

**Важно:** 
- Добавьте `/*` в конце каждого URL для разрешения всех путей
- Если у вас есть кастомный домен, добавьте его тоже: `https://yourdomain.com/*`
- Для preview deployments Vercel использует `*.vercel.app`, поэтому добавьте `https://*.vercel.app/*`

### Шаг 4: Сохраните изменения
1. Нажмите **Save**
2. Подождите 1-2 минуты для применения изменений

### Шаг 5: Проверьте
1. Обновите страницу на продакшене
2. Карта должна загрузиться без ошибок

## Дополнительные рекомендации

### Для безопасности API ключа:
1. **Ограничьте API ключ по API** - в разделе **API restrictions** выберите только нужные API:
   - Maps JavaScript API
   - Places API (если используется)
   - Geocoding API (если используется)

2. **Не используйте один ключ для всех окружений** - лучше создать отдельные ключи для:
   - Development (localhost)
   - Production (продакшн домен)

### Пример конфигурации для разных окружений:

**Development:**
```
http://localhost:3000/*
http://127.0.0.1:3000/*
```

**Production:**
```
https://maporia-l8bg-git-main-arts-projects-9e2117f8.vercel.app/*
https://yourdomain.com/*
https://*.vercel.app/*
```

## Проверка после исправления

После добавления referrers проверьте в консоли браузера:
- ✅ Нет ошибки `RefererNotAllowedMapError`
- ✅ Карта загружается и отображается корректно
- ✅ Маркеры отображаются на карте

## Если проблема сохраняется

1. Убедитесь, что изменения сохранены в Google Cloud Console
2. Подождите 2-3 минуты (изменения могут применяться с задержкой)
3. Очистите кеш браузера
4. Проверьте, что используется правильный API ключ в переменных окружения Vercel
5. Убедитесь, что API ключ не заблокирован и имеет правильные ограничения

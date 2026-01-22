# Unified Google Import Feature

Унифицированная функция импорта из Google Maps для Profile и Place редакторов.

## Возможности

- ✅ Принимает Google Maps URL или текстовый адрес/название места
- ✅ Автоматически определяет тип входных данных (URL или текст)
- ✅ Использует Google Places API для поиска и получения данных
- ✅ Кеширование ответов для уменьшения использования API
- ✅ Работает для Profile Create/Edit и Place Create/Edit
- ✅ Полная серверная обработка (без утечки API ключей)

## Использование

### Для пользователей

1. Откройте редактор Profile или Place
2. Найдите поле "Импорт из Google" или кнопку "Импорт из Google"
3. Вставьте:
   - **Google Maps ссылку** (из кнопки "Поделиться" в Google Maps)
   - **Или введите адрес/название места** (например: "Кафе в Москве" или "123 Main St, New York")
4. Нажмите "Импорт" или Enter
5. Данные автоматически заполнят форму
6. Отредактируйте при необходимости и сохраните

### Поддерживаемые форматы входных данных

**URL:**
- `https://www.google.com/maps/place/...`
- `https://maps.google.com/?cid=...`
- `https://goo.gl/maps/...`
- Любые другие форматы Google Maps URL

**Текст:**
- Полный адрес: "123 Main Street, New York, NY 10001"
- Название + город: "Starbucks Москва"
- Частичный адрес: "Красная площадь, Москва"
- Название места: "Эрмитаж"

## Технические детали

### API Endpoint

**POST** `/api/google/place-import`

**Request:**
```json
{
  "query": "Google Maps URL or address text",
  "access_token": "supabase_session_token"
}
```

**Response:**
```json
{
  "name": "Place Name",
  "formatted_address": "Full Address",
  "lat": 55.7558,
  "lng": 37.6173,
  "website": "https://...",
  "phone": "+7...",
  "rating": 4.5,
  "reviews_count": 123,
  "place_id": "ChIJ...",
  "google_maps_url": "https://...",
  "city": "Moscow",
  "types": ["restaurant", "food"],
  "photos": [...],
  ...
}
```

### Обработка запросов

1. **Определение типа входных данных:**
   - Если входные данные - валидный URL → пытается извлечь `place_id`
   - Если не URL или `place_id` не найден → использует как текстовый запрос

2. **Поиск места:**
   - Для URL: извлекает `place_id` или использует Find Place From Text
   - Для текста: использует Google Places API "Find Place From Text"

3. **Получение деталей:**
   - Использует `place_id` для получения полных данных через Place Details API

4. **Кеширование:**
   - Ответы кешируются по `place_id` на 1 час
   - Уменьшает количество запросов к Google API

### Маппинг данных

**Profile:**
- `name` → `display_name`
- `formatted_address` → `address`
- `website` → `website`
- `phone` → `phone`
- `place_id` → `google_place_id`
- `rating` → `google_rating`
- `reviews_count` → `google_reviews_count`
- `types` → `bio` (только если bio пустое)

**Place:**
- `name` → `title`
- `formatted_address` → `address`
- `lat/lng` → `lat/lng`
- `website` → `link`
- `place_id` → `google_place_id`
- `types` → `categories` (с маппингом)

### Безопасность

- ✅ API ключ хранится только на сервере (`GOOGLE_MAPS_API_KEY`)
- ✅ Все запросы к Google API выполняются на сервере
- ✅ Rate limiting: 10 запросов в минуту на пользователя
- ✅ Кеширование для уменьшения нагрузки на API

### Ограничения

- Rate limit: 10 запросов/минуту на пользователя
- Кеш: 1 час для каждого `place_id`
- В production рекомендуется использовать Redis для кеширования и rate limiting

## Компоненты

### UnifiedGoogleImportField

Унифицированный компонент для импорта из Google.

**Props:**
- `userId: string` - ID пользователя
- `onImportSuccess: (data) => void | Promise<void>` - Callback при успешном импорте
- `compact?: boolean` - Компактный режим (по умолчанию: false)
- `context?: "profile" | "place"` - Контекст использования (по умолчанию: "place")

**Использование:**
```tsx
<UnifiedGoogleImportField
  userId={user.id}
  context="place"
  onImportSuccess={(data) => {
    // Обработка импортированных данных
  }}
/>
```

## Обработка ошибок

- **MISSING_API_KEY**: API ключ не настроен
- **PLACE_NOT_FOUND**: Место не найдено (404)
- **429**: Превышен rate limit
- **401**: Требуется авторизация

Все ошибки отображаются пользователю с понятными сообщениями на русском языке.

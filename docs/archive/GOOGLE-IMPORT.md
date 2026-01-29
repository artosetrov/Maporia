# Google Maps Import — настройка и использование

Импорт мест из Google Maps в Profile и Place редакторы.

---

## Настройка

### 1. API ключ (обязательно)

При ошибке "Server configuration error" или "Google Maps API key is not configured":

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → **Create Credentials** → **API Key**
2. Включите API: **Places API (New)** (и при необходимости **Places API**)
3. В `.env.local` добавьте (без `NEXT_PUBLIC_`):

```bash
GOOGLE_MAPS_API_KEY=ваш_ключ_здесь
```

4. Перезапустите dev-сервер: `npm run dev`
5. Рекомендуется ограничить ключ: HTTP referrers + только Places API

### 2. Миграция БД (для профиля)

В Supabase Dashboard → SQL Editor выполните:

- `sql/add-profile-google-fields.sql` — поля профиля (google_place_id, website, phone и т.д.)

---

## Возможности

- Google Maps URL или текст (адрес/название места)
- Работа в Profile и Place редакторах
- Серверная обработка, кеширование, rate limit

## Использование

1. Редактор Profile или Place → поле «Импорт из Google»
2. Вставьте ссылку Google Maps или введите адрес/название
3. Нажмите «Импорт» или Enter
4. Отредактируйте при необходимости и сохраните

**Форматы:** `https://www.google.com/maps/place/...`, `goo.gl/maps/...`, текст «Кафе Москва» и т.п.

---

## API

**POST** `/api/google/place-import`

- Body: `{ "query": "URL или текст", "access_token": "supabase_session_token" }`
- Ответ: name, formatted_address, lat, lng, place_id, city, photos и др.

**Ограничения:** 10 запросов/минуту на пользователя, кеш по place_id ~1 час.

---

## Компоненты

- **UnifiedGoogleImportField** — унифицированный импорт (Profile и Place)
- **GoogleImportField** — для страницы импорта места (targetPlaceId)

Ошибки: `MISSING_API_KEY`, `PLACE_NOT_FOUND`, 429, 401 — отображаются пользователю.

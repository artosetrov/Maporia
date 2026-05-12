# Admin Analytics Dashboard — план

**Цель.** Внутренний дашборд `/admin/analytics` со статистикой посещений сайта: уникальные/просмотры, динамика, топ-страниц, источники трафика, география, поведение (auth vs guest), просмотры конкретных мест.

**Ограничение.** Свой трекинг на Supabase, без сторонней аналитики. Паттерн строго как у `/admin/billing`: RPC `SECURITY DEFINER` с админ-гейтом + клиентская страница, читающая RPC.

---

## 0. Архитектура одной картинкой

```
Browser
  └─ ClientTracker (1 раз на mount каждого route)
       └─ POST /api/track  (fire-and-forget, sendBeacon fallback)
            └─ insert into page_views_raw (RLS: insert-only для anon/auth)

Cron (daily, 03:00 UTC)
  └─ SELECT cron … →  RPC rollup_page_views_daily()
       └─ UPSERT в page_views_daily (агрегаты)

/admin/analytics
  └─ supabase.rpc('get_analytics_kpi', { range })
       └─ читает page_views_daily + page_views_raw (последние 24 ч)
       └─ возвращает { overview, timeseries, top_paths, top_referrers,
                       geo, devices, top_places, auth_split }
```

Двухуровневое хранение (сырые события + ежедневные свёртки) — компромисс между гибкостью и размером таблицы.

---

## 1. Схема БД

### 1.1 `page_views_raw` — сырые события

```sql
CREATE TABLE public.page_views_raw (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  session_id    uuid        NOT NULL,           -- стабильный per-browser, в cookie
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  path          text        NOT NULL,           -- "/id/abc-123", без query
  query         text,                           -- "?city=Moscow"
  referrer_host text,                           -- "google.com" / null
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  country       text,                           -- ISO-2, из Vercel/CF header
  city          text,
  device        text,                           -- "mobile" | "desktop" | "tablet"
  browser       text,                           -- "chrome" | "safari" | ...
  os            text,
  place_id      uuid        REFERENCES public.places(id) ON DELETE SET NULL,
                                                -- если path = /id/[id], парсим в API
  is_bot        boolean     NOT NULL DEFAULT false
);

CREATE INDEX page_views_raw_occurred_at_idx ON page_views_raw (occurred_at DESC);
CREATE INDEX page_views_raw_session_id_idx  ON page_views_raw (session_id);
CREATE INDEX page_views_raw_path_idx        ON page_views_raw (path);
CREATE INDEX page_views_raw_place_id_idx    ON page_views_raw (place_id) WHERE place_id IS NOT NULL;
```

RLS:

```sql
ALTER TABLE page_views_raw ENABLE ROW LEVEL SECURITY;

-- никому нельзя SELECT (всё идёт через RPC SECURITY DEFINER)
-- INSERT тоже только через service-role из /api/track (не даём anon писать напрямую)
```

**Retention.** Хранить сырые 30–60 дней, потом удалять через cron — иначе таблица распухнет (см. §6 про объёмы).

### 1.2 `page_views_daily` — агрегаты

```sql
CREATE TABLE public.page_views_daily (
  day             date NOT NULL,
  path            text NOT NULL,                 -- '/' | '/map' | '/id/<uuid>' | '__total__'
  place_id        uuid REFERENCES places(id) ON DELETE SET NULL,
  country         text,
  device          text,
  views           integer NOT NULL DEFAULT 0,
  unique_sessions integer NOT NULL DEFAULT 0,
  auth_views      integer NOT NULL DEFAULT 0,
  guest_views     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, COALESCE(country, ''), COALESCE(device, ''))
);

CREATE INDEX page_views_daily_day_idx ON page_views_daily (day DESC);
```

Свёртки делаем cron'ом раз в сутки: вчерашний день агрегируем и upsert'им. Сегодняшний день читаем налету из raw.

### 1.3 `page_views_referrers_daily` и `page_views_utm_daily`

Аналогично `_daily`, но по группировкам referrer_host / utm_source. Если хотим экономить — можно держать всё в одной таблице с `dimension`/`dimension_value`, но три тонкие таблицы проще для запросов.

---

## 2. Трекинг на клиенте

### 2.1 `app/components/AnalyticsTracker.tsx`

`"use client"` компонент, подключённый один раз в корневом layout (или в `(public)/layout.tsx`, не в `admin/`). Логика:

1. На mount читает/создаёт `session_id` в localStorage (`maporia_sid`, uuid v4, TTL 30 дней — на стороне клиента).
2. На каждое изменение `pathname` (next/navigation `usePathname`) отправляет `POST /api/track` с:
   - `path`, `query`, `referrer = document.referrer`, `session_id`, `user_id` (если есть в `useUserAccessContext`).
3. `fetch(..., { keepalive: true })` — чтобы запрос не убивался при навигации.
4. Дебаунс 300 мс на быстрых редиректах + защита от двойного срабатывания в StrictMode (ref-флаг).

### 2.2 `/api/track` (Edge route)

```ts
// app/api/track/route.ts
export const runtime = 'edge';

export async function POST(req: Request) {
  const body = await req.json();
  const ua = req.headers.get('user-agent') ?? '';
  const country = req.headers.get('x-vercel-ip-country') ?? null;
  const city    = req.headers.get('x-vercel-ip-city')    ?? null;

  // bot-filter: простая UA-эвристика + Vercel-bot headers
  const isBot = /bot|crawler|spider|preview/i.test(ua);

  // parse device/browser/os из UA (можно ua-parser-js, но он тяжёлый — лучше regex-минимум)
  const { device, browser, os } = parseUA(ua);

  // если path = /id/<uuid>, вынимаем place_id
  const placeId = extractPlaceId(body.path);

  // referrer_host из body.referrer
  const referrerHost = safeHost(body.referrer);

  // service-role клиент (этот роут НЕ публичен)
  await supabaseAdmin.from('page_views_raw').insert({ ... });

  return new Response(null, { status: 204 });
}
```

**Анти-бот:** на старте — простой UA-regex. Если будет шум — добавить challenge cookie или Vercel Edge Middleware с `request.headers.get('x-vercel-bot')`.

**Что НЕ пишем:** IP, полный UA, полный referrer URL (только host). Это упрощает GDPR-сторону.

---

## 3. Cron-свёртки

Через Supabase `pg_cron`:

```sql
SELECT cron.schedule(
  'rollup_page_views_daily',
  '0 3 * * *',                       -- 03:00 UTC ежедневно
  $$ SELECT public.rollup_page_views_daily(); $$
);

SELECT cron.schedule(
  'prune_page_views_raw',
  '30 3 * * *',
  $$ DELETE FROM page_views_raw WHERE occurred_at < now() - interval '60 days'; $$
);
```

Функция `rollup_page_views_daily()` берёт вчерашний день и `INSERT … ON CONFLICT DO UPDATE` в `page_views_daily`. Идемпотентна — можно перезапускать.

---

## 4. RPC для дашборда

`get_analytics_kpi(p_range text)` — `SECURITY DEFINER`, внутри проверка `is_admin(auth.uid())`. `p_range` ∈ `'24h' | '7d' | '30d' | '90d'`.

Возвращает один JSON:

```ts
type AnalyticsKpi = {
  generated_at: string;
  range: '24h' | '7d' | '30d' | '90d';

  overview: {
    total_views: number;
    unique_sessions: number;
    auth_views: number;
    guest_views: number;
    avg_views_per_session: number;
    prev_period_total_views: number;  // для дельты "vs прошлый период"
  };

  timeseries: Array<{          // по дням или по часам для 24h
    bucket: string;            // ISO
    views: number;
    unique_sessions: number;
  }>;

  top_paths: Array<{ path: string; views: number; unique: number }>;       // top 20
  top_places: Array<{ place_id: string; title: string; views: number }>;   // top 20, join с places
  top_referrers: Array<{ referrer_host: string; views: number }>;
  top_utm: Array<{ utm_source: string; views: number }>;

  geo: Array<{ country: string; views: number }>;                          // top 15
  devices: Array<{ device: 'mobile'|'desktop'|'tablet'; views: number }>;
};
```

Для текущих суток читаем `page_views_raw`, для остального — `page_views_daily`. Запрос конструируется как `UNION ALL` с разными источниками.

---

## 5. Страница `/admin/analytics`

Файл: `app/(auth)/admin/analytics/page.tsx`. Структура копирует `billing/page.tsx`:

1. **Гейт.** `useUserAccessContext` → `isUserAdmin(access)` → если нет, `router.replace('/profile')`.
2. **Селектор диапазона.** Сегмент-контрол `24h | 7d | 30d | 90d`. На смену — заново зовём RPC.
3. **Секция Overview** (4 карточки): total views, unique sessions, avg views/session, auth share. На каждой — дельта vs прошлый период (стрелка ↑/↓).
4. **Линейный график timeseries** (просмотры + уникальные за выбранный период). Библиотека: `recharts` (уже в Next.js-стэке, лёгкая). Если не подключена — добавить.
5. **Таблица top_paths** (path, views, unique). Кликабельный path → `/id/<uuid>` или путь.
6. **Таблица top_places** (title, views, ссылка). Это самое полезное для владельцев бизнеса в перспективе.
7. **Таблица top_referrers + top_utm** (две колонки рядом).
8. **География.** Простая таблица country → views (флаги опц.). Без карты на v1.
9. **Devices.** Donut/horizontal-bar: mobile vs desktop vs tablet.
10. **Footer.** `Generated at HH:MM. Cron last ran at …` + кнопка Refresh.

UI-токены строго из существующего стиля (`#1F2A1F`, `#ECEEE4`, `font-fraunces`). Компоненты `StatCard`/`SkeletonCard` берём как в billing.

---

## 6. Объём и нагрузка — прикидка

Допущения (грубо, не проверял в твоей аналитике):
- 1000 уникальных в день × 5 pageviews = 5000 событий/день
- = ~150к строк/мес в `page_views_raw`
- ~50 байт на строку → ~7.5 МБ/мес сырых

Если в 10 раз больше — всё равно копейки для Supabase. Retention 60 дней удерживает таблицу < 100 МБ. `page_views_daily` растёт ~1000 строк/день и легко живёт годами.

Узкое место — `POST /api/track` на каждом переходе. Edge runtime + keepalive это решают, но если станет шумно — батчить на клиенте (накопить 3–5 событий за 1 сек и слать пачкой).

---

## 7. Этапы реализации (порядок коммитов)

1. **Migration 1: схема + RLS.** Таблицы, индексы, RLS-политики. Без cron.
2. **API `/api/track` + `AnalyticsTracker`.** Подключить в root layout, проверить что строки пишутся.
3. **RPC `is_admin(uuid)` + `get_analytics_kpi(text)`.** Сначала простая версия — только overview и top_paths.
4. **Страница `/admin/analytics` MVP.** Overview-карточки + одна таблица. Цель: убедиться, что цикл работает.
5. **Cron + `rollup_page_views_daily()`.** Запустить вручную один раз, проверить агрегаты.
6. **Полный RPC + полная страница.** Timeseries, top_places, geo, devices, referrers, UTM.
7. **Recharts + графики.** Если ещё не подключён.
8. **Retention cron.** `prune_page_views_raw` после того, как агрегаты доказали жизнеспособность.
9. **Polishing.** Skeleton-states, эмпти-стейты, error-boundary, дельты vs прошлый период.

---

## 8. Открытые вопросы / риски

- **GDPR / cookie banner.** Сейчас session_id в localStorage — формально это уже tracking. Если Maporia таргетит EU — нужен баннер согласия. Если только RU/глобал без EU-таргета — можно пока без.
- **Бот-трафик.** UA-regex отсекает ~70% мусора. Если в данных будет шум — добавить серверный фильтр через Vercel headers (`x-vercel-deployment-url` присутствует у preview-ботов).
- **Auth vs guest корректность.** `user_id` пишем из клиента, но валидируем на сервере через `auth.getUser()` (без передачи токена нельзя). Если беспокоит подмена — делать `/api/track` с `runtime: 'nodejs'` и читать `auth.uid()` из cookies. Edge не умеет supabase-auth-helpers без обвязки.
- **Просмотры приватных мест.** Если человек смотрит чужую premium-карточку, надо ли это считать? Думаю — да, считать, но в `top_places` фильтровать по `visibility = 'public'`, чтобы в админке не светить приватные тайтлы.
- **Realtime vs cached.** Текущие сутки читаются из raw — это N тысяч строк на каждое открытие дашборда. На v1 ОК; если будет тормозить — кэш в Redis на 60 сек или materialized view с авто-обновлением.

---

## 9. Что НЕ входит в v1

- Funnel'ы (визит → клик «забронировать» → переход на сайт). Это уже event-tracking, отдельная история.
- Cohorts / retention curves.
- Realtime лента «кто сейчас на сайте».
- Дашборд аналитики для владельцев конкретных мест (это перспективный фичефлаг — данные в БД уже будут).
- A/B тестирование.

---

## 10. Уточнения, которые ещё хочется собрать перед стартом

1. **GDPR-сценарий.** Нужен баннер согласия или таргет вне EU и можно без?
2. **Recharts уже в deps?** Если нет — ОК поставить, или предпочитаешь нативный SVG/Chart.js?
3. **`AnalyticsTracker` подключаем в root layout или только в публичной части?** В админке считать визиты обычно не нужно.
4. **Edge vs Node для `/api/track`?** Edge быстрее, но строже с зависимостями. Node проще авторизовать через Supabase cookies. Я бы начал с Node — потом оптимизируем.
5. **Прокидывать ли `place_id` отдельно в трекер,** или достаточно парсить из `/id/<uuid>`? (Парсинг проще, но если потом появятся другие пути на карточку места — придётся менять в двух местах.)

# CONTACTS_PLAN.md — телефон/сайт/соцсети у карточек

Дата: 2026-05-07. Скоуп: добавить контактные поля на карточки `places` всех трёх типов (location | service | experience).

## Решения (которые ты подтвердил)

- **Хранение:** отдельные колонки в `public.places` — `phone`, `website`, `instagram`, `youtube`, `telegram`. Все `text` и `nullable`.
- **Скоп kinds:** все три типа карточек.
- **Где править:** новая страница `/places/[id]/edit/contacts` (как title/description/photos) + ссылка с хаба `/places/[id]/edit`. Поскольку `/add` фактически только выбирает `kind` и редиректит на `/places/[id]/edit`, отдельный шаг в `/add` не нужен — карточка «Contacts» появляется в общем списке разделов хаба сразу после создания черновика.
- **`places.link`:** оставлен как есть — это легаси/CTA для service/experience («Связаться» / «Забронировать»). Контактный сайт хранится отдельно в `places.website`.

## Что реализовано

### БД (Supabase project `owgqntmgavexijwozyyx`)
- Миграция `add_place_contact_fields` применена. Добавила 5 колонок в `places`, все `nullable`, без CHECK. Комментарии к колонкам — в DDL.
- Smoke-тест UPDATE → SELECT → UPDATE NULL прошёл.

### Типы
- `app/types.ts` → `Place` расширен 5 опциональными полями.
- `app/types/supabase.ts` → `Database['public']['Tables']['places']` Row/Insert/Update — добавлены поля.

### UI
- `app/components/PlaceContacts.tsx` — новый компонент. Принимает 5 опциональных полей; если все пустые — возвращает `null`. Поддерживает варианты `card` (с border/bg) и `inline` (без). Сам нормализует ввод в href: `tel:` для телефона, `https://` дописывает у website, `@handle` распознаёт у Instagram/Telegram/YouTube.
- `app/(auth)/places/[id]/edit/contacts/page.tsx` — редактор. Пять inputs с иконками, лимит длины 200, простой Save/Cancel. Никакой валидации формата на стороне клиента (кроме lengthlimit) и тем более БД — нормализуем на лету при отображении.
- `app/(auth)/places/[id]/edit/page.tsx` (хаб):
  - Place type расширен.
  - SELECT для load и для visibilitychange-reload включает новые поля.
  - Между Categories и блоком price/schedule добавлена карточка «Contacts» с превью «X of 5 set — phone, Instagram…».
- `app/id/[id]/_views/OfferPlaceView.tsx` (service/experience): локальный `OfferPlace` расширен; компонент `<PlaceContacts>` вставлен секцией перед Reviews.
- `app/id/[id]/page.tsx` (legacy/location):
  - Place type расширен.
  - SELECT добавил contact-поля.
  - Sidebar (десктоп ≥1120px): `<PlaceContacts variant="card">` после кнопки Share.
  - Mobile/tablet (<1120px): `<PlaceContacts variant="inline">` сразу после Categories. Внешняя обёртка с border-bottom условно скрывается, если все 5 полей пустые.

### Проверки
- `npx tsc --noEmit --skipLibCheck` — чисто.
- Eslint не запускал (быстрые правки в стиле существующих файлов, ESLint не должен жаловаться на них больше, чем на остальные).

## Что НЕ реализовано (намеренно отложено)

- **Шаг «Contacts» в `/add`-визарде** — `/add` сейчас только показывает выбор kind и сразу редиректит на `/places/[id]/edit`, поэтому отдельный шаг там не нужен. Если в будущем визард станет линейным (не хабом) — добавь шаг по образцу title/description/contacts.
- **CHECK-валидация формата (URL, телефон):** не добавлял. Любая некорректная строка в `website` будет переписана в `https://<строка>` при отображении и просто не откроется. Если нужна жёсткая валидация — лучше сделать на сервер-сайде через RPC, не CHECK (CHECK на URL хрупок).
- **Импорт контактов из Google Places (UnifiedGoogleImportField):** сейчас он пишет только `link` (см. `app/(auth)/places/[id]/edit/title/page.tsx`). Если хочешь, чтобы Google-импорт заодно заполнял `website` и `phone` — это отдельная итерация.
- **Категории на `/map` маркерах:** не трогал, к контактам не относится.
- **Аналитика (lens):** event для клика по contact-линке не добавлен.

## Риски

- **`places.link` vs `places.website`** теперь сосуществуют. На хабе мы показываем «Contacts» (включая website), а CTA-кнопка «Связаться»/«Забронировать» в OfferPlaceView продолжает указывать на `link`. Если креатор вписал тот же URL и в link, и в website — увидит две одинаковые ссылки. Решение: либо однажды сделать миграцию `link` → `website`, либо явно объяснить разницу в UI (link = «куда вести при клике на CTA», website = «информационная ссылка»). Я выбрал ничего не менять и оставить решение тебе.
- **`youtube` vs `youtube_shorts_url`** — два разных поля. `youtube_shorts_url` уже используется в карусели (контентный шортс). Новое `youtube` — это контактный канал. На странице карточки они появятся в разных местах. Если возникнет путаница — ребрендировать поля или мерджить.
- **Тестовых данных в БД нет** — после smoke-теста откатил UPDATE к NULL.

## Что настроить вручную

Ничего. Миграция применена через Supabase MCP, RLS-политики на таблице `places` уже разрешают INSERT/UPDATE для владельца карточки — новых колонок это касается автоматически. Никаких Stripe/Vercel-настроек не нужно.

## Файлы

```
app/components/PlaceContacts.tsx                       (new)
app/(auth)/places/[id]/edit/contacts/page.tsx          (new)
app/types.ts                                           (edit)
app/types/supabase.ts                                  (edit)
app/(auth)/places/[id]/edit/page.tsx                   (edit)
app/id/[id]/_views/OfferPlaceView.tsx                  (edit)
app/id/[id]/page.tsx                                   (edit)
```

Migration: `add_place_contact_fields` (Supabase project `owgqntmgavexijwozyyx`).

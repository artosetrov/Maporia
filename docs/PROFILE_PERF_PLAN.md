# /profile — план разгона

**Симптом (2026-05-10, прод):** на `/profile` юзер видит скелетон 8+ сек, иногда вообще не догружается. Скриншот от Артёма: вкладка Added, шапка профиля и карточки — всё ещё placeholders.

**Цели:**
- TTFB-аналог (первый paint имени и аватара) ≤ 1 сек
- Карточки в Added появляются ≤ 2 сек после открытия `/profile?section=added`
- Полная страница (включая reviews/activity) ≤ 3 сек

Ниже — два независимых направления. Их можно деплоить раздельно. Frontend-фиксы — без DDL и без риска. RLS — DDL-миграция, требует ревью.

---

## Направление A — Frontend (без DDL, низкий риск)

Файл: `app/(auth)/profile/page.tsx` (4588 строк, `"use client"`, `force-dynamic`).
Связанные: `app/contexts/UserAccessContext.tsx`, `app/hooks/useUserAccess.ts`, `app/hooks/useBatchPlaceData.ts`.

### A1. Расцепить `loading` per-section ⚠️ главный быстрый win

**Где:** `page.tsx:163`

```ts
const loading = profileLoading || extrasLoading;
```

**Проблема:** `AddedPlacesSection` получает этот общий `loading`. Поэтому даже когда `added` уже в стейте после R1 параллельных запросов, секция продолжает показывать скелетон, потому что `extrasLoading` ещё ждёт R3 (reviewer profiles) и R4 (activity titles).

**Фикс:** ввести гранулярные флаги:

```ts
const [addedLoading, setAddedLoading] = useState(true);
const [savedLoading, setSavedLoading] = useState(true);
const [activityLoading, setActivityLoading] = useState(true);
const [reviewsLoading, setReviewsLoading] = useState(true);
```

И в каждом `Promise.all`/после каждого fetch — флипать только тот, что приехал. `AddedPlacesSection` принимает `loading={addedLoading}` (а не общий). Появится сразу как пришёл R1.

**Ожидаемый выигрыш:** Added показывается на ~1.5–3 сек раньше (отрезаем R2+R3+R4 от его критического пути).

### A2. Убрать дубль profile-fetch

**Где:** `page.tsx:460–482` vs. `useUserAccess.ts:168`.

`UserAccessContext` уже сделал `select id,display_name,username,avatar_url,bio,role,subscription_status,is_admin,favorite_categories,favorite_tags,...` и дал результат через `useUserAccessContext().profile`. Страница в useEffect ждёт `accessLoading=false` и делает почти такой же select ещё раз. Последовательно.

**Фикс:**
- Использовать `profile` напрямую из контекста (`const { profile, access, loading, user } = useUserAccessContext()`).
- Убрать локальный `setProfile`/`setUserRole`/`setUserIsAdmin`. Все нужные поля уже есть в `profile` из контекста. Страница оставляет только локальный fetch для extras (added/saved/...).
- Тогда `setProfileLoading` тоже исчезает: первый paint = когда `accessLoading=false`.

Проверить, что `useUserAccess.ts:168` подтягивает все колонки, которые нужны странице (по текущему select — да, набор больше).

**Выигрыш:** −1 round-trip перед тем как покажется шапка профиля. В прод-холодке это 200–500 мс.

### A3. Сжать 4 раунда extras в 1 RPC или 2 раунда

Сейчас (`page.tsx:444–678`):
- R1 (5 ||): `places.created_by=user.id`, `reactions.user_id=user.id`, `comments.count user_id=user.id`, `comments user_id=user.id LIMIT 50`, `places IN recently_viewed_ids`
- R2 (2 ||): `places IN reactions.place_id`, `comments IN added.place_ids`
- R3 (2 ||): `profiles IN reviewer_ids`, `places IN review_place_ids`
- R4 (1): `places IN activity.placeIds`

R1 → R2 → R3 → R4 — серийно по дате-зависимостям. Это 4× round-trip.

**Варианты:**

**Вариант 3a — оставить клиентом, но оптимизировать порядок:**
- В R1 не запрашивать `comments LIMIT 50` для activity (нужно только для активити-секции, которая под другой вкладкой).
- В R2: `commentsReceived` бессмыслен если у юзера 0 added — короткозамкнуть.
- R3 — слить с R2: реальные deps это reactions→saved, addedIds→commentsReceived. R3 (reviewer profiles) можно стартовать СРАЗУ после R2 — но не ждать. Лучше выкинуть его в `useEffect(() => fetch reviews when section==='users-or-similar')`.
- Activity тайтлы (R4) — лениво, при `section==='activity'`.

**Вариант 3b — Postgres RPC (рекомендую):**

Создать `get_profile_dashboard(p_user_id uuid)` SECURITY INVOKER STABLE, возвращает JSON с `added`, `saved`, `comments_count`, `recently_viewed_ids` (без places, их матерится клиент уже из batch). Один round-trip вместо 4. RLS остаётся как есть (INVOKER).

**Выигрыш:** −800 мс…−2 сек в холодную. Работа: 1 миграция + ребейс fetch-логики.

### A4. Перенести heavy секции под `useEffect(section==='X')`

Activity, reviews-received, recentlyViewed-places не нужны до клика на соответствующую вкладку. Сейчас они грузятся всегда, при первом open `/profile`.

**Фикс:** разделить «всегда нужное» (added counter, saved counter, profile) и «по требованию» (activity items, reviews, recentlyViewed places). Lazy-fetch по `section`.

**Выигрыш:** ~50% запросов в R2/R3/R4 не делаются вовсе на дефолтном открытии.

### A5. RSC-shell + client islands (большая работа, отдельный PR)

`/profile` — 159KB raw .tsx, всё `"use client"`. Шапку (имя, аватар, статусы, sidebar) можно отрендерить серверным компонентом по cookie-сессии. `AddedPlacesSection`, `TripsSection`, `ActivitySection` — клиентские острова.

Зависимость: нужен серверный supabase-клиент (`@supabase/ssr` + cookies()). У нас уже есть в `middleware.ts`, но не в pages.

**Выигрыш:** первый paint ≤ 500 мс, JS-bundle меньше. Большой рефактор — отдельный этап.

### A6. `useBatchPlaceData` стартует раньше places

Сейчас `useBatchPlaceData(cardPlaceIds, cardCreatorIds)` запускается из секции, после того как `loading=false` и `places.length > 0`. После A1 это уже не блокер UI (места показываются с placeholder-обложкой), но всё равно — лишний round-trip.

**Фикс:** перенести батч-фетч в общий effect страницы — стартует параллельно с extras, как только пришёл R1 с `added` + `saved`. Photos и creator-profiles за один round-trip с reactions/comments.

---

## Направление B — RLS / база (DDL, средний риск)

Источник: Supabase performance advisors на проекте `owgqntmgavexijwozyyx` (проверено 2026-05-10).

### B1. Почистить permissive policies на `places`

**Найдено:** `places SELECT` имеет **6 PERMISSIVE-политик**. Каждый SELECT прогоняет все 6 (PERMISSIVE объединяются OR'ом, и Postgres вычисляет каждую отдельно):
- «Public read»
- «Anyone can view all»
- «Premium users can view premium places»
- «Users can view their own places»
- (+ 2 дубликата с похожими именами)

**Действие:** свести к **2 политикам**:
1. `places_public_select` — PERMISSIVE, для всех (anon+authenticated): `manually_hidden=false AND is_hidden=false AND visibility NOT IN ('hidden','private') AND (NOT premium_only OR (select auth.uid()) IN (premium-роли))`
2. `places_owner_select` — PERMISSIVE, authenticated: `created_by = (select auth.uid())`

Все остальные дропнуть.

**Выигрыш:** SELECT places быстрее в 2–3× на больших датасетах. Главный prod-killer для любого листинга.

### B2. Обернуть `auth.uid()` / `auth.role()` в `(select …)` — 46 политик

**Найдено:** 46 политик в 12 таблицах используют `auth.uid()` напрямую в WHERE, без обёртки `(select auth.uid())`. Postgres исполняет это как volatile-функцию **per-row**, а не как initplan один раз.

**Действие:** замигрить все 46 политик. Pattern:

```sql
-- было:
USING (created_by = auth.uid())
-- стало:
USING (created_by = (select auth.uid()))
```

Семантика идентична, но Postgres кэширует результат на запрос.

**Затронутые таблицы (для /profile критичные):** places, profiles, comments, reactions, place_photos, subscriptions, place_links.

**Выигрыш:** 30–50% к скорости на запросах с большим набором строк.

### B3. Убрать дубликаты политик

- `profiles UPDATE` — есть и «Users can update their own profile», и «Users can update own profile». Сохранить одну.
- `place_photos SELECT` — «Users can view place photos» дублирует «Place photos are viewable by everyone».
- `comments SELECT` — 3 permissive, два можно слить.

### B4. (опц.) Дропнуть 9 unused-индексов

`places_categories_gin_idx`, `places_tags_gin_idx`, `profiles_favorite_categories_idx`, `profiles_favorite_tags_idx`, `comments_place_rating_idx` и др. — `idx_scan=0`. Лишний overhead на write. Не блокер perf чтения, но гигиена.

**Риск:** если запрос в будущем начнёт использовать GIN — придётся восстанавливать. Подождать до явного кейса.

---

## План отгрузки

| Этап | Что | Риск | Статус |
|------|-----|------|--------|
| 1 | A1 (per-section loading) + A2 (убрать дубль profile) | низкий | ✅ done 2026-05-10 |
| 2 | A4 (lazy по section) | низкий | ✅ done 2026-05-10 (activity lazy) |
| 2b | A6 (batch раньше) | низкий | skipped — после B2 RLS быстрая, выигрыш мал; вернуться если будут жалобы |
| 3 | B2 (auth.uid() обёртки) — 1 миграция | средний (DDL) | ✅ done 2026-05-10 (`b2_wrap_auth_uid_in_rls_policies` + `b2_1_helper_functions_stable`) |
| 4 | B1 (дедуп policies на places) — 1 миграция | средний → высокий (можно случайно сломать видимость) | pending — нужен QA-план |
| 5 | B3 (дедуп остальных) | низкий | ✅ done 2026-05-10 (`b3_drop_duplicate_rls_policies`) |
| 6 | A3 (RPC `get_profile_dashboard`) | средний (рефакторинг fetch-логики) | pending |
| 7 | A5 (RSC-shell) | высокий (большой рефактор) | отдельный PR |

### Применённые миграции в B2 + B3

- `b2_wrap_auth_uid_in_rls_policies` — обернул `auth.uid()` и `is_admin()`
  в `(select …)` в 35 политиках на 7 hot-таблицах: `profiles`, `places`,
  `comments`, `reactions`, `place_photos`, `place_links`, `subscriptions`.
  Стало `(( SELECT auth.uid() AS uid) = …)` — initplan вместо per-row call.
- `b2_1_helper_functions_stable` — пометил `has_premium_access()` (×2 overload)
  и `get_user_role()` (×2 overload) как `STABLE`. Их тела — чистые SELECT,
  side-effects нет. До этого они были VOLATILE — Postgres не мог хойстить
  даже из обёрнутых политик.
- `b3_drop_duplicate_rls_policies` — удалил 4 точных дубля политик:
  «comments delete own» (= «Users can delete their own comments»),
  «Users can view place photos» и «place_photos select» (обе = «Place photos
  are viewable by everyone», `qual=true`), «Users can unlike places»
  (= «Users can delete their own reactions»). Особенно важно для
  place_photos — она в hot path /profile через PlaceCard.

**Не трогать пока:** B4 (unused indexes) — не блокер.

## Контроль

После каждого этапа — замер на проде:
- DevTools → Network → отметить TTFB первого paint, время до карточек в Added
- Supabase Dashboard → Logs → SQL → удостовериться что 4-раундная цепочка ушла

## Открытые вопросы

- (A2) Достаточно ли полей в `useUserAccess.ts:168` select'е для шапки профиля? Beg: проверить, что `bio`, `display_name`, `avatar_url`, `favorite_categories`, `favorite_tags` все там — да, они есть.
- (B1) В каких именно условиях premium-only места должны быть видны? Source of truth — `app/lib/access.ts canUserViewPlace`. Перед миграцией B1 — выписать в отдельный док какие user-классы видят какие places, и протестить на staging для каждого класса.
- (A3) Если идём по RPC-варианту — где источник правды для visibility-фильтра в `get_profile_dashboard`? Дублировать тот же предикат, что используется в B1 / `get_top_cities`.

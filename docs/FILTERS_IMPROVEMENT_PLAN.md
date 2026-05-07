# План улучшений FiltersModal

Дата: 2026-05-07
Контекст: после фикса счётчиков TYPE и реактивности categoryCounts по kinds (см. изменения в `app/components/FiltersModal.tsx` и `app/map/page.tsx` от 2026-05-07).

Документ — карта дальнейших улучшений по четырём направлениям, отсортированным по приоритету. Каждый пункт: проблема → предлагаемое решение → эффорт (S/M/L) → риск.

---

## 1. UX и логика счётчиков

### 1.1 [P0] Категории зависят от выбранного TYPE — несоответствие таксономии
**Проблема.** В `app/components/FiltersModal.tsx` секция CATEGORY всегда отрисовывает константу `CATEGORIES` (= `LOCATION_CATEGORIES`, 9 шт. — Food & Drinks, Nature & Walks, Crime & Haunted и т.д.). Если юзер выбирает TYPE=Service, под ним остаются те же location-категории, хотя в `app/constants.ts` уже определены `SERVICE_CATEGORIES` (10 шт. — Photography, Massage, Hair, Spa…) и `EXPERIENCE_CATEGORIES` (10 шт.). Помощник `getCategoriesByKind()` существует — но FiltersModal его не зовёт.
Из-за этого:
- Юзер на Service видит нерелевантные категории.
- Service-карточка с категорией `📸 Photography` не попадает ни под одну видимую категорию в фильтре — выбрать невозможно.
- Счётчики на location-категориях при TYPE=Service будут 0 → они почти всегда будут disabled-выглядеть.

**Решение.**
- Когда `draftFilters.kinds` пустой → показывать union(LOCATION+SERVICE+EXPERIENCE), сгруппированный по типу с подзаголовками (Airbnb-стиль).
- Когда выбран один kind → показывать только его таксономию.
- Когда выбраны несколько kinds → union только этих таксономий, со субсекциями.
- Заголовки секций: "PLACES", "SERVICES", "EXPERIENCES".

**Эффорт:** M (1 файл, ~40 строк, плюс адаптация `getCategoryCount` чтобы не передавать категории из чужой таксономии).
**Риск:** низкий — `getCategoriesByKind` уже есть, работает.

### 1.2 [P1] TYPE-счётчики не учитывают другие выбранные фильтры
**Проблема.** `getKindCount(kind, premiumOnly)` сейчас зависит только от `premiumOnly`. Если юзер выбрал категорию `📸 Photography`, на кнопке Locations стоит `113` (всё в БД), а реально пересечение Locations × Photography = 0.
**Booking/Airbnb-pattern:** счётчик опции = «сколько результатов будет, если я выберу ИМЕННО эту опцию ДОПОЛНИТЕЛЬНО к уже выбранным».
- Locations при выбранной Photography → 0 (правильно, это disabled-сигнал).
- Service при выбранной Photography → ~30 (число фотографов).

**Решение.** Расширить `getKindCount(kind, premiumOnly, otherFilters)` принимать остальные фильтры (categories, tags, cities). Внутри: `select count(*)` с применением всех фильтров кроме `kinds`, плюс `.eq("kind", kind)`.
**Эффорт:** S (1 запрос, 5 строк).
**Риск:** низкий.

### 1.3 [P1] Опции с count=0 — disabled, не выбираются
**Проблема.** Сейчас юзер может выбрать опцию с 0 → получает «Show 0 places» → кнопка disabled, но непонятно что делать.
**Решение.** Если `count === 0` — opacity-50 + cursor-not-allowed + `aria-disabled="true"` + onClick=noop. Распространить на TYPE, CATEGORY, TAGS, CITIES.
**Эффорт:** S.
**Риск:** низкий.

### 1.4 [P2] «Show 0 places» — убрать или заменить на CTA
**Проблема.** Когда фильтр даёт 0, кнопка `disabled` без объяснения. Юзер думает «сломалось».
**Решение.** При 0:
- Кнопка-якорь меняется на `Reset filters` (active, не disabled).
- Над кнопкой строка: «No places match these filters».
**Эффорт:** S.
**Риск:** низкий.

### 1.5 [P2] Premium-toggle — быстрая обратимость
**Проблема.** Premium toggle меняет ВСЕ счётчики (kindCounts × 3, categoryCounts × 9, tagCounts × N). При тоггле — 12+ запросов и заметная задержка.
**Решение.** Уйдёт само после п. 2.1 (один запрос всех мест).
**Эффорт:** покрывается 2.1.

---

## 2. Производительность счётчиков

### 2.1 [P0] Заменить N round-trip'ов на 1 SELECT при открытии
**Проблема.** Сейчас при открытии FiltersModal летит ≥13 запросов:
- 9 × `getCategoryCount` (по числу `CATEGORIES`)
- 3 × `getKindCount` (после фикса 2026-05-07)
- 1 × `getFilteredCount` — full SELECT всех мест без `count: 'exact', head: true`
- 1 × `getTagCounts` (батч — это уже хорошо)
- N × `getCityCount` (если секция городов используется)

При смене premium-toggle — повтор всех 12+ запросов. На медленной сети — секунды.

**Решение.** Один SELECT при открытии модала с минимальным набором полей:
```ts
supabase
  .from('places')
  .select('id, kind, categories, tags, access_level, city_name_cached, lat, lng');
```
Это уже близко к тому, что делает `getFilteredCount`. Все count'ы (kind, category, tag, city, total) считаются на клиенте через reduce. Premium-toggle — мгновенный, без round-trip'а.

При размере БД до ~10–20K мест ответ ≤ 500 KB и быстрее, чем 13 раздельных запросов.
Если БД вырастет — переезжаем на серверный RPC (см. 2.2).

**Эффорт:** M (новый хук `useFilterCounts`, удаление 4 prop'ов, замена в page.tsx).
**Риск:** средний — нужно проверить, что при первом открытии нет thundering herd между этим SELECT'ом и основным fetch'ем мест.

### 2.2 [P3] Postgres RPC `get_filter_counts` — для будущего масштаба
**Проблема.** При >20K мест клиентский reduce может быть тяжёлым.
**Решение.** RPC возвращающий
```json
{
  "kinds": {"location": 113, "service": 18, "experience": 15},
  "categories": {"🍽 Food & Drinks": 88, ...},
  "tags": {"romantic": 12, ...},
  "total": 146
}
```
Принимает текущие фильтры и считает в Postgres.
**Эффорт:** L (миграция + RPC + замена клиента).
**Риск:** средний — надо точно повторить логику клиентской фильтрации (radius для городов!).

### 2.3 [P2] Кеш счётчиков на уровне сессии
**Проблема.** Юзер открывает модал → закрывает → открывает снова — повтор всех запросов.
**Решение.** SWR / простой `useRef`-кеш в `UserAccessContext` или новый `FiltersDataProvider`. Инвалидация при `filtersVersion++` или при mutation.
**Эффорт:** S после 2.1.

---

## 3. Код / архитектура

### 3.1 [P1] Дублирование `getFilteredCount` в 4 файлах
**Проблема.** Идентичная логика подсчёта живёт в `app/page.tsx`, `app/map/page.tsx`, `app/id/[id]/page.tsx`, `app/(auth)/profile/page.tsx`. При каждом изменении фильтров приходится править все 4 (что и упустилось при добавлении `kinds`).
**Решение.** Вынести в `app/lib/filterCounts.ts`:
```ts
export async function getFilterCounts(
  supabase: SupabaseClient,
  draftFilters: ActiveFilters,
  draftCities: string[],
  cityCoordsMap: Map<string, {lat,lng}>,
): Promise<{ total: number; kinds: ...; categories: ...; tags: ... }>
```
Каждая страница зовёт один хелпер. После п. 2.1 — это и есть тот самый «один SELECT».
**Эффорт:** M.
**Риск:** низкий — рефакторинг с тестируемым контрактом.

### 3.2 [P2] Убить дубль `premium` / `premiumOnly`
**Проблема.** В `ActiveFilters` есть оба поля (`premium` + `premiumOnly` для backcompat). Везде в коде синхронизируются вручную (`premium: !prev.premium, premiumOnly: !prev.premium`). Источник багов.
**Решение.** Глобальный поиск/замена `premiumOnly` → `premium`, удалить из типа. Один коммит, один диф.
**Эффорт:** S.
**Риск:** низкий, но надо аккуратно с URL-параметрами (если `?premiumOnly=` в внешних ссылках).

### 3.3 [P1] Хук `useFilterCounts(places, draftFilters)` для `FiltersModal`
**Решение.** Логика загрузки categoryCounts/kindCounts/tagCounts сейчас разбросана по трём `useEffect` в FiltersModal. Перенести в кастомный хук, передающий `places: Place[]` (после п. 2.1) и draftFilters. Возвращает `{ total, kinds, categories, tags }`.
**Эффорт:** S после 2.1.

### 3.4 [P3] `filterPlaces` в `app/lib/filterPlaces.ts`
**Проблема.** `filterPlaces()` живёт внутри `app/map/page.tsx:80`. Нужен и на других страницах для подсчёта.
**Решение.** Вынести в `app/lib/filterPlaces.ts` вместе с `PlaceFilters` типом.
**Эффорт:** S.
**Риск:** низкий.

---

## 4. Mobile UX / a11y

### 4.1 [P1] Контраст счётчиков ниже WCAG AA
**Проблема.** Цвет `text-[#A8B096]` (приглушённый счётчик) на белом фоне — расчётный контраст ≈ 2.4:1. WCAG AA для small text требует ≥4.5:1.
**Решение.** Заменить на `text-[#6F7A5A]` (≈4.7:1) либо увеличить размер счётчика до 14px и оставить как есть (для large text ≥3:1). Проще — поменять цвет.
**Эффорт:** S (1 строка).
**Риск:** нулевой.

### 4.2 [P1] Нет focus-state на кнопках
**Проблема.** Класс `transition-all` без `focus:ring-…`. Юзер с клавиатуры не видит, на чём он. Tab-навигация по 12 кнопкам категорий → ничего не подсвечено.
**Решение.** Добавить `focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-2` на все интерактивные кнопки модала. Также проверить `outline-none` — если он есть, заменить на `focus-visible:outline-none`.
**Эффорт:** S.
**Риск:** нулевой.

### 4.3 [P2] Bottom-sheet без swipe-to-dismiss
**Проблема.** На мобайле модал — bottom sheet с drag handle (визуальный), но drag handle не drag'ается. Юзер тянет вниз — ничего не происходит.
**Решение.** Либо убрать визуальный handle (он обманывает), либо добавить swipe-to-close через `framer-motion` / `vaul`. Минимальный вариант — `onTouchStart/onTouchMove` на header.
**Эффорт:** M (без библиотеки) / S (с `vaul`).
**Риск:** средний — touch events на iOS Safari капризничают, см. уже существующие `body.style.position='fixed'` хаки в коде.

### 4.4 [P2] Touch targets кнопок-категорий
**Проблема.** Кнопки `py-4` ≈ 60px высотой при 33% ширины экрана (~125px у iPhone SE) — это ОК. Но кнопки тегов в `grid-cols-4` дают ~95px — на грани минимума 44×44 от Apple HIG. На очень мелких экранах (320px) могут стать <80px ширины и тяжело попадать.
**Решение.** На <360px переключаться на `grid-cols-3` для тегов.
**Эффорт:** S.
**Риск:** нулевой.

### 4.5 [P2] Aria-label на кнопках с эмодзи
**Проблема.** Скринридер читает кнопку категории как «sparkle Vibe and Atmosphere» (эмодзи произносится буквально). Многие плохо настроенные iOS VoiceOver вообще проглатывают.
**Решение.** Эмодзи внутри `<span aria-hidden="true">`. Текст метки оставить — он считается.
**Эффорт:** S.
**Риск:** нулевой.

### 4.6 [P3] Reduce motion
**Проблема.** `animation: 'slide-up 0.3s ease-out'` на модале не уважает `prefers-reduced-motion`.
**Решение.** В CSS:
```css
@media (prefers-reduced-motion: reduce) {
  .filters-modal { animation: none; }
}
```
**Эффорт:** S.

---

## Предлагаемый порядок работ

1. **Спринт 1 (P0, ~1 день).**
   - 1.1 Категории по выбранному TYPE.
   - 2.1 Один SELECT при открытии → 0 round-trip'ов на тоггл премиума.
2. **Спринт 2 (P1, ~1 день).**
   - 1.2 TYPE-счётчики учитывают другие фильтры.
   - 1.3 Disabled-стейт для count=0.
   - 3.1 Вынести `getFilterCounts` в `app/lib/filterCounts.ts`.
   - 3.3 Хук `useFilterCounts`.
   - 4.1 Контраст счётчиков.
   - 4.2 Focus-state.
3. **Спринт 3 (P2, по необходимости).**
   - 1.4 Reset CTA вместо «Show 0 places».
   - 3.2 Убить `premiumOnly`.
   - 4.3 Swipe-to-close.
   - 4.4–4.5 Touch targets, aria-hidden эмодзи.
4. **Бэклог (P3).**
   - 2.2 RPC `get_filter_counts` если БД вырастет >20K.
   - 3.4 `filterPlaces` в shared lib.
   - 4.6 reduce-motion.

---

## Принципы решений

- **Один источник правды для счётчиков.** Сейчас 4 страницы дублируют логику. После рефакторинга — `app/lib/filterCounts.ts` + хук.
- **Booking-pattern для интерактивности.** Счётчики должны зависеть от других фильтров, кроме своей группы. Это даёт юзеру понимание, какие комбинации вообще возможны.
- **Disabled, не пустой результат.** Не позволять юзеру кликать в пустоту.
- **Минимум round-trip'ов.** Один SELECT на открытие модала, всё остальное — клиентский reduce.

---

## Что НЕ делаем сейчас

- Поиск/автокомплит внутри модала по категориям и тегам — overkill, у нас 9 категорий и до ~30 тегов. Вернёмся, если их станет 100+.
- Per-user сохранённые комбинации фильтров («Saved searches»). Отдельная фича, не оптимизация.
- Server-side rendering модала — он dynamic-loaded, и так норм.

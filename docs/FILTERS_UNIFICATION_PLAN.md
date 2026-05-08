# Filters Unification Plan (2026-05-08)

## Контекст и проблема

Артём заметил, что фильтры на главной (`/`) и на «внутренних» страницах (`/map`, `/feed`, `/saved`, `/profile`, `/id/[id]`) ведут себя по-разному. Скриншоты:

1. На `/` — TYPE как **radio**: ровно один тип выбран всегда (Locations / Experiences / Services). Категории показаны без подзаголовков.
2. На `/map` — TYPE как **multi-select**: можно 0 или несколько. Показаны все три таксономии с подзаголовками `PLACES · CATEGORY`, `SERVICES · CATEGORY`, `EXPERIENCES · CATEGORY`.
3. На `/feed`, `/saved`, `/profile`, `/id/[id]` — TYPE **полностью скрыт** (`hideKindFilter`).

## Ключевое открытие архитектуры

**Все страницы кроме `/map` при apply фильтров редиректят на `/map?…`.** Реальная фильтрация по `kind` выполняется только на `/map` через `.in("kind", kinds)` в SQL. На остальных страницах модал — просто билдер URL.

Значит унификация сводится к двум вещам:

1. **UX-единообразие модала**: везде один и тот же режим (multi-select).
2. **Корректное прокидывание `kinds` в URL** при редиректе на `/map`.

## Решение (из AskUserQuestion 2026-05-08)

- Везде **multi-select** TYPE (как на `/map`).
- На `/feed`, `/saved`, `/profile`, `/id/[id]` — **показать TYPE** и применить фильтр (через URL → `/map`).

## Изменения по страницам

### `app/components/FiltersModal.tsx`

Никаких изменений в самом компоненте не требуется — он уже поддерживает multi-select по умолчанию. Пропсы `singleKindMode` и `hideKindFilter` остаются как escape hatch (на случай будущих экранов), но в нашей кодбазе никто их больше не использует.

### `app/page.tsx` (главная)

- Удалить prop `singleKindMode` при рендере `FiltersModal`.
- `appliedFilters.kinds = activeKind ? [activeKind] : []` — оставляем как initial preselection (юзер пришёл на таб «Locations» → в модале сразу подсвечен Locations).
- В `handleFiltersApply`:
  - Удалить sync с табом главной (`if (nextKind !== activeKind) setActiveKind(nextKind);`) — т.к. multi-select может дать 0 или 2+ kind'а, и таб главной перестаёт быть валидной проекцией. Раз всё равно push на `/map`, sync не нужен.
  - Передавать `kinds` CSV в URL — уже есть.
- Счётчик `activeFiltersCount`: добавить `(activeFilters.kinds ?? []).length`.

### `app/feed/page.tsx`

- Удалить `hideKindFilter`.
- В `onApply` (FiltersModal): добавить
  ```ts
  if (filters.kinds && filters.kinds.length > 0) {
    params.set("kinds", filters.kinds.join(","));
  }
  ```
- Счётчик `activeFiltersCount`: добавить kinds.

### `app/(auth)/saved/page.tsx`

То же, что `/feed`.

### `app/(auth)/profile/page.tsx`

- Удалить `hideKindFilter`.
- `handleFiltersApply` — найти и добавить `kinds` в URL params.
- Локальный `getFilteredCount` для секций `trips`/`added` — добавить kind-фильтр поверх `categories`:
  ```ts
  if ((draftFilters.kinds ?? []).length > 0) {
    filtered = filtered.filter((p) => (draftFilters.kinds ?? []).includes(p.kind));
  }
  ```
  Это требует, чтобы в `Place`-типе была `kind`-колонка. Если её нет в выборке — добавить в `select(...)`.
- Счётчик `activeFiltersCount`: добавить kinds.

### `app/id/[id]/page.tsx`

- Удалить `hideKindFilter`.
- `handleFiltersApply` (если есть) — добавить kinds в URL.
- `getFilteredCount` уже опрашивает `places` — добавить `.in("kind", kinds)` если выбран kinds.

## Что не делаем

- Не убираем `singleKindMode`/`hideKindFilter` из FiltersModal API — оставляем на будущее.
- Не трогаем backend / SQL-фильтр на `/map` — он уже принимает `kinds`.
- Не реализуем серверную kind-фильтрацию для feed/saved/profile/id «in place» — все эти страницы редиректят на /map, поэтому достаточно корректного URL.

## Верификация

Чек-лист:
- [ ] На каждой из страниц `/`, `/map`, `/feed`, `/saved`, `/profile`, `/id/[id]` модал открывается, секция TYPE видна, можно выбрать 0/1/несколько типов.
- [ ] При apply на любой странице URL `/map` содержит `?kinds=…` если выбраны.
- [ ] На `/map` фильтр действительно сужает список (server-side `.in("kind", …)`).
- [ ] Счётчик активных фильтров на топбаре учитывает kinds.
- [ ] Reset all сбрасывает kinds.
- [ ] Дев-консоль чистая (нет TS-ошибок и runtime-warnings).

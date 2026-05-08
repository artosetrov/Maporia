# Home Redesign v2 — Integration Plan

> Companion to [`HOME_REDESIGN_INTEGRATION_PLAN.md`](./HOME_REDESIGN_INTEGRATION_PLAN.md)
> (v1, already shipped to code under flag `NEXT_PUBLIC_HOME_REDESIGN`).
>
> v2 prototype: [`redesign-prototype-v2.html`](../redesign-prototype-v2.html).

## What v2 changes vs v1

v1 — Airbnb-style: центрированный hero, search-bar как trigger открывающий
SearchModal, ticker под поиском, ниже карусели.

v2 — Dribbble-style: split hero (текст слева, визуальный плакат справа),
**search — реальный input** (submit → редирект на `/map?q=…`), tabs со
**счётчиками**, popular теги под поиском, CTA-баннер «Become a provider»,
ticker съезжает в самый низ. Все элементы привязаны к **реальному контенту
Maporia** (Fort Lauderdale, `LOCATION_CATEGORIES`, live counts).

| Элемент | v1 (in-code) | v2 (target) |
| --- | --- | --- |
| Layout | Центрированный hero | Split: text + tabs + search + popular слева, visual panel справа (≥ lg) |
| Заголовок | «Where to next?» | «Discover *local gems* of **Fort Lauderdale**» — город кликабельный (city picker) |
| Eyebrow | «Discover · Curated by locals» | «Curated by locals · Fort Lauderdale» + live-pulse dot |
| Tabs | Сегментированный pill-control | Минималистичный (текст + иконка), active = тёмная pill, **+ счётчики** (276 / 0 / 1) |
| Search | Trigger 4-зон → открывает SearchModal | **Real input** + 🔍 button. Submit → `router.push("/map?q=…")`. Mobile тоже real input. |
| Popular tags | — | Новый ряд под поиском, теги = `getCategoriesByKind(activeKind)` |
| Visual panel (right) | — | Новый компонент только на ≥ lg: map texture + pins + 1–2 mock карточки + live-chip |
| CTA banner | — | Новый блок ниже hero: «Become a provider» trigger → `BecomeProviderModal` |
| Stats ticker | Под sticky-зоной | Перенесён в самый низ hero (после CTA), стиль тот же |

## What we keep from v1 (still in code)

- `app/config/homeRedesign.ts` — флаг `HOME_REDESIGN_ENABLED`. **Не меняем.**
- `app/types/home.ts` — `HomeKind` + `HOME_TABS`. Будем расширять, не переписывать.
- `app/components/StatsTicker.tsx` — компонент остаётся. Только переедет визуально (порядок в JSX), без изменений в коде.
- Sticky-зона и `top-[64px]` — остаются. Hero v2 не sticky, как и v1.
- TopBar — не трогаем. v2 nav-меню в прототипе показано иллюстративно; реальный TopBar остаётся текущим.
- `SearchModal`, `FiltersModal`, `BecomeProviderModal`, все URL-контракты `/map?…` — без изменений.

## Inventory of code changes

| Файл | Действие | Risk |
| --- | --- | --- |
| `app/components/HomeHero.tsx` | **Переписать** под split layout, добавить city-picker trigger в заголовке | 🟡 |
| `app/components/HomeTabsSegmented.tsx` | **Переписать** визуал + добавить счётчики через новый prop `counts` | 🟢 |
| `app/components/HomeSearchHero.tsx` | **Переписать** trigger → real `<form>` с `<input>`. Также удалить mobile-разделение: используем один компонент, отзывчивый CSS-сеткой | 🔴 (search — критический путь) |
| `app/components/HomeVisualPanel.tsx` | **Новый**, только desktop, presentational | 🟢 |
| `app/components/HomePopularTags.tsx` | **Новый**, контекстные теги по `activeKind` | 🟢 |
| `app/components/HomeBecomeProviderBanner.tsx` | **Новый**, обёртка над существующим `BecomeProviderModal` | 🟢 |
| `app/page.tsx` | Перестроить новую ветку под флагом: убрать v1 search-row, собрать split layout, подключить новые компоненты | 🟡 |
| `app/types/home.ts` | Добавить `HomeKindCounts` тип | 🟢 |
| `app/hooks/useHomeKindCounts.ts` | **Новый** хук — 4 supabase counts (users + 3 kinds), reuse того же запроса что в StatsTicker. Сейчас счётчики дублируются | 🟡 |

> **Note:** v1-компоненты (`HomeHero`, `HomeTabsSegmented`, `HomeSearchHero`) **переписываются**, потому что флаг до сих пор выключен в проде — никто кроме разработчика их не видел. Без флага main / staging остаются на legacy. Если случайно включал на preview — выключи, сделай новый build.

---

## Phases

### Phase A — `useHomeKindCounts` хук (≈ 1 ч, 🟡)

`StatsTicker` сейчас сам делает 4 supabase counts. Tabs v2 хочет показать
3 из них (locations / services / experiences) рядом с подписью таба.
Делать ещё один запрос — расточительство.

**Создать** `app/hooks/useHomeKindCounts.ts`:

```ts
export type HomeKindCounts = {
  locations: number | null;
  services: number | null;
  experiences: number | null;
  users: number | null;
};

export function useHomeKindCounts(): { counts: HomeKindCounts; loading: boolean } {
  // 4 параллельных count(*) запроса как в StatsTicker, но с общим состоянием.
  // Используется и Tabs (для счётчиков), и StatsTicker (вместо собственного fetch).
}
```

`StatsTicker` мигрирует на новый хук — удаляет дублирующий useEffect.
Cancellation, `hasValidSupabaseConfig` гейт, обработка `manual override`
из `app_settings.stats_banner` остаются на стороне `StatsTicker` (хук
отдаёт сырой live count, override — забота консьюмера).

**Acceptance:**
- [ ] Сетевая панель: на главной 4 count-запроса (как сейчас), не 8.
- [ ] StatsTicker отображает те же числа.
- [ ] Хук работает в SSR-friendly режиме (не падает без window).

---

### Phase B — Tabs со счётчиками (≈ 1 ч, 🟢)

Переписать `HomeTabsSegmented.tsx`:

- Новый визуал: текст + иконка, без подложки на неактивных, тёмная pill
  на активном.
- Добавить prop `counts: HomeKindCounts` (или `Partial<>` чтобы не падать
  пока хук не отдал).
- Иконки tabs менять — теперь это inline SVG (не emoji), чтобы стиль
  совпадал с Dribbble-направлением. Emoji в `HOME_TABS` можно оставить
  как fallback.

```tsx
<HomeTabsSegmented
  active={activeKind}
  onChange={setActiveKind}
  counts={counts}   // NEW
/>
```

Roving tabindex и `←/→` keyboard оставляем — они уже работают.

**Acceptance:**
- [ ] Числа в tabs совпадают с числами в ticker.
- [ ] При `count = null` бейдж скрыт (а не «—»).
- [ ] При `count = 0` бейдж показан (например «0»), таб НЕ disabled —
      клик ведёт на `EmptyKindState`.

---

### Phase C — Hero (split layout) (≈ 2 ч, 🟡)

Переписать `HomeHero.tsx`:

- Split на ≥ lg: левая колонка (eyebrow + h1 + lede), правая колонка
  пустой контейнер для `HomeVisualPanel`.
- На < lg текст центрирован, visual панель скрыта.
- Заголовок «Discover *local gems* of {city}.» — город как `<button>`,
  открывает city picker.
- Live-pulse dot в eyebrow.
- City picker — переиспользуем существующий dropdown из
  `SearchBar.tsx` (там уже есть `cityDropdownOpen` + `cityDropdownRef` +
  список `CITIES` + onCityChange коллбек). Либо вынести в общий компонент
  `CityPickerPopover`. Решаем по ходу — если SearchBar полностью
  remove'ится из главной (см. Phase D), переиспользование проще через
  вынос.

**Open question:** клик по городу в заголовке = открытие city dropdown,
или открытие SearchModal на «город»? **Рекомендация:** city dropdown, как
сейчас в SearchBar — не пугать пользователя модалкой ради смены города.

**Acceptance:**
- [ ] На < lg — стек по центру, как у мобилки в прототипе.
- [ ] На ≥ lg — split, текст слева, визуал справа.
- [ ] Клик по городу в заголовке → dropdown с 4 городами + «Anywhere».
- [ ] После выбора города — заголовок обновляется, ticker и live-chip
      пересчитываются (если хук подписан на `selectedCity`).

---

### Phase D — Search hero (real input) (≈ 4 ч, 🔴)

**Самая рискованная фаза.** Сейчас на главной поиск — это trigger,
открывающий SearchModal. v2 хочет настоящий input с прямым редиректом
на `/map?q=…`.

Переписать `HomeSearchHero.tsx`:

```tsx
type Props = {
  selectedCity: string | null;
  onSubmit: (query: string) => void;        // page.tsx → handleSearchChange
};

export default function HomeSearchHero({ selectedCity, onSubmit }: Props) {
  const [value, setValue] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(value); }}>
      <Icon name="map-pin" />
      <input
        type="text"
        placeholder="Search beaches, bars, hidden gems…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" aria-label="Search"><Icon name="search" /></button>
    </form>
  );
}
```

**Где открывается SearchModal сейчас**, что меняется:

| Раньше | Что делать в v2 |
| --- | --- |
| Клик на desktop SearchBar → SearchModal | Убрать. Юзер печатает прямо в input |
| Клик на mobile SearchBar pill → SearchModal | Оставить как есть на мобайле для legacy SearchBar; в v2 mobile тоже использует HomeSearchHero (real input) |
| Клик на «Where» в HomeSearchHero v1 → SearchModal | N/A (v1 удалён) |

**Что делать с extended search в SearchModal** (city + tags picker):
SearchModal остаётся доступен через **отдельный** trigger. Варианты:

1. **«Advanced» small button рядом с input** (типа `⚙` или текст
   «advanced»). При клике — открывает SearchModal. Минимально визуально.
2. **Filters button = open FiltersModal**, городов нет в input — город
   меняется только через city-picker в заголовке. Самое чистое.

**Рекомендация:** вариант 2. SearchModal перестаёт быть нужен на главной
вообще; он остаётся только в TopBar для других страниц (`/map`,
`/explore`). Город меняется через city-picker, фильтры — через
FiltersModal-кнопку (см. Phase G ниже).

**URL контракт без изменений:**
- Submit input «cafe» → `router.push("/map?q=cafe&city=Fort%20Lauderdale")`
  (тот же `handleSearchChange` из page.tsx, не трогаем).
- Apply фильтры → `handleFiltersApply` (тот же).
- Изменение города → `handleCityChange` (тот же).

**Acceptance — критическое:**
- [ ] Input получает фокус по клику в любую часть pill-обёртки.
- [ ] Enter в input = submit form = редирект на `/map?q=…`.
- [ ] При пустом input + submit → редирект на `/map?` без q (просто
      открывает карту).
- [ ] iOS / Safari: клавиатура не задирает hero вверх криво (тестим в DevTools).
- [ ] Autofill (1Password, browser saved) не ломается.
- [ ] Lighthouse mobile: реальный input не уронил LCP (текст input не
      должен быть LCP target — должен быть hero h1).

---

### Phase E — Visual panel (right column) (≈ 2 ч, 🟢)

Создать `app/components/HomeVisualPanel.tsx`:

- Только desktop (`hidden lg:block`).
- Внутри: фон с map-dot текстурой + 4–5 pin-иконок + 1 main mock карточка
  + 1 secondary peeking карточка + live-chip.
- Контент карточек — статичные moki по умолчанию.

**Открытый вопрос:** реальные top places из БД или моки?

Реальные — RPC `get_top_places(city, kind, limit)` или просто
`places.select().order('like_count').limit(2)`. Это +1 SELECT при первом
рендере. Плюсы: hero «живой», социальная валидация. Минусы: ещё один
запрос.

**Рекомендация:** **Phase E.1 = моки**, **Phase E.2 = реальные после
первого rollout** (когда метрики покажут, что hero не тормозит). Гибкая
архитектура: компонент принимает prop `featured?: PlaceCard | null`;
если не передан — рисует мок.

**Acceptance:**
- [ ] На < lg компонент рендерит `null`.
- [ ] Live-chip показывает реальный count locations через
      `useHomeKindCounts`.
- [ ] Никаких новых картинок в bundle (фон — CSS gradient).

---

### Phase F — Popular tags (≈ 1.5 ч, 🟢)

Создать `app/components/HomePopularTags.tsx`:

```tsx
type Props = {
  activeKind: HomeKind;
  onTagClick: (category: string) => void;   // page.tsx → handleTagClick
};

const POPULAR_BY_KIND: Record<HomeKind, string[]> = {
  location: [
    "🌅 Scenic & Views",
    "🤫 Hidden & Unique",
    "🍸 Bars & Wine",
    "🍽 Food & Drinks",
    "🌳 Nature & Walks",
  ],
  experience: [
    "🏊 Water Sports",
    "🗺 Tours & Walks",
    "🍷 Tastings",
    "📷 Photo Walks",
    "🥾 Adventures",
  ],
  service: [
    "📸 Photography",
    "💆 Massage",
    "✂️ Hair",
    "🧖 Spa & Wellness",
    "👨‍🍳 Chefs & Catering",
  ],
};
```

Список — подмножество `LOCATION_CATEGORIES` / `SERVICE_CATEGORIES` /
`EXPERIENCE_CATEGORIES` (из `constants.ts`). Эти 5 — куратирский
выбор «что показывать на главной». Можно вынести в
`app_settings(id='home_popular_tags')` если потом захотим править
без редеплоя — но для MVP хардкод.

Клик по тегу → `handleTagClick(category)` (уже существует в page.tsx) →
`router.push("/map?categories=…")`.

**Acceptance:**
- [ ] Список меняется при смене таба без перерисовки всего hero
      (мемоизированный список).
- [ ] Mobile: горизонтальный скролл с `scrollbar-width: none`.
- [ ] Tab key проходит по тегам, Enter = click.

---

### Phase G — Filters trigger (≈ 0.5 ч, 🟢)

В v1 у HomeSearchHero был внутренний slot для Filters. В v2 search —
просто input. Где же Filters?

**Решение:** маленькая кнопка-иконка справа от input pill (внутри той же
обёртки, перед 🔍-кнопкой) или в отдельном ряду. Прототип v2 не показал
её явно — её надо добавить в коде.

```
[ 📍 Search… ⚙ 🔍 ]
```

Где `⚙` — `<Icon name="filter" />` с badge active filters count, как
в v1.

Альтернатива — оставить Filters только во FiltersModal-pop-up из
**FiltersButton** под Popular tags ряд. На скриншоте Dribbble такого нет,
но у нас фильтры — реально полезная функция.

**Рекомендация:** маленькая иконка `⚙` внутри pill, перед `🔍`. Меньше
визуального хлама, юзер привык что фильтры рядом с поиском.

---

### Phase H — Become provider banner (≈ 1 ч, 🟢)

Создать `app/components/HomeBecomeProviderBanner.tsx`:

- Светло-зелёная подложка (`bg-[#eef0e0]`).
- Pill «Become a provider NEW».
- Текст: «Знаешь скрытое место, делаешь массаж на дому, водишь photo walks по A1A? Опубликуй карточку за 2 минуты — оплата идёт между тобой и гостем напрямую.»
- Клик по pill → открывает существующий `BecomeProviderModal`.

`BecomeProviderModal` уже подключён в TopBar — нужно либо вытащить общее
состояние (контекст) для двух точек открытия, либо иметь свою копию
modal в новом компоненте. **Простейший путь:** банер-pill = `<Link href="/add">`
если у пользователя уже есть Pro plan, иначе trigger открытия модалки
через тот же контекст что и TopBar. Если контекста нет — добавить
`BecomeProviderContext` (3-4 строки).

---

### Phase I — Page wiring (≈ 1.5 ч, 🟡)

Переписать новую ветку под флагом в `app/page.tsx`. Структура:

```tsx
{HOME_REDESIGN_ENABLED ? (
  <>
    <HomeHero
      city={selectedCity}
      onCityChange={handleCityChange}
      counts={counts}
      activeKind={activeKind}
      onChangeKind={setActiveKind}
      onSubmitSearch={handleSearchChange}
      onFiltersClick={handleFiltersClick}
      activeFiltersCount={activeFiltersCount}
      onTagClick={handleTagClick}
    />
    <HomeBecomeProviderBanner />
    <StatsTicker />
    {/* далее карусели как сейчас */}
  </>
) : (
  /* legacy layout — пока не трогаем, всё ещё в коде */
)}
```

`HomeHero` v2 становится «компоновщиком» — внутри него собирается
левая колонка (текст + tabs + search + popular tags + filters trigger)
и правая колонка (`HomeVisualPanel`). Так page.tsx не знает про
внутреннюю split-сетку.

Sticky-зона из v1 (с tabs row + search row) **удаляется** в v2-ветке —
hero не sticky, под ним сразу банер и ticker.

**Что важно НЕ сломать:**
- `?tab=` URL контракт — работает через `setActiveKind`.
- Lazy `ensurePlacesForTagsLoaded` — продолжает срабатывать только при
  открытии FiltersModal (`handleFiltersClick`).
- `searchParams` через `<Suspense>` обёртку — не трогаем.

---

### Phase J — QA / perf / a11y (≈ 3 ч)

Расширенный smoke (см. полный чек-лист в `HOME_REDESIGN_SMOKE_RUNBOOK.md`,
v2-добавления):

- [ ] Real input: автокомплит браузера не ломается; submit Enter работает.
- [ ] City picker в заголовке открывается клавишей Enter/Space на city-кнопке.
- [ ] Tab counts обновляются после смены города (если city-зависимые) или
      остаются глобальными (текущая реализация — глобальные).
- [ ] Visual panel рендерится **только** на ≥ lg (DevTools toggle).
- [ ] Popular tags меняются при смене tab без визуального flash.
- [ ] BecomeProviderModal открывается одинаково из TopBar и из банера.
- [ ] Lighthouse mobile: LCP — это hero h1, не visual panel.
- [ ] Bundle delta ≤ 6 KB (3 новых компонента + хук + расширения существующих).

---

### Phase K — Rollout

Идентично v1. Тот же флаг `NEXT_PUBLIC_HOME_REDESIGN`. Но **обнули его на
Preview перед деплоем**, чтобы не показать промежуточное состояние:

```bash
# Vercel → Settings → Environment Variables
# Найти NEXT_PUBLIC_HOME_REDESIGN на Preview = 1
# Снять до окончания всех Phase A–I.
# Включить обратно после Phase J QA.
```

---

## Risk matrix (delta vs v1)

| Риск | Вероятность | Митигация |
| --- | --- | --- |
| Real input ломает SearchModal-flow на мобайле (юзеры привыкли тапать на pill и видеть модалку) | средняя | Mobile тоже получает real input. Фокус остаётся на hero. Если есть аналитика — посмотреть, сколько % мобильных юзеров реально используют SearchModal. |
| City picker в заголовке = новый паттерн взаимодействия | средняя | Подчёркивание зелёной линией под городом + tooltip при hover. Включить в smoke-чек-лист. |
| Visual panel грузит +1 запрос (если Phase E.2) | низкая | Делаем E.1 (моки) сначала, тянем реальные данные позже после метрик. |
| Tab counts вылетают при медленном БД | низкая | `count = null` → бейдж скрыт. Tabs не блокируются на загрузке. |
| Bundle > +6 KB | низкая | Visual panel — pure CSS, без картинок. Popular tags — статичный массив. |
| Search Real input + клавиатура iOS «зум на focus» | средняя | `font-size: 16px` минимум на input (anti-iOS-zoom). |
| BecomeProviderModal не открывается из второго места | низкая | Завести `BecomeProviderContext` или просто экспортировать trigger из существующего хука. |

---

## Estimated time

| Phase | Time |
| --- | --- |
| A — useHomeKindCounts hook | 1 h |
| B — Tabs со счётчиками | 1 h |
| C — Hero split + city picker | 2 h |
| D — Search real input | 4 h |
| E — Visual panel (mocks) | 2 h |
| F — Popular tags | 1.5 h |
| G — Filters trigger inside search | 0.5 h |
| H — Become provider banner | 1 h |
| I — Page wiring | 1.5 h |
| J — QA / perf / a11y | 3 h |
| K — Rollout (clicks) | 1 h |
| **Total** | **~18.5 h** |

С учётом ревью + доработок — закладывай **3–4 рабочих дня**.

---

## Open questions (resolve before Phase D)

1. **Mobile search: real input или модалка?** Прототип v2 показывает real
   input на мобайле. Это удобнее для одной руки на iPhone? Или лучше
   оставить тап → модалка как было? Зависит от того, есть ли у нас данные
   по успешным сабмитам мобильного поиска. **Default:** real input
   (единый паттерн с десктопом, меньше кода).

2. **Filters trigger — внутри search pill или отдельной кнопкой?**
   **Default:** внутри pill, перед 🔍.

3. **Visual panel: моки или real top places?** **Default:** Phase E.1 моки,
   Phase E.2 (после первого rollout) — реальные.

4. **City picker в заголовке = существующий dropdown или новый компонент?**
   Если в v2 SearchBar полностью удалён с главной — нужно вытащить
   dropdown в общий `CityPickerPopover`, иначе дубль логики.
   **Default:** вынос в общий компонент (одно место для логики выбора
   города).

5. **«Become a provider» banner — всегда виден или только для не-провайдеров?**
   У существующих провайдеров баннер визуальный шум. Можно скрывать
   через `useUserAccessContext().access.canBecomeProvider`.
   **Default:** скрывать для уже-провайдеров.

---

## Cross-references

- v1 plan: [`HOME_REDESIGN_INTEGRATION_PLAN.md`](./HOME_REDESIGN_INTEGRATION_PLAN.md)
- v1 smoke: [`HOME_REDESIGN_SMOKE_RUNBOOK.md`](./HOME_REDESIGN_SMOKE_RUNBOOK.md)
- v2 prototype: [`redesign-prototype-v2.html`](../redesign-prototype-v2.html)
- Stats source of truth: `app/hooks/useStatsBannerSettings.ts` + `app_settings(id='stats_banner')`
- Categories source of truth: `app/constants.ts` (`LOCATION_CATEGORIES`, `SERVICE_CATEGORIES`, `EXPERIENCE_CATEGORIES`)
- Cities source of truth: `app/constants.ts` (`CITIES`, `DEFAULT_CITY`)
- Memory: `maporia_project.md`, `maporia_admin_settings.md`, `maporia_place_kinds.md`, `maporia_home_redesign.md`

# Home Redesign — Integration Plan

> Created 2026-05-07.
> Cross-link: prototype at `redesign-prototype.html` (root), this file is the
> **integration guide**.

---

## 0. Цель и непреложные ограничения

**Цель:** заменить hero главной на «Where to next?» + segmented tabs + crystal-clear
search bar, ужать stats-блок в тонкий тикер. Контент тот же, меняем только
архитектуру первого экрана.

**Что НЕ трогаем (это страховка от регрессии):**

| Контракт | Почему он критичен |
| --- | --- |
| URL-параметр `?tab=services\|experiences` | Управляет `activeKind` на главной. Любая навигация вне страницы (пуши, deeplink из `/add?returnTo=`, `EmptyKindState`) полагается на него. |
| `handleSearchChange / handleCityChange / handleSearchSubmit / handleFiltersApply / handleTagClick` | Все они через `router.push("/map?…")`. Это **единственный** путь поиска с главной. Подписи и сигнатуры менять нельзя — они используются TopBar, SearchBar, SearchModal, FiltersModal. |
| `SearchModal` (`onSearchBarClick`) | Главный UX-вход в поиск на мобайле. Должен открываться от любого hero-search-блока, как сейчас. |
| `FiltersModal` с `hideKindFilter` и lazy `ensurePlacesForTagsLoaded` | На главной TYPE-фильтр выключен (контент типом управляют tabs). Lazy fetch tags-поля экономит мульти-MB до первого открытия модала. |
| `<StatsBanner />` → `app_settings(id='stats_banner')` + `useStatsBannerSettings` | Админ может выключить любую метрику или подменить ручным значением. Тикер должен читать те же данные. |
| Live-counts `count: 'exact', head: true` для users / locations / services / experiences | Считают **только primary `kind`**, без `secondary_kinds` — согласовано с фильтрами. |
| Sticky-зона `top-[64px]` (под TopBar) | Tabs+Search прилипают вместе, hero **не должен** становиться sticky. |
| Mobile/desktop SearchBar через CSS (`lg:hidden / hidden lg:flex`) | Чтобы не было hydration-моргания. Никаких `useEffect(() => setIsMobile(...))`. |
| `<Suspense>` обёртка вокруг `HomePageInner` | `useSearchParams()` без неё ломает prerender. |
| Bundle главной | `/map`, `/profile`, `/explore`, `/id/[id]` уже на грани. Главную тащим в RSC + client islands там, где это возможно. Никаких новых тяжёлых либ. |
| `EmptyKindState` для пустых service/experience | Сейчас рендерится **вместо** карусельного контента (но после hero/tabs/search). Этот порядок сохраняем. |

---

## 1. Скоуп изменений (карта файлов)

```
app/
  page.tsx                           ← главный файл редизайна; перестроить layout, не логику
  components/
    HomeHero.tsx                     ← НОВЫЙ. "Where to next?" + lede. Чистый презентационный.
    HomeTabsSegmented.tsx            ← НОВЫЙ. Сегмент-контрол на 3 kind'а. Заменяет Pill-табы.
    HomeSearchHero.tsx               ← НОВЫЙ. Составной Where/When/Filters bar (Airbnb-style).
                                       Прокидывает существующие колбэки. Это desktop-версия.
                                       Mobile продолжает использовать <SearchBar isMobile/>.
    StatsTicker.tsx                  ← НОВЫЙ. "1,387 travelers · 276 places · …" — одна строка.
                                       Внутри re-uses useStatsBannerSettings. На мобайле — чипы.
    StatsBanner.tsx                  ← БЕЗ ИЗМЕНЕНИЙ. Остаётся как fallback / для других мест.
    SearchBar.tsx                    ← БЕЗ ИЗМЕНЕНИЙ (используется и на других страницах: /map, /explore, /id, /feed, /saved, /profile).
    TopBar.tsx                       ← БЕЗ ИЗМЕНЕНИЙ. На главной он уже showSearchBar=false.
    Pill.tsx                         ← БЕЗ ИЗМЕНЕНИЙ. Используется в куче других мест.
  hooks/
    useStatsBannerSettings.ts        ← БЕЗ ИЗМЕНЕНИЙ.
  config/
    homeRedesign.ts                  ← НОВЫЙ. Один булев флаг + helper. См. фазу 0.
docs/
  HOME_REDESIGN_INTEGRATION_PLAN.md  ← этот файл.
```

**Принцип:** мы **не редактируем** общие компоненты (`SearchBar`, `Pill`,
`TopBar`, `StatsBanner`). Создаём новые компоненты для главной, переключение —
один флаг внутри `app/page.tsx`. Если что-то пошло не так — вернули флаг в `false`,
старый layout рендерится без правок.

---

## 2. Фазы релиза

### Phase 0 — Feature flag (≈ 30 мин, риск 🟢)

**Файлы:** `app/config/homeRedesign.ts`, `app/page.tsx`.

```ts
// app/config/homeRedesign.ts
export const HOME_REDESIGN_ENABLED =
  process.env.NEXT_PUBLIC_HOME_REDESIGN === "1";
```

В `app/page.tsx` оборачиваем обе ветки:

```tsx
{HOME_REDESIGN_ENABLED ? <NewHomeHeader … /> : <LegacyHomeHeader … />}
```

`LegacyHomeHeader` = ровно текущая sticky-зона + StatsBanner (просто вынесенный
в один JSX-фрагмент или inline). `NewHomeHeader` пока пустой — заполним в
следующих фазах.

**Зачем:** переключатель в env даёт мгновенный rollback (`NEXT_PUBLIC_HOME_REDESIGN=0`
→ редеплой Vercel ≈ 30 сек) без правок кода. Разработка идёт без блокировки прода.

**Опционально:** если хочется горячий toggle без редеплоя — добавить
`home_redesign` ключ в `app_settings` (см. `maporia_admin_settings.md`). Но env
проще для первой итерации.

**Acceptance:** `NEXT_PUBLIC_HOME_REDESIGN=0` → главная **байт в байт** старая.
`=1` → пустой экран (или плейсхолдер «WIP»). PR-ревью этой фазы делаем отдельно
от UI-работы — чтобы не путать рефакторинг и редизайн.

---

### Phase 1 — Hero блок (≈ 1.5 ч, риск 🟢)

**Новый файл:** `app/components/HomeHero.tsx`.

```tsx
"use client";
export default function HomeHero() {
  return (
    <section className="px-4 pt-8 pb-4 text-center">
      <p className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#556036]">
        Discover · Curated by locals
      </p>
      <h1 className="font-fraunces text-[40px] sm:text-[56px] leading-[1.05] tracking-[-0.02em] mt-3">
        Where to <em className="italic font-medium text-[#8F9E4F]">next</em>?
      </h1>
      <p className="text-[15px] sm:text-[16px] text-[#6F7A5A] max-w-[540px] mx-auto mt-2">
        Найди место, опыт или сервис в один клик.
      </p>
    </section>
  );
}
```

Вставляем в `app/page.tsx` под `<TopBar>` и **над** sticky-зоной табов.
**Hero не sticky.** Он скроллится вверх вместе с контентом, оставляя tabs+search
залипшими — это и есть Airbnb-паттерн.

**Что проверить:**
- На мобайле hero не съедает первый фолд: должен оставаться виден хотя бы один tab или верхняя часть search-бара.
- Lighthouse CLS = 0 (hero рендерится сразу, не подгружается).
- I18n: тексты hero — RU + EN (см. что у нас на главной русский lede). Если нет i18n-словаря — оставляем как есть, рядом с прочими hardcoded.

**Rollback:** удалить `<HomeHero />` из ветки нового header'а. Изменения только в
двух файлах.

---

### Phase 2 — Segmented tabs (≈ 2 ч, риск 🟡)

**Новый файл:** `app/components/HomeTabsSegmented.tsx`.

```tsx
"use client";
import type { HomeKind } from "../page"; // или вынести HomeKind в types

const TABS: { id: HomeKind; label: string; emoji: string }[] = [
  { id: "location", label: "Locations", emoji: "📍" },
  { id: "experience", label: "Experiences", emoji: "✨" },
  { id: "service", label: "Services", emoji: "🛠" },
];

export default function HomeTabsSegmented({
  active,
  onChange,
}: { active: HomeKind; onChange: (k: HomeKind) => void }) {
  return (
    <div role="tablist" className="inline-flex bg-white border border-[#ECEEE4] rounded-full p-1.5 shadow-sm">
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`h-10 px-5 rounded-full text-[14px] font-medium inline-flex items-center gap-2 transition-colors ${
              isActive ? "bg-[#8F9E4F] text-[#F7F3DA]" : "text-[#5A5F4D] hover:bg-[#F1EDE2]"
            }`}
          >
            <span aria-hidden>{t.emoji}</span>{t.label}
          </button>
        );
      })}
    </div>
  );
}
```

В `app/page.tsx`:

- Вынести тип `HomeKind` и константу `HOME_TABS` в `app/types/home.ts` (или
  оставить локально, импортировать туда). Сейчас они объявлены прямо в
  `page.tsx`.
- Заменить старый блок `{HOME_TABS.map((tab) => <Pill … />)}` на
  `<HomeTabsSegmented active={activeKind} onChange={setActiveKind} />`.
- **`setActiveKind` не трогаем** — он мутирует `?tab=` через `router.replace`,
  это контракт.

**A11y:**
- Добавить `keydown` Left/Right для перемещения между tabs (опционально,
  но грамотный сегмент это умеет).
- `tabindex="0"` только на активной кнопке (roving tabindex), остальные `-1` —
  стандарт для `role="tablist"`.

**Что проверить:**
- Старые ссылки `/?tab=services`, `/?tab=experiences` корректно подсвечивают tab.
- `EmptyKindState` всё ещё рендерится при пустом service/experience.
- `CategoryCarousel` показывается только когда `activeKind !== "location"` и
  `kindIsEmpty !== true` — поведение не меняется.

**Rollback:** одна строка JSX в `page.tsx`. Заменить `<HomeTabsSegmented>` обратно
на старый `{HOME_TABS.map…}` — компонент `Pill` остался нетронутым.

---

### Phase 3 — Search hero (≈ 4 ч, риск 🟡)

Это самая объёмная фаза, потому что мы трогаем критический путь поиска.

**Новый файл:** `app/components/HomeSearchHero.tsx` — только desktop.
Mobile продолжает использовать существующий `<SearchBar isMobile />` —
там уже всё хорошо, под-капотом он открывает `SearchModal`, не ломаем.

```tsx
"use client";

type Props = {
  selectedCity: string | null;
  searchValue: string;
  activeFiltersCount: number;
  onSearchBarClick: () => void;     // открывает SearchModal
  onFiltersClick: () => void;       // открывает FiltersModal
};

export default function HomeSearchHero(props: Props) {
  return (
    <div
      role="search"
      onClick={props.onSearchBarClick}
      className="mx-auto max-w-[760px] grid grid-cols-[1.5fr_1fr_1fr_auto] items-stretch
                 bg-white border border-[#ECEEE4] rounded-full p-2 shadow-[0_4px_16px_rgba(31,36,23,0.08)] cursor-pointer"
    >
      <button type="button" className="text-left px-5 py-2.5 border-r border-[#ECEEE4]">
        <div className="text-[11px] font-semibold text-[#1F2A1F]">Where</div>
        <div className="text-[14px] text-[#8A8F7D] mt-0.5">
          {props.selectedCity ?? "City, region or vibe…"}
        </div>
      </button>
      <button type="button" className="text-left px-5 py-2.5 border-r border-[#ECEEE4]">
        <div className="text-[11px] font-semibold text-[#1F2A1F]">When</div>
        <div className="text-[14px] text-[#8A8F7D] mt-0.5">Any time</div>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); props.onFiltersClick(); }}
        className="text-left px-5 py-2.5"
      >
        <div className="text-[11px] font-semibold text-[#1F2A1F]">Filters</div>
        <div className="text-[14px] text-[#8A8F7D] mt-0.5">
          {props.activeFiltersCount > 0 ? `${props.activeFiltersCount} applied` : "Cuisine, price, mood"}
        </div>
      </button>
      <span className="self-center mr-1 size-14 rounded-full bg-[#8F9E4F] text-[#F7F3DA] inline-flex items-center justify-center">
        🔍
      </span>
    </div>
  );
}
```

**Куда вставить в `page.tsx`:**

```tsx
<div className="border-b border-[#ECEEE4] bg-white sticky top-[64px] z-50">
  <div className="…">
    <div className="flex justify-center pt-3 pb-2">
      <HomeTabsSegmented … />
    </div>
    <div className="pb-3 pt-1">
      <div className="lg:hidden">
        <SearchBar isMobile … />               {/* как сейчас */}
      </div>
      <div className="hidden lg:flex justify-center">
        <HomeSearchHero … />                    {/* НОВЫЙ */}
      </div>
    </div>
  </div>
</div>
```

**Критические инварианты, которые нужно протестировать:**

1. **Клик в любую часть hero-bar открывает `SearchModal`** (через
   `onSearchBarClick`). Сегодня старый `SearchBar` так и работает — мы это
   воспроизводим.
2. **Клик в Filters открывает `FiltersModal`** (через `onFiltersClick`),
   `e.stopPropagation()` обязателен, иначе сверху сработает SearchModal.
3. **`activeFiltersCount`** прокидывается и отображается, чтобы юзер видел, что
   у него есть применённые фильтры.
4. **Клавиатура:** focus order Where → When → Filters → 🔍. Каждая часть —
   `<button type="button">`. Поэтому клавиатура работает как для focusable
   элементов, без хаков.
5. **Не делаем форму с `<input>`**: ввод текста уже происходит в `SearchModal`.
   Hero-bar — это «trigger», не реальный инпут. Так у Airbnb. Если будем
   делать inline-инпут — это **отдельная** фаза, не сейчас.

**Что проверить вручную (smoke):**
- `/?city=Tbilisi&q=cafe&categories=Coffee` рендерится → в hero-баре подставляются город и счётчик фильтров.
- Клик на hero-bar → SearchModal открывается; submit → редирект на `/map?city=…&q=…`.
- Клик на «Filters» → FiltersModal открывается; apply → редирект на `/map?…`.
- Запрос `placesForTags` срабатывает только при первом открытии Filters (`ensurePlacesForTagsLoaded`).

**Rollback:** заменить `<HomeSearchHero …/>` обратно на `<SearchBar … />` (он
уже импортирован). Удалять файл `HomeSearchHero.tsx` не обязательно.

---

### Phase 4 — Stats ticker (≈ 2 ч, риск 🟢)

**Новый файл:** `app/components/StatsTicker.tsx` — переиспользует
`useStatsBannerSettings` + те же 3 cheap counts. Ничего нового в DB.

```tsx
"use client";
import { useEffect, useState } from "react";
import { supabase, hasValidSupabaseConfig } from "../lib/supabase";
import { useStatsBannerSettings, type StatsMetricKey } from "../hooks/useStatsBannerSettings";

const ORDER: StatsMetricKey[] = ["users", "locations", "services", "experiences"];
const EMOJI = { users: "👥", locations: "📍", services: "🛠", experiences: "✨" } as const;
const LABEL_FALLBACK = { users: "travelers", locations: "places", services: "services", experiences: "experiences" } as const;

export default function StatsTicker() {
  const { settings } = useStatsBannerSettings();
  const [live, setLive] = useState<Record<StatsMetricKey, number | null>>({
    users: null, locations: null, services: null, experiences: null,
  });

  // …те же запросы, что в StatsBanner.tsx — копируем 1:1, чтобы цифры точно
  // совпадали и админский manual override продолжал работать.

  if (!settings.enabled) return null;
  const visible = ORDER.filter((k) => settings.metrics[k]?.enabled);
  if (visible.length === 0) return null;

  return (
    <div className="text-[13px] text-[#5A5F4D] flex flex-wrap justify-center gap-x-6 gap-y-2 py-3 border-t border-[#ECEEE4]">
      {visible.map((k, i) => {
        const m = settings.metrics[k]!;
        const n = m.manual ?? live[k];
        return (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden>{EMOJI[k]}</span>
            <b className="text-[#1F2A1F] font-semibold">{n == null ? "—" : new Intl.NumberFormat("en-US").format(n)}</b>
            <span>{m.label || LABEL_FALLBACK[k]}</span>
            {i < visible.length - 1 && <span className="opacity-50 ml-2">·</span>}
          </span>
        );
      })}
    </div>
  );
}
```

В `page.tsx` под новым флагом:

```tsx
{HOME_REDESIGN_ENABLED ? <StatsTicker /> : <StatsBanner />}
```

**Mobile:** на ширинах < lg либо тот же тикер с `flex-wrap`, либо
горизонтальные чипы. В прототипе мы выбрали чипы — оставим этот вариант
параметризацией внутри одного компонента.

**Что проверить:**
- Если админ выключает все 4 метрики в `app_settings` — компонент отдаёт `null`.
- `manual` override отображается вместо live (как и в `StatsBanner`).
- Никаких новых запросов, ничего не сломано в админке `/profile/elements/stats-banner`.

**Rollback:** одна строка — `<StatsBanner />` обратно. `StatsBanner.tsx` мы
не трогали, он живёт.

---

### Phase 5 — QA, perf, a11y (≈ 3 ч)

**Functional smoke (вручную, чек-лист):**

```
[ ] /?
[ ] /?tab=services
[ ] /?tab=experiences
[ ] /?city=Tbilisi
[ ] /?q=cafe
[ ] /?categories=Coffee
[ ] Combo: /?tab=services&city=Bali&q=photo
[ ] Click hero search → SearchModal opens, submit → redirects /map?…
[ ] Click filters in hero → FiltersModal opens, apply → redirects /map?…
[ ] Click tab → URL updates, content kind switches, no full reload
[ ] Empty service/experience tab → EmptyKindState renders
[ ] Stats ticker reflects manual override from /profile/elements/stats-banner
[ ] Login/logout → no auth flash, sections render before auth resolves
```

**Perf (сравнить v1 vs new):**

```
npm run build
# смотрим First Load JS для "/" в выводе
# baseline: записать сейчас, до Phase 0
# after: должна быть ≤ baseline + 4 KB (3 новых компонента + 1 файл конфига)
```

Lighthouse mobile (`http://localhost:3000`):
- LCP ≤ 2.5s (hero текст должен быть LCP — не картинка, текст рендерится из RSC).
- CLS = 0.
- TBT не вырасти больше чем на +50 ms (новые компоненты — лёгкие, без зависимостей).

**A11y (axe-core / keyboard-only):**
- Tab order: лого → Become a provider → меню → tabs → search trigger → filters trigger → search button → first carousel.
- `Tab` нигде не приземляется на `<div onClick>` (мы используем `<button>`).
- Контраст: `#5A5F4D` на `#FAFAF7` — проверить, AA пройден.
- `aria-selected` на табах, `role="search"` на hero-bar.

**Bundle hygiene:**
- Никаких новых зависимостей.
- Компоненты не делают `import * as`.
- `<HomeHero>`, `<HomeTabsSegmented>`, `<HomeSearchHero>`, `<StatsTicker>` —
  client components, но без `useEffect` при первом рендере (кроме
  `StatsTicker`, который и в старом `StatsBanner` имел useEffect).

---

### Phase 6 — Rollout (≈ 1 ч клик-работы)

1. **Dev preview:** `NEXT_PUBLIC_HOME_REDESIGN=1` в Vercel preview branch
   `home-redesign`. Тестируем на preview-домене. Прод не трогаем.
2. **Internal review:** показываем команде, собираем мелкие правки.
3. **A/B (опционально):** если есть PostHog/GA — feature flag по cookie/uid.
   Не критично для MVP.
4. **Soft launch:** включаем в проде на 1 день, смотрим:
   - Sentry — рост ошибок?
   - Analytics — bounce rate / scroll depth / клики на search.
5. **Cleanup (через 1–2 недели стабильной работы):**
   - Удалить ветку legacy header'а из `page.tsx`.
   - Удалить `HOME_REDESIGN_ENABLED`.
   - Удалить `StatsBanner.tsx`, **только** если не используется в других местах
     (проверить grep — сейчас он только в `app/page.tsx` + админка
     `app/(auth)/profile/elements/stats-banner/page.tsx`; админка должна
     остаться — она настраивает данные, не render).

---

## 3. Карта рисков

| Риск | Вероятность | Митигация |
| --- | --- | --- |
| Hero отжимает контент вниз, growth-метрики проседают | средняя | Feature flag → быстрый откат. Сравнить `scroll_depth` и `click_to_search` за неделю. |
| Сегмент-tabs ломают deeplink из push-уведомлений / `/add?returnTo=` | низкая | `setActiveKind` не трогаем; тест-кейсы на все 3 значения `?tab=`. |
| Hero-search-bar «съедает» клик на Filters | средняя | `e.stopPropagation()` на Filters-кнопке. Smoke-тест в чек-листе. |
| Тикер не учитывает manual override → админ обижается | низкая | Re-use `useStatsBannerSettings`. Покрыть E2E-тестом, если есть; иначе — ручной QA на `/profile/elements/stats-banner`. |
| Hydration mismatch из-за server vs client рендера | низкая | Все 4 новых компонента — `"use client"`. Mobile/desktop разделение через CSS, не JS. |
| Bundle главной превысит порог | низкая | Новые компоненты — ~1 KB каждый. Запустить `npm run build` до и после Phase 1–4. |

---

## 4. Open questions (нужно решить до Phase 3)

1. **Нужна ли «When»-секция в hero-search?** Сейчас Maporia не работает с датами
   — `When` в прототипе декоративный. Варианты:
   a) Оставить как UI-якорь, но кликабельный → SearchModal (без логики дат).
   b) Убрать `When` и расширить `Where` + `Filters` на 50/50.
   c) Превратить `When` в `Type` (дублируя tab-state) — нет, конфликтует с tabs.
   **Default:** вариант (a), пока не появятся даты у service/experience.

2. **«Become a provider» CTA** в новом hero?  
   Сейчас он живёт в TopBar. На десктопе ок, на мобайле занимает место. Варианты:
   a) Оставить в TopBar (как сейчас).
   b) Перенести в нижний sheet / меню на мобайле.
   **Default:** (a), `BecomeProviderModal` уже привязан к TopBar — не ломаем.

3. **Кому показываем редизайн первым?** Только админу (`profiles.is_admin`) или
   всем сразу с feature-flag-cookie? Зависит от наличия аналитики.

---

## 5. Приёмка (acceptance criteria)

PR можно мержить, когда:

- [ ] Все Phase 0–4 разнесены по отдельным коммитам (или PR'ам).
- [ ] `NEXT_PUBLIC_HOME_REDESIGN=0` рендерит **байт в байт** старый layout.
- [ ] `NEXT_PUBLIC_HOME_REDESIGN=1` проходит smoke-чек-лист из Phase 5.
- [ ] `npm run check` зелёный (typecheck + lint + build).
- [ ] First Load JS для `/` не вырос более чем на 4 KB.
- [ ] Lighthouse mobile: LCP, CLS, TBT не хуже baseline.
- [ ] A11y: keyboard-only smoke пройден.
- [ ] Прототип `redesign-prototype.html` визуально соответствует
      реализации (минимальные расхождения допустимы — токены, шрифты).

---

## 6. Хронометраж (оценка)

| Фаза | Время |
| --- | --- |
| 0 — Feature flag | 0.5 ч |
| 1 — Hero | 1.5 ч |
| 2 — Segmented tabs | 2 ч |
| 3 — Search hero | 4 ч |
| 4 — Stats ticker | 2 ч |
| 5 — QA / perf / a11y | 3 ч |
| 6 — Rollout (clicks) | 1 ч |
| **Итого** | **~14 ч чистой работы** |

С учётом ревью и доработок — закладывайте **2–3 рабочих дня**.

---

## 7. Cross-references

- Прототип: `redesign-prototype.html` (корень проекта).
- Текущая страница: `app/page.tsx`.
- Stats источник правды: `app/hooks/useStatsBannerSettings.ts` + `app_settings(id='stats_banner')` + `app/(auth)/profile/elements/stats-banner/page.tsx`.
- Filters: `docs/FILTERS_IMPROVEMENT_PLAN.md`.
- Memory: `maporia_project.md`, `maporia_admin_settings.md`, `maporia_place_kinds.md`.

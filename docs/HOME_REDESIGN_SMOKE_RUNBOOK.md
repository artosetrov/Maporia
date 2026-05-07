# Home Redesign — Phase 5 Smoke Runbook

> Companion to `HOME_REDESIGN_INTEGRATION_PLAN.md`. This file is the
> hands-on checklist a reviewer (or you) walks through before merging /
> rolling out. Built around the actual code changes from Phases 0–4.

**Под флагом:** `NEXT_PUBLIC_HOME_REDESIGN=1` (см. `app/config/homeRedesign.ts`).

Каждая секция — независимая. Можно делать в любом порядке. Ставим `[x]`
по ходу. PR можно мержить, когда все «MUST» секции зелёные.

---

## 0 · Pre-flight (5 мин)

```bash
cd "/Users/artosetrov/Documents/MY AI/maporia"

# A. Legacy baseline — флаг ВЫКЛ
unset NEXT_PUBLIC_HOME_REDESIGN
npm run dev
# открой http://localhost:3000/  и сделай скриншот hero'а — это эталон

# B. Redesign — флаг ВКЛ
# в новом терминале (или Ctrl+C + перезапуск)
NEXT_PUBLIC_HOME_REDESIGN=1 npm run dev
# открой http://localhost:3000/  — это и есть редизайн
```

- [ ] Лeagcy и redesign открываются без ошибок в DevTools Console.
- [ ] React Hydration warnings = 0 (любой `Warning: Hydration` — баг).
- [ ] Ни одной красной 4xx/5xx в Network на первый рендер `/`.

---

## 1 · MUST · Hero block (HomeHero)

**Where:** новая секция выше sticky-зоны, рендерится только если `HOME_REDESIGN_ENABLED`.

| Шаг | Ожидаемое |
| --- | --- |
| Открыть `/?` (редизайн) | Видишь eyebrow «Discover · Curated by locals», заголовок «Where to *next*?» (italic accent), lede «Найди место…» |
| Прокрутить вниз | Hero уезжает вверх, sticky-зона табов+search **остаётся** прилипшей к `top-[64px]` |
| Открыть `/?` (legacy) | Hero **отсутствует**. Сразу sticky-зона. |

**MUST checks:**
- [ ] Hero виден только при включённом флаге. (`unset NEXT_PUBLIC_HOME_REDESIGN; npm run dev` — никакого Hero нет.)
- [ ] Hero не sticky.
- [ ] Шрифт заголовка — Fraunces (serif), не sans. Если шрифт не подгрузился — браузер должен фолбэкнуться на Georgia, но пропорции не должны ломаться (см. `font-fraunces` в Tailwind конфиге).
- [ ] CLS = 0 при первом рендере (DevTools → Performance Insights → Layout shift).

---

## 2 · MUST · Segmented tabs (HomeTabsSegmented)

**Where:** строка под Hero, в sticky-зоне.

| Шаг | Ожидаемое |
| --- | --- |
| Клик по «Locations» / «Experiences» / «Services» | URL меняется: `/`, `/?tab=experiences`, `/?tab=services` |
| Активный таб подсвечен оливковым `#8F9E4F`, текст кремовый `#F7F3DA` | визуально |
| Клавиатура: Tab → попасть на активный таб → ←/→ | переключают tabs, **фокус переходит** на следующий, URL обновляется |
| Tab далее | фокус идёт **за пределы** таб-контрола (не блуждает между неактивными) |

**MUST checks:**
- [ ] Прямой переход `/` → активен Locations.
- [ ] Прямой переход `/?tab=services` → активен Services. (deeplink из `/add?returnTo=/?tab=services` — не сломан)
- [ ] Прямой переход `/?tab=experiences` → активен Experiences.
- [ ] Roving tabindex: только активный `tabindex="0"`, остальные `"-1"`. (DevTools → Inspect Element)
- [ ] `aria-selected="true"` на активном.
- [ ] При выборе пустого `service`/`experience` отрисовывается `EmptyKindState` (см. CTA «Create your first service» / «Create an experience»).

---

## 3 · MUST · Search hero (HomeSearchHero) — desktop ≥ lg

**Where:** sticky-зона, `<div className="hidden lg:flex">`. Mobile использует
старый `<SearchBar isMobile/>`, его проверяем в секции 4.

| Шаг | Ожидаемое |
| --- | --- |
| Клик по зоне «Where» | Открывается `<SearchModal>` |
| Клик по зоне «When» | Открывается `<SearchModal>` (та же модалка) |
| Клик по зоне «Filters» | Открывается `<FiltersModal>`, **не** SearchModal |
| Клик по 🔍 кнопке | Открывается `<SearchModal>` |
| Активные фильтры > 0 | На зоне Filters показан badge `«N applied»` + зелёный кружок справа сверху |
| `selectedCity` выставлен | В Where отображается название города (не «City, region or vibe…») |
| `searchValue` выставлен | Заголовок зоны меняется с «When» на «Search», под ним — текст запроса |

**MUST checks:**
- [ ] `/?city=Tbilisi` → в Where написано `Tbilisi`.
- [ ] `/?q=cafe` → во второй зоне заголовок «Search», значение «cafe».
- [ ] `/?categories=Coffee` → на Filters badge `1 applied`.
- [ ] `/?city=Bali&q=photo&categories=Coffee,Music` → все три отражены.
- [ ] Apply фильтров через FiltersModal → редирект на `/map?…` с параметрами. Главное: ни одного непреднамеренного редиректа в момент **открытия** модалки.
- [ ] Submit SearchModal → редирект на `/map?…` (через `handleSearchSubmit`).
- [ ] Клавиатура: Tab по зонам в порядке Where → When → Filters → 🔍.
- [ ] Enter/Space на сфокусированной зоне = клик. (Это default для `<button>`, но проверяем.)
- [ ] `e.stopPropagation()` на Filters работает: нет двойного открытия (FiltersModal не должен сразу закрываться SearchModal'ом).

---

## 4 · MUST · Mobile path (lg < 1024px)

Mobile **не редизайнится** в рамках этих фаз: мы продолжаем рендерить
старый `<SearchBar isMobile/>`. Проверяем, что флаг **не задел** mobile-ветку.

| Шаг | Ожидаемое |
| --- | --- |
| DevTools → Mobile эмуляция (iPhone 12 Pro / 390px) | hero виден; ниже sticky-зона; tabs (segmented) занимают ~ширину строки |
| Клик по «Where?» | Открывается SearchModal |
| Клик по «Filters» | Открывается FiltersModal |
| Скролл вниз | sticky-зона прилипла к top-[64px] |

**MUST checks:**
- [ ] Tabs **не уходят** в горизонтальный скролл (3 ровные кнопки).
- [ ] `<SearchBar isMobile/>` — UI как было до редизайна (pill-style Where? | Filters).
- [ ] Touch-таргеты ≥ 44×44px. (DevTools → Inspect → проверить высоту)

---

## 5 · MUST · Stats ticker (StatsTicker)

**Where:** под sticky-зоной, **до** CategoryCarousel и HomeSection'ов.

| Шаг | Ожидаемое |
| --- | --- |
| `/?` (редизайн) | Видишь одну тонкую строку: `👥 1,387 travelers · 📍 276 places · 🛠 1 services · ✨ 0 experiences` |
| `/?` (legacy) | Видишь старые 4 stat-карточки (StatsBanner) |
| Mobile (< sm = 640px) | Чипы вместо строки, скроллятся горизонтально |
| Числа `null` (фейл запроса) | Ячейка показывает `—`, не пустоту, не `NaN` |

**MUST checks:**
- [ ] Перейти на `/profile/elements/stats-banner` → выставить `manual` для одной метрики (например, users = 9999) → сохранить → вернуться на `/?` → ticker показывает `9999` для users, остальные — live.
- [ ] Выключить enabled у одной метрики в админке → метрика исчезает из тикера. Остальные на месте.
- [ ] Выключить **глобальный** enabled → ticker исчезает (полностью `null`). Карусели контента остаются.
- [ ] Те же действия на `/?` с **флагом=0** (legacy) дают то же самое поведение в `<StatsBanner/>`. (Это контроль того, что общий источник правды не изменился.)

---

## 6 · MUST · Регрессии на других страницах

Общие компоненты, которые мы **не трогали**, но которые могли бы сломаться:

| Компонент | Где используется | Что проверить |
| --- | --- | --- |
| `Pill` | `/(auth)/places/[id]/edit/location/page.tsx` | Открыть страницу редактирования локации, проверить что Pill-кнопки всё ещё рендерятся |
| `SearchBar` (desktop) | `TopBar` (на нон-главных страницах) | `/map`, `/explore`, `/feed`, `/saved`, `/profile`, `/id/[id]` — TopBar всё ещё показывает SearchBar как раньше |
| `StatsBanner` | `/(auth)/profile/elements/stats-banner` | Админ-страница работает без изменений (она редактирует настройки, не рендерит баннер) |
| `SearchModal` / `FiltersModal` | везде | Открываются и сабмитят как раньше |

- [ ] `/map` — SearchBar в TopBar открывает SearchModal, фильтры применяются.
- [ ] `/map?categories=Coffee` — приходим из главной с фильтром, отображается корректно.
- [ ] `/explore` — TopBar на месте, поиск работает.
- [ ] `/profile` — без изменений.
- [ ] `/id/[id]` (любая карточка) — без изменений.
- [ ] `/(auth)/places/[id]/edit/location` — Pill кнопки рендерятся.
- [ ] `/(auth)/profile/elements/stats-banner` — настройки сохраняются.

---

## 7 · A11y / keyboard-only sweep

Сделать без мыши:

- [ ] `Tab` начиная с верха `/`: лого → Become a provider (или меню) → активный таб → search-trigger → магнифер → первая карусель. Никаких приземлений на `<div onClick>`.
- [ ] `←` / `→` на табах переключают.
- [ ] `Esc` закрывает SearchModal, FiltersModal.
- [ ] Все интерактивы имеют focus-ring (фокус виден).
- [ ] `aria-selected`, `role="tablist"`, `role="search"` присутствуют (DevTools → Accessibility tree).
- [ ] Контраст: `#5A5F4D` (muted text) на `#FAFAF7` — должен быть ≥ 4.5:1 для AA. (Chrome DevTools → Issues → Accessibility покажет, если что-то фейлит.)
- [ ] Screen reader (VoiceOver на macOS, `Cmd+F5`):
  - Hero читает eyebrow + заголовок + lede.
  - Сегмент-tabs анонсирует «Locations, tab, 1 of 3, selected».
  - Search-зоны читаются как кнопки с понятными подписями.

---

## 8 · Performance

Сравнение должно быть честным: тот же URL, тот же тротлинг, две сборки.

```bash
# Baseline (без флага)
npm run build
# найти First Load JS для "/" — записать (Y_legacy KB)

# Redesign
NEXT_PUBLIC_HOME_REDESIGN=1 npm run build
# найти First Load JS для "/" — записать (Y_new KB)
```

Acceptance:
- [ ] `Y_new - Y_legacy ≤ 4 KB`.
- [ ] Lighthouse Mobile (Desktop эмуляция, Slow 4G):
  - LCP ≤ 2.5 s (LCP должен быть текст hero, не картинка).
  - CLS = 0.
  - TBT не вырос больше чем на +50 ms.
- [ ] DevTools → Network → запросы `/?`: количество запросов **не выросло**. StatsTicker делает те же 4 (или меньше) supabase counts, что и StatsBanner.

> Если `npm run build` падает локально из-за Turbopack — в плане memory:
> «Полный build не пробовал, может тормозить». В таком случае оставь
> Lighthouse-проверки на preview-домене Vercel (см. секцию 9).

---

## 9 · Preview deploy (Vercel)

Не на прод сразу. Соберём preview.

1. Закоммитить (см. секцию ниже) на ветку `home-redesign` (или любое имя).
2. Запушить → Vercel автоматически собирает preview.
3. В Vercel → Project → Settings → Environment Variables:
   - `NEXT_PUBLIC_HOME_REDESIGN=1` для Preview environment **только**.
   - Production environment пусть остаётся без этой переменной.
4. Сравни preview vs прод визуально и функционально (секции 1–8 заново на preview-домене).

- [ ] Preview-домен показывает редизайн.
- [ ] Прод-домен **не показывает** редизайн.
- [ ] Sentry / Logflare / Vercel Logs за час после preview deploy — нет всплесков ошибок.

---

## 10 · Commit & PR

Атомарные коммиты упрощают review и rollback.

```bash
cd "/Users/artosetrov/Documents/MY AI/maporia"

# Phase 0 — flag + types extraction
git add app/config/homeRedesign.ts app/types/home.ts
git commit -m "feat(home): phase 0 — feature flag + extract HomeKind/HOME_TABS"

# Phase 1 — Hero
git add app/components/HomeHero.tsx
git add app/page.tsx     # частичный — только Hero-часть; см. ниже про патч
git commit -m "feat(home): phase 1 — HomeHero block above sticky zone"

# Phase 2 — segmented tabs
git add app/components/HomeTabsSegmented.tsx
# дополнительные изменения page.tsx уже в индексе после phase 1
git commit -m "feat(home): phase 2 — HomeTabsSegmented replaces Pill row under flag"

# Phase 3 — search hero
git add app/components/HomeSearchHero.tsx
git commit -m "feat(home): phase 3 — HomeSearchHero (Airbnb-style desktop search trigger)"

# Phase 4 — stats ticker
git add app/components/StatsTicker.tsx
git commit -m "feat(home): phase 4 — StatsTicker (compact ticker; reuses stats_banner settings)"

# Docs
git add docs/HOME_REDESIGN_INTEGRATION_PLAN.md docs/HOME_REDESIGN_SMOKE_RUNBOOK.md redesign-prototype.html
git commit -m "docs(home): integration plan + smoke runbook + HTML prototype"

git push -u origin home-redesign
```

> На практике быстрее одним коммитом, если коллеги это терпят. Атомарные —
> ценны при `git revert` отдельной фазы.

**PR description (шаблон):**

```markdown
## Home page redesign (phases 0–4)

Behind feature flag `NEXT_PUBLIC_HOME_REDESIGN`. Default OFF → home page is
byte-for-byte the legacy layout.

### What changes when ON
- Hero «Where to next?» above the sticky zone
- Segmented tabs (Locations / Experiences / Services) instead of Pill row
- Airbnb-style composite search bar on desktop (Where / When / Filters / 🔍)
- Single-line stats ticker instead of 4-card StatsBanner

### What stays
- All URL contracts (`?tab=…`, redirects to `/map?…`)
- SearchModal / FiltersModal flows, including `hideKindFilter` and lazy tags
- Mobile SearchBar isMobile (no mobile redesign in this PR)
- StatsBanner, Pill, SearchBar, TopBar — untouched, still used elsewhere
- `app_settings(id='stats_banner')` admin still controls both versions

### Rollback
Set `NEXT_PUBLIC_HOME_REDESIGN=0` (or unset) and redeploy. ~30 s.

### Risks
See `docs/HOME_REDESIGN_INTEGRATION_PLAN.md` § 3 for full risk matrix.
Highest: hero pushes content down → could affect scroll-depth / click-search.

### Verification
Walked through `docs/HOME_REDESIGN_SMOKE_RUNBOOK.md` — all MUST sections green.
Lighthouse / bundle delta in section 8.
```

---

## 11 · Rollout (Phase 6)

After preview is happy:

- [ ] Merge `home-redesign` → `main`.
- [ ] On Vercel: copy `NEXT_PUBLIC_HOME_REDESIGN=1` from Preview to **Production**.
- [ ] Trigger production redeploy (Settings → Deployments → Redeploy).
- [ ] Watch Vercel Logs / Sentry first hour. Any spike → set var to `0`, redeploy.
- [ ] Внутренний smoke на проде ещё раз, секции 1–6 (без перфа).

**Stable for ≥ 1 week → cleanup PR:**
- удалить ветку legacy в `app/page.tsx` (`HOME_REDESIGN_ENABLED ? new : legacy` → just new)
- удалить `app/config/homeRedesign.ts` и убрать импорты
- удалить `app/components/StatsBanner.tsx` и `StatsBannerView.tsx` ТОЛЬКО если grep подтвердит, что админка не рендерит сам компонент (она редактирует настройки, не рендерит — но проверь). 
- `Pill` НЕ удалять (всё ещё используется на `/(auth)/places/[id]/edit/location/page.tsx`).
- `SearchBar` НЕ удалять (всё ещё используется в TopBar и mobile-ветке главной — на мобайле редизайн не делали).

---

## 12 · Sign-off

PR готов к мержу, когда:

- [ ] Все «MUST» секции выше — зелёные.
- [ ] `npm run check` зелёный.
- [ ] Bundle delta ≤ 4 KB.
- [ ] Preview-deploy одобрен глазами (минимум 1 человек кроме автора).
- [ ] Никаких новых Sentry/Vercel ошибок за время preview-проверки.

---

## Cross-references

- План: [`docs/HOME_REDESIGN_INTEGRATION_PLAN.md`](./HOME_REDESIGN_INTEGRATION_PLAN.md)
- HTML прототип: [`redesign-prototype.html`](../redesign-prototype.html)
- Главный файл: [`app/page.tsx`](../app/page.tsx)
- Админка stats: [`app/(auth)/profile/elements/stats-banner/page.tsx`](../app/(auth)/profile/elements/stats-banner/page.tsx)

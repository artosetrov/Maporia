# План: интеграция Lucide Icons в Maporia

**Дата:** 2026-05-07
**Стратегия (выбрано):** фасад `Icon.tsx` + `modularizeImports` сразу + миграция всех 44 семантик за один заход.
**Цель:** перевести кастомные inline-SVG в `app/components/Icon.tsx` на `lucide-react`, не ломая публичный API компонента (~274 вхождения в 65 файлах).

---

## 0. Контекст

- Текущий файл: `app/components/Icon.tsx` — 583 строки, 44 семантики, кастомные SVG-paths, `"use client"`.
- Использование: ~274 вызова `<Icon name="…" />` в 65 `.tsx`-файлах. Hot-path: `/map`, `/id/[id]`, `/explore`, `/profile` (см. память — там бандлы 92–159 KB).
- Комментарии в `Icon.tsx` уже маппят семантику на Lucide (Search, Bookmark, ChevronLeft, X, Share2, Pencil, MapPin…) — то есть автор изначально проектировал "как Lucide". Миграция концептуально совпадает.
- Лицензия Lucide: ISC (совместима).
- Стек: Next 16 (App Router) + React 19 + Tailwind 4 + Turbopack.

---

## 1. API-контракт (НЕ ломать)

```ts
type IconProps = {
  name: IconName;          // 44 значения — сохраняем все
  size?: 12|14|16|18|20|24|32|48|64;
  className?: string;
  strokeWidth?: number;    // default 2
  filled?: boolean;        // для heart/favorite/star/bookmark
  active?: boolean;        // алиас filled для read-сайтов
};
```

Любая страница, которая делает `<Icon name="search" size={20} />`, должна продолжать работать без правок.

---

## 2. Маппинг семантик → Lucide

44 имени. Большинство — прямой 1:1. Три случая требуют решения.

### 2.1 Прямые маппинги (38 шт)

| IconName | Lucide |
|---|---|
| `search` | `Search` |
| `profile` | `User` |
| `users` | `Users` |
| `back` | `ChevronLeft` |
| `forward` | `ChevronRight` |
| `close` | `X` |
| `share` | `Share2` |
| `edit` | `Pencil` |
| `delete` | `Trash2` |
| `settings` | `Settings` |
| `map` | `Map` |
| `location` | `MapPin` |
| `photo` | `Image` |
| `add` | `Plus` |
| `remove` | `Minus` |
| `check` | `Check` |
| `comment` | `MessageCircle` |
| `calendar` | `Calendar` |
| `clock` | `Clock` |
| `link` | `Link` |
| `external-link` | `ExternalLink` |
| `eye` | `Eye` |
| `eye-off` | `EyeOff` |
| `lock` | `Lock` |
| `unlock` | `Unlock` |
| `grid` | `LayoutGrid` |
| `list` | `List` |
| `zoom-in` | `ZoomIn` |
| `zoom-out` | `ZoomOut` |
| `chevron-down` | `ChevronDown` |
| `chevron-up` | `ChevronUp` |
| `arrow-up` | `ArrowUp` |
| `arrow-down` | `ArrowDown` |
| `more-vertical` | `MoreVertical` |
| `more-horizontal` | `MoreHorizontal` |
| `logout` | `LogOut` |
| `package` | `Package` |
| `maximize` | `Maximize2` |
| `briefcase` | `Briefcase` |
| `calendar-days` | `CalendarDays` |
| `mail` | `Mail` |
| `alert-circle` | `AlertCircle` |
| `activity` | `Activity` |

### 2.2 Filled-варианты (4 шт)

Lucide рендерит контурную иконку. Заливка делается двумя путями:
- **A.** Использовать парную filled-иконку, если есть (`Heart` + `Heart` с `fill="currentColor"`).
- **B.** Передать `fill="currentColor"` и `stroke="none"` через стили.

Решение: вариант B (одна иконка, переключение fill). Уже работает в текущем `Icon.tsx`.

| IconName | Lucide | filled-поведение |
|---|---|---|
| `heart` | `Heart` | при `filled` → `fill=currentColor stroke=none` |
| `star` | `Star` | то же |
| `favorite` | `Bookmark` | то же (favorite семантически = bookmark в проекте) |
| `bookmark` | `Bookmark` | то же |

### 2.3 Спорные случаи — РЕШЕНО (после grep по проекту)

| IconName | Контекст использования | Решение | Обоснование |
|---|---|---|---|
| `filter` | 7 вхождений: кнопки «Filters» в `explore/page.tsx`, `TopBar.tsx`, `SearchBar.tsx` — все открывают `FiltersModal` с бейджем `activeFiltersCount`. | **`ListFilter`** | Визуально ближе всего к текущей кастомной (3 линии разной длины), и семантически это именно фильтр. Lucide `Filter` (воронка) — другой визуальный язык, ломает привычку. |
| `my-location` | 2 вхождения: кнопка «к моей локации» на карте `/explore`, пункт «Use current location» в `SearchModal`. | **`LocateFixed`** | Канонический "my location" в Lucide (крестик с центральной точкой). Текущий filled-кружок с кольцом тоже норм, но `LocateFixed` чище и единообразнее. |
| `minimize` | 1 вхождение: `isFullscreen ? minimize : maximize` в `explore/page.tsx`. | **`Minimize2`** | Текущий рендер (X) — баг, должно быть свёртывание. `Minimize2` — пара к уже выбранному для `maximize` `Maximize2`. |

Все три закрыты, можно ехать дальше без блокеров.

---

## 3. Архитектура нового `Icon.tsx`

```tsx
// app/components/Icon.tsx
import {
  Search, User, Users, ChevronLeft, ChevronRight, X,
  Share2, Pencil, Trash2, Settings, SlidersHorizontal,
  Map as MapIcon, MapPin, Image as ImageIcon,
  Plus, Minus, Check, Heart, MessageCircle,
  Calendar, Clock, Link as LinkIcon, ExternalLink,
  Eye, EyeOff, Lock, Unlock, Star,
  LayoutGrid, List, ZoomIn, ZoomOut, LocateFixed,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown,
  MoreVertical, MoreHorizontal, LogOut, Bookmark,
  Package, Maximize2, Briefcase, CalendarDays,
  Mail, AlertCircle, Activity,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<IconName, LucideIcon> = {
  search: Search,
  profile: User,
  users: Users,
  // ... 44 строки
};

const FILLABLE: ReadonlySet<IconName> = new Set([
  "heart", "star", "favorite", "bookmark",
]);

export default function Icon({ name, size = 20, className = "", strokeWidth = 2, filled, active }) {
  const LucideComp = iconMap[name];
  if (!LucideComp) { console.warn(`Icon "${name}" not found`); return null; }
  const isFilled = (filled || active) && FILLABLE.has(name);
  return (
    <LucideComp
      className={`${sizeMap[size]} ${className}`}
      strokeWidth={isFilled ? 0 : strokeWidth}
      fill={isFilled ? "currentColor" : "none"}
      aria-hidden="true"
    />
  );
}
```

**Ключевые решения:**
- Убрать `"use client"` — Lucide-иконки SSR-совместимы. Это даёт страницам шанс рендериться как RSC, что бьёт прямо в перф-проблему `/profile` (159 KB).
- Сохранить sizeMap как был.
- Для filled — переключение `fill`/`stroke`, не разные иконки.

**Risk:** удаление `"use client"` может всплыть в местах, где `<Icon>` используется внутри Client Components с детьми/обработчиками. Это не должно ломать — иконка простая. Но проверить.

---

## 4. `modularizeImports`

`next.config.ts`, добавить:

```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  modularizeImports: {
    "lucide-react": {
      transform: "lucide-react/dist/esm/icons/{{ kebabCase member }}",
      preventFullImport: true,
    },
  },
  // ... images, redirects
};
```

`preventFullImport: true` — компилятор упадёт, если кто-то напишет `import * as Icons from "lucide-react"`. Это и есть та страховка, ради которой это включается.

**Совместимость с Turbopack:** Next 16 поддерживает `modularizeImports` под Turbopack. Если внезапно нет — fallback: ничего не делать, named-импорты и так шейкаются. Проверим эмпирически.

---

## 5. Шаги реализации

1. **`npm install lucide-react`** (последняя стабильная, ~`0.460.x` или новее).
2. **Финализировать спорные иконки** (filter / my-location / minimize) — прогрепать вхождения, согласовать с тобой.
3. **Переписать `app/components/Icon.tsx`** по схеме из §3.
4. **Обновить `next.config.ts`** — добавить `modularizeImports`.
5. **`npm run typecheck`** — должен пройти, т.к. публичный API не меняется.
6. **`npm run lint`** — фикс, если что-то всплывёт.
7. **Бандл-замер** (опционально, но желательно): `npm run build` до и после, сравнить размеры First Load JS на `/map`, `/profile`, `/id/[id]`, `/explore`. Ожидание: $\Delta < 5\text{ KB}$ на страницу. Если больше — диагностировать.
8. **Визуальная проверка** на `/brand-guide` (там, по всей видимости, галерея иконок) + hot-path-страницах.
9. **Обновить документацию:**
   - `CLAUDE.md` (если есть) или `README.md` — секция про иконки, правило named-импортов.
   - Память: добавить `lucide-react` в `maporia_project.md`.

---

## 6. Риски и митигации

| Риск | Митигация |
|---|---|
| Визуальное расхождение (Lucide-иконка отличается от текущей кастомной) | Это вообще ожидаемо — Lucide стилистически чище. Сверяем на `/brand-guide`, фиксим то, что бросается. |
| `filter`/`my-location` — UX-ломка | Решаем до начала кодинга (§2.3). |
| Бандл вырос | $\text{modularizeImports} + \text{named imports}$ должны это исключить. Если выросло — проверить, что нет случайного `import *`. |
| `"use client"` удалён, но что-то ломается | Откатить директиву. Цена — `Icon.tsx` шипается клиентским, что и так есть сейчас. |
| Иконка отсутствует в Lucide | Не наш случай — все 44 семантики есть. Но если в будущем — фасад позволяет смешивать: одна иконка может остаться кастомным SVG. |

---

## 7. Что вне скоупа этого PR

- Замена `<Icon name="…" />` на прямые `<Search />` в местах вызова — оставляем фасад.
- Перевод hot-path-страниц на RSC (это отдельная задача из памяти — TODO про `/map`, `/id/[id]`).
- Обновление дизайн-системы / brand-guide-страницы (если она вообще ещё актуальна).

---

## 8. Definition of Done

- [ ] `lucide-react` в `package.json`.
- [ ] `Icon.tsx` использует Lucide, API не сломан.
- [ ] `modularizeImports` в `next.config.ts`.
- [ ] `npm run typecheck && npm run lint` зелёные.
- [ ] Визуально проверены: `/brand-guide`, `/map`, `/id/[id]`, `/explore`, `/profile`.
- [ ] First Load JS на hot-path не вырос больше чем на 5 KB.
- [ ] Память и `CLAUDE.md`/README обновлены.

---

## 9. Открытые вопросы перед стартом

1. ~~Какие иконки выбрать для `filter`, `my-location`, `minimize`?~~ — **закрыто в §2.3.**
2. Делать ли бандл-замер обязательной частью DoD, или достаточно глаза?
3. Есть ли где-то в проекте общий design-doc по иконкам, который тоже стоит обновить? (вижу `app/brand-guide/page.tsx` — возможно, ответ там).

# SAFE MODE — отчёт: TypeScript и ESLint

**Дата:** текущее состояние без правок.  
**Режим:** только прогон и отчёт, без изменений кода.

---

## 1. TypeScript errors

(Команда: `npx tsc --noEmit`. Предупреждений (warnings) у `tsc` нет — только errors.)

| # | Файл | Строка | Описание | Риск |
|---|------|--------|----------|------|
| 1 | `.next/dev/types/validator.ts` | 409 | Type layout config: Property 'default' is missing | **low** (артефакт сборки) |
| 2 | `app/(auth)/add/page.tsx` | 52 | No overload matches: insert in `places` (argument assignable to `never`) | **medium** |
| 3 | `app/(auth)/add/page.tsx` | 64, 72 | Property 'id' does not exist on type 'never' | **medium** |
| 4 | `app/(auth)/places/[id]/edit/access/page.tsx` | 51, 60, 62, 96 | Property 'created_by' / 'access_level' on 'never'; argument assignable to 'never' | **medium** |
| 5 | `app/(auth)/places/[id]/edit/categories/page.tsx` | 74, 80–81, 148, 174–175 | Properties on 'never'; argument to 'never' | **medium** |
| 6 | `app/(auth)/places/[id]/edit/description/page.tsx` | 56, 62, 126 | Property on 'never'; argument to 'never' | **medium** |
| 7 | `app/(auth)/places/[id]/edit/location/page.tsx` | 92, 98–111, 145–152, 214 | Multiple properties on 'never'; argument to 'never' | **medium** |
| 8 | `app/(auth)/places/[id]/edit/page.tsx` | 216, 317, 445, 552, 700, 1160, 1179–1181 | Property 'url' / 'is_hidden' / 'visibility' on 'never'; argument to 'never' | **medium** |
| 9 | `app/(auth)/places/[id]/edit/photos/page.tsx` | 101, 119–127, 135–144, 331, 398 | Properties on 'never'; insert overload; argument to 'never' | **medium** |
| 10 | `app/api/...` (разные route) | — | (явные TS errors в API не выделены в сыром выводе; см. ESLint) | — |
| 11 | `app/components/GoogleImportField.tsx` | 188 | Parameter 'p' implicitly has an 'any' type | **low** |
| 12 | `app/components/GoogleImportField.tsx` | 463 | Type '18' is not assignable to size type (24 \| 20 \| …) | **low** |
| 13 | `app/components/HomeSection.tsx` | 103–104 | Property 'favorite_categories' / 'favorite_tags' on 'never' | **medium** |
| 14 | `app/components/PlaceCard.tsx` | 136–138 | Property 'display_name' / 'username' / 'avatar_url' on 'never' | **medium** |
| 15 | `app/components/PremiumUpsellModal.tsx` | 142, 144 | Property 'cover_url' / 'id' on 'never' | **medium** |
| 16 | `app/explore/page.tsx` | 206–213, 298, 371, 1618 | Properties on 'never'; reactions insert 'never' | **medium** |
| 17 | `app/explore/page.tsx` | **1697** | **Cannot find name 'shouldLoadMap'** | **high** |
| 18 | `app/feed/page.tsx` | 180–333 (множество строк) | Properties on 'never' (profiles, places, reactions, comments) | **medium** |
| 19 | `app/hooks/usePremiumModalSettings.ts` | 65–66 | Property 'settings' on 'never' | **medium** |
| 20 | `app/lib/cities.ts` | 113 | Property 'name' on 'never' | **medium** |
| 21 | `app/lib/supabase.ts` | 220 | Property 'catch' does not exist on PromiseLike; parameter 'testErr' implicitly 'any' | **medium** |
| 22 | `app/map/page.tsx` | 510–517, 1001, 1142, 2224 | Properties on 'never'; reactions insert 'never'; 'url' on 'never' | **medium** |
| 23 | `app/map/page.tsx` | **652** | **No value in scope for shorthand property 'citiesToFilter'** | **high** |
| 24 | `app/map/page.tsx` | 832 | 'premiumOnly' does not exist in type 'PlaceFilters' | **medium** |
| 25 | `app/page.tsx` | **10, 11** | **Duplicate identifier 'ActiveFilters'** | **high** |
| 26 | `app/page.tsx` | 131, 182 | Property 'place_id' on 'never'; reactions insert 'never' | **medium** |
| 27 | `app/places/[id]/settings/page.tsx` | 49, 83, 179 | Property on 'never'; argument 'any' to 'never' | **medium** |
| 28 | `app/settings/page.tsx` | 58–59, 64–65 | Property 'display_name' / 'avatar_url' on 'never' | **medium** |

**Итого TS:** десятки ошибок; большинство — «Property X does not exist on type 'never'» (расхождение с типами Supabase/таблиц). Критичные по риску: дубликат `ActiveFilters`, отсутствие `shouldLoadMap`, отсутствие значения для `citiesToFilter`.

---

## 2. TypeScript warnings

Отдельных предупреждений (warnings) у `tsc` при текущем запуске **нет** — только errors.

---

## 3. ESLint errors (9)

| # | Файл | Строка | Правило | Описание | Риск |
|---|------|--------|---------|----------|------|
| 1 | `app/api/ai/generate-description/route.ts` | 100 | prefer-const | 'effectivePlaceId' never reassigned | **low** |
| 2 | `app/api/google-import/search/route.ts` | 203 | prefer-const | 'originalUrl' never reassigned | **low** |
| 3 | `app/api/google/place-import/route.ts` | 196 | prefer-const | 'originalUrl' never reassigned | **low** |
| 4 | `app/components/BottomNav.tsx` | 47 | react-hooks/rules-of-hooks | useEffect called conditionally | **high** |
| 5 | `app/components/FiltersModal.tsx` | 100 | react-hooks/refs | Cannot access/update refs during render | **high** |
| 6 | `app/components/FiltersModal.tsx` | 101 | react-hooks/refs | Cannot access/update refs during render | **high** |
| 7 | `app/components/HomeSection.tsx` | 116 | prefer-const | 'query' never reassigned | **low** |
| 8 | `app/contexts/UserAccessContext.tsx` | 29 | react-hooks/rules-of-hooks | useUserAccess called conditionally | **high** |
| 9 | `app/map/page.tsx` | 673 | prefer-const | 'filteredData' never reassigned | **low** |

---

## 4. ESLint warnings (343)

Сводка по правилам и рискам.

### 4.1 По правилам

| Правило | Кол-во | Риск | Примечание |
|---------|--------|------|------------|
| `@typescript-eslint/no-unused-vars` | много | **low** | Неиспользуемые переменные/импорты |
| `@typescript-eslint/no-explicit-any` | много | **low** | Явное использование `any` |
| `react-hooks/exhaustive-deps` | много | **medium** | Зависимости useEffect/useMemo |
| `@next/next/no-img-element` | много | **low** | Рекомендация использовать next/image |
| `react-hooks/refs` | 0 (ошибки выше) | — | Ref в render уже в блоке errors |
| Unused eslint-disable | несколько | **low** | Директива не нужна |

### 4.2 По файлам (выборочно, только high/medium риск)

| Файл | Строка | Правило | Риск |
|------|--------|---------|------|
| `app/(auth)/add/google/page.tsx` | 34 | react-hooks/exhaustive-deps (redirectToAuth) | **medium** |
| `app/(auth)/add/page.tsx` | 80 | react-hooks/exhaustive-deps (redirectToAuth) | **medium** |
| `app/(auth)/profile/page.tsx` | 614, 1805, 2357, 2551 | exhaustive-deps (replaceToAuth, defaultUserAccess, defaultContent) | **medium** |
| `app/(auth)/profile/edit/username/page.tsx` | 82 | exhaustive-deps (checkUsernameAvailability) | **medium** |
| `app/components/PlaceCard.tsx` | 466 | exhaustive-deps (ref in cleanup) | **medium** |
| `app/explore/page.tsx` | 98, 1673 | exhaustive-deps (defaultUserAccess); unused directive | **medium** / low |
| `app/feed/page.tsx` | 190 | exhaustive-deps | **medium** |
| `app/id/[id]/page.tsx` | 331, 345, 550 | exhaustive-deps (place, comments.length) | **medium** |
| `app/map/page.tsx` | 160, 865, 906, 935, 955, 1216, 2133 | exhaustive-deps (searchParams, view, categories, placesData, defaultUserAccess) | **medium** |
| `app/settings/page.tsx` | 68 | exhaustive-deps (redirectToAuth) | **medium** |
| `app/components/HomeSection.tsx` | 222, 255 | exhaustive-deps (defaultUserAccess, section.categories) | **medium** |

Остальные предупреждения — в основном **low** (unused vars, no-explicit-any, no-img-element, неиспользуемые директивы).

### 4.3 Полный список файлов с ESLint warnings (без детализации по строкам)

Файлы, в которых есть хотя бы одно предупреждение:

- `app/(auth)/add/google/page.tsx`
- `app/(auth)/add/page.tsx`
- `app/(auth)/places/[id]/edit/*` (categories, description, location, page, photos, required, title)
- `app/(auth)/profile/edit/*` (avatar, bio, name, page, username)
- `app/(auth)/profile/page.tsx`
- `app/(auth)/saved/page.tsx`
- `app/api/admin/tags/route.ts`
- `app/api/ai/generate-description/route.ts`
- `app/api/google-import/search/route.ts`
- `app/api/google/place-import/route.ts`
- `app/api/tags/route.ts`
- `app/auth/page.tsx`
- `app/brand-guide/page.tsx`
- `app/components/*` (AddressAutocomplete, AuthModal, DesktopMosaic, FiltersModal, GoogleImportField, HomeSection, ImportPreviewCard, MobileCarousel, PlaceCard, PremiumUpsellModal, ProductionDiagnostics, SearchBar, SearchModal, TopBar, UnifiedGoogleImportField, Wordmark)
- `app/contexts/UserAccessContext.tsx` (error уже выше)
- `app/error.tsx`
- `app/explore/page.tsx`
- `app/feed/page.tsx`
- `app/hooks/*` (usePremiumGate, usePremiumModalSettings, useUserAccess)
- `app/id/[id]/page.tsx`
- `app/lib/*` (ai/placeDescription, cities, cityResolver, diagnostics, premium, supabase, useLatestRequest)
- `app/map/page.tsx`
- `app/page.tsx`
- `app/places/[id]/settings/page.tsx`
- `app/settings/page.tsx`
- `app/types.ts`
- `next.config.ts`
- `proxy.ts`
- `scripts/fix-rls-policies.mjs`

---

## 5. Сводка по рискам

| Категория | High | Medium | Low |
|-----------|------|--------|-----|
| **TS errors** | 3 (ActiveFilters duplicate, shouldLoadMap, citiesToFilter) | остальные (типы Supabase/never, типы API) | 1 (validator.ts артефакт) |
| **ESLint errors** | 4 (условные хуки, refs в render) | 0 | 5 (prefer-const) |
| **ESLint warnings** | 0 | множество (exhaustive-deps) | большинство (unused, any, img) |

---

## 6. Команды для повторного прогона

```bash
npx tsc --noEmit
npm run lint
```

Правки в коде по этому отчёту **не вносились** (SAFE MODE).

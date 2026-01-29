# SUGGESTION: Единый UserAccess provider и потребители

**Extreme safe mode.** Никаких автоматических изменений. Все ниже — только предложения (// SUGGESTION:), рефакторинг только после подтверждения.

---

## 1. Вынести useUserAccess в единый provider / layout

### 1.1. Контекст (новый файл)

Создать `app/contexts/UserAccessContext.tsx` и вызывать `useUserAccess` один раз внутри провайдера:

```tsx
// SUGGESTION: New file app/contexts/UserAccessContext.tsx
"use client";

import { createContext, useContext, ReactNode } from "react";
import { useUserAccess, type UseUserAccessResult } from "../hooks/useUserAccess";

const UserAccessContext = createContext<UseUserAccessResult | null>(null);

export function UserAccessProvider({
  children,
  requireAuth = false,
  requireProfile = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
  requireProfile?: boolean;
}) {
  const value = useUserAccess(requireAuth, requireProfile);
  return (
    <UserAccessContext.Provider value={value}>
      {children}
    </UserAccessContext.Provider>
  );
}

export function useUserAccessContext(): UseUserAccessResult {
  const ctx = useContext(UserAccessContext);
  if (ctx == null) {
    throw new Error("useUserAccessContext must be used within UserAccessProvider");
  }
  return ctx;
}
```

Проблема: у страниц разные требования `requireAuth`/`requireProfile`. Варианты:

- **Вариант A.** В layout один провайдер с `requireAuth={false}`, `requireProfile={false}`. На страницах, где нужна авторизация, оставить редирект по `user === null` (как сейчас) или проверку в layout для защищённых маршрутов.
- **Вариант B.** Не оборачивать в layout, а оборачивать только группу маршрутов (layout для `/`, `/map`, `/explore`, `/feed`, `/id/[...]`) с общим `requireAuth={false}`. Для `/profile`, `/places/.../edit`, `/add` оставить локальный `useUserAccess(true)` или отдельный вложенный провайдер с `requireAuth={true}`.

### 1.2. Подключение в layout

Текущий `app/layout.tsx` уже содержит `PremiumModalProvider` и `GoogleMapsProvider`. Предложение — обернуть детей в `UserAccessProvider` (один вызов `useUserAccess` на всё дерево):

```tsx
// SUGGESTION: In app/layout.tsx, wrap children with UserAccessProvider (requireAuth=false, requireProfile=false).
// Then TopBar, BottomNav, and all pages under this layout can use useUserAccessContext() instead of useUserAccess().
// Example:
//   <PremiumModalProvider>
//     <UserAccessProvider requireAuth={false} requireProfile={false}>
//       <GoogleMapsProvider>
//         {children}
//       </GoogleMapsProvider>
//     </UserAccessProvider>
//   </PremiumModalProvider>
```

Импорт: `import { UserAccessProvider } from "./contexts/UserAccessContext";`

---

## 2. Компоненты, которые можно перевести на чтение готовых данных

Все эти компоненты сейчас вызывают `useUserAccess(...)` и могут быть переведены на `useUserAccessContext()` без изменения логики (только источник данных: контекст вместо хука). Существующие `useEffect` не трогать.

| Файл | Сейчас использует | Можно перевести на |
|------|--------------------|---------------------|
| **app/components/TopBar.tsx** | `useUserAccess()` → `access` | `useUserAccessContext()` → `access` |
| **app/page.tsx** (Home) | `useUserAccess()` → loading, access, user, profile | `useUserAccessContext()` → те же поля |
| **app/map/page.tsx** | `useUserAccess()` → accessLoading, access | `useUserAccessContext()` → loading, access |
| **app/explore/page.tsx** | `useUserAccess()` → accessLoading, access | `useUserAccessContext()` → loading, access |
| **app/feed/page.tsx** | `useUserAccess()` → access | `useUserAccessContext()` → access |
| **app/id/[id]/page.tsx** | `useUserAccess()` → accessLoading, access | `useUserAccessContext()` → loading, access |
| **app/profile/page.tsx** | `useUserAccess()` в нескольких подкомпонентах → access, user | `useUserAccessContext()` в тех же местах |
| **app/hooks/usePremiumStatus.ts** | `useUserAccess()` → access, loading | Внутри хука вызывать `useUserAccessContext()` вместо `useUserAccess()` |

Страницы с `requireAuth: true` (редирект на /auth при отсутствии сессии):

- **app/saved/page.tsx** — useUserAccess(true) → user, profile, accessLoading, access  
  После введения провайдера: либо оставить `useUserAccess(true)` только на этой странице (тогда один лишний запрос только на /saved), либо обернуть маршрут /saved в отдельный layout с `UserAccessProvider requireAuth={true}` и на странице использовать контекст.
- **app/profile/edit/*, app/places/[id]/edit/*, app/add/*, app/places/[id]/settings/page.tsx** — везде useUserAccess(true, false) или useUserAccess(true).  
  Вариант: не менять их сразу; они остаются на `useUserAccess(...)`. Или вынести защищённые маршруты в группу с общим layout, где провайдер с `requireAuth={true}`, и там перевести на контекст.

Итого по приоритету перевода на контекст (без трогания useEffect):

1. **TopBar** — один вызов, только `access`.  
2. **app/page.tsx** (Home) — access, user, profile, loading.  
3. **app/map/page.tsx**, **app/explore/page.tsx** — accessLoading, access.  
4. **app/feed/page.tsx**, **app/id/[id]/page.tsx** — access или accessLoading + access.  
5. **usePremiumStatus** — заменить внутренний вызов на контекст.  
6. **profile/page.tsx** (и подкомпоненты, где вызывается useUserAccess) — access, user.  
7. Страницы с requireAuth — по желанию, после решения по варианту A/B выше.

---

## 3. Map — альтернативные зависимости эффекта (только в комментариях)

Эффект загрузки мест в `app/map/page.tsx` (тот, что заканчивается зависимостями на строке ~763) сейчас имеет вид:

```ts
}, [appliedCity, appliedCities, appliedQ, appliedCategories, selectedTag, activeFilters.sort, hasExplicitCityInUrlState, userId, bootReady, refreshKey]);
```

- Текущие зависимости уже привязаны к параметрам, влияющим на серверный запрос (поиск, тег, категории, города, сортировка) и к bootReady/refreshKey/userId. **Менять этот массив зависимостей не предлагается.**

Рекомендации только в комментариях:

- **Не добавлять** в этот эффект: `filteredPlaces.length`, `placesData?.length`, `filteredPlaces`, `placesLoading` — иначе эффект будет повторно запускаться при изменении только клиентского фильтра/длины списка и давать лишние запросы.
- **Опционально (только идея):** если в будущем понадобится жёстко привязать рефетч только к «набору фильтров», можно ввести стабильный ключ, например `filterKey = JSON.stringify({ appliedCity, appliedCities, appliedQ, appliedCategories, selectedTag, sort: activeFilters.sort })`, и в deps использовать `[bootReady, refreshKey, userId, filterKey]`. Сейчас в этом нет необходимости — текущий список deps уже корректен.

В коде map добавлен только комментарий // SUGGESTION: с этой формулировкой, без изменения самого эффекта и его зависимостей.

# TopBar — Документация всех состояний

## Общая информация

**Компонент:** `app/components/TopBar.tsx`  
**Breakpoint:** `lg` (1024px) — переключение между мобильной и десктоп версиями  
**Z-index:** `z-40` (основной TopBar), `z-30` (переключатель List/Map)

---

## Главная страница (`/`)

### Мобильная версия (< 1024px)

**Структура:**
```
[Back] [Search Pill] [Filters]
```

**Элементы:**
1. **Back Button** (слева)
   - Иконка: `back`
   - Размер: `w-10 h-10`
   - Действие: Навигация на `/` (скрыт на главной странице)
   - Видимость: Скрыт (`shouldShowBackButton = false` для `/`)

2. **Search Pill** (центр, `flex-1`)
   - Текст: "Start to your search"
   - Иконка поиска слева
   - Стиль: `rounded-full`, `border border-[#E5E8DB]`
   - Действие: Открывает `SearchModal` при клике
   - Выравнивание: `justify-center` (центрированный текст)

3. **Filters Button** (справа)
   - Иконка: `filter`
   - Размер: `w-10 h-10`
   - Badge: Кружок с количеством активных фильтров (если `activeFiltersCount > 0`)
   - Видимость: Скрыт на главной странице (`pathname !== "/"`)

**Особенности:**
- Back button скрыт (главная страница)
- Filters button скрыт (главная страница)
- Search pill центрирован с иконкой поиска

---

### Десктоп версия (≥ 1024px)

**Структура:**
```
[Wordmark Logo] [SearchBar (Airbnb-style)] [Add Place] [Auth/Avatar]
```

**Элементы:**
1. **Wordmark Logo** (слева)
   - Компонент: `Wordmark`
   - Размер: `text-4xl`
   - Без иконки, без ® символа
   - Ссылка на `/`

2. **SearchBar** (центр, `flex-1`)
   - Компонент: `SearchBar` (десктоп версия)
   - Стиль: Airbnb-style pill с тремя секциями:
     - City Selector (слева, `rounded-l-full`)
     - Search Input (центр, `flex-1`)
     - Filters Button (справа, `rounded-r-full`)
   - Badge на Filters: Кружок с количеством фильтров

3. **Add Place Button** (справа)
   - Видимость: Только для авторизованных пользователей
   - Иконка: `+`
   - Размер: `h-10 w-10`
   - Ссылка: `/add`

4. **Auth Area** (справа)
   - **Неавторизован:** Кнопка "Login" (`/auth`)
   - **Авторизован:** Avatar с dropdown меню:
     - Profile
     - Feed
     - Saved
     - Settings
     - Logout

**Особенности:**
- SearchBar всегда виден (`showSearchBar={true}`)
- Border-bottom: `border-b border-[#ECEEE4]`

---

## Страница карты (`/map`)

### Мобильная версия (< 1024px)

**Структура:**
```
[Back] [SearchBar (Mobile)] [Filters]
─────────────────────────────────────
[List] [Map] ← Переключатель (fixed, top-[64px])
```

**Элементы первой строки:**
1. **Back Button** (слева)
   - Иконка: `back`
   - Действие: Навигация на `/`

2. **SearchBar** (центр, `flex-1`)
   - Компонент: `SearchBar` с `isMobile={true}`
   - Стиль: Кнопка-триггер (`rounded-full`)
   - Текст: Показывает `searchValue` или `selectedCity · Search by vibe...`
   - Действие: Открывает `SearchModal` при клике (`onSearchBarClick`)
   - Badge: Убран (индикатор только на Filters)

3. **Filters Button** (справа)
   - Иконка: `filter`
   - Badge: Кружок с количеством фильтров (если `activeFiltersCount > 0`)
   - Действие: Открывает `FiltersModal`

**Элементы второй строки (переключатель):**
- **View Toggle** (List/Map)
  - Позиция: `fixed top-[64px] left-0 right-0`
  - Z-index: `z-30`
  - Видимость: Только на мобильных (`lg:hidden`)
  - Стиль: Две кнопки с активным состоянием
  - Активная кнопка: `bg-[#8F9E4F] text-white`
  - Неактивная: `bg-white text-[#8F9E4F] border`

**Особенности:**
- Border-bottom: Убран (`pathname === "/map"` → нет `border-b`)
- Переключатель List/Map виден только на мобильных
- SearchBar открывает SearchModal (не встроенный input)

---

### Десктоп версия (≥ 1024px)

**Структура:**
```
[Wordmark Logo] [SearchBar (Airbnb-style)] [Add Place] [Auth/Avatar]
```

**Элементы:**
1. **Wordmark Logo** (слева)
   - Аналогично главной странице

2. **SearchBar** (центр, `flex-1`)
   - Компонент: `SearchBar` (десктоп версия)
   - Полнофункциональный поиск с:
     - City Selector (dropdown)
     - Search Input (live search)
     - Filters Button (с badge)

3. **Add Place Button** (справа)
   - Аналогично главной странице

4. **Auth Area** (справа)
   - Аналогично главной странице

**Особенности:**
- Переключатель List/Map скрыт (на десктопе используется split view)
- Border-bottom: Убран (`pathname === "/map"` → нет `border-b`)
- SearchBar работает как встроенный компонент (не модальное окно)

---

## Другие страницы

### Страница места (`/id/[id]`)

**Мобильная версия:**
```
[Back] [Share] [Favorite]
```

**Элементы:**
- Back Button (слева)
- Share Button (справа)
- Favorite Button (справа)

**Десктоп версия:**
- Стандартный TopBar с Logo, SearchBar (если не передан `showSearchBar`), Auth

---

### Страница профиля (`/profile`)

**Мобильная версия:**
```
[Back] [Search Pill] [Add Place (fixed, top-right)]
```

**Элементы:**
- Back Button
- Search Pill (скрыт на profile)
- Add Place Button (fixed в правом верхнем углу)

**Десктоп версия:**
- Стандартный TopBar

---

### Остальные страницы (`/explore`, `/feed`, `/saved`, `/settings`, `/collections`)

**Мобильная версия:**
```
[Logo] [Search Pill] [Filters]
```

**Элементы:**
- Logo (круглая иконка, ссылка на `/`)
- Search Pill (показывает `selectedCity` или "Anywhere")
- Filters Button (с badge)

**Десктоп версия:**
- Стандартный TopBar с Logo, SearchBar, Auth

---

## Технические детали

### Breakpoints
- **Мобильная:** `< 1024px` (`lg:hidden`)
- **Десктоп:** `≥ 1024px` (`hidden lg:block`)

### Z-index иерархия
- TopBar: `z-40`
- View Toggle (List/Map): `z-30`
- Dropdown меню: `z-50`

### Позиционирование
- TopBar: `fixed top-0 left-0 right-0`
- View Toggle: `fixed top-[64px] lg:top-[80px]` (мобильный/десктоп высота TopBar)
- Add Place (profile): `absolute top-safe-top top-3 right-4`

### Border-bottom
- По умолчанию: `border-b border-[#ECEEE4]`
- Исключение: `/map` страница (нет border)

### SearchBar состояния
- **Мобильная:** Кнопка-триггер → открывает `SearchModal`
- **Десктоп:** Встроенный компонент с live search

### Индикаторы фильтров
- **Мобильная:** Только на кнопке Filters (badge)
- **Десктоп:** На кнопке Filters внутри SearchBar (badge)

---

## Props интерфейс

```typescript
type TopBarProps = {
  // Search bar props (only for /map page)
  showSearchBar?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  selectedCity?: string | null;
  onCityChange?: (city: string | null) => void;
  onFiltersClick?: () => void;
  activeFiltersCount?: number;
  activeFiltersSummary?: string;
  onSearchBarClick?: () => void; // Mobile: открывает SearchModal
  
  // User props
  userAvatar?: string | null;
  userDisplayName?: string | null;
  userEmail?: string | null;
  
  // Custom props
  showBackButton?: boolean;
  showAddPlaceButton?: boolean;
  onBackClick?: () => void;
  
  // Place page props
  onShareClick?: () => void;
  onFavoriteClick?: () => void;
  isFavorite?: boolean;
  favoriteLoading?: boolean;
  
  // Map page view toggle
  view?: "list" | "map";
  onViewChange?: (view: "list" | "map") => void;
};
```

---

## Изменения (последние обновления)

1. **Убран индикатор фильтров из мобильного SearchBar** — теперь только на кнопке Filters
2. **Переключатель List/Map синхронизирован с TopBar** — скрывается на `lg` breakpoint
3. **SearchModal добавлен на страницу Map** — для мобильной версии поиска
4. **Border-bottom убран на странице Map** — для мобильной и десктоп версий

---

## Визуальная схема

### Главная страница (Mobile)
```
┌─────────────────────────────────┐
│ [🔍 Start to your search]      │
└─────────────────────────────────┘
```

### Главная страница (Desktop)
```
┌─────────────────────────────────────────────────────────────┐
│ [Maporia] [Anywhere ▼ | Search... | 🔍 Filters] [➕] [👤▼] │
└─────────────────────────────────────────────────────────────┘
```

### Страница карты (Mobile)
```
┌─────────────────────────────────┐
│ [←] [Miami · Search...] [🔍 2]   │
├─────────────────────────────────┤
│ [List] [Map]                    │
└─────────────────────────────────┘
```

### Страница карты (Desktop)
```
┌─────────────────────────────────────────────────────────────┐
│ [Maporia] [Miami ▼ | Search... | 🔍 2] [➕] [👤▼]          │
└─────────────────────────────────────────────────────────────┘
```

---

*Документация обновлена: 2024*

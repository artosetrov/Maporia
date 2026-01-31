# Visual Schemas — реальные элементы интерфейса

Схемы главных экранов с подписанными компонентами из кода (TopBar, SearchBar, BottomNav, map page).

---

## Home Page (Mobile)

```
┌─────────────────────────────────────────────────────────────┐
│  [Search pill]                                               │
│  • Текст: "Search by vibe, mood, or place"                   │
│    (или "Miami · Search by vibe, mood, or place" при городе) │
│  • Иконка поиска слева (Icon name="search")                  │
│  • Клик → открывает SearchModal                              │
│  • Класс: rounded-full border border-[#E5E8DB] px-4 py-2.5   │
└─────────────────────────────────────────────────────────────┘
│  Контент: HomeSection(s) — Recommended, For you, и т.д.      │
├─────────────────────────────────────────────────────────────┤
│  BottomNav (fixed, lg:hidden)                               │
│  [Explore]     [Saved]        [Profile]                      │
│  SearchIcon    FavoriteIcon   Avatar / ProfileIcon           │
│  "Explore"     "Saved"       "Profile"                      │
└─────────────────────────────────────────────────────────────┘
```

**Примечание:** На Home без `showSearchBar` в TopBar показывается кнопка с текстом **"Start to your search"** и иконкой поиска по центру; при `showSearchBar={true}` (как в `app/page.tsx`) — используется **SearchBar** с текстом "Search by vibe, mood, or place".

---

## Home Page (Desktop)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  [Logo_maporia1.svg]  │  [Where? ▼]  [Filters]  [🔴 2]  │  [Login] / [Avatar] [☰]   │
│  Link href="/"        │  SearchBar (city + Filters)     │  AuthCTA / Profile + Menu  │
│  h-10                 │  • City: "Where?" или город     │  • Add Gem в dropdown      │
│                       │  • Filters + badge count        │  • Home, Map, Profile, ...  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Реальные элементы:**
- **Логотип:** `<img src="/Logo_maporia1.svg" alt="Maporia" className="h-10 w-auto" />`
- **SearchBar (desktop):** один pill: `[Where? | Miami]` (city selector) + `[Filters]` (с бейджем `activeFiltersCount`). Поле ввода поиска только в SearchModal.
- **Справа:** не залогинен — кнопка **Login** (AuthCTA). Залогинен — **Avatar** (ссылка на `/profile`) + **Hamburger** (dropdown: Add Gem, Home, Map, Profile, Log out).

---

## Map Page (Mobile)

```
┌─────────────────────────────────────────────────────────────┐
│  [←]  [Miami · Search by vibe, mood or place]  [Filters 2]   │
│  Back  SearchBar (mobile) — клик → SearchModal               │  Icon filter + badge
└─────────────────────────────────────────────────────────────┘
│  Контент: список мест или карта (переключение только lg)   │
├─────────────────────────────────────────────────────────────┤
│  BottomNav: [Explore] [Saved] [Profile]                     │
└─────────────────────────────────────────────────────────────┘
```

**Реальные элементы:**
- **Слева:** кнопка **Back** (`Icon name="back"`) → `router.push("/")`.
- **По центру:** **SearchBar** (mobile) — кнопка с городом и подзаголовком поиска; `activeFiltersSummary` под текстом при активных фильтрах.
- **Справа:** кнопка **Filters** (`Icon name="filter"`) + бейдж с `activeFiltersCount` (например `2`).
- **List/Map** на мобиле в TopBar не показываются (`hidden lg:flex`), переключение вида только на десктопе.

---

## Map Page (Desktop)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  [Logo_maporia1.svg]  │  [Miami ▼]  [Filters]  [🔴 2]  │  [List] [Map]  │  [Avatar] [☰] │
│  Link "/"             │  SearchBar                      │  View toggle   │  Auth       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Реальные элементы:**
- **Логотип:** как на Home (desktop).
- **SearchBar:** город **Miami** (или Where?) + **Filters** с бейджем.
- **View toggle:** две кнопки **List** и **Map** в одном rounded pill (`view === "list"` / `"map"`), активная с `bg-[#8F9E4F] text-white`.
- **Справа:** Avatar + Hamburger (как на Home desktop).

---

## Сводка компонентов

| Элемент           | Компонент / место в коде                    | Мобиль | Десктоп |
|-------------------|---------------------------------------------|--------|---------|
| Поиск (плейсхолдер) | SearchBar / TopBar pill                     | "Search by vibe, mood, or place" или "Start to your search" (без showSearchBar) | В SearchBar только city + Filters |
| Город             | SearchBar — city selector                   | В тексте кнопки + SearchModal                | "Where?" или название города в pill |
| Фильтры           | TopBar → `onFiltersClick`, FiltersModal     | Кнопка filter + бейдж count                  | Кнопка "Filters" + бейдж |
| List/Map          | TopBar `view`, `onViewChange`               | Скрыто                                      | Показано только на /map |
| Нижняя навигация  | BottomNav                                   | Explore, Saved, Profile                     | Скрыта (lg:hidden) |
| Логотип           | TopBar — Logo_maporia1.svg                  | На других страницах (не Home/Map) — круг с pin | Всегда на десктопе |
| Добавить место    | TopBar → "Add Gem" в dropdown / Profile     | В меню или на странице профиля              | Add Gem в hamburger dropdown |

Файлы: `app/components/TopBar.tsx`, `app/components/SearchBar.tsx`, `app/components/BottomNav.tsx`, `app/page.tsx`, `app/map/page.tsx`.

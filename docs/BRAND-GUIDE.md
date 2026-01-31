# Maporia Brand Guide

**Single source of truth:** Live design-system doc at [**/brand-guide**](https://maporia.co/brand-guide) (same content, structured for daily use). This file is the canonical reference for code and assets.

**Page structure (9 sections):** 1. Brand Essence · 2. Logo System · 3. Color System · 4. Typography · 5. Iconography · 6. UI Components · 7. Product Patterns · 8. Layout & Spacing · 9. Developer / Handoff.

---

## 1. Шрифты

### Wordmark (логотип «Maporia»)
- **Шрифт:** Manrope
- **Начертание:** Extrabold (800) — в компоненте `Wordmark` используется `font-extrabold`
- **Подключение:** `@fontsource/manrope` в `app/globals.css` (400, 500, 600, 700, 800)
- **Класс:** `.font-manrope` — `font-family: Manrope, Inter, system-ui, sans-serif`; в CSS задан `font-weight: 600`, компонент переопределяет на Extrabold
- **Кернинг:** `-0.02em` (`letter-spacing: -0.02em`)
- **Регистр:** Title Case — «Maporia»
- **Эффекты:** без теней, обводок и градиентов

### Остальной интерфейс
- **Основной текст:** Inter (переменная `--font-inter`)
- **Заголовки и названия мест:** Fraunces (`--font-fraunces`)

---

## 2. Цвета (Design Tokens)

Из `app/globals.css`:

| Назначение        | Переменная       | HEX      | Использование                    |
|-------------------|------------------|----------|----------------------------------|
| Бренд (wordmark, CTA) | `--olive-primary` | `#8F9E4F` | Логотип, кнопки, акценты         |
| Фон страницы      | `--warm-white`   | `#FAFAF7` | Фон экранов                      |
| Текст основной    | `--text-primary` | `#1F2A1F` | Заголовки, основной текст        |
| Текст вторичный   | `--text-secondary`| `#6F7A5A` | Подписи, мета-текст              |
| Текст приглушённый| `--text-muted`   | `#A8B096` | Placeholder, иконки               |
| Границы           | `--border-light` | `#ECEEE4` | Рамки карточек, разделители       |
| Успех             | `--success`      | `#7FA35C` | Успешные состояния               |
| Ошибка            | `--error`        | `#C96A5B` | Ошибки, предупреждения          |
| Отключённый фон   | `--disabled-bg`  | `#DADDD0` | Disabled-кнопки                  |

---

## 3. Логотип и иконки

### Файлы
- **`/Logo_maporia1.svg`** — основной логотип в продукте: пин + бренд-зелёный фон (`#81904C`), белая фигура. Используется в TopBar, на экране входа и в компоненте Wordmark как «иконка».
- **`/public/brand/maporia-symbol.svg`** — только символ M-pin, `fill="currentColor"`, для использования через CSS-цвет (например, иконка приложения).
- **`/public/brand/maporia-symbol-1024.svg`** — экспорт 1024×1024 для App Store / Play Store и пайплайнов иконок.

### Где что используется
- **TopBar (десктоп):** `<img src="/Logo_maporia1.svg" />`, высота `h-10` (40px).
- **Экран входа / модалка входа:** тот же `Logo_maporia1.svg`, высота `h-8` (32px).
- **Компонент Wordmark:** при `withIcon={true}` — та же `Logo_maporia1.svg` как иконка (16 / 20 / 24px) + текст «Maporia»; при `inverted={true}` к изображению применяется `filter: brightness(0) invert(1)`.

---

## 4. Компонент Wordmark

**Файл:** `app/components/Wordmark.tsx`

### Пропсы
| Пропс              | Тип      | По умолчанию | Описание |
|--------------------|----------|--------------|----------|
| `showRegistered`   | boolean  | false        | Показывать ® (только маркетинг, не в продукте). |
| `inverted`         | boolean  | false        | Белый текст/иконка на зелёном фоне.             |
| `withIcon`         | boolean  | false        | Показывать иконку (Logo_maporia1.svg) слева.   |
| `size`             | "small" \| "default" \| "large" | "default" | Размер. |
| `href`             | string   | —            | Если задан, слово «Maporia» — ссылка.          |
| `className`        | string   | ""           | Доп. классы.                                   |

### Размеры
- **Иконка:** small = 16px, default = 20px, large = 24px.
- **Текст:** small = `text-base`, default = `text-lg`, large = `text-xl`.
- **Отступ между иконкой и текстом:** 8px (`gap-2`).

### Примеры
```tsx
// Продукт: иконка + «Maporia», без ®
<Wordmark href="/" withIcon={true} size="default" />

// Маркетинг: с ®
<Wordmark href="/" withIcon={true} size="large" showRegistered={true} />

// Инвертированный (белый на зелёном)
<Wordmark href="/" withIcon={true} inverted={true} />
```

### Правила
- В продукте (TopBar, экраны приложения) **не** показывать ®.
- ® только на маркетинговых страницах и в бренд-материалах; в коде компонента размер ~60% x-height, смещение вправо/вверх.

---

## 5. App Icon / Favicon

- **Иконка приложения:** символ M-pin (например, из `public/brand/maporia-symbol-1024.svg`); без слова «Maporia» и без ®.
- **Фон:** прозрачный или бренд-зелёный `#8F9E4F`.
- **Favicon:** тот же символ; форматы/размеры по необходимости (ICO, PNG, SVG).

---

## 6. Что не делать

- Не использовать ® в продуктовом UI (только в маркетинге).
- Не писать «MAPORIA» капсом.
- Не менять кернинг, начертание и пропорции wordmark.
- Не использовать другой шрифт для слова «Maporia» (только Manrope в компоненте Wordmark).

---

## 7. Visual Schemas (Layout)

Схемы главных экранов с реальными элементами интерфейса (TopBar, SearchBar, BottomNav):

- **Home (Mobile):** Search pill («Search by vibe, mood, or place» / «Start to your search») → контент → BottomNav (Explore, Saved, Profile).
- **Home (Desktop):** Logo_maporia1.svg | City + Filters | Login / Avatar + Hamburger.
- **Map (Mobile):** Back | SearchBar (город + подзаголовок) | Filters с бейджем → контент → BottomNav.
- **Map (Desktop):** Logo | City + Filters | List/Map toggle | Avatar + Hamburger.

Подробные ASCII-схемы, названия компонентов и ссылки на код: **[docs/VISUAL-SCHEMAS.md](VISUAL-SCHEMAS.md)**.

---

## 8. Ссылки на код и ресурсы

- Шрифты и токены: `app/globals.css`
- **Радио и чекбоксы:** глобальные стили в `app/globals.css` — рамка `--border-light`, выбранное / hover / focus — `--olive-primary`, disabled — `--disabled-bg`; живые примеры на `/brand-guide`, секция 6 «Form controls».
- Компонент Wordmark: `app/components/Wordmark.tsx`
- Использование в TopBar: `app/components/TopBar.tsx` (десктоп — логотип слева)
- Использование на входе: `app/auth/page.tsx`, `app/components/AuthModal.tsx`
- Символ и экспорты: `public/brand/` (README + `maporia-symbol.svg`, `maporia-symbol-1024.svg`)
- Страница с примерами бренда в приложении: `/brand-guide` (`app/brand-guide/page.tsx`)
- Схемы экранов и элементов UI: `docs/VISUAL-SCHEMAS.md`
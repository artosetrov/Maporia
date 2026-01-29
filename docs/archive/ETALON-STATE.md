# Эталонное состояние (reference)

Текущее состояние зафиксировано как эталон. Код не меняем.

## Проверки

### Build

```bash
npm run build
```

- **В среде агента:** падает с `EPERM: operation not permitted, open '.next/trace'` (ограничения окружения).
- **Локально:** выполнить в терминале. При EPERM: удалить папку `.next`, затем снова `npm run build`.

### Lint

```bash
npm run lint
```

- **Результат:** 9 errors, 343 warnings (на момент фиксации).
- **Ошибки (9):**
  - `prefer-const` — переменные, которые лучше объявить как `const` (несколько файлов).
  - `react-hooks/rules-of-hooks` — условный вызов хуков (`useEffect`, `useUserAccess`) в одном из компонентов; в `app/error.tsx` — `useUserAccess` после early return.
  - "Cannot access refs during render" — в двух местах.
- **Предупреждения:** в основном `@typescript-eslint/no-unused-vars`, `no-explicit-any`, `react-hooks/exhaustive-deps`, `@next/next/no-img-element`. Код не трогали.

---

## Ручной прогон (чеклист)

Проверить в браузере:

| # | Маршрут / сценарий | Что проверить |
|---|--------------------|----------------|
| 1 | **Home** `/` | Главная открывается, секции, избранное (без логина — редирект на auth с `?from=/`). |
| 2 | **Map** `/map` | Карта и список мест, фильтры, клик по месту. Без логина — кнопка «Add to favorites» ведёт на auth с toast. |
| 3 | **Explore** `/explore` | Список/карта, фильтры, избранное. |
| 4 | **Place** `/id/[id]` | Карточка места, галерея, комментарии. Кнопки «Sign in» / «Add to favorites» (AuthCTA) — toast + редирект на auth с `?from=/id/...`. |
| 5 | **Auth → login → redirect back** | Зайти на любую страницу (например `/map` или `/id/xxx`) → нажать Login / Sign in → на `/auth?from=...` войти (email или Google) → после входа редирект обратно на `from` (или `/`). |
| 6 | **Add** (auth) `/add` | Только для авторизованных. Без логина — редирект на auth с `?from=/add`. С логином — создание места и редирект в редактор. |
| 7 | **Edit** (auth) `/(auth)/places/[id]/edit/*` | Редактирование места только для авторизованных. Без логина — редирект на auth. |

---

## Команды для локальной проверки

```bash
# Сборка
npm run build

# Линт
npm run lint

# Dev-сервер (для ручного прогона)
npm run dev
```

После прогона можно отметить в этой таблице: ✅ / ❌ по каждому пункту.

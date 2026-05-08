# Maporia Wiki

Последнее обновление: 2026-05-08.

Это главная точка входа в знания по продукту Maporia. Вики собрана после аудита кода, существующих документов и health-check отчета.

## Быстрый Поиск

| Нужно найти | Открыть |
| --- | --- |
| Краткий бриф для новой LLM/agent | [00-llm-brief.md](./00-llm-brief.md) |
| Что такое продукт, для кого он и как монетизируется | [01-product-audit.md](./01-product-audit.md) |
| Какие есть страницы, API и пользовательские сценарии | [02-feature-map.md](./02-feature-map.md) |
| Где живут данные, роли, платежи, карты и интеграции | [03-architecture.md](./03-architecture.md) |
| Что проверять перед релизом и где главные риски | [04-operations-and-risks.md](./04-operations-and-risks.md) |
| Быстро найти термин, таблицу, route или команду | [05-search-index.md](./05-search-index.md) |
| Старые документы, планы и архивные отчеты | [../README.md](../README.md) |

## TL;DR

Maporia - Next.js каталог локальных мест, сервисов и experiences с картой, Supabase backend, Google Maps импортом, premium-доступом и Stripe-монетизацией.

Главные домены:

- Каталог: `places`, `place_photos`, `collections`, `tags`, `cities`.
- Пользователи: `profiles`, auth через Supabase, роли и тарифы в `app/lib/access.ts`.
- Монетизация: one-time Premium, creator subscriptions, extra listing add-ons в `app/lib/plans.ts` и Stripe API routes.
- Карта и поиск: Google Maps, фильтры по city/category/tag/access, radius-фильтрация.
- Админка: коллекции, billing, health, tags, impersonation.

## Карта Кода

| Область | Где смотреть |
| --- | --- |
| Страницы App Router | `app/**/page.tsx` |
| API routes | `app/api/**/route.ts` |
| Общие UI-компоненты | `app/components/` |
| Контексты и хуки доступа | `app/contexts/`, `app/hooks/` |
| Supabase client и auth helpers | `app/lib/supabase.ts`, `app/lib/auth/` |
| Права, роли, квоты | `app/lib/access.ts`, `app/lib/plans.ts` |
| Google import/maps | `app/lib/googleImport.ts`, `app/config/googleMaps.ts`, `app/api/google*` |
| Stripe | `app/lib/stripe.ts`, `app/api/stripe/**` |
| SQL и миграции | `scripts/sql/`, `scripts/migrations/` |
| Product health checks | `scripts/health/`, `health-report.json` |

## Команды

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run health
npm run health:json
npm run docs:check
npm run check
```

## Правила Обновления Вики

- Любая новая страница или API route должна попасть в [feature map](./02-feature-map.md).
- Любое изменение таблиц, RLS, тарифов или env-переменных должно попасть в [architecture](./03-architecture.md).
- Любой известный production bug, workaround или релизный риск должен попасть в [operations and risks](./04-operations-and-risks.md).
- Любой новый доменный термин или source-of-truth файл должен попасть в [search index](./05-search-index.md).
- Любое изменение правил для LLM/agents должно попасть в [00-llm-brief.md](./00-llm-brief.md) и корневой `AGENTS.md`.
- Архивные документы не удалять без причины: лучше ссылаться на них из актуальной страницы и явно помечать статус.

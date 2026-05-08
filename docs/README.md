# Документация Maporia

Главная актуальная точка входа: [wiki/README.md](./wiki/README.md).

Вики собрана как продуктово-технический слой поверх кода и старых документов: там есть аудит, карта фич, архитектура, операции и список рисков.

## Актуальная Вики

- [Maporia Wiki](./wiki/README.md) - навигация и быстрый поиск.
- [LLM Brief](./wiki/00-llm-brief.md) - краткая ориентация для новой LLM/agent.
- [Product Audit](./wiki/01-product-audit.md) - что за продукт, монетизация, сценарии и приоритеты.
- [Feature Map](./wiki/02-feature-map.md) - страницы, API routes, компоненты и поисковые команды.
- [Architecture](./wiki/03-architecture.md) - стек, данные, роли, billing, интеграции.
- [Operations And Risks](./wiki/04-operations-and-risks.md) - health-check, релизный checklist, риски.
- [Search Index](./wiki/05-search-index.md) - термины, source-of-truth файлы и быстрые `rg` команды.

## Документы По Темам

### Бренд И UI

- [BRAND-GUIDE.md](./BRAND-GUIDE.md) - бренд, логотип, Wordmark, цвета.
- [VISUAL-SCHEMAS.md](./VISUAL-SCHEMAS.md) - визуальные схемы.
- [COLLECTION-COVERS-STORAGE.md](./COLLECTION-COVERS-STORAGE.md) - storage для обложек коллекций.

### Auth И Доступ

- [auth-email-password-plan.md](./auth-email-password-plan.md) - план email/password auth.
- [IMPERSONATION_PLAN.md](./IMPERSONATION_PLAN.md) - admin impersonation.

### Production

- [production/PRODUCTION-AUDIT-REPORT.md](./production/PRODUCTION-AUDIT-REPORT.md)
- [production/PRODUCTION-TROUBLESHOOTING.md](./production/PRODUCTION-TROUBLESHOOTING.md)
- [production/PRODUCTION-DATA-LOADING-FIX.md](./production/PRODUCTION-DATA-LOADING-FIX.md)
- [production/FIX-GOOGLE-MAPS-PRODUCTION.md](./production/FIX-GOOGLE-MAPS-PRODUCTION.md)

### Archive

Старые аудиты, инструкции и отчеты лежат в [archive/](./archive/). Они полезны как история решений, но перед применением надо сверять с текущим кодом и вики.

## SQL И Скрипты

- SQL: `scripts/sql/`
- JS migrations/helpers: `scripts/migrations/`
- Diagnostics: `scripts/diagnostics/`
- Health checks: `scripts/health/`

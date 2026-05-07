# Operations And Risks

Последнее обновление: 2026-05-07.

## Audit Snapshot

Команда:

```bash
npm run health:json
```

Результат на 2026-05-07:

- Status: `YELLOW`.
- Passed: 16.
- Warnings: 77.
- Failures: 0.
- Navigation check: all 52 `page.tsx` files export default; internal links валидны.
- Security criticals: не найдено real keys в `.env.example`, anon key не найден в admin routes, server-only keys не найдены в client files.

## Top Risks

| Priority | Риск | Где | Почему важно | Что сделать |
| --- | --- | --- | --- | --- |
| P1 | Public route может не фильтровать premium access | `app/feed/page.tsx`, `app/places/[id]/settings/page.tsx` | Риск показа premium/hidden данных не тем пользователям | Проверить queries и добавить `canUserViewPlace`/server filtering |
| P1 | PostgREST `.or()` без sanitize в нескольких местах | `app/components/PremiumUpsellModal.tsx`, `app/(auth)/add/page.tsx` | Потенциальная filter injection/сломанные фильтры при спецсимволах | Использовать `sanitizePostgrestValue` или структурировать query без raw `.or()` |
| P1 | Несколько источников правды для card batch loading | `/map`, `/explore`, collections, profile, `useBatchPlaceData` | Риск N+1, разного UI и разной производительности | Вынести общий loader и перевести списки на него |
| P2 | Модалки дублируются на страницах | `TopBar`, `/map`, `/explore`, collections, profile | Лишний JS, неожиданные состояния, сложнее поддерживать | Довести `GlobalModals` до единой точки |
| P2 | Много `any` и untyped API responses | `app/(auth)/profile/page.tsx`, `app/id/[id]/page.tsx`, API routes | Регрессии ловятся поздно | Типизировать hotspots и response contracts |
| P2 | Deprecated Google `Marker` | `/map`, `/id/[id]`, edit location | Будущая миграционная боль и warnings | Provision Map ID и перейти на `AdvancedMarkerElement` |
| P3 | ErrorBoundary покрытие неполное | auth/pricing/admin/edit pages | Краш секции может ронять всю страницу | Обернуть risky pages/sections |

## Release Checklist

Перед релизом:

```bash
npm run health:json
npm run typecheck
npm run lint
npm run build
```

Проверить вручную:

- Guest видит public places и не видит premium details.
- Standard user может логиниться, сохранять/комментировать, но premium locked.
- Premium user видит premium places и может публиковать location.
- Creator Service может создать service, но не experience.
- Creator Experience может создать experience, но не service.
- Creator All может создать both, лимит 10 combined.
- Extra listing checkout увеличивает `bonus_listing_credits`.
- Admin видит admin routes и может impersonate/exit.
- Google import: search, preview, import, photos.
- Stripe webhook: one-time Premium, subscription created/updated/deleted, payment failed.

## Env Checklist

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Recommended/feature-dependent:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAP_ID=
OPENAI_API_KEY=
OPENAI_MODEL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PREMIUM_ONETIME=
STRIPE_PRICE_CREATOR_SERVICE_MONTH=
STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH=
STRIPE_PRICE_CREATOR_ALL_MONTH=
STRIPE_PRICE_EXTRA_LISTING=
IMPERSONATION_COOKIE_SECRET=
CRON_SECRET=
SUPABASE_JWT_SECRET=
```

## Debug Playbooks

### Supabase/Auth

- Проверить `.env.local` и production env.
- Открыть browser console на ошибки `[Supabase]`.
- Проверить `profiles` row для user id.
- Для stale refresh token issues смотреть `app/lib/supabase.ts`.

### Premium Access

- Проверить `profiles.plan`, `subscription_status`, `is_admin`.
- Проверить `places.access_level` и legacy fields.
- Найти usage:

```bash
rg "canUserViewPlace|isPlacePremium|getUserAccess" app
```

### Stripe

- Проверить, что Price IDs соответствуют `PLAN_CONFIG`.
- Проверить webhook secret и route runtime `nodejs`.
- Для subscription искать `supabase_user_id`, `plan`, `period` в Stripe metadata.
- Проверить `subscriptions` и denormalized `profiles.plan`.

### Google Maps

- Проверить API key restrictions.
- Проверить enabled APIs: Maps JavaScript API, Places API, Geocoding/Photos if used.
- Для Advanced Marker миграции проверить `NEXT_PUBLIC_GOOGLE_MAP_ID`.

## Existing Documentation Index

Актуальные рядом:

- `README.md` - базовый setup.
- `STRIPE_SETUP.md` - Stripe setup, синхронизирован с текущей тарифной сеткой.
- `docs/BRAND-GUIDE.md` - бренд.
- `docs/VISUAL-SCHEMAS.md` - визуальные схемы.
- `docs/COLLECTION-COVERS-STORAGE.md` - storage для collection covers.
- `docs/production/*` - production bugfix history.
- `docs/archive/*` - старые аудиты и инструкции.

Планы в корне:

- `IMPLEMENTATION_PLAN.md`
- `MONETIZATION_PLAN.md`
- `PLACE_KINDS_PLAN.md`
- `BECOME_PROVIDER_PLAN.md`
- `CONTACTS_PLAN.md`
- `PAGES_UPDATE_PLAN.md`
- `LAUNCH_CHECKLIST.md`

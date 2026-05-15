# Operations And Risks

Последнее обновление: 2026-05-15.

## Production Deployment Target

Live production traffic for Maporia is served by the Vercel project `maporia_full`, not the separate `maporia` project.

- Production domains: `https://www.maporia.co`, `https://maporia.co`.
- Vercel project: `maporia_full`.
- Project id for clean temp deploys: `prj_7h0OXlw5rrbQuREEIso0NGkkLsxp`.
- Deployment rule: when asked to deploy the live site, run production deploy against `maporia_full`. Deploying only to `maporia` / `https://maporia.vercel.app` will not update the customer-facing site.

## 2026-05-15 Places Price Options Schema Drift

Production/edit clients can hit `column places.price_options does not exist` if `scripts/sql/add-price-unit-per-month.sql` has not been applied to the active Supabase database. This surfaced as a misleading `Place not found` state on `/places/[id]/edit` because the editor selected `price_options` alongside core place fields.

Actions taken:

- `/places/[id]/edit` now falls back to a base `places` select without `price_options` and treats missing price options as `null`, matching the public `/id/[id]` fallback.
- `/places/[id]/edit/price` now falls back to compact price fields when `price_options` is missing and blocks pricing-menu saves until the schema is applied.
- Added `scripts/sql/fix-place-editor-admin-and-price-options.sql` to add `places.price_options` and admin RLS policies for editing any listing plus related photos/links.

Follow-up:

- Apply `scripts/sql/fix-place-editor-admin-and-price-options.sql` in Supabase SQL Editor before relying on pricing-menu editing or admin editing of non-owned hidden/private listings.

## 2026-05-14 Stripe Price Env Repair

Production checkout was returning `MISSING_PLAN_PRICE` for Pro Location because `maporia_full` production env did not include `STRIPE_PRICE_CREATOR_LOCATION_MONTH/YEAR`. The v3 `creator_pro` env keys were also missing from docs/env examples.

Actions taken:

- Created/found Stripe test-mode Prices for Premium, Pro Location, Pro Creator, legacy Pro Service/Experience, Pro All-in, and Extra Listing using the production `STRIPE_SECRET_KEY` currently configured in Vercel.
- Added/overrode all `STRIPE_PRICE_*` production env vars in Vercel project `maporia_full`.
- Rebuilt the latest production deployment with `vercel redeploy` so serverless functions pick up the updated env.
- Updated `STRIPE_SETUP.md`, `.env.example`, and wiki env checklists to include `STRIPE_PRICE_CREATOR_PRO_MONTH/YEAR`.

Follow-up: production is currently configured with a `sk_test_...` Stripe secret. Before accepting real customer payments, switch `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and all `STRIPE_PRICE_*` vars to live-mode values and redeploy `maporia_full`.

## 2026-05-13 Admin Users Role Fix

Что было исправлено после ошибки `infinite recursion detected in policy for relation "profiles"` в Users admin UI:

- Admin manual plan/role saves now call `/api/admin/users/[id]/role`, which verifies the admin session and updates `profiles` with the service-role client instead of writing from the browser Supabase client.
- Current-user profile edits now call `PATCH /api/profile` for avatar/name/bio/username/interests instead of browser-side `profiles.update`, which avoids the same recursive `profiles` RLS policy on profile edit screens.
- Added `scripts/sql/fix-profiles-rls-recursion.sql` to replace the recursive `profiles` UPDATE policy. Apply it in Supabase SQL Editor or via an authenticated Supabase migration before relying on direct self-profile updates.

Проверки после фикса:

- `npm run typecheck`
- `npm run docs:check`
- Manual smoke: admin opens `/profile?section=users`, changes a non-self user plan, saves, refreshes, and confirms `profiles.plan/role/is_admin` changed without RLS recursion.

## 2026-05-11 QA Fix Sweep

Что было исправлено после ручного QA продовых флоу:

- Stripe recurring plans: recurring checkout больше не создаёт дубли подписок, если у customer уже есть активная/trialing subscription. Для upgrade, downgrade и смены monthly/yearly открывается Stripe Billing Portal `subscription_update_confirm`, где Stripe показывает пересчитанный upcoming invoice/proration credit до подтверждения.
- Stripe verify/webhook: `/api/stripe/verify` и webhook синхронизируют все активные/trialing subscriptions и выбирают самый сильный entitlement, чтобы профиль не откатывался из-за порядка событий или старой подписки.
- Pricing/profile UI: creator plans показывают, что Premium включён; current plan блокируется только для точного совпадения plan+period, а смена периода остаётся доступной.
- Map discovery: `/map` больше не использует невалидные координаты и `[0,0]` для center/bounds/markers, поэтому фильтры не должны уводить карту в world/null-island zoom.
- Discovery counts: публичные счетчики на home/search/map дополнительно исключают hidden places через `is_hidden = false`, чтобы списки и цифры не расходились из-за пустых draft.
- Place navigation: карточки на `/map` открывают details в той же вкладке, а удалённый/nonexistent `/id/[id]` показывает not-found state вместо redirect на `/`.
- Reviews/auth: Sign In entry для комментариев использует centralized auth redirect/modal, без disabled dead-end.
- Empty `/add` drafts: добавлен conservative orphan detector, cleanup текущего пользователя перед quota checks и cron/admin endpoint `/api/maintenance/cleanup-drafts` для старых пустых hidden drafts старше 24 часов.

Проверки перед попыткой deploy:

- `npm run typecheck` - pass.
- `npm run docs:check` - pass.
- `npm run health:json` - `GREEN`, 25/25, 0 warnings.
- `npm run build` - pass.

Production deploy note: запуск `npx vercel@latest deploy . --prod -y` был начат, но остановлен после пользовательского переключения на обновление wiki. Перед повторным деплоем можно rerun той же командой из корня проекта.

## Audit Snapshot

Команда:

```bash
npm run health:json
```

Результат на 2026-05-11:

- Status: `GREEN`.
- Passed: 25.
- Warnings: 0.
- Failures: 0.
- Navigation check: all 54 `page.tsx` files export default; internal links валидны.
- Security criticals: не найдено real keys в `.env.example`, anon key не найден в admin routes, server-only keys не найдены в client files, raw `.or()` filters sanitized.
- Performance/UI/error/API/type hygiene: batch loading, skeleton loading, ErrorBoundary coverage, logger usage, API response typing and explicit-`any` checks are clear.
- Docs freshness: `npm run docs:check` проходит и проверяет agent/wiki entrypoints, source-of-truth файлы и markdown-ссылки.

## Top Risks

| Priority | Риск | Где | Почему важно | Что сделать |
| --- | --- | --- | --- | --- |
| P1 | Нужен реальный production smoke с внешними сервисами | Auth, Supabase RLS, Stripe, Google Maps, OpenAI | Static health не доказывает, что live keys, webhooks, RLS и billing metadata настроены правильно | Прогнать manual checklist ниже на staging с реальными env и webhook events |
| P2 | Supabase generated types всё еще placeholder-style | `app/types/supabase.ts` | Часть Supabase SDK overloads infer `never`, поэтому отдельные writes типизируются через `as never` | Сгенерировать реальные типы через Supabase CLI и снять локальные обходы |
| P3 | Deprecated Google `Marker` | `/map`, `/id/[id]`, edit location | Будущая миграционная боль и warnings | Provision Map ID и перейти на `AdvancedMarkerElement` |

## Release Checklist

Перед релизом:

```bash
npm run health:json
npm run typecheck
npm run docs:check
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
- Google import: search, preview, import, photos, including 429 behavior after repeated requests.
- AI description generation: premium/admin access, invalid JSON, missing key, 429 behavior after repeated requests.
- Resolve APIs: city resolve and Google place-id resolve reject bad JSON, enforce auth, and return 429 after repeated requests.
- Stripe checkout/portal: return URLs use the configured app origin, not arbitrary request origins.
- Stripe verify/webhook: one-time Premium, extra listing does not activate Premium, subscription created/updated/deleted, payment failed, webhook handler failures return 500 for retry.
- Maintenance cron: `/api/maintenance/cleanup-drafts` deletes only abandoned empty `/add` drafts older than 24h; confirm it returns 200 and does not delete filled hidden drafts.

## Env Checklist

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
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
STRIPE_PRICE_CREATOR_LOCATION_MONTH=
STRIPE_PRICE_CREATOR_LOCATION_YEAR=
STRIPE_PRICE_CREATOR_PRO_MONTH=
STRIPE_PRICE_CREATOR_PRO_YEAR=
STRIPE_PRICE_CREATOR_SERVICE_MONTH=
STRIPE_PRICE_CREATOR_SERVICE_YEAR=
STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH=
STRIPE_PRICE_CREATOR_EXPERIENCE_YEAR=
STRIPE_PRICE_CREATOR_ALL_MONTH=
STRIPE_PRICE_CREATOR_ALL_YEAR=
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

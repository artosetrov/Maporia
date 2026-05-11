# Architecture

Последнее обновление: 2026-05-10.

## Stack

- Framework: Next.js 16 App Router, React 19.
- Language: TypeScript strict mode.
- Styling: Tailwind CSS 4 + global CSS.
- Backend/data: Supabase Auth, Postgres, Storage, RLS.
- Maps: Google Maps via `@react-google-maps/api`, marker clustering via `@googlemaps/markerclusterer`.
- Payments: Stripe SDK.
- AI: OpenAI API for place descriptions.
- Deployment target: Vercel-oriented configuration.

## Runtime Boundaries

| Boundary | Files |
| --- | --- |
| Client Supabase singleton | `app/lib/supabase.ts` |
| Server/admin Supabase client | `app/lib/stripe.ts`, admin API routes |
| Auth business helpers | `app/lib/auth/**`, `app/hooks/useAuthRedirect.ts` |
| User access context | `app/contexts/UserAccessContext.tsx`, `app/hooks/useUserAccess.ts` |
| Premium modal context | `app/contexts/PremiumModalContext.tsx` |
| Google Maps provider | `app/providers/GoogleMapsProvider.tsx` |
| Health checks | `scripts/health/**`, `/api/health` |

## Data Model

Основные таблицы по сгенерированным типам и фактическому использованию:

| Table | Назначение |
| --- | --- |
| `profiles` | Профиль, роль, admin flag, Stripe customer, plan, interests, Google/provider fields |
| `places` | Главная сущность каталога: location/service/experience, access, coordinates, contacts, price/schedule/details |
| `place_photos` | Фото карточек с сортировкой |
| `reactions` | Likes/favorites |
| `comments` | Комментарии и rating |
| `cities` | Нормализованные города и координаты |
| `tags` | Теги, категории, emoji |
| `collections` | Редакционные подборки |
| `place_collections` | Связка places с collections |
| `app_settings` | Настройки приложения, включая premium modal |
| `subscriptions` | История/состояние Stripe subscriptions |
| `admin_impersonation_log` | Журнал impersonation |

Storage buckets из README:

- `avatars` - public profile pictures.
- `place-photos` - public place photos.

## Access Model

Источник правды: `app/lib/access.ts`.

Роли:

- `guest`: нет profile/session.
- `standard`: авторизован, но без активного paid plan.
- `premium`: любой paid plan.
- `admin`: `profile.is_admin === true`, полный доступ.

Premium place определяется через несколько полей ради обратной совместимости:

- primary: `access_level === "premium"`;
- legacy: `is_premium`, `premium_only`, `visibility === "premium"`;
- draft state: `accessLevel`.

Правила просмотра:

- Public places видят все.
- Premium places видят paid users и admins.

Правила публикации:

- `canUserAddPlace` сейчас разрешает add только `premium` или `admin`.
- `canUserCreate(kind)` уточняет права по типам:
  - `location`: любой paid plan.
  - `service`: `creator_service` или `creator_all`.
  - `experience`: `creator_experience` или `creator_all`.
- `canUserCreateMulti` требует права на каждый выбранный kind.
- `checkQuota` учитывает текущие active service/experience listings и `bonus_listing_credits`.

## Billing Architecture

Источник тарифов: `app/lib/plans.ts`.

Stripe entry points:

- `POST /api/stripe/checkout`: checkout для Premium, creator plans, extra listing.
- `POST /api/stripe/webhook`: updates `profiles` и `subscriptions`.
- `/api/stripe/verify`: проверка результата checkout.
- `/api/stripe/portal`: customer portal.

Stripe success/cancel/portal return origins are resolved through `app/lib/stripeRedirectOrigin.ts`. Production should set `NEXT_PUBLIC_APP_URL` (or `APP_URL`) to the canonical HTTPS origin; request `Origin`/`Referer` is only accepted when it matches that origin, with localhost allowed in development.

Важные env:

```env
NEXT_PUBLIC_APP_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PREMIUM_ONETIME=
STRIPE_PRICE_CREATOR_LOCATION_MONTH=
STRIPE_PRICE_CREATOR_SERVICE_MONTH=
STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH=
STRIPE_PRICE_CREATOR_ALL_MONTH=
STRIPE_PRICE_EXTRA_LISTING=
```

Legacy env `STRIPE_PRICE_ID` остаётся только как fallback для старого one-time Premium checkout. Новые флоу должны использовать актуальные plan/add-on env выше.

## Integrations

### Supabase

Client-side singleton в `app/lib/supabase.ts` делает defensive init, не валит browser полностью при missing env и вручную стартует auth auto-refresh после session validation.

Service-role operations должны жить только в API routes/server utils. Health-check уже проверяет, что service keys не попали в client files.

### Google Maps

Ключи:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAP_ID=
```

Сейчас используется `google.maps.Marker` в некоторых местах, хотя есть подготовленный `AdvancedPinMarker`. Для полного перехода нужен `NEXT_PUBLIC_GOOGLE_MAP_ID` на production и проверка Google Cloud Map ID.

### OpenAI

`/api/ai/generate-description` использует:

```env
OPENAI_API_KEY=
OPENAI_MODEL=
```

Runtime guards:

- requires an authenticated Supabase user;
- requires Premium/admin access before external AI work;
- validates JSON and place identifiers before lookup;
- applies an in-memory per-user rate limit of 8 requests/minute as a local cost-abuse guard.

### Google Import

`/api/google-import/search` requires an authenticated Supabase user, validates JSON/query length, caches successful Place details responses in memory for 1 hour, and applies an in-memory per-user rate limit of 12 requests/minute before calling Google Places.

### Resolve APIs

- `/api/places/resolve-place-id` requires auth, validates JSON/place id length, rate-limits at 20 requests/minute/user, enforces place view access, and only persists resolved `google_place_id` for the owner/admin.
- `/api/cities/resolve` requires auth, validates JSON, normalizes text/coordinates, and rate-limits at 30 requests/minute/user before calling `get_or_create_city`.

## Scripts And Operations

| Script | Назначение |
| --- | --- |
| `npm run health` | Dev health report |
| `npm run health:ci` | CI health report |
| `npm run health:json` | Health report + `health-report.json` |
| `npm run check` | prebuild health + typecheck + lint + build |
| `npm run setup:stripe` | Stripe setup helper |
| `npm run migrate:photos` | Google photo migration |
| `npm run fix-rls` | RLS fix helper |
| `npm run db:types` | Generate Supabase types from linked project |

SQL scripts live in `scripts/sql/`. They are not a single ordered migration chain, so before applying manually, read names and current DB state.

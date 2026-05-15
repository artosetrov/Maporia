# Search Index

Последнее обновление: 2026-05-13.

## По Доменам

| Термин | Что искать | Где обычно живет |
| --- | --- | --- |
| Auth | `auth`, `signIn`, `signUp`, `magicLink`, `reset` | `app/lib/auth/`, `app/components/auth/`, `app/auth/**` |
| Profile | `profiles`, `display_name`, `username`, `avatar_url`, `updateOwnProfile` | `app/(auth)/profile/**`, `app/api/profile/route.ts`, `app/lib/profileUpdate.ts`, `app/types.ts` |
| Access | `getUserAccess`, `canUserViewPlace`, `isPlacePremium` | `app/lib/access.ts` |
| Premium | `premium_viewer`, `PremiumUpsellModal`, `LockedPlaceOverlay` | `app/lib/plans.ts`, `app/components/` |
| Pricing entitlements | `chooseBestEntitlement`, `planTier`, `BillingEntitlement` | `app/lib/pricing/entitlements.ts`, `app/api/stripe/**` |
| Creator plans | `creator_location`, `creator_pro`, `creator_all`, legacy `creator_service`, `creator_experience` | `app/lib/pricing/registry.ts`, `app/lib/access.ts` |
| Quota | `checkQuota`, `bonus_listing_credits`, `EXTRA_LISTING` | `app/lib/access.ts`, `app/lib/plans.ts` |
| Places | `places`, `Place`, `PlaceListItem`, `kind` | `app/types.ts`, `app/types/supabase.ts`, `app/(auth)/places/**` |
| Draft cleanup | `orphan`, `cleanup-drafts`, `ORPHAN_ADD_DRAFT` | `app/lib/placeDrafts.ts`, `app/api/maintenance/cleanup-drafts/route.ts`, `app/(auth)/add/page.tsx` |
| Service/Experience | `OfferPlaceView`, `price_amount`, `price_options`, `schedule`, `host_qualification` | `app/id/[id]/_views/`, edit pages |
| Collections | `collections`, `place_collections` | `app/collections/**`, `app/(auth)/admin/collections/**` |
| Tags | `tags`, `category_ids`, `emoji` | `app/api/tags`, `app/api/admin/tags`, `scripts/sql/*tags*` |
| Cities | `cities`, `city_id`, `city_name_cached`, `resolve` | `app/lib/cities.ts`, `app/lib/cityResolver.ts`, `app/api/cities/resolve` |
| Map | `GoogleMap`, `MarkerClusterer`, `MaporiaClusterRenderer` | `app/map/page.tsx`, `app/explore/page.tsx`, `app/lib/clusterRenderer.ts` |
| Google import | `google_place_id`, `place-import`, `google-import` | `app/api/google*`, `app/(auth)/add/google/**` |
| Stripe | `checkout`, `webhook`, `subscription`, `stripe_customer_id` | `app/api/stripe/**`, `app/lib/stripe.ts` |
| Stripe plan switching | `subscription_update_confirm`, `create_prorations`, `listOpenSubscriptions` | `app/api/stripe/checkout/route.ts`, `scripts/setup-stripe.mjs`, `STRIPE_SETUP.md` |
| AI description | `generate-description`, `placeDescription` | `app/api/ai/generate-description`, `app/lib/ai/` |
| Impersonation | `impersonate`, `admin_impersonation_log` | `app/api/admin/impersonate/**`, `app/lib/impersonation.ts` |
| Admin users | `admin/users`, `AdminAssignable`, `fix-profiles-rls-recursion` | `app/(auth)/profile/page.tsx`, `app/api/admin/users/**`, `scripts/sql/fix-profiles-rls-recursion.sql` |
| Health | `health`, `CheckResult`, `health:json` | `scripts/health/**`, `app/api/health/route.ts` |
| LLM orientation | `AGENTS.md`, `LLM Brief`, `wiki` | `AGENTS.md`, `docs/wiki/00-llm-brief.md`, `docs/wiki/README.md` |
| Wiki freshness | `docs:check`, `checkWikiFreshness` | `scripts/wiki/checkWikiFreshness.ts`, `package.json` |
| Home redesign | `HOME_REDESIGN`, `HomeHero`, `HomeSearchHero`, `HomeTabsSegmented` | `app/config/homeRedesign.ts`, `app/components/Home*.tsx`, `docs/HOME_REDESIGN_*` |

## Быстрые Команды

```bash
# все страницы
find app -type f -name 'page.tsx' | sort

# все API routes
find app/api -type f -name 'route.ts' | sort

# все Supabase table usages
rg "from\\(['\\\"]" app scripts

# premium/access logic
rg "access_level|premium_only|is_premium|canUserViewPlace|isPlacePremium" app

# billing
rg "PLAN_CONFIG|STRIPE_|checkout|webhook|subscription|bonus_listing_credits" app scripts

# admin users / role assignment
rg "admin/users|AdminAssignable|fix-profiles-rls-recursion" app scripts docs

# карта и маркеры
rg "GoogleMap|MarkerClusterer|AdvancedMarker|google\\.maps\\.Marker" app

# Google import
rg "google_place_id|google-import|place-import|GoogleImport" app

# TODO и известные долги
rg "TODO|FIXME|deprecated|CRITICAL" app scripts docs

# LLM/agent context
rg "LLM|agent|source of truth|health:json|HOME_REDESIGN" AGENTS.md docs/wiki docs

# Wiki freshness check
npm run docs:check
```

## Файлы-Источники Правды

| Решение | Источник |
| --- | --- |
| Тарифы и цены | `app/lib/pricing/registry.ts` |
| Роли, доступ, квоты | `app/lib/access.ts` |
| Shared domain types | `app/types.ts` |
| Generated Supabase schema | `app/types/supabase.ts` |
| Категории и города | `app/constants.ts` |
| Home sections | `app/constants/homeSections.ts` |
| Supabase browser client | `app/lib/supabase.ts` |
| Stripe server utilities | `app/lib/stripe.ts` |
| Google Maps config | `app/config/googleMaps.ts` |
| Place layout config | `app/config/placeLayout.ts` |
| Health check rules | `scripts/health/healthChecks.ts` |
| Wiki freshness check | `scripts/wiki/checkWikiFreshness.ts` |
| Agent entrypoint | `AGENTS.md` |
| LLM short brief | `docs/wiki/00-llm-brief.md` |
| Home redesign flag | `app/config/homeRedesign.ts` |

## Где Не Искать Первым

- `docs/archive/` - сначала смотри актуальную вики и код; archive нужен для истории.
- Корневые `*_PLAN.md` - это планы, не всегда текущая реализация.
- `README.md` - полезен для setup, но не покрывает текущую модель продукта целиком.

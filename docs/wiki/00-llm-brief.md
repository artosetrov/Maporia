# LLM Brief

Последнее обновление: 2026-05-11.

Это краткая ориентация для любой LLM/agent, которая впервые открывает Maporia. Цель: за 3 минуты понять продукт, архитектуру, текущие решения и где искать правду.

## Что Это

Maporia - discovery marketplace/local guide:

- Users discover curated local places, hidden gems, services, and experiences.
- Creators/providers publish locations, services, and experiences.
- Admins manage collections, tags, billing, health, users, and impersonation.

Stack:

- Next.js 16 App Router, React 19, TypeScript strict.
- Supabase Auth/Postgres/Storage/RLS.
- Google Maps and Places import.
- Stripe Premium/creator billing.
- OpenAI place description generation.
- Vercel-oriented deployment.

## Сначала Открыть

1. `AGENTS.md` - repo-level rules for agents.
2. `docs/wiki/README.md` - wiki navigation.
3. `docs/wiki/05-search-index.md` - search commands and source-of-truth files.
4. `docs/wiki/04-operations-and-risks.md` - current warnings and release checklist.

## Главные Домены

| Domain | Read |
| --- | --- |
| Product audit | `docs/wiki/01-product-audit.md` |
| Feature/routes/API map | `docs/wiki/02-feature-map.md` |
| Architecture/data/integrations | `docs/wiki/03-architecture.md` |
| Operations/risks/checklists | `docs/wiki/04-operations-and-risks.md` |
| Search index | `docs/wiki/05-search-index.md` |
| Stripe setup | `STRIPE_SETUP.md` |
| Home redesign smoke test | `docs/HOME_REDESIGN_SMOKE_RUNBOOK.md` |

## Current Product Model

Places have a primary kind:

- `location`
- `service`
- `experience`

Publishing rights and pricing:

- `free`: public browsing.
- `premium_viewer`: one-time Premium, sees premium places; v2 treats it as consumer-only for new buyers.
- `creator_location`: monthly/yearly, Premium included, location quota.
- `creator_pro`: monthly/yearly, Premium included, combined service/experience quota.
- `creator_service` / `creator_experience`: legacy grandfathered subscription plans.
- `creator_all`: monthly/yearly, combined service/experience quota.
- `extra_listing`: one-time add-on credit.

Source of truth:

- Plans/prices: `app/lib/pricing/registry.ts`; `app/lib/plans.ts` is legacy compatibility.
- Roles/access/quota: `app/lib/access.ts`.
- Shared domain types: `app/types.ts`.
- DB generated types: `app/types/supabase.ts`.

## Recent Important Decisions

- Wiki and LLM orientation are the canonical knowledge layer.
- Stripe billing is being migrated from legacy `PLAN_CONFIG` to the v2 pricing registry.
- Premium/access filtering P1 warnings are closed.
- `.or()` PostgREST filter warnings are closed.
- Auth and Premium modals are centralized through `GlobalModals`.
- Home redesign exists behind `NEXT_PUBLIC_HOME_REDESIGN`.
- Filters have been refactored toward shared count/filter helpers and type-aware behavior.
- Stripe recurring checkout now routes existing subscribers through Billing Portal update confirmation, so upgrade/downgrade/monthly-yearly switches show Stripe proration before confirmation instead of creating duplicate subscriptions.
- Subscription verify/webhook reconciliation chooses the strongest active entitlement across all active/trialing Stripe subscriptions.
- `/add` empty hidden drafts older than 24h are cleaned conservatively through current-user cleanup and `/api/maintenance/cleanup-drafts`.
- `/map` ignores invalid/null-island coordinates for markers/bounds/center and opens place cards in the same tab.

## What Not To Assume

- Old root `*_PLAN.md` files may describe intent, not current code.
- `docs/archive/` is historical; verify against code and current wiki before using.
- `STRIPE_PRICE_ID` is legacy fallback, not the main billing model.
- Some DB scripts in `scripts/sql/` are maintenance scripts, not a single ordered migration chain.
- Health warnings are not all failures; check current baseline before declaring breakage.

## Current Verification Baseline

Run:

```bash
npm run typecheck
npm run health:json
npm run docs:check
```

Expected current shape:

- Typecheck should pass.
- Health should be `GREEN`, no warnings/failures.
- Wiki freshness should pass.
- Green areas should include security, access filtering, modal centralization, navigation.

## Quick Navigation Commands

```bash
find app -type f -name 'page.tsx' | sort
find app/api -type f -name 'route.ts' | sort
rg "PLAN_CONFIG|STRIPE_|checkout|webhook|subscription" app scripts
rg "getUserAccess|canUserViewPlace|isPlacePremium|checkQuota" app
rg "GoogleMap|MarkerClusterer|google_place_id|google-import" app
rg "GlobalModals|PremiumModalContext|usePremiumGate" app
rg "HOME_REDESIGN|HomeHero|HomeSearchHero|HomeTabsSegmented" app docs
```

## If You Change Something

Update wiki when changing:

- routes or API routes -> `docs/wiki/02-feature-map.md`;
- data, env, billing, access, integrations -> `docs/wiki/03-architecture.md`;
- known risks, warnings, release checks -> `docs/wiki/04-operations-and-risks.md`;
- source-of-truth files or search terms -> `docs/wiki/05-search-index.md`;
- high-level LLM onboarding -> this file and `AGENTS.md`.

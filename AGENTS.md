# Maporia Agent Guide

This file is the first context checkpoint for any coding agent or LLM working in this repository.

## Read First

1. `docs/wiki/00-llm-brief.md` - shortest project brief for LLMs.
2. `docs/wiki/README.md` - wiki navigation.
3. `docs/wiki/04-operations-and-risks.md` - current risks and release checks.
4. `docs/wiki/05-search-index.md` - fast `rg` commands and source-of-truth files.

## Project Snapshot

Maporia is a Next.js App Router product for discovering and publishing local places, services, and experiences. It uses Supabase for auth/data/storage, Google Maps for map/search/import, Stripe for Premium and creator billing, and OpenAI for AI-generated place descriptions.

Current important product concepts:

- `place.kind`: `location`, `service`, `experience`.
- Premium access: `access_level = premium` plus legacy fields.
- Plans: `premium_viewer`, `creator_service`, `creator_experience`, `creator_all`.
- Global modal architecture: `app/components/GlobalModals.tsx` + `app/contexts/PremiumModalContext.tsx`.
- Home redesign is feature-flagged by `NEXT_PUBLIC_HOME_REDESIGN`.
- Product health is tracked by `npm run health:json`.

## Deployment Target

Always deploy the live Maporia site to the Vercel project `maporia_full`, which serves:

- `https://www.maporia.co`
- `https://maporia.co`

Do not treat the separate Vercel project `maporia` / `https://maporia.vercel.app` as the live production site. When using a clean temp deploy copy, write `.vercel/repo.json` for project id `prj_7h0OXlw5rrbQuREEIso0NGkkLsxp` (`maporia_full`) before running `vercel deploy --prod`.

## Source Of Truth

| Domain | File |
| --- | --- |
| Product/wiki entry | `docs/wiki/README.md` |
| LLM brief | `docs/wiki/00-llm-brief.md` |
| Routes/API/components | `docs/wiki/02-feature-map.md` |
| Architecture/data/billing | `docs/wiki/03-architecture.md` |
| Risks/checklists | `docs/wiki/04-operations-and-risks.md` |
| Search commands | `docs/wiki/05-search-index.md` |
| Plans and prices | `app/lib/plans.ts` |
| Access, roles, quota | `app/lib/access.ts` |
| Domain types | `app/types.ts` |
| Generated DB types | `app/types/supabase.ts` |
| Categories/cities | `app/constants.ts` |
| Supabase client | `app/lib/supabase.ts` |
| Stripe utilities | `app/lib/stripe.ts` |
| Health rules | `scripts/health/healthChecks.ts` |

## Before Editing

- Check `git status --short`; the worktree may contain user or other-agent changes.
- Do not revert unrelated changes.
- Prefer existing patterns in `app/components`, `app/hooks`, `app/lib`.
- Use `rg`/`rg --files` for navigation.
- For docs, update the wiki when you change routes, API, env, billing, access, data, or known risks.

## Verification

Use the narrowest useful checks first:

```bash
npm run typecheck
npm run health:json
npm run docs:check
```

For broader release confidence:

```bash
npm run lint
npm run build
npm run check
```

Current baseline after recent work: `health:json` is expected to be `YELLOW` with no failures. Warnings are tracked in `docs/wiki/04-operations-and-risks.md`.

## Current Known Warning Buckets

- Missing batch loading around several `PlaceCard` list surfaces.
- Missing skeleton loading on some pages.
- `any` hotspots in larger legacy pages.
- Untyped API route responses.
- Missing ErrorBoundary on selected routes.
- Raw console usage in `lib/` and `api/`.

## Commit Hygiene

- Keep docs-only, UI, billing, access/security, and refactor changes in separate commits when practical.
- If a git lock file blocks a command, first check for active git processes before removing stale locks.
- Do not commit `.env.local`, build output, `health-report.json`, or ad hoc scratch files.

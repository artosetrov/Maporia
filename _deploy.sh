#!/usr/bin/env bash
# Maporia commit + deploy — 2026-05-11
# Запускать из корня проекта: bash _deploy.sh
# (или построчно)

set -euo pipefail

cd "$(dirname "$0")"

echo "==> 0. Чистим sandbox-мусор и stale git lock"
rm -f .git/index.lock
rm -rf tmp/

echo "==> 1. Sanity-check: убедимся, что layoutConfig.ts на месте, layout.ts удалён"
test -f app/config/layoutConfig.ts || { echo "ERROR: app/config/layoutConfig.ts отсутствует"; exit 1; }
test ! -f app/config/layout.ts || { echo "ERROR: старый app/config/layout.ts ещё на месте — удали вручную"; exit 1; }
grep -q "config/layoutConfig" app/hooks/useIsDesktop.ts || { echo "ERROR: импорт в useIsDesktop.ts не обновлён"; exit 1; }

echo "==> 2. (опционально) локальный билд для подстраховки"
if command -v pnpm >/dev/null 2>&1; then
  PKG=pnpm
elif command -v npm >/dev/null 2>&1; then
  PKG=npm
else
  PKG=""
fi
read -p "Прогнать ${PKG:-?} build локально? (y/N): " RUN_BUILD
if [[ "$RUN_BUILD" == "y" || "$RUN_BUILD" == "Y" ]]; then
  if [[ -z "$PKG" ]]; then
    echo "ERROR: ни pnpm ни npm не найдены — пропусти билд (N)"
    exit 1
  fi
  "$PKG" run build || { echo "BUILD FAILED — стоп, не коммитим"; exit 1; }
fi

echo "==> 3. git add (всё, включая QA-доки)"
git add -A
git status --short

echo "==> 4. commit"
git commit -m "feat: Stripe plan switching, edit UX polish, /add draft cleanup, QA pass

Stripe & billing
- checkout/route.ts: detect existing open subscriptions, redirect to Billing
  Portal for plan switches; create new only when customer has none.
- verify/route.ts: extended verification flow with subscription status reconciliation.
- webhook/route.ts: handle subscription.updated/deleted, sync entitlements.
- New: app/lib/pricing/entitlements.ts — chooseBestEntitlement() picks highest-tier
  active plan when user has multiple (e.g. mid-cycle upgrade).

Places /add hygiene
- New: app/lib/placeDrafts.ts — shared orphan-draft predicate + cleanup constants
  (TTL 24h, batch limit 100).
- New: app/api/maintenance/cleanup-drafts/route.ts — cron endpoint
  (Bearer CRON_SECRET / x-cron-secret / admin session) that deletes empty
  drafts older than TTL. Wired in vercel.json.

Edit-flow UX
- New: app/components/ConfirmDialog.tsx — unified destructive-action modal.
- New: app/components/TransientNotice.tsx — toast-style ephemeral feedback.
- All /places/[id]/edit/* sub-pages and /profile/edit/* refactored to use the
  shared dialog/notice components instead of ad-hoc confirms.

Map / discovery
- PlaceCard: new openInNewTab prop (default = isDesktop). /map and listings now
  open same-tab (fixes QA S3 — was always target=_blank on cards).
- /map: kind-filter + viewport sync rework; /explore, / (home), /id, /pricing
  touched for consistency.
- AuthModal / ReviewsSection / SearchModal: tighter guest UX (fixes QA S2
  'Sign In' dead-end on reviews, 'Show all photos' AuthModal for guest).

Next.js 16 compat
- Rename app/config/layout.ts → app/config/layoutConfig.ts. Next 16 treats
  app/<seg>/layout.ts as a layout route file and now requires default export;
  this file is only constants, so the rename keeps it out of the route system.
  Updated import in app/hooks/useIsDesktop.ts.

Docs / QA
- New: QA_PLAN_2026-05-11.md, QA_REPORT_2026-05-11.md — full smoke pass on
  production, 1×S2 + 3×S3 + 1×S4 found, several already fixed in this commit.
- docs/wiki/* refreshed (architecture, feature-map, operations-and-risks,
  search-index, llm-brief).
- STRIPE_SETUP.md / scripts/setup-stripe.mjs / .env.example aligned with new
  multi-plan flow.

Misc
- TopBar, HomeSection, GoogleImportField, ImpersonationBannerClient minor polish.
- vercel.json: cleanup-drafts cron schedule + headers tweaks.
"

echo "==> 5. push в origin/main → Vercel auto-deploy"
git push origin main

echo "==> 6. ✅ Готово. Следи за деплоем: https://vercel.com/dashboard"

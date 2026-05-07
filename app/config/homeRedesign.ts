/**
 * Home redesign feature flag.
 *
 * Toggle the new home header (hero + segmented tabs + search hero +
 * stats ticker) without code changes:
 *   • Vercel env: NEXT_PUBLIC_HOME_REDESIGN=1 → on
 *   • Vercel env: NEXT_PUBLIC_HOME_REDESIGN=0 (or unset) → off, legacy layout
 *
 * Why a build-time env var instead of a runtime DB flag:
 * the home page is the hottest path; reading an extra row from
 * `app_settings` on every render adds an avoidable round-trip. Env flag
 * is free at runtime and gives instant rollback by redeploy (~30 s).
 *
 * If we ever want a soft-launch with cookie-based bucketing, we can
 * introduce a runtime override on top of this default — but that's a
 * separate change.
 *
 * Cross-link: docs/HOME_REDESIGN_INTEGRATION_PLAN.md (Phase 0)
 */
export const HOME_REDESIGN_ENABLED =
  process.env.NEXT_PUBLIC_HOME_REDESIGN === "1";

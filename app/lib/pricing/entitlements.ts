import type { Plan, PlanPeriod } from "../../types";

export type BillingEntitlement = {
  plan: Plan;
  period: PlanPeriod;
  renewsAt?: string | null;
  stripeSubscriptionId?: string | null;
  createdAt?: string | null;
};

// v3 (2026-05-11): creator_pro заменил creator_service/experience (tier 3).
// Legacy планы сохраняют тот же tier — grandfathered подписчик видит Pro Creator как Switch.
export function planTier(plan: Plan): number {
  if (plan === "free") return 0;
  if (plan === "premium_viewer" || plan === "premium_grandfathered") return 1;
  if (plan === "creator_location") return 2;
  if (
    plan === "creator_pro" ||
    plan === "creator_service" ||
    plan === "creator_experience"
  )
    return 3;
  if (plan === "creator_all") return 4;
  return 0;
}

function timestampValue(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function chooseBestEntitlement<T extends BillingEntitlement>(
  entitlements: readonly T[],
): T | null {
  let best: T | null = null;

  for (const item of entitlements) {
    if (item.plan === "free") continue;
    if (!best) {
      best = item;
      continue;
    }

    const tierDelta = planTier(item.plan) - planTier(best.plan);
    if (tierDelta > 0) {
      best = item;
      continue;
    }
    if (tierDelta < 0) continue;

    const renewDelta = timestampValue(item.renewsAt) - timestampValue(best.renewsAt);
    if (renewDelta > 0) {
      best = item;
      continue;
    }
    if (renewDelta < 0) continue;

    if (timestampValue(item.createdAt) > timestampValue(best.createdAt)) {
      best = item;
    }
  }

  return best;
}

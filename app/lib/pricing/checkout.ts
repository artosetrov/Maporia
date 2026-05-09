/**
 * Stripe Price ID resolver — двунаправленный мост между registry и Stripe.
 *
 *   resolvePriceId({plan, cycle, currency}) → "price_xyz"  (для checkout)
 *   resolvePlanByPriceId("price_xyz")       → {plan, cycle, currency}  (для webhook)
 *
 * Все Stripe Price ID берутся ИСКЛЮЧИТЕЛЬНО из ENV — никаких хардкоденных
 * id в коде. Имена ENV-переменных — из registry (`PriceSpec.stripeIdEnv`).
 *
 * Validation на старте — `app/lib/env.ts` (Φ9).
 */

import {
  PRICING_REGISTRY,
  type Currency,
  type Cycle,
  type PlanId,
  type PriceSpec,
  EXTRA_LISTING,
  getPriceSpec,
} from "./registry";

export class PriceNotConfiguredError extends Error {
  constructor(
    public plan: PlanId | "extra_listing",
    public cycle: Cycle | null,
    public currency: Currency,
    public envName: string,
  ) {
    super(
      `Stripe Price not configured: plan=${plan} cycle=${cycle ?? "n/a"} currency=${currency} (env ${envName} is empty)`,
    );
    this.name = "PriceNotConfiguredError";
  }
}

export class UnsupportedPlanCycleError extends Error {
  constructor(plan: PlanId, cycle: Cycle, currency: Currency) {
    super(
      `Plan "${plan}" does not support cycle="${cycle}" in currency=${currency}`,
    );
    this.name = "UnsupportedPlanCycleError";
  }
}

/**
 * Резолвит Stripe Price ID для checkout. Кидает ошибку, если variant не сконфигурирован.
 * Каллер должен поймать `PriceNotConfiguredError` и показать юзеру понятную ошибку
 * («этот план временно недоступен») — чтобы missing ENV не убивал весь чекаут silently.
 */
export function resolvePriceId(args: {
  plan: PlanId;
  cycle: Cycle;
  currency?: Currency;
}): string {
  const currency = args.currency ?? "USD";
  const spec = getPriceSpec(args.plan, args.cycle, currency);
  if (!spec) {
    throw new UnsupportedPlanCycleError(args.plan, args.cycle, currency);
  }
  const id = readEnvPriceId(spec);
  if (!id) {
    throw new PriceNotConfiguredError(args.plan, args.cycle, currency, spec.stripeIdEnv);
  }
  return id;
}

/** Резолв add-on $2.99 — отдельная функция, потому что он не входит в plan model. */
export function resolveExtraListingPriceId(): string {
  const id = process.env[EXTRA_LISTING.stripeIdEnv];
  if (!id) {
    throw new PriceNotConfiguredError(
      "extra_listing",
      null,
      EXTRA_LISTING.currency,
      EXTRA_LISTING.stripeIdEnv,
    );
  }
  return id;
}

/**
 * Reverse-маппинг: по Stripe Price ID найти, какой это plan/cycle/currency.
 * Используется webhook'ом при `customer.subscription.created/updated`.
 *
 * Возвращает null, если price ID не относится ни к одному из наших планов
 * (например, юзер случайно подписался на Stripe-product-not-from-Maporia,
 * или это add-on $2.99). Каллер решает, как реагировать.
 *
 * Performance: O(plans × currencies × cycles) ≈ 24 итерации. Кэшировать пока не нужно.
 */
export function resolvePlanByPriceId(
  priceId: string,
): { plan: PlanId; cycle: Cycle; currency: Currency } | null {
  for (const [plan, spec] of Object.entries(PRICING_REGISTRY) as [
    PlanId,
    (typeof PRICING_REGISTRY)[PlanId],
  ][]) {
    for (const [currency, cyclePrices] of Object.entries(spec.prices) as [
      Currency,
      Partial<Record<Cycle, PriceSpec>>,
    ][]) {
      if (!cyclePrices) continue;
      for (const [cycle, price] of Object.entries(cyclePrices) as [
        Cycle,
        PriceSpec | undefined,
      ][]) {
        if (!price) continue;
        if (readEnvPriceId(price) === priceId) {
          return { plan, cycle, currency };
        }
      }
    }
  }
  return null;
}

/** Это extra-listing add-on price ID? */
export function isExtraListingPriceId(priceId: string): boolean {
  return process.env[EXTRA_LISTING.stripeIdEnv] === priceId;
}

function readEnvPriceId(spec: PriceSpec): string | undefined {
  const v = process.env[spec.stripeIdEnv];
  return v && v.length > 0 ? v : undefined;
}

/**
 * Все ENV-имена, которые регистр объявляет. Используется для smoke-validation
 * («все ли ENV ENV-имена, на которые ссылается registry, реально есть в process.env?»).
 */
export function listAllStripePriceEnvs(): readonly string[] {
  const out = new Set<string>();
  for (const spec of Object.values(PRICING_REGISTRY)) {
    for (const cyclePrices of Object.values(spec.prices)) {
      if (!cyclePrices) continue;
      for (const price of Object.values(cyclePrices)) {
        if (price) out.add(price.stripeIdEnv);
      }
    }
  }
  out.add(EXTRA_LISTING.stripeIdEnv);
  return [...out];
}

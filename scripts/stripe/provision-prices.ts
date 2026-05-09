/**
 * scripts/stripe/provision-prices.ts
 *
 * Идемпотентный provisioning Stripe Products + Prices из `app/lib/pricing/registry.ts`.
 *
 *   npx tsx scripts/stripe/provision-prices.ts          # читает STRIPE_SECRET_KEY из env
 *   npx tsx scripts/stripe/provision-prices.ts --dry    # ничего не создаёт, только печатает план
 *
 * Принцип:
 *   - Для каждого `(plan, currency, cycle)` из registry скрипт ищет существующий Stripe
 *     Product по `metadata.maporia_plan = <plan>`. Если нет — создаёт.
 *   - Затем ищет Stripe Price по `metadata.maporia_plan + metadata.maporia_cycle + currency`.
 *     Если нет — создаёт. Если есть, но `unit_amount` расходится с registry — ругается
 *     (Stripe Prices иммутабельны; для смены цены нужно создать новый Price).
 *   - Печатает .env-блок с `STRIPE_PRICE_*` IDs.
 *
 * Запускать на любом Stripe-аккаунте — test и live имеют одни и те же metadata-keys,
 * получаются разные Price IDs.
 *
 * См. docs/PRICING_V2_PLAN.md § 11.3 (Stripe provisioning).
 */

import Stripe from "stripe";
import {
  PRICING_REGISTRY,
  EXTRA_LISTING,
  type Cycle,
  type Currency,
  type PlanId,
} from "../../app/lib/pricing/registry";

const DRY_RUN = process.argv.includes("--dry") || process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("-v") || process.argv.includes("--verbose");

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error(
    "[provision] STRIPE_SECRET_KEY is not set. Export it (test: sk_test_..., live: sk_live_...).",
  );
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY, { typescript: true });
const isLive = STRIPE_KEY.startsWith("sk_live_");

console.log(
  `[provision] mode=${isLive ? "LIVE" : "TEST"} dry=${DRY_RUN} stripe-key-prefix=${STRIPE_KEY.slice(0, 12)}…`,
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — find or create Product / Price
// ─────────────────────────────────────────────────────────────────────────────

type ProvisionResult = {
  envName: string;
  priceId: string;
  productId: string;
  action: "created" | "found" | "would-create";
};

async function findProductByMetadata(maporiaPlan: PlanId | "extra_listing"): Promise<Stripe.Product | null> {
  // Stripe не индексирует metadata в search для всех аккаунтов; делаем manual scan.
  // На небольшом каталоге (5 plans + 1 add-on) это копеечный list.
  const list = await stripe.products.list({ limit: 100, active: true });
  return list.data.find((p) => p.metadata.maporia_plan === maporiaPlan) ?? null;
}

async function findPriceByMetadata(args: {
  productId: string;
  cycle: Cycle;
  currency: Currency;
  amountCents: number;
}): Promise<Stripe.Price | null> {
  const list = await stripe.prices.list({
    product: args.productId,
    active: true,
    limit: 100,
  });
  return (
    list.data.find(
      (p) =>
        p.metadata.maporia_cycle === args.cycle &&
        p.currency.toLowerCase() === args.currency.toLowerCase(),
    ) ?? null
  );
}

async function ensureProduct(
  maporiaPlan: PlanId | "extra_listing",
  name: string,
  description: string,
): Promise<Stripe.Product> {
  const existing = await findProductByMetadata(maporiaPlan);
  if (existing) {
    if (VERBOSE) console.log(`  [product] found: ${existing.id} (${existing.name})`);
    return existing;
  }
  if (DRY_RUN) {
    console.log(`  [product] WOULD create: ${name} (metadata.maporia_plan=${maporiaPlan})`);
    // Минимальный stub для TypeScript; в DRY режиме реальные поля не используются.
    return {
      id: "prod_DRY_RUN",
      name,
      metadata: { maporia_plan: maporiaPlan },
    } as unknown as Stripe.Product;
  }
  const created = await stripe.products.create({
    name,
    description,
    metadata: { maporia_plan: maporiaPlan },
  });
  console.log(`  [product] created: ${created.id} (${name})`);
  return created;
}

async function ensurePrice(args: {
  product: Stripe.Product;
  plan: PlanId | "extra_listing";
  cycle: Cycle;
  currency: Currency;
  amountUSD: number;
}): Promise<Stripe.Price> {
  const amountCents = Math.round(args.amountUSD * 100);

  const existing = await findPriceByMetadata({
    productId: args.product.id,
    cycle: args.cycle,
    currency: args.currency,
    amountCents,
  });

  if (existing) {
    if (existing.unit_amount !== amountCents) {
      console.warn(
        `  [price] ⚠ MISMATCH for ${args.plan}/${args.cycle}/${args.currency}: ` +
          `Stripe has ${existing.unit_amount}c, registry says ${amountCents}c. ` +
          `Stripe Prices are immutable — create a new Price manually if you want to change the amount.`,
      );
    } else if (VERBOSE) {
      console.log(`  [price] found: ${existing.id} (${args.cycle}, ${amountCents}c)`);
    }
    return existing;
  }

  if (DRY_RUN) {
    console.log(
      `  [price] WOULD create: ${args.plan}/${args.cycle}/${args.currency} ${amountCents}c`,
    );
    return { id: "price_DRY_RUN" } as unknown as Stripe.Price;
  }

  const params: Stripe.PriceCreateParams = {
    product: args.product.id,
    currency: args.currency.toLowerCase(),
    unit_amount: amountCents,
    metadata: {
      maporia_plan: args.plan,
      maporia_cycle: args.cycle,
    },
  };

  if (args.cycle === "month" || args.cycle === "year") {
    params.recurring = { interval: args.cycle };
  }

  const created = await stripe.prices.create(params);
  console.log(
    `  [price] created: ${created.id} (${args.plan}/${args.cycle}/${args.currency} ${amountCents}c)`,
  );
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const results: ProvisionResult[] = [];

  // ── Plans ──
  for (const [planKey, spec] of Object.entries(PRICING_REGISTRY)) {
    const plan = planKey as PlanId;
    if (Object.keys(spec.prices).length === 0) {
      // Free, premium_grandfathered — нет цен, скип.
      continue;
    }

    console.log(`\n[plan] ${plan} (${spec.display?.name ?? "internal"})`);

    const product = await ensureProduct(
      plan,
      spec.display?.name ?? plan,
      spec.display?.tagline ?? "",
    );

    for (const [currencyKey, cyclePrices] of Object.entries(spec.prices)) {
      const currency = currencyKey as Currency;
      if (!cyclePrices) continue;

      for (const [cycleKey, priceSpec] of Object.entries(cyclePrices)) {
        const cycle = cycleKey as Cycle;
        if (!priceSpec) continue;

        const price = await ensurePrice({
          product,
          plan,
          cycle,
          currency,
          amountUSD: priceSpec.amount,
        });

        results.push({
          envName: priceSpec.stripeIdEnv,
          priceId: price.id,
          productId: product.id,
          action: DRY_RUN ? "would-create" : "found",
        });
      }
    }
  }

  // ── Add-on ──
  console.log(`\n[addon] extra_listing`);
  const addonProduct = await ensureProduct(
    "extra_listing",
    "Extra Listing Slot",
    "+1 listing slot beyond plan quota",
  );
  const addonPrice = await ensurePrice({
    product: addonProduct,
    plan: "extra_listing",
    cycle: "lifetime",
    currency: EXTRA_LISTING.currency,
    amountUSD: EXTRA_LISTING.amount,
  });
  results.push({
    envName: EXTRA_LISTING.stripeIdEnv,
    priceId: addonPrice.id,
    productId: addonProduct.id,
    action: DRY_RUN ? "would-create" : "found",
  });

  // ── ENV block ──
  console.log("\n" + "═".repeat(70));
  console.log("  Copy-paste into your .env.local (or Vercel ENV):");
  console.log("═".repeat(70));
  console.log("");
  for (const r of results) {
    console.log(`${r.envName}=${r.priceId}`);
  }
  console.log("");
  if (DRY_RUN) {
    console.log("  ⚠ DRY-RUN — no Products/Prices were created. Re-run without --dry to apply.");
  } else if (isLive) {
    console.log("  ⚠ LIVE mode — these Price IDs are real. Update Vercel ENV.");
  } else {
    console.log("  ✓ TEST mode — Price IDs created in Stripe test.");
  }
}

main().catch((err) => {
  console.error("[provision] failed:", err);
  process.exit(1);
});

/**
 * scripts/stripe/migrate-all-in-to-v3.ts
 *
 * One-shot миграция Pro All-in с v2 цены $34.99 на v3 цену $19.99.
 *
 *   npx tsx scripts/stripe/migrate-all-in-to-v3.ts --dry
 *   npx tsx scripts/stripe/migrate-all-in-to-v3.ts
 *
 * Что делает:
 *   1. Для каждого cycle (month, year) у plan='creator_all':
 *      a) Находит active Stripe Price по metadata.maporia_plan=creator_all + maporia_cycle.
 *      b) Если unit_amount не совпадает с registry (1999c month / 19188c year) → старый Price
 *         помечается active=false, создаётся новый Price с registry-amount.
 *      c) Сохраняет mapping old_price_id → new_price_id.
 *   2. Печатает .env-блок (STRIPE_PRICE_CREATOR_ALL_MONTH/YEAR с новыми ID).
 *   3. Для каждой active Stripe subscription, item которой ссылается на old price → переключает
 *      на new price с proration_behavior='none' (юзер не доплачивает пропорционально, новая
 *      цена применяется со следующего billing cycle).
 *
 * Идемпотентен: при повторном запуске — старые price уже inactive, новые Prices совпадают по
 * amount → ничего не делает, кроме сверки.
 *
 * Запуск ПОСЛЕ деплоя кода с registry v3, но до того как новые юзеры начнут чекаут на
 * Pro All-in. Webhook сам синхронизирует profiles.plan + subscriptions.* по customer.subscription.updated.
 *
 * См. docs/PRICING_V3_CREATOR_MERGE.md § 5.2 / § 7.2.
 */

// Подгружаем .env.local / .env как Next делает в runtime.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import Stripe from "stripe";
import {
  PRICING_REGISTRY,
  type Cycle,
} from "../../app/lib/pricing/registry";

const DRY_RUN = process.argv.includes("--dry") || process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("-v") || process.argv.includes("--verbose");

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error("[migrate] STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY, { typescript: true });
const isLive = STRIPE_KEY.startsWith("sk_live_");

console.log(`[migrate] mode=${isLive ? "LIVE" : "TEST"} dry=${DRY_RUN}`);

const TARGET_CYCLES: Cycle[] = ["month", "year"];
const PLAN_ID = "creator_all" as const;

type CycleMigration = {
  cycle: Cycle;
  oldPriceId: string | null;
  newPriceId: string;
  registryAmountCents: number;
  registryEnvName: string;
};

async function findActiveCreatorAllPrice(cycle: Cycle): Promise<Stripe.Price | null> {
  // Stripe не индексирует metadata в search всегда — manual scan.
  const products = await stripe.products.list({ limit: 100, active: true });
  const product = products.data.find((p) => p.metadata.maporia_plan === PLAN_ID);
  if (!product) {
    console.warn(`  [find] No Stripe Product with metadata.maporia_plan=${PLAN_ID}`);
    return null;
  }
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  return (
    prices.data.find(
      (p) => p.metadata.maporia_cycle === cycle && p.currency.toLowerCase() === "usd",
    ) ?? null
  );
}

async function findOrCreateProduct(): Promise<Stripe.Product> {
  const products = await stripe.products.list({ limit: 100, active: true });
  const found = products.data.find((p) => p.metadata.maporia_plan === PLAN_ID);
  if (found) return found;
  if (DRY_RUN) {
    console.log(`  [product] WOULD create creator_all Product`);
    return { id: "prod_DRY_RUN" } as unknown as Stripe.Product;
  }
  const created = await stripe.products.create({
    name: "Pro All-in",
    description: "Locations + services + experiences",
    metadata: { maporia_plan: PLAN_ID },
  });
  console.log(`  [product] created: ${created.id}`);
  return created;
}

async function ensureV3Price(cycle: Cycle): Promise<CycleMigration> {
  const registrySpec = PRICING_REGISTRY[PLAN_ID].prices.USD?.[cycle];
  if (!registrySpec) {
    throw new Error(`registry missing creator_all/${cycle} spec`);
  }
  const targetCents = Math.round(registrySpec.amount * 100);

  const existing = await findActiveCreatorAllPrice(cycle);

  if (existing && existing.unit_amount === targetCents) {
    if (VERBOSE) console.log(`  [${cycle}] already on v3: ${existing.id} (${targetCents}c)`);
    return {
      cycle,
      oldPriceId: null, // нет миграции — уже v3
      newPriceId: existing.id,
      registryAmountCents: targetCents,
      registryEnvName: registrySpec.stripeIdEnv,
    };
  }

  // MISMATCH или price отсутствует → нужно создать новый и деактивировать старый.
  const product = existing
    ? ({ id: existing.product as string } as Stripe.Product)
    : await findOrCreateProduct();

  if (existing) {
    console.log(
      `  [${cycle}] old price ${existing.id} unit_amount=${existing.unit_amount}c ≠ ${targetCents}c → deactivate`,
    );
    if (!DRY_RUN) {
      await stripe.prices.update(existing.id, { active: false });
    }
  }

  let newPriceId = "price_DRY_RUN";
  if (DRY_RUN) {
    console.log(`  [${cycle}] WOULD create new price: ${targetCents}c`);
  } else {
    const params: Stripe.PriceCreateParams = {
      product: product.id,
      currency: "usd",
      unit_amount: targetCents,
      metadata: {
        maporia_plan: PLAN_ID,
        maporia_cycle: cycle,
        maporia_version: "v3",
      },
    };
    if (cycle === "month" || cycle === "year") {
      params.recurring = { interval: cycle };
    }
    const created = await stripe.prices.create(params);
    newPriceId = created.id;
    console.log(`  [${cycle}] created new v3 price: ${created.id} (${targetCents}c)`);
  }

  return {
    cycle,
    oldPriceId: existing?.id ?? null,
    newPriceId,
    registryAmountCents: targetCents,
    registryEnvName: registrySpec.stripeIdEnv,
  };
}

async function migrateSubscriptions(migrations: CycleMigration[]) {
  // Map: oldPriceId → newPriceId. Только cycle'ы где была реальная миграция.
  const priceMap = new Map<string, string>();
  for (const m of migrations) {
    if (m.oldPriceId && m.oldPriceId !== m.newPriceId) {
      priceMap.set(m.oldPriceId, m.newPriceId);
    }
  }
  if (priceMap.size === 0) {
    console.log("\n[subs] no price migrations needed (registry == Stripe already).");
    return;
  }

  console.log(`\n[subs] scanning active subscriptions for old creator_all price IDs…`);

  // List все active subs. Если у Артёма скоро много подписчиков — заменить на pagination,
  // сейчас 3 в test mode → одного list'а хватит.
  let total = 0;
  let updated = 0;

  for await (const sub of stripe.subscriptions.list({
    status: "active",
    limit: 100,
    expand: ["data.items"],
  })) {
    total++;
    for (const item of sub.items.data) {
      const oldId = item.price.id;
      const newId = priceMap.get(oldId);
      if (!newId) continue;

      console.log(
        `  [sub ${sub.id}] item ${item.id} ${oldId} → ${newId}${DRY_RUN ? " (dry)" : ""}`,
      );
      if (!DRY_RUN) {
        await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, price: newId }],
          proration_behavior: "none",
          metadata: {
            ...sub.metadata,
            maporia_v3_migrated_at: new Date().toISOString(),
          },
        });
        updated++;
      } else {
        updated++;
      }
    }
  }

  console.log(`\n[subs] scanned=${total} updated=${updated} dry=${DRY_RUN}`);
}

async function main() {
  const migrations: CycleMigration[] = [];
  for (const cycle of TARGET_CYCLES) {
    console.log(`\n[cycle] ${cycle}`);
    migrations.push(await ensureV3Price(cycle));
  }

  // ── ENV block ──
  console.log("\n" + "═".repeat(70));
  console.log("  Copy-paste into .env.local / Vercel ENV (Pro All-in v3 prices):");
  console.log("═".repeat(70));
  console.log("");
  for (const m of migrations) {
    console.log(`${m.registryEnvName}=${m.newPriceId}`);
  }
  console.log("");

  // ── Subscriptions ──
  await migrateSubscriptions(migrations);

  if (DRY_RUN) {
    console.log("\n⚠ DRY-RUN — no Stripe writes. Re-run without --dry to apply.");
  } else {
    console.log("\n✓ Done. Webhook will sync subscriptions table on next price update event.");
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});

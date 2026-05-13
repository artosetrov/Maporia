#!/usr/bin/env node
/**
 * scripts/migrate-all-in-to-v3.mjs — переключает активные Pro All-in подписки
 * со старого price ($34.99/mo, $335.88/yr) на новый v3 price ($19.99/mo, $191.88/yr).
 *
 * Контекст: PRICING v3 (2026-05-11) снизил Pro All-in. Stripe Prices иммутабельны,
 * поэтому новые Price ID создаются через `scripts/setup-stripe.mjs` с lookup_keys
 * `maporia_pro_all_month_v3` / `maporia_pro_all_year_v3`. Этот скрипт переключает
 * существующие active/trialing подписки с OLD на NEW price через
 * `stripe.subscriptions.update({items: [{ id, price: NEW }]}, proration_behavior: 'none')`.
 *
 * Pre-conditions:
 *   - `scripts/setup-stripe.mjs` уже прогнан в этом же режиме (test или live).
 *     То есть и старые `maporia_pro_all_*`, и новые `maporia_pro_all_*_v3` price'ы существуют.
 *
 * Запуск:
 *   # сухой прогон — печатает кого тронет, ничего не меняет
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/migrate-all-in-to-v3.mjs --dry-run
 *
 *   # боевой прогон — переключает подписки, proration_behavior='none' (без списаний разницы)
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/migrate-all-in-to-v3.mjs
 *
 *   # после успешной миграции — деактивировать старые prices (cleanup)
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/migrate-all-in-to-v3.mjs --deactivate-old
 *
 * Безопасность:
 *   - `proration_behavior: 'none'` — мы не дёргаем deltу. Новая цена применится со следующего
 *     billing cycle. Это согласовано с docs/PRICING_V3_CREATOR_MERGE.md §7.2.
 *   - На каждой подписке Stripe пришлёт `customer.subscription.updated` → webhook сделает upsert
 *     в БД. ENV должен быть уже обновлён на новый price_id ДО этого прогона, иначе
 *     `resolvePlanByPriceId(NEW_ID)` вернёт null и план юзера сбросится в free.
 *     См. docs/STRIPE_V3_MIGRATION_PLAN.md §2 (порядок шагов).
 *
 * Идемпотентность: повторный прогон по уже мигрированным подпискам — no-op (фильтр идёт
 * по item.price.id === OLD_ID, у мигрированных там NEW_ID).
 */

import Stripe from "stripe";

// ──────────────────────────────────────────────────────────────
// Config — lookup keys должны совпадать с scripts/setup-stripe.mjs
// ──────────────────────────────────────────────────────────────

const OLD_LOOKUP_KEYS = {
  month: "maporia_pro_all_month",
  year: "maporia_pro_all_year",
};
const NEW_LOOKUP_KEYS = {
  month: "maporia_pro_all_month_v3",
  year: "maporia_pro_all_year_v3",
};

// ──────────────────────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  acc[k] = v ?? true;
  return acc;
}, {});

const DRY = !!args["dry-run"];
const DEACTIVATE_OLD = !!args["deactivate-old"];

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY env var is required.");
  console.error("   STRIPE_SECRET_KEY=sk_test_... node scripts/migrate-all-in-to-v3.mjs");
  process.exit(1);
}
if (/[^\x21-\x7e]/.test(STRIPE_SECRET_KEY)) {
  console.error("❌ STRIPE_SECRET_KEY contains non-ASCII characters (placeholder?).");
  process.exit(1);
}
if (!/^sk_(test|live)_/.test(STRIPE_SECRET_KEY)) {
  console.error("❌ STRIPE_SECRET_KEY должен начинаться с sk_test_ или sk_live_");
  process.exit(1);
}

const isLive = STRIPE_SECRET_KEY.startsWith("sk_live_");
const mode = isLive ? "LIVE" : "TEST";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

async function findPriceByLookup(lookupKey) {
  const res = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  return res.data[0] ?? null;
}

/**
 * Listing all active/trialing subscriptions that contain a given price_id as their (single) item.
 * Pagination: scan all pages.
 */
async function listSubsByPriceId(priceId) {
  const out = [];
  let startingAfter = undefined;
  // Stripe API: subscriptions.list supports `price` filter directly.
  // status='all' so мы видим past_due/unpaid тоже — у них Stripe всё ещё хочет тянуть деньги
  // и переключить им price корректно.
  // (Cancelled/incomplete мы скипнем ниже по фильтру.)
  while (true) {
    const page = await stripe.subscriptions.list({
      price: priceId,
      status: "all",
      limit: 100,
      starting_after: startingAfter,
    });
    out.push(...page.data);
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return out;
}

function isMigratable(sub) {
  // Меняем подписки, которые ещё «живут» — Stripe сам тянет с них деньги.
  return sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
}

async function migrateOne({ sub, oldPriceId, newPriceId }) {
  const items = sub.items?.data ?? [];
  // Ожидаем, что у Maporia подписки — 1 line item. Если их больше — пропускаем и логируем.
  if (items.length !== 1) {
    console.warn(
      `   ⚠ sub ${sub.id} has ${items.length} items, skipping (manual review needed)`,
    );
    return { ok: false, reason: "multi-item" };
  }
  const item = items[0];
  if (item.price.id !== oldPriceId) {
    console.log(`   • sub ${sub.id} item price already ≠ ${oldPriceId}, skip`);
    return { ok: true, reason: "already-migrated" };
  }

  if (DRY) {
    console.log(
      `   [dry] would update sub=${sub.id} customer=${sub.customer} item=${item.id} ` +
      `price: ${oldPriceId} → ${newPriceId}`,
    );
    return { ok: true, reason: "dry-run" };
  }

  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: newPriceId }],
    proration_behavior: "none",
    metadata: {
      ...sub.metadata,
      pricing_v3_migrated_at: new Date().toISOString(),
    },
  });
  console.log(
    `   ✓ migrated sub=${sub.id} customer=${sub.customer} ${oldPriceId} → ${newPriceId}`,
  );
  return { ok: true };
}

async function deactivatePrice(priceId, label) {
  if (DRY) {
    console.log(`   [dry] would deactivate price ${label}=${priceId}`);
    return;
  }
  await stripe.prices.update(priceId, { active: false });
  console.log(`   ✓ deactivated price ${label}=${priceId}`);
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🛠  Maporia All-in v3 Migration — ${mode} mode${DRY ? " (DRY-RUN)" : ""}\n`);
  if (isLive && !DRY) {
    console.log("⚠️  LIVE mode. Real subscriptions will be updated. Make sure ENV in Vercel");
    console.log("    already points to the new v3 price IDs (см. STRIPE_V3_MIGRATION_PLAN.md §2).\n");
  }

  // 1. Резолвим old & new price IDs по lookup_key
  console.log("🔎 Resolving price IDs by lookup_key…");
  const oldMonth = await findPriceByLookup(OLD_LOOKUP_KEYS.month);
  const oldYear = await findPriceByLookup(OLD_LOOKUP_KEYS.year);
  const newMonth = await findPriceByLookup(NEW_LOOKUP_KEYS.month);
  const newYear = await findPriceByLookup(NEW_LOOKUP_KEYS.year);

  const pairs = [
    { label: "month", old: oldMonth, new: newMonth },
    { label: "year",  old: oldYear,  new: newYear },
  ];

  let fatal = false;
  for (const p of pairs) {
    const oldStr = p.old ? `${p.old.id} ($${(p.old.unit_amount/100).toFixed(2)})` : "—";
    const newStr = p.new ? `${p.new.id} ($${(p.new.unit_amount/100).toFixed(2)})` : "—";
    console.log(`   ${p.label}: old=${oldStr}  new=${newStr}`);
    if (!p.new) {
      console.error(`   ❌ new ${p.label} price not found. Run setup-stripe.mjs first.`);
      fatal = true;
    }
  }
  if (fatal) {
    console.error("\nAborting.");
    process.exit(2);
  }

  // 2. Pre-deactivate validation: если pre-existing подписки на старых price'ах есть,
  //    то deactivate-old можно делать только после миграции.
  if (DEACTIVATE_OLD) {
    console.log("\n🧹 Cleanup mode: --deactivate-old");
    if (!oldMonth && !oldYear) {
      console.log("   Nothing to deactivate (no old prices found).");
      return;
    }
    // Проверяем, что на старых нет активных подписок.
    let hasActive = false;
    for (const p of pairs) {
      if (!p.old) continue;
      const subs = (await listSubsByPriceId(p.old.id)).filter(isMigratable);
      if (subs.length > 0) {
        console.error(
          `   ❌ ${subs.length} active/trialing subs still on old ${p.label} price ${p.old.id}.` +
          ` Run без --deactivate-old сначала, чтобы их мигрировать.`,
        );
        hasActive = true;
      }
    }
    if (hasActive) {
      process.exit(3);
    }
    if (oldMonth) await deactivatePrice(oldMonth.id, "month");
    if (oldYear)  await deactivatePrice(oldYear.id, "year");
    console.log("\n✓ Cleanup complete.\n");
    return;
  }

  // 3. Миграция подписок
  console.log("\n🔄 Migrating active subscriptions…");
  const summary = { migrated: 0, skipped: 0, errors: 0, considered: 0 };
  for (const p of pairs) {
    if (!p.old) {
      console.log(`   ${p.label}: no old price → nothing to migrate.`);
      continue;
    }
    console.log(`   ── ${p.label}: scanning subs on ${p.old.id} …`);
    const subs = await listSubsByPriceId(p.old.id);
    const eligible = subs.filter(isMigratable);
    const skippedByStatus = subs.length - eligible.length;
    if (skippedByStatus > 0) {
      console.log(
        `      skipping ${skippedByStatus} sub(s) with terminal status (canceled/incomplete_expired/etc)`,
      );
      summary.skipped += skippedByStatus;
    }
    summary.considered += eligible.length;
    for (const sub of eligible) {
      try {
        const res = await migrateOne({ sub, oldPriceId: p.old.id, newPriceId: p.new.id });
        if (res.ok && !res.reason) summary.migrated += 1;
        else summary.skipped += 1;
      } catch (e) {
        console.error(`   ✗ sub ${sub.id} failed: ${e.message}`);
        summary.errors += 1;
      }
    }
  }

  console.log("\n📊 Summary:");
  console.log(`   considered: ${summary.considered}`);
  console.log(`   migrated:   ${summary.migrated}${DRY ? " (dry-run)" : ""}`);
  console.log(`   skipped:    ${summary.skipped}`);
  console.log(`   errors:     ${summary.errors}`);

  if (!DRY) {
    console.log("\n💡 Next:");
    console.log("   1. Watch /api/stripe/webhook logs — каждый migrated sub шлёт subscription.updated.");
    console.log("   2. Spot-check 1-2 users в БД: profiles.plan='creator_all', subscription row updated.");
    console.log("   3. После недели наблюдения — прогнать снова с --deactivate-old для cleanup.");
  }

  console.log("");
}

main().catch((err) => {
  console.error("\n❌ Migration failed:", err.message);
  if (err.raw) console.error("   Stripe error:", err.raw);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * scripts/setup-stripe.mjs — one-shot Stripe setup for Maporia.
 *
 * Что делает:
 *  1. Создаёт Stripe products для всех публичных планов + Extra Listing.
 *  2. Создаёт monthly/yearly Prices с lookup_key для идемпотентности.
 *  3. Опционально создаёт Webhook endpoint, если передан --webhook-url=https://….
 *  4. Печатает env-переменные готовые к копированию в Vercel.
 *  5. Опционально — заливает env в Vercel через Vercel CLI (--push-vercel).
 *
 * Запуск:
 *   STRIPE_SECRET_KEY=sk_test_… node scripts/setup-stripe.mjs
 *   STRIPE_SECRET_KEY=sk_live_… node scripts/setup-stripe.mjs --mode=production
 *   STRIPE_SECRET_KEY=sk_test_… node scripts/setup-stripe.mjs --webhook-url=https://maporia.com/api/stripe/webhook
 *
 * Идемпотентность: prices матчатся по lookup_key. Если уже есть — переиспользуем.
 * Products матчатся по metadata.maporia_id.
 *
 * ⚠️ Скрипт делает реальные изменения в Stripe. Сначала test mode, потом live.
 */

import Stripe from "stripe";
import { execSync } from "node:child_process";

// ──────────────────────────────────────────────────────────────
// Plans config — должен совпадать с app/lib/pricing/registry.ts
// ──────────────────────────────────────────────────────────────

// v3 (2026-05-12, см. docs/PRICING_V3_CREATOR_MERGE.md и docs/STRIPE_V3_MIGRATION_PLAN.md):
//   - Добавлен creator_pro ($14.99/$143.88).
//   - creator_all переоценён с $34.99/$335.88 на $19.99/$191.88. Stripe Prices иммутабельны,
//     поэтому новые цены создаются под НОВЫМИ lookup_keys (`*_v3`). Старые $34.99 prices
//     остаются активными в Stripe до прогона `scripts/migrate-all-in-to-v3.mjs`, который
//     переключит активные подписки и (с флагом `--deactivate-old`) выключит их.
//   - creator_service / creator_experience помечены `legacy: true` — они нужны для grandfathered
//     подписчиков. Скрипт всё равно проходит по ним (идемпотентно — ensureProduct/ensurePrice
//     находят существующие объекты по metadata/lookup_key и не пересоздают), чтобы portal-whitelist
//     включал их (grandfathered юзеры должны иметь возможность открыть Portal и cancel'нуть).
//     Флаг `legacy: true` влияет только на лог.
const PLANS = [
  {
    maporiaId: "premium_viewer",
    name: "Maporia Premium",
    description: "Unlock all hidden locations on Maporia. One-time payment, lifetime access.",
    price: { amount: 3500, currency: "usd", type: "one_time" },
    lookupKey: "maporia_premium_onetime",
    envVar: "STRIPE_PRICE_PREMIUM_ONETIME",
  },
  {
    maporiaId: "creator_location",
    name: "Maporia Pro Location",
    description: "Publish up to 5 locations on Maporia. Premium included.",
    price: { amount: 999, currency: "usd", type: "recurring", interval: "month" },
    lookupKey: "maporia_pro_location_month",
    envVar: "STRIPE_PRICE_CREATOR_LOCATION_MONTH",
  },
  {
    maporiaId: "creator_location",
    name: "Maporia Pro Location",
    description: "Publish up to 5 locations on Maporia. Premium included.",
    price: { amount: 9588, currency: "usd", type: "recurring", interval: "year" },
    lookupKey: "maporia_pro_location_year",
    envVar: "STRIPE_PRICE_CREATOR_LOCATION_YEAR",
  },
  // ── Pro Creator (v3, merged from creator_service + creator_experience) ──
  {
    maporiaId: "creator_pro",
    name: "Maporia Pro Creator",
    description:
      "Publish up to 5 services or experiences (any mix) on Maporia. Premium included. Secondary location free.",
    price: { amount: 1499, currency: "usd", type: "recurring", interval: "month" },
    lookupKey: "maporia_pro_creator_month",
    envVar: "STRIPE_PRICE_CREATOR_PRO_MONTH",
  },
  {
    maporiaId: "creator_pro",
    name: "Maporia Pro Creator",
    description:
      "Publish up to 5 services or experiences (any mix) on Maporia. Premium included. Secondary location free.",
    price: { amount: 14388, currency: "usd", type: "recurring", interval: "year" },
    lookupKey: "maporia_pro_creator_year",
    envVar: "STRIPE_PRICE_CREATOR_PRO_YEAR",
  },
  // ── Legacy v2 (grandfathered) — провижатся только с `--include-legacy` ──
  {
    maporiaId: "creator_service",
    name: "Maporia Pro Service",
    description: "Publish up to 5 services on Maporia. Premium included.",
    price: { amount: 1499, currency: "usd", type: "recurring", interval: "month" },
    lookupKey: "maporia_pro_service_month",
    envVar: "STRIPE_PRICE_CREATOR_SERVICE_MONTH",
    legacy: true,
  },
  {
    maporiaId: "creator_service",
    name: "Maporia Pro Service",
    description: "Publish up to 5 services on Maporia. Premium included.",
    price: { amount: 14388, currency: "usd", type: "recurring", interval: "year" },
    lookupKey: "maporia_pro_service_year",
    envVar: "STRIPE_PRICE_CREATOR_SERVICE_YEAR",
    legacy: true,
  },
  {
    maporiaId: "creator_experience",
    name: "Maporia Pro Experience",
    description: "Launch up to 5 experiences on Maporia. Premium included.",
    price: { amount: 1499, currency: "usd", type: "recurring", interval: "month" },
    lookupKey: "maporia_pro_experience_month",
    envVar: "STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH",
    legacy: true,
  },
  {
    maporiaId: "creator_experience",
    name: "Maporia Pro Experience",
    description: "Launch up to 5 experiences on Maporia. Premium included.",
    price: { amount: 14388, currency: "usd", type: "recurring", interval: "year" },
    lookupKey: "maporia_pro_experience_year",
    envVar: "STRIPE_PRICE_CREATOR_EXPERIENCE_YEAR",
    legacy: true,
  },
  // ── Pro All-in v3 ($19.99 / $191.88, новые lookup_keys *_v3) ──
  // ⚠ Старые $34.99/$335.88 prices (lookup_keys без `_v3`) удалять нельзя пока
  // `scripts/migrate-all-in-to-v3.mjs` не переключил все активные подписки.
  {
    maporiaId: "creator_all",
    name: "Maporia Pro All-in",
    description:
      "Up to 10 listings combined (locations + services + experiences) + Premium.",
    price: { amount: 1999, currency: "usd", type: "recurring", interval: "month" },
    lookupKey: "maporia_pro_all_month_v3",
    envVar: "STRIPE_PRICE_CREATOR_ALL_MONTH",
  },
  {
    maporiaId: "creator_all",
    name: "Maporia Pro All-in",
    description:
      "Up to 10 listings combined (locations + services + experiences) + Premium.",
    price: { amount: 19188, currency: "usd", type: "recurring", interval: "year" },
    lookupKey: "maporia_pro_all_year_v3",
    envVar: "STRIPE_PRICE_CREATOR_ALL_YEAR",
  },
  {
    maporiaId: "extra_listing",
    name: "Maporia Extra Listing",
    description: "One additional listing slot beyond your plan limit. One-time, kept forever.",
    price: { amount: 299, currency: "usd", type: "one_time" },
    lookupKey: "maporia_extra_listing",
    envVar: "STRIPE_PRICE_EXTRA_LISTING",
  },
];

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

// ──────────────────────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  acc[k] = v ?? true;
  return acc;
}, {});

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY env var is required.");
  console.error("   Get one: https://dashboard.stripe.com/test/apikeys");
  console.error("   Run: STRIPE_SECRET_KEY=sk_test_51XXXXX node scripts/setup-stripe.mjs");
  process.exit(1);
}
// Sanity check: ключ должен быть ASCII-only (иначе Node не пустит его в Authorization header).
// Частая ошибка — скопировали команду с placeholder'ом типа sk_test_… (многоточие — non-ASCII).
if (/[^\x21-\x7e]/.test(STRIPE_SECRET_KEY)) {
  console.error("❌ STRIPE_SECRET_KEY contains non-ASCII characters.");
  console.error("   Похоже вы скопировали placeholder со знаком «…».");
  console.error("   Возьмите реальный ключ из https://dashboard.stripe.com/test/apikeys");
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

async function ensureProduct(plan) {
  const tag = plan.legacy ? " [legacy/grandfathered]" : "";
  // Match by metadata.maporia_id
  const existing = await stripe.products.search({
    query: `metadata['maporia_id']:'${plan.maporiaId}' AND active:'true'`,
    limit: 1,
  });
  if (existing.data.length > 0) {
    console.log(`   ✓ product exists${tag}: ${plan.name} (${existing.data[0].id})`);
    return existing.data[0];
  }
  const product = await stripe.products.create({
    name: plan.name,
    description: plan.description,
    metadata: { maporia_id: plan.maporiaId },
  });
  console.log(`   + created product${tag}: ${plan.name} (${product.id})`);
  return product;
}

async function ensurePrice(plan, product) {
  const tag = plan.legacy ? " [legacy/grandfathered]" : "";
  // Match by lookup_key
  const existing = await stripe.prices.list({
    lookup_keys: [plan.lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data.length > 0) {
    console.log(`   ✓ price exists${tag}: ${plan.lookupKey} (${existing.data[0].id})`);
    return existing.data[0];
  }
  const params = {
    product: product.id,
    unit_amount: plan.price.amount,
    currency: plan.price.currency,
    lookup_key: plan.lookupKey,
    metadata: { maporia_id: plan.maporiaId },
  };
  if (plan.price.type === "recurring") {
    params.recurring = { interval: plan.price.interval };
  }
  const price = await stripe.prices.create(params);
  console.log(`   + created price${tag}: ${plan.lookupKey} (${price.id})`);
  return price;
}

async function ensureWebhook(url) {
  if (!url) return null;
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const found = list.data.find((w) => w.url === url);
  if (found) {
    console.log(`   ✓ webhook exists: ${url}`);
    // Patch events in case we added new ones
    const missing = WEBHOOK_EVENTS.filter((e) => !found.enabled_events.includes(e));
    if (missing.length > 0) {
      const updated = await stripe.webhookEndpoints.update(found.id, {
        enabled_events: [...new Set([...found.enabled_events, ...WEBHOOK_EVENTS])],
      });
      console.log(`   ↑ updated webhook events (added ${missing.join(", ")})`);
      return updated;
    }
    return found;
  }
  const wh = await stripe.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
    description: "Maporia subscription + add-on lifecycle",
  });
  console.log(`   + created webhook: ${url} (${wh.id})`);
  console.log(`   📋 SAVE THIS — webhook signing secret:\n      STRIPE_WEBHOOK_SECRET=${wh.secret}`);
  return wh;
}

function pushToVercel(envMap, env) {
  const target = env === "production" ? "production" : "preview development";
  console.log(`\n🚀 Pushing to Vercel (${target})…`);
  for (const [k, v] of Object.entries(envMap)) {
    try {
      // echo "$v" | vercel env add KEY production --force
      execSync(`echo "${v}" | vercel env add ${k} ${target} --force`, {
        stdio: ["pipe", "inherit", "inherit"],
      });
    } catch (e) {
      console.error(`   ⚠ failed to push ${k}: ${e.message}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🛠  Maporia Stripe Setup — ${mode} mode\n`);
  if (isLive) {
    console.log("⚠️  Using LIVE Stripe key. Real money flows. Make sure this is intended.\n");
  }

  console.log("📦 Products + prices…");
  const envMap = {};
  const recurringPortalProducts = new Map();
  for (const plan of PLANS) {
    const product = await ensureProduct(plan);
    const price = await ensurePrice(plan, product);
    envMap[plan.envVar] = price.id;
    if (plan.price.type === "recurring") {
      const existing = recurringPortalProducts.get(product.id) ?? [];
      recurringPortalProducts.set(product.id, [...existing, price.id]);
    }
  }

  // Webhook
  if (args["webhook-url"]) {
    console.log("\n🔔 Webhook…");
    await ensureWebhook(args["webhook-url"]);
  } else {
    console.log("\n🔔 Webhook: skipped (pass --webhook-url=https://your-domain/api/stripe/webhook)");
  }

  // Configure Customer Portal
  console.log("\n🪪 Customer Portal…");
  try {
    const portalProducts = Array.from(recurringPortalProducts.entries()).map(([product, prices]) => ({
      product,
      prices,
    }));
    const portalFeatures = {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: portalProducts,
      },
    };
    const list = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
    if (list.data.length === 0) {
      const cfg = await stripe.billingPortal.configurations.create({
        business_profile: { headline: "Maporia subscription management" },
        features: portalFeatures,
        default_return_url: undefined,
      });
      console.log(`   + created Customer Portal config (${cfg.id})`);
    } else {
      const cfg = await stripe.billingPortal.configurations.update(list.data[0].id, {
        business_profile: { headline: "Maporia subscription management" },
        features: portalFeatures,
      });
      console.log(`   ↑ updated Customer Portal config (${cfg.id})`);
    }
  } catch (e) {
    console.log(`   ⚠ skipped Portal config: ${e.message}`);
    console.log("     Configure manually: https://dashboard.stripe.com/test/settings/billing/portal");
  }

  // Print envs
  console.log(`\n📋 Env vars (copy to Vercel → Settings → Environment Variables):\n`);
  for (const [k, v] of Object.entries(envMap)) {
    console.log(`${k}=${v}`);
  }
  console.log(`\nSTRIPE_SECRET_KEY=${STRIPE_SECRET_KEY.slice(0, 12)}…  (the one you used)`);
  console.log(`STRIPE_WEBHOOK_SECRET=…  (printed above if a webhook was created)`);

  // Optional Vercel push
  if (args["push-vercel"]) {
    pushToVercel(envMap, args["env"] || "preview");
  } else {
    console.log("\n💡 Tip: pass --push-vercel to push these env vars via Vercel CLI.");
    console.log("       Requires `vercel link` already done in this dir.");
  }

  console.log("\n✓ Setup complete.\n");
}

main().catch((err) => {
  console.error("❌ Setup failed:", err.message);
  if (err.raw) console.error("   Stripe error:", err.raw);
  process.exit(1);
});

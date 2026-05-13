#!/usr/bin/env node
/**
 * scripts/notify-all-in-repricing.mjs — рассылает уведомление о репрайсе Pro All-in
 * клиентам, которые БЫЛИ на старом $34.99 price.
 *
 * Логика «кому слать»:
 *   1. По Stripe metadata `pricing_v3_migrated_at` (его кладёт `migrate-all-in-to-v3.mjs`).
 *      Это самый чистый источник: ровно те подписки, которые мы переключили.
 *   2. Customer email берётся из Stripe Customer.email.
 *
 * Идемпотентность: локальный JSON `scripts/.notify-all-in-sent.json` хранит уже отправленные
 * customer.id. Повторный прогон тех же — no-op. Если файл потерян — повторный send (но с
 * `--dry-run` сначала всегда видно).
 *
 * Запуск:
 *   STRIPE_SECRET_KEY=sk_test_... RESEND_API_KEY=re_... node scripts/notify-all-in-repricing.mjs --dry-run
 *   STRIPE_SECRET_KEY=sk_live_... RESEND_API_KEY=re_... node scripts/notify-all-in-repricing.mjs --send
 *
 * Безопасность:
 *   - Без `--send` (или с `--dry-run`) скрипт НИКОГДА не отправляет — только печатает кого тронет.
 *   - Sender = `hello@maporia.co` (домен верифицирован в Resend; @maporia.com даст 550).
 *   - Письма шлются через Resend API напрямую (не через Supabase Auth SMTP, т.к. это не auth-флоу).
 *   - Текст письма — `docs/email-templates/all-in-repricing-notice.md`. Скрипт парсит plain-text
 *     и html секции из этого файла, чтобы не дублировать копирайт в коде.
 */

import Stripe from "stripe";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE_PATH = path.join(
  REPO_ROOT,
  "docs/email-templates/all-in-repricing-notice.md",
);
const SENT_LOG_PATH = path.join(__dirname, ".notify-all-in-sent.json");

// ──────────────────────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  acc[k] = v ?? true;
  return acc;
}, {});

// По умолчанию dry-run. Чтобы реально отправить — `--send`.
const SEND = !!args.send && !args["dry-run"];
const FORCE = !!args.force; // ре-отправить даже тем, кто в SENT_LOG
const LIMIT = args.limit ? Number(args.limit) : Infinity;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY env var is required.");
  process.exit(1);
}
if (!/^sk_(test|live)_/.test(STRIPE_SECRET_KEY)) {
  console.error("❌ STRIPE_SECRET_KEY должен начинаться с sk_test_ или sk_live_");
  process.exit(1);
}
if (SEND && !RESEND_API_KEY) {
  console.error("❌ --send требует RESEND_API_KEY.");
  console.error("   Get one: https://resend.com/api-keys");
  process.exit(1);
}

const isLive = STRIPE_SECRET_KEY.startsWith("sk_live_");
const mode = isLive ? "LIVE" : "TEST";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// ──────────────────────────────────────────────────────────────
// Template parsing
// ──────────────────────────────────────────────────────────────

function parseTemplate(raw) {
  // Грубый парс md: front-matter `---` блок, потом `# Subject`, `# Plain-text body`, `# HTML body`.
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) throw new Error("Template: missing front-matter");
  const fm = {};
  for (const line of fmMatch[1].split("\n")) {
    const m = line.match(/^(\w+):\s*"?(.*?)"?$/);
    if (m) fm[m[1]] = m[2];
  }
  const body = raw.slice(fmMatch[0].length);

  function section(name) {
    const re = new RegExp(`^# ${name}\\s*\\n([\\s\\S]*?)(?=^# |\\Z)`, "m");
    const m = body.match(re);
    return m ? m[1].trim() : null;
  }

  const subject = section("Subject");
  const plain = section("Plain-text body");
  const html = section("HTML body");
  if (!subject || !plain || !html) {
    throw new Error("Template: missing Subject / Plain-text body / HTML body sections");
  }
  return { fm, subject, plain, html };
}

function fillPlaceholders(text, vars) {
  return text.replace(/\{\{([^}|]+)(?:\|([^}]*))?\}\}/g, (_, key, fallback) => {
    const k = key.trim();
    const v = vars[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
    return fallback ?? "";
  });
}

// ──────────────────────────────────────────────────────────────
// Sent log (idempotency)
// ──────────────────────────────────────────────────────────────

function loadSentLog() {
  try {
    const raw = fs.readFileSync(SENT_LOG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { sent: {} };
  }
}

function saveSentLog(log) {
  fs.writeFileSync(SENT_LOG_PATH, JSON.stringify(log, null, 2));
}

// ──────────────────────────────────────────────────────────────
// Candidates discovery
// ──────────────────────────────────────────────────────────────

async function listMigratedSubscriptions() {
  // Подписки, у которых metadata.pricing_v3_migrated_at не пустое.
  // Stripe search API поддерживает `metadata`.
  const out = [];
  let nextPage = undefined;
  while (true) {
    const page = await stripe.subscriptions.search({
      query: `metadata['pricing_v3_migrated_at']:'*'`,
      limit: 100,
      page: nextPage,
    });
    out.push(...page.data);
    if (!page.has_more) break;
    nextPage = page.next_page;
    if (!nextPage) break;
  }
  return out;
}

async function getCustomerEmail(customerOrId) {
  const id = typeof customerOrId === "string" ? customerOrId : customerOrId?.id;
  if (!id) return null;
  const c = await stripe.customers.retrieve(id);
  if (c.deleted) return null;
  return {
    id: c.id,
    email: c.email ?? null,
    name: c.name ?? null,
  };
}

// ──────────────────────────────────────────────────────────────
// Resend sender
// ──────────────────────────────────────────────────────────────

async function sendViaResend({ from, to, replyTo, subject, text, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: replyTo,
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json();
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n📨 Maporia All-in repricing notice — ${mode} mode` +
    (SEND ? "" : " (DRY-RUN — pass --send to actually send)") +
    "\n",
  );

  // 1. Шаблон
  const tplRaw = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const tpl = parseTemplate(tplRaw);
  const fromAddr = tpl.fm.from || "Maporia <hello@maporia.co>";
  const replyTo = tpl.fm.reply_to || "hello@maporia.co";
  console.log(`From: ${fromAddr}`);
  console.log(`Subject: ${tpl.subject}\n`);

  // 2. Кандидаты
  console.log("🔎 Finding migrated subscriptions…");
  const subs = await listMigratedSubscriptions();
  console.log(`   ${subs.length} subscription(s) with pricing_v3_migrated_at metadata\n`);

  if (subs.length === 0) {
    console.log("Nothing to do. Did you run scripts/migrate-all-in-to-v3.mjs first?");
    return;
  }

  // 3. Дедуплицируем по customer.id (один customer может иметь >1 sub — шлём 1 письмо)
  const byCustomer = new Map();
  for (const sub of subs) {
    const cid = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!cid) continue;
    if (!byCustomer.has(cid)) byCustomer.set(cid, sub);
  }
  console.log(`   ${byCustomer.size} unique customer(s)\n`);

  // 4. Лог
  const log = loadSentLog();
  const summary = { sent: 0, skipped_sent_log: 0, skipped_no_email: 0, errors: 0 };

  let processed = 0;
  for (const [cid, sub] of byCustomer) {
    if (processed >= LIMIT) break;

    if (!FORCE && log.sent[cid]) {
      summary.skipped_sent_log += 1;
      console.log(`   • ${cid} already sent on ${log.sent[cid].at}, skip`);
      processed += 1;
      continue;
    }

    let customer;
    try {
      customer = await getCustomerEmail(cid);
    } catch (e) {
      console.error(`   ✗ ${cid} customer fetch failed: ${e.message}`);
      summary.errors += 1;
      processed += 1;
      continue;
    }
    if (!customer?.email) {
      console.warn(`   ⚠ ${cid} has no email, skip`);
      summary.skipped_no_email += 1;
      processed += 1;
      continue;
    }

    const firstName = (customer.name ?? "").trim().split(/\s+/)[0] || "";
    const vars = { first_name: firstName };
    const subject = fillPlaceholders(tpl.subject, vars);
    const text = fillPlaceholders(tpl.plain, vars);
    const html = fillPlaceholders(tpl.html, vars);

    if (!SEND) {
      console.log(`   [dry] would send to ${customer.email} (${cid}, sub=${sub.id})`);
      processed += 1;
      continue;
    }

    try {
      const out = await sendViaResend({
        from: fromAddr,
        to: customer.email,
        replyTo,
        subject,
        text,
        html,
      });
      log.sent[cid] = {
        at: new Date().toISOString(),
        email: customer.email,
        resend_id: out.id ?? null,
        subscription_id: sub.id,
      };
      saveSentLog(log);
      summary.sent += 1;
      console.log(`   ✓ sent to ${customer.email} (resend_id=${out.id ?? "?"})`);
    } catch (e) {
      console.error(`   ✗ ${customer.email} send failed: ${e.message}`);
      summary.errors += 1;
    }
    processed += 1;
  }

  console.log("\n📊 Summary:");
  console.log(`   sent:                ${summary.sent}${SEND ? "" : " (dry-run)"}`);
  console.log(`   skipped (sent log):  ${summary.skipped_sent_log}`);
  console.log(`   skipped (no email):  ${summary.skipped_no_email}`);
  console.log(`   errors:              ${summary.errors}`);
  console.log("");

  if (!SEND) {
    console.log("💡 Re-run with --send (and RESEND_API_KEY) to actually deliver.\n");
  }
}

main().catch((err) => {
  console.error("\n❌ Notify failed:", err.message);
  if (err.raw) console.error("   Stripe error:", err.raw);
  process.exit(1);
});

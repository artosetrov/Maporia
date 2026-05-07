/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook: верифицирует подпись и обновляет тариф пользователя.
 *
 * Поддерживаемые события:
 *  - checkout.session.completed       — legacy one-time payment (old Premium flag)
 *  - customer.subscription.created    — пользователь оформил подписку
 *  - customer.subscription.updated    — изменения статуса (renew, plan change, past_due)
 *  - customer.subscription.deleted    — отмена / окончание периода
 *  - invoice.payment_failed           — эскалация в past_due
 *
 * Все обновления — через service role (bypass RLS).
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, supabaseAdmin } from "../../../lib/stripe";
import type { Plan, PlanPeriod } from "../../../types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    console.error("[stripe/webhook] Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Signature verification failed";
    console.error("[stripe/webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      default:
        if (process.env.NODE_ENV === "development") {
          console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
        }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook handler error";
    console.error("[stripe/webhook] Handler error:", message, "event:", event.type);
    // Возвращаем 200, чтобы Stripe не ретраил из-за ошибок логики (мы их логируем).
    return NextResponse.json({ received: true, error: message }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_VALUES: Plan[] = [
  "free",
  "premium_viewer",
  "creator_service",
  "creator_experience",
  "creator_all",
];
const PERIOD_VALUES: PlanPeriod[] = ["month", "year", "lifetime"];

function asPlan(value: unknown): Plan {
  return PLAN_VALUES.includes(value as Plan) ? (value as Plan) : "free";
}
function asPeriod(value: unknown): PlanPeriod {
  return PERIOD_VALUES.includes(value as PlanPeriod) ? (value as PlanPeriod) : "month";
}

function mapStripeStatusToOurs(
  status: Stripe.Subscription.Status
): "active" | "past_due" | "cancelled" | "incomplete" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "cancelled";
  return "incomplete";
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-time payments: либо Premium (lifetime premium_viewer), либо add-on
 * (+1 слот за $2.99). Различаем по metadata.kind.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id;
  if (!userId) {
    console.error("[stripe/webhook] checkout.session.completed без supabase_user_id", {
      sessionId: session.id,
    });
    return;
  }

  // Subscription mode — подхватит handleSubscriptionUpsert; тут только one-time payment.
  if (session.mode !== "payment") return;

  if (session.payment_status !== "paid") {
    console.warn("[stripe/webhook] checkout payment_status !== 'paid':", session.payment_status);
    return;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  // ────── Add-on: +1 слот ──────
  if (session.metadata?.kind === "extra_listing") {
    // Простая инкрементация. Если когда-нибудь будут гонки — переписать через RPC.
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("bonus_listing_credits")
      .eq("id", userId)
      .single();
    if (pErr) {
      console.error("[stripe/webhook] extra_listing read profile failed:", pErr.message);
      throw new Error(pErr.message);
    }
    const next = (prof?.bonus_listing_credits ?? 0) + 1;
    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update({ bonus_listing_credits: next, stripe_customer_id: customerId })
      .eq("id", userId);
    if (uErr) {
      console.error("[stripe/webhook] extra_listing update failed:", uErr.message);
      throw new Error(uErr.message);
    }
    console.log("[stripe/webhook] +1 listing credit for", userId, "→", next);
    return;
  }

  // ────── Premium one-time ($35 lifetime) или legacy ──────
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: "premium_viewer",
      plan_period: "lifetime",
      // Legacy-поля для обратной совместимости:
      subscription_status: "active",
      role: "premium",
      stripe_customer_id: customerId,
    })
    .eq("id", userId);

  if (error) {
    console.error("[stripe/webhook] Failed to activate premium:", error.message);
    throw new Error(`Failed to activate premium for ${userId}: ${error.message}`);
  }
  console.log("[stripe/webhook] Premium (lifetime) activated for", userId);
}

/**
 * Subscription created/updated — основная точка входа для подписочной модели.
 *
 * 1. Берём supabase_user_id из metadata подписки.
 * 2. План определяем из metadata (мы туда положили в checkout) — Stripe Price ID
 *    можно использовать как фоллбэк, если подписку создали в Dashboard вручную.
 * 3. Делаем upsert в public.subscriptions и обновляем profiles.plan для быстрых проверок.
 */
async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const userId = sub.metadata?.supabase_user_id;
  if (!userId) {
    console.error("[stripe/webhook] subscription без supabase_user_id в metadata", {
      subId: sub.id,
    });
    return;
  }

  const plan = asPlan(sub.metadata?.plan);
  const period = asPeriod(sub.metadata?.period);
  const status = mapStripeStatusToOurs(sub.status);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // 1) История подписок: upsert по stripe_subscription_id
  const periodEndUnix = (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodStartUnix = (sub as unknown as { current_period_start?: number }).current_period_start;
  const cancelAtPeriodEnd =
    (sub as unknown as { cancel_at_period_end?: boolean }).cancel_at_period_end ?? false;

  const subRow = {
    user_id: userId,
    plan,
    period,
    status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    current_period_start: periodStartUnix
      ? new Date(periodStartUnix * 1000).toISOString()
      : null,
    current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
  };

  const { error: upsertErr } = await supabaseAdmin
    .from("subscriptions")
    .upsert(subRow, { onConflict: "stripe_subscription_id" });
  if (upsertErr) {
    console.error("[stripe/webhook] subscriptions upsert failed:", upsertErr.message);
    throw new Error(upsertErr.message);
  }

  // 2) Денормализованный план на profile — только если подписка активна.
  if (status === "active") {
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        plan,
        plan_period: period,
        plan_renews_at: subRow.current_period_end,
        // Legacy-флаги — чтобы старый код продолжал работать:
        subscription_status: "active",
        role: "premium",
        stripe_customer_id: customerId,
      })
      .eq("id", userId);
    if (profErr) {
      console.error("[stripe/webhook] profile update failed:", profErr.message);
      throw new Error(profErr.message);
    }
    console.log("[stripe/webhook] subscription active:", { userId, plan, period });
  } else if (status === "past_due") {
    // Не сбрасываем план сразу — даём Stripe пройти retry-цикл.
    console.warn("[stripe/webhook] subscription past_due:", { userId, subId: sub.id });
  }
}

/**
 * Подписка удалена/закончилась — возвращаем юзера на free, если активной нет.
 */
async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = sub.metadata?.supabase_user_id;
  if (!userId) return;

  // Обновляем строку в subscriptions
  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id);

  // Проверяем, есть ли у юзера ещё какая-то активная подписка (на случай переключения тарифов)
  const { data: stillActive } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);

  if (stillActive && stillActive.length > 0) {
    return; // Есть другая активная — план не меняем.
  }

  await supabaseAdmin
    .from("profiles")
    .update({
      plan: "free",
      plan_period: null,
      plan_renews_at: null,
      subscription_status: "inactive",
      role: "standard",
    })
    .eq("id", userId);

  console.log("[stripe/webhook] subscription cancelled, user → free:", userId);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subId) return;
  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subId);
  console.warn("[stripe/webhook] payment failed for sub:", subId);
}

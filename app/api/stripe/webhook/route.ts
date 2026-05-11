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
import { getStripe, getSupabaseAdmin } from "../../../lib/stripe";
import { logger } from "../../../lib/logger";
import { resolvePlanByPriceId } from "../../../lib/pricing";
import { chooseBestEntitlement } from "../../../lib/pricing/entitlements";
import type { Plan, PlanPeriod } from "../../../types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Идемпотентность: пробуем INSERT в stripe_webhook_events. Если row уже была —
 * это retry уже обработанного event'а, возвращаем false → handler skip'ает работу.
 *
 * См. docs/PRICING_V2_PLAN.md § 11.3 (Webhook resilience).
 */
async function tryClaimWebhookEvent(
  supabaseAdmin: SupabaseAdminClient,
  eventId: string,
  eventType: string,
  requestId: string | null,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({ event_id: eventId, event_type: eventType, request_id: requestId })
    .select("event_id");

  if (error) {
    // 23505 = unique_violation — duplicate, нормально, skip.
    const code = (error as { code?: string }).code;
    if (code === "23505") return false;
    // Любая другая ошибка — пробрасываем, Stripe заретраит.
    throw new Error(`stripe_webhook_events insert failed: ${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}

async function releaseWebhookEventClaim(
  supabaseAdmin: SupabaseAdminClient,
  eventId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("stripe_webhook_events")
    .delete()
    .eq("event_id", eventId);

  if (error) {
    logger.error("[stripe/webhook] failed to release event claim:", error.message);
  }
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin not configured" }, { status: 503 });
  }

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    logger.error("[stripe/webhook] Missing STRIPE_WEBHOOK_SECRET");
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
    logger.error("[stripe/webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── Idempotency: пробуем застолбить event.id ──
  // Если не получилось — Stripe ретраит уже обработанное событие, отвечаем 200.
  try {
    const claimed = await tryClaimWebhookEvent(
      supabaseAdmin,
      event.id,
      event.type,
      request.headers.get("stripe-signature")?.slice(0, 64) ?? null,
    );
    if (!claimed) {
      logger.info(`[stripe/webhook] duplicate event skipped: ${event.id} (${event.type})`);
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err: unknown) {
    // Если не смогли проверить idempotency — лучше отказать с 500, чем дважды активировать план.
    const message = err instanceof Error ? err.message : "Idempotency check failed";
    logger.error("[stripe/webhook] Idempotency check error:", message);
    return NextResponse.json({ error: "Idempotency unavailable" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object, supabaseAdmin);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object, supabaseAdmin);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object, supabaseAdmin);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object, supabaseAdmin);
        break;
      default:
        logger.info(`[stripe/webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook handler error";
    logger.error("[stripe/webhook] Handler error:", message, "event:", event.type);
    await releaseWebhookEventClaim(supabaseAdmin, event.id);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_VALUES: Plan[] = [
  "free",
  "premium_viewer",
  "premium_grandfathered",
  "creator_location",
  "creator_service",      // legacy v2 — grandfathered (см. docs/PRICING_V3_CREATOR_MERGE.md)
  "creator_experience",   // legacy v2 — grandfathered
  "creator_pro",
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

async function syncProfileToBestActiveSubscription(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  stripeCustomerId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, period, current_period_end, stripe_subscription_id, created_at")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    logger.error("[stripe/webhook] active subscription lookup failed:", error.message);
    throw new Error(error.message);
  }

  const best = chooseBestEntitlement(
    (data ?? []).map((row) => ({
      plan: asPlan(row.plan),
      period: asPeriod(row.period),
      renewsAt: row.current_period_end ?? null,
      stripeSubscriptionId: row.stripe_subscription_id ?? null,
      createdAt: row.created_at ?? null,
    })),
  );

  if (!best) return false;

  const { error: profErr } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: best.plan,
      plan_period: best.period,
      plan_renews_at: best.renewsAt ?? null,
      subscription_status: "active",
      role: "premium",
      stripe_customer_id: stripeCustomerId,
    })
    .eq("id", userId);

  if (profErr) {
    logger.error("[stripe/webhook] profile entitlement sync failed:", profErr.message);
    throw new Error(profErr.message);
  }

  logger.info("[stripe/webhook] profile synced to best active subscription:", {
    userId,
    plan: best.plan,
    period: best.period,
  });
  return true;
}

/**
 * Резолвит supabase user ID из webhook event'а с двумя фолбэками:
 *   1. metadata.supabase_user_id (его кладёт checkout-роут).
 *   2. lookup profile by stripe_customer_id (его пишут при checkout creation).
 *
 * Второй фолбэк нужен если subscription создана вручную в Dashboard,
 * либо если Stripe API version (старая 2018) не передаёт metadata в нужном виде.
 *
 * Возвращает null если ни одна стратегия не сработала.
 */
async function resolveUserId(args: {
  supabaseAdmin: SupabaseAdminClient;
  metadataUserId: string | undefined;
  stripeCustomerId: string | null;
}): Promise<string | null> {
  if (args.metadataUserId) return args.metadataUserId;

  if (!args.stripeCustomerId) return null;

  const { data, error } = await args.supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", args.stripeCustomerId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error("[stripe/webhook] resolveUserId failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-time payments: либо Premium (lifetime premium_viewer), либо add-on
 * (+1 слот за $2.99). Различаем по metadata.kind.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabaseAdmin: SupabaseAdminClient
) {
  const customerIdEarly =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  const userId = await resolveUserId({
    supabaseAdmin,
    metadataUserId: session.metadata?.supabase_user_id,
    stripeCustomerId: customerIdEarly,
  });

  if (!userId) {
    logger.error("[stripe/webhook] checkout.session.completed: cannot resolve user", {
      sessionId: session.id,
      customerId: customerIdEarly,
      metadata: session.metadata,
    });
    return;
  }

  logger.info("[stripe/webhook] handleCheckoutCompleted:", {
    sessionId: session.id,
    mode: session.mode,
    payment_status: session.payment_status,
    userId,
    via: session.metadata?.supabase_user_id ? "metadata" : "customer_id_lookup",
  });

  // Subscription mode — подхватит handleSubscriptionUpsert; тут только one-time payment.
  if (session.mode !== "payment") {
    logger.debug("[stripe/webhook] skipping: mode != payment, will be picked up by subscription handler");
    return;
  }

  if (session.payment_status !== "paid") {
    logger.warn("[stripe/webhook] checkout payment_status !== 'paid':", session.payment_status);
    return;
  }

  const customerId = customerIdEarly;

  // ────── Add-on: +1 слот ──────
  if (session.metadata?.kind === "extra_listing") {
    // Простая инкрементация. Если когда-нибудь будут гонки — переписать через RPC.
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("bonus_listing_credits")
      .eq("id", userId)
      .single();
    if (pErr) {
      logger.error("[stripe/webhook] extra_listing read profile failed:", pErr.message);
      throw new Error(pErr.message);
    }
    const next = (prof?.bonus_listing_credits ?? 0) + 1;
    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update({ bonus_listing_credits: next, stripe_customer_id: customerId })
      .eq("id", userId);
    if (uErr) {
      logger.error("[stripe/webhook] extra_listing update failed:", uErr.message);
      throw new Error(uErr.message);
    }
    logger.info("[stripe/webhook] +1 listing credit for", userId, "→", next);
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
    logger.error("[stripe/webhook] Failed to activate premium:", error.message);
    throw new Error(`Failed to activate premium for ${userId}: ${error.message}`);
  }
  logger.info("[stripe/webhook] Premium (lifetime) activated for", userId);
}

/**
 * Subscription created/updated — основная точка входа для подписочной модели.
 *
 * 1. Берём supabase_user_id из metadata подписки.
 * 2. План определяем из metadata (мы туда положили в checkout) — Stripe Price ID
 *    можно использовать как фоллбэк, если подписку создали в Dashboard вручную.
 * 3. Делаем upsert в public.subscriptions и обновляем profiles.plan для быстрых проверок.
 */
async function handleSubscriptionUpsert(
  sub: Stripe.Subscription,
  supabaseAdmin: SupabaseAdminClient
) {
  // DEBUG: видим полную структуру subscription event'а
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const userId = await resolveUserId({
    supabaseAdmin,
    metadataUserId: sub.metadata?.supabase_user_id,
    stripeCustomerId: customerId,
  });

  if (!userId) {
    logger.error("[stripe/webhook] subscription: cannot resolve user", {
      subId: sub.id,
      customerId,
      sub_metadata: sub.metadata,
    });
    return;
  }

  logger.info("[stripe/webhook] handleSubscriptionUpsert:", {
    subId: sub.id,
    status: sub.status,
    userId,
    via: sub.metadata?.supabase_user_id ? "metadata" : "customer_id_lookup",
    item_price_id: sub.items?.data?.[0]?.price?.id,
  });

  // Plan + period: сначала из metadata (наш checkout пишет туда). Если metadata пустые —
  // например, подписку создали вручную в Stripe Dashboard — резолвим из subscription items[0].price.id
  // через `resolvePlanByPriceId` (registry reverse-map).
  let plan = asPlan(sub.metadata?.plan);
  let period = asPeriod(sub.metadata?.period);

  if (plan === "free") {
    const priceId =
      sub.items.data[0]?.price?.id ?? null;
    if (priceId) {
      const resolved = resolvePlanByPriceId(priceId);
      if (resolved) {
        plan = resolved.plan;
        period = resolved.cycle === "lifetime" ? "lifetime" : resolved.cycle;
        logger.info(
          `[stripe/webhook] plan resolved from price_id (no metadata): ${plan}/${period}`,
        );
      }
    }
  }

  const status = mapStripeStatusToOurs(sub.status);
  // customerId уже резолвлен в начале функции

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
    logger.error("[stripe/webhook] subscriptions upsert failed:", upsertErr.message);
    throw new Error(upsertErr.message);
  }

  // 2) Денормализованный план на profile — только если подписка активна.
  // Если у customer уже несколько active subscriptions, profile получает самый сильный
  // entitlement, чтобы более старое событие низкого тарифа не перезаписало Pro All/Service.
  if (status === "active") {
    await syncProfileToBestActiveSubscription(supabaseAdmin, userId, customerId);
  } else if (status === "past_due") {
    // Не сбрасываем план сразу — даём Stripe пройти retry-цикл.
    logger.warn("[stripe/webhook] subscription past_due:", { userId, subId: sub.id });
  }
}

/**
 * Подписка удалена/закончилась — возвращаем юзера на free, если активной нет.
 */
async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  supabaseAdmin: SupabaseAdminClient
) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = await resolveUserId({
    supabaseAdmin,
    metadataUserId: sub.metadata?.supabase_user_id,
    stripeCustomerId: customerId,
  });
  if (!userId) {
    logger.error("[stripe/webhook] subscription.deleted: cannot resolve user", {
      subId: sub.id,
      customerId,
      sub_metadata: sub.metadata,
    });
    return;
  }

  // Обновляем строку в subscriptions
  const { error: subUpdateError } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id);
  if (subUpdateError) {
    logger.error("[stripe/webhook] subscription deleted update failed:", subUpdateError.message);
    throw new Error(subUpdateError.message);
  }

  // Если у юзера осталась другая активная подписка, синхронизируем профиль на неё.
  const hasActiveEntitlement = await syncProfileToBestActiveSubscription(
    supabaseAdmin,
    userId,
    customerId,
  );
  if (hasActiveEntitlement) return;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: "free",
      plan_period: null,
      plan_renews_at: null,
      subscription_status: "inactive",
      role: "standard",
    })
    .eq("id", userId);
  if (profileError) {
    logger.error("[stripe/webhook] subscription deleted profile update failed:", profileError.message);
    throw new Error(profileError.message);
  }

  logger.info("[stripe/webhook] subscription cancelled, user → free:", userId);
}

async function handlePaymentFailed(
  invoice: Stripe.Invoice,
  supabaseAdmin: SupabaseAdminClient
) {
  const subId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subId) return;
  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subId);
  logger.warn("[stripe/webhook] payment failed for sub:", subId);
}

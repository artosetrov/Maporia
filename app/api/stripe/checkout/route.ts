/**
 * POST /api/stripe/checkout
 *
 * Body (v2):
 *   { access_token, plan?, cycle?, addon? }
 *
 *   - plan: PaidPlan — 'premium_viewer' | 'creator_location' | 'creator_service' |
 *                      'creator_experience' | 'creator_all'.
 *   - cycle: 'month' | 'year' | 'lifetime' (default: 'month' для recurring, 'lifetime' для premium).
 *           v2: yearly billing toggle на /pricing — клиент явно передаёт 'year'.
 *   - addon: 'extra_listing' — разовая покупка +1 слот ($2.99). Игнорирует plan/cycle.
 *
 * Резолвинг Stripe Price ID — через registry (`app/lib/pricing/checkout.ts`).
 * Никаких хардкодов STRIPE_PRICE_* в этом файле — registry единственный источник.
 *
 * Без любого из этих параметров — legacy fallback на STRIPE_PRICE_ID (старая Premium one-time).
 *
 * Возвращает { url } для редиректа в Stripe Checkout.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe, getSupabaseAdmin, getOrCreateStripeCustomer } from "../../../lib/stripe";
import {
  resolvePriceId,
  resolveExtraListingPriceId,
  PriceNotConfiguredError,
  UnsupportedPlanCycleError,
  PRICING_REGISTRY,
  type Cycle,
  type PlanId,
} from "../../../lib/pricing";
import { isImpersonatingFromRequest } from "../../../lib/impersonation";
import { getStripeRedirectOrigin } from "../../../lib/stripeRedirectOrigin";
import { logger } from "../../../lib/logger";
import type { PaidPlan } from "../../../types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status });

function isPaidPlan(value: unknown): value is PaidPlan {
  return (
    value === "premium_viewer" ||
    value === "creator_location" ||
    value === "creator_service" ||
    value === "creator_experience" ||
    value === "creator_all"
  );
}

function isCycle(value: unknown): value is Cycle {
  return value === "month" || value === "year" || value === "lifetime";
}

/** Дефолтный cycle для плана: lifetime для premium, month для recurring. */
function defaultCycleForPlan(plan: PlanId): Cycle {
  const usd = PRICING_REGISTRY[plan].prices.USD;
  if (usd?.lifetime) return "lifetime";
  if (usd?.month) return "month";
  return "month"; // defensive
}

export async function POST(request: NextRequest) {
  try {
    // Гард: запрещаем Stripe-операции под impersonation.
    if (isImpersonatingFromRequest(request)) {
      return jsonError(
        "Stripe operations are disabled while impersonating another user.",
        403,
        "IMPERSONATION_ACTIVE"
      );
    }

    const stripe = getStripe();
    if (!stripe) {
      return jsonError("Stripe is not configured. Set STRIPE_SECRET_KEY.", 503, "MISSING_STRIPE_KEY");
    }
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonError("Supabase admin is not configured.", 503, "MISSING_SUPABASE_ADMIN");
    }

    const body = (await request.json().catch(() => ({}))) as {
      access_token?: string;
      plan?: string;
      cycle?: string;
      /** @deprecated v1: переименовано в `cycle`. Принимаем для backward-compat. */
      period?: string;
      addon?: string;
    };

    if (!body.access_token) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(body.access_token);
    const user = authData?.user;
    if (authError || !user) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

    // --- Резолвим Stripe Price ID + mode через registry ---
    let priceId: string | null = null;
    let mode: "subscription" | "payment" = "payment";
    const sessionMetadata: Record<string, string> = { supabase_user_id: user.id };
    const subscriptionMetadata: Record<string, string> = { supabase_user_id: user.id };

    if (body.addon === "extra_listing") {
      // ────── Add-on: +1 слот за $2.99 ──────
      try {
        priceId = resolveExtraListingPriceId();
      } catch (e) {
        if (e instanceof PriceNotConfiguredError) {
          return jsonError(
            `Stripe Price ID for add-on is not set. Define env ${e.envName}.`,
            503,
            "MISSING_ADDON_PRICE",
          );
        }
        throw e;
      }
      mode = "payment";
      sessionMetadata.kind = "extra_listing";
    } else if (isPaidPlan(body.plan)) {
      // ────── План (v2: с cycle) ──────
      // cycle: явно из body, fallback на legacy `period`, fallback на default по плану.
      const cycleInput = isCycle(body.cycle)
        ? body.cycle
        : isCycle(body.period)
          ? body.period
          : defaultCycleForPlan(body.plan);

      try {
        priceId = resolvePriceId({ plan: body.plan, cycle: cycleInput });
      } catch (e) {
        if (e instanceof PriceNotConfiguredError) {
          return jsonError(
            `Stripe Price ID is not set for plan=${body.plan} cycle=${cycleInput}. Define env ${e.envName}.`,
            503,
            "MISSING_PLAN_PRICE",
          );
        }
        if (e instanceof UnsupportedPlanCycleError) {
          return jsonError(
            `Plan ${body.plan} does not support cycle ${cycleInput}.`,
            400,
            "UNSUPPORTED_PLAN_CYCLE",
          );
        }
        throw e;
      }

      mode = cycleInput === "lifetime" ? "payment" : "subscription";
      sessionMetadata.plan = body.plan;
      sessionMetadata.period = cycleInput;
      sessionMetadata.cycle = cycleInput;
      subscriptionMetadata.plan = body.plan;
      subscriptionMetadata.period = cycleInput;
      subscriptionMetadata.cycle = cycleInput;
    } else {
      // ────── Legacy fallback ──────
      priceId = process.env.STRIPE_PRICE_ID || null;
      mode = "payment";
      sessionMetadata.plan = "premium_viewer";
      sessionMetadata.period = "lifetime";
      if (!priceId) {
        return jsonError(
          "Payment is not configured. Set STRIPE_PRICE_ID or pass { plan } / { addon }.",
          503,
          "MISSING_STRIPE_PRICE"
        );
      }
    }

    const stripeCustomerId = await getOrCreateStripeCustomer(user.id, user.email || "");

    const origin = getStripeRedirectOrigin(request);

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/profile?section=premium&payment=success`,
      cancel_url: `${origin}/pricing?payment=cancelled`,
      metadata: sessionMetadata,
      ...(mode === "subscription"
        ? { subscription_data: { metadata: subscriptionMetadata } }
        : { payment_intent_data: { metadata: sessionMetadata } }),
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session";
    logger.error("[stripe/checkout] Error:", message);
    return jsonError(message, 500, "CHECKOUT_ERROR");
  }
}

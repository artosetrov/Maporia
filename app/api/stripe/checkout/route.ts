/**
 * POST /api/stripe/checkout
 *
 * Body:
 *   { access_token, plan?, period?, addon? }
 *
 *   - plan: 'premium_viewer' | 'creator_service' | 'creator_experience' | 'creator_all'
 *           Premium = one-time payment ($35).
 *           Creator-планы = monthly subscription ($14.99 / $34.99).
 *   - period: 'month' (для creator-тарифов) — необязательно, всё равно month.
 *   - addon: 'extra_listing' — разовая покупка +1 слот ($2.99).
 *           Не зависит от plan.
 *
 * Без любого из этих параметров — legacy fallback на STRIPE_PRICE_ID.
 *
 * Возвращает { url } для редиректа в Stripe Checkout.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe, supabaseAdmin, getOrCreateStripeCustomer } from "../../../lib/stripe";
import { EXTRA_LISTING, PLAN_CONFIG } from "../../../lib/plans";
import type { PaidPlan } from "../../../types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status });

function isPaidPlan(value: unknown): value is PaidPlan {
  return (
    value === "premium_viewer" ||
    value === "creator_service" ||
    value === "creator_experience" ||
    value === "creator_all"
  );
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return jsonError("Stripe is not configured. Set STRIPE_SECRET_KEY.", 503, "MISSING_STRIPE_KEY");
    }

    const body = (await request.json().catch(() => ({}))) as {
      access_token?: string;
      plan?: string;
      period?: string;
      addon?: string;
    };

    if (!body.access_token) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(body.access_token);
    const user = authData?.user;
    if (authError || !user) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

    // --- Резолвим Stripe Price ID + mode ---
    let priceId: string | null = null;
    let mode: "subscription" | "payment" = "payment";
    const sessionMetadata: Record<string, string> = { supabase_user_id: user.id };
    const subscriptionMetadata: Record<string, string> = { supabase_user_id: user.id };

    if (body.addon === "extra_listing") {
      // ────── Add-on: +1 слот за $2.99 ──────
      priceId = process.env[EXTRA_LISTING.priceIdEnv] || null;
      mode = "payment";
      sessionMetadata.kind = "extra_listing";
      if (!priceId) {
        return jsonError(
          `Stripe Price ID для add-on не задан: ${EXTRA_LISTING.priceIdEnv}`,
          503,
          "MISSING_ADDON_PRICE"
        );
      }
    } else if (isPaidPlan(body.plan)) {
      // ────── План ──────
      const cfg = PLAN_CONFIG[body.plan];
      priceId = process.env[cfg.priceIdEnv] || null;
      if (!priceId) {
        return jsonError(
          `Stripe Price ID не задан: установи env ${cfg.priceIdEnv}`,
          503,
          "MISSING_PLAN_PRICE"
        );
      }
      mode = cfg.billing.kind === "subscription" ? "subscription" : "payment";
      sessionMetadata.plan = body.plan;
      sessionMetadata.period = cfg.billing.kind === "subscription" ? cfg.billing.period : "lifetime";
      subscriptionMetadata.plan = body.plan;
      subscriptionMetadata.period = cfg.billing.kind === "subscription" ? cfg.billing.period : "lifetime";
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

    const origin =
      request.headers.get("origin") ||
      request.headers.get("referer")?.replace(/\/+$/, "") ||
      "http://localhost:3000";

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
    console.error("[stripe/checkout] Error:", message);
    return jsonError(message, 500, "CHECKOUT_ERROR");
  }
}

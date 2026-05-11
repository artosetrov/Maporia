/**
 * POST /api/stripe/verify
 * Verifies that the current user has a completed Stripe payment
 * and activates Premium if not yet activated.
 *
 * This is a fallback for when webhooks are delayed or unreachable (e.g. localhost).
 * Called from the client after redirect from Stripe Checkout.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe, getSupabaseAdmin } from "../../../lib/stripe";
import { logger } from "../../../lib/logger";
import { isImpersonatingFromRequest } from "../../../lib/impersonation";
import { resolvePlanByPriceId } from "../../../lib/pricing";
import { chooseBestEntitlement } from "../../../lib/pricing/entitlements";
import type { Plan, PlanPeriod } from "../../../types";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status });

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(userId);

  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) return false;

  limit.count++;
  return true;
}

const PLAN_VALUES: Plan[] = [
  "free",
  "premium_viewer",
  "premium_grandfathered",
  "creator_location",
  "creator_service",      // legacy v2 — grandfathered
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

function isEntitlementStatus(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing";
}

function subscriptionTime(sub: Stripe.Subscription, field: "current_period_start" | "current_period_end"): string | null {
  const value = (sub as unknown as Record<typeof field, number | undefined>)[field];
  return value ? new Date(value * 1000).toISOString() : null;
}

function resolveSubscriptionPlan(sub: Stripe.Subscription): { plan: Plan; period: PlanPeriod } | null {
  let plan = asPlan(sub.metadata?.plan);
  let period = asPeriod(sub.metadata?.period ?? sub.metadata?.cycle);

  if (plan === "free") {
    const priceId = sub.items.data[0]?.price?.id ?? null;
    const resolved = priceId ? resolvePlanByPriceId(priceId) : null;
    if (!resolved) return null;
    plan = resolved.plan;
    period = resolved.cycle === "lifetime" ? "lifetime" : resolved.cycle;
  }

  if (plan === "free" || period === "lifetime") return null;
  return { plan, period };
}

export async function POST(request: NextRequest) {
  try {
    if (isImpersonatingFromRequest(request)) {
      return jsonError(
        "Stripe verification is disabled while impersonating another user.",
        403,
        "IMPERSONATION_ACTIVE"
      );
    }

    const stripe = getStripe();
    if (!stripe) {
      return jsonError("Stripe is not configured.", 503, "MISSING_STRIPE_KEY");
    }
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonError("Supabase admin is not configured.", 503, "MISSING_SUPABASE_ADMIN");
    }

    // --- Auth ---
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError("Invalid JSON body", 400, "INVALID_JSON");
    }
    const { access_token } = body as { access_token?: string };

    if (!access_token) {
      return jsonError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(access_token);
    const user = authData?.user;

    if (authError || !user) {
      return jsonError("Unauthorized", 401, "UNAUTHORIZED");
    }

    if (!checkRateLimit(user.id)) {
      return jsonError(
        "Too many verification requests. Please wait a minute and try again.",
        429,
        "RATE_LIMITED"
      );
    }

    // --- Reconcile active Stripe subscriptions first ---
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_status, role, plan, plan_period, stripe_customer_id")
      .eq("id", user.id)
      .single();

    const customerId = profile?.stripe_customer_id;
    if (customerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });

      const activeEntitlements = subscriptions.data
        .filter((sub) => isEntitlementStatus(sub.status))
        .map((sub) => {
          const resolved = resolveSubscriptionPlan(sub);
          if (!resolved) return null;
          return {
            ...resolved,
            renewsAt: subscriptionTime(sub, "current_period_end"),
            stripeSubscriptionId: sub.id,
            createdAt: sub.created ? new Date(sub.created * 1000).toISOString() : null,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (activeEntitlements.length > 0) {
        await Promise.all(activeEntitlements.map((entitlement) => {
          const sub = subscriptions.data.find((candidate) => candidate.id === entitlement.stripeSubscriptionId);
          return supabaseAdmin.from("subscriptions").upsert({
            user_id: user.id,
            plan: entitlement.plan,
            period: entitlement.period,
            status: "active",
            stripe_subscription_id: entitlement.stripeSubscriptionId,
            stripe_customer_id: customerId,
            current_period_start: sub ? subscriptionTime(sub, "current_period_start") : null,
            current_period_end: entitlement.renewsAt ?? null,
            cancel_at_period_end: sub
              ? ((sub as unknown as { cancel_at_period_end?: boolean }).cancel_at_period_end ?? false)
              : false,
            cancelled_at: null,
          }, { onConflict: "stripe_subscription_id" });
        }));

        const best = chooseBestEntitlement(activeEntitlements);
        if (best) {
          const changed =
            profile?.plan !== best.plan ||
            profile?.plan_period !== best.period;

          const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({
              plan: best.plan,
              plan_period: best.period,
              plan_renews_at: best.renewsAt ?? null,
              subscription_status: "active",
              role: "premium",
              stripe_customer_id: customerId,
            })
            .eq("id", user.id);

          if (updateError) {
            logger.error("[stripe/verify] Failed to sync subscription plan:", updateError.message);
            return jsonError("Failed to sync subscription plan.", 500, "DB_ERROR");
          }

          return NextResponse.json({
            status: changed ? "subscription_synced" : "subscription_current",
            activated: false,
            synced: changed,
            plan: best.plan,
            period: best.period,
          });
        }
      }
    }

    // --- Check if already premium without active recurring subscriptions ---
    if (profile?.subscription_status === "active") {
      if (!profile.plan || profile.plan === "free" || !profile.plan_period) {
        await supabaseAdmin
          .from("profiles")
          .update({
            plan: "premium_viewer",
            plan_period: "lifetime",
            plan_renews_at: null,
            role: "premium",
          })
          .eq("id", user.id);
      }
      return NextResponse.json({ status: "already_premium", activated: false, synced: false });
    }

    // --- Find completed one-time Premium checkout session for this user ---
    if (!customerId) {
      return NextResponse.json({ status: "no_payment_found", activated: false, synced: false });
    }

    // List recent checkout sessions for this customer
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 5,
    });

    const paidSession = sessions.data.find((s) => {
      if (s.payment_status !== "paid") return false;
      if (s.mode !== "payment") return false;
      if (s.metadata?.supabase_user_id !== user.id) return false;
      if (s.metadata?.kind === "extra_listing") return false;
      const plan = s.metadata?.plan;
      const period = s.metadata?.period || s.metadata?.cycle;
      return (!plan || plan === "premium_viewer") && (!period || period === "lifetime");
    });

    if (!paidSession) {
      return NextResponse.json({ status: "no_payment_found", activated: false, synced: false });
    }

    // --- Activate premium ---
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        plan: "premium_viewer",
        plan_period: "lifetime",
        plan_renews_at: null,
        subscription_status: "active",
        role: "premium",
        stripe_customer_id: customerId,
      })
      .eq("id", user.id);

    if (updateError) {
      logger.error("[stripe/verify] Failed to activate premium:", updateError.message);
      return jsonError("Failed to activate premium.", 500, "DB_ERROR");
    }

    logger.info("[stripe/verify] Premium activated for user:", user.id);
    return NextResponse.json({ status: "activated", activated: true, synced: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Verification failed";
    logger.error("[stripe/verify] Error:", message);
    return jsonError(message, 500, "VERIFY_ERROR");
  }
}

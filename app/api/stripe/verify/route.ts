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

    // --- Check if already premium ---
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_status, role, plan, plan_period, stripe_customer_id")
      .eq("id", user.id)
      .single();

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
      return NextResponse.json({ status: "already_premium", activated: false });
    }

    // --- Find completed checkout session for this user ---
    const customerId = profile?.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json({ status: "no_payment_found", activated: false });
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
      return NextResponse.json({ status: "no_payment_found", activated: false });
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
    return NextResponse.json({ status: "activated", activated: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Verification failed";
    logger.error("[stripe/verify] Error:", message);
    return jsonError(message, 500, "VERIFY_ERROR");
  }
}

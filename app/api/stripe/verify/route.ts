/**
 * POST /api/stripe/verify
 * Verifies that the current user has a completed Stripe payment
 * and activates Premium if not yet activated.
 *
 * This is a fallback for when webhooks are delayed or unreachable (e.g. localhost).
 * Called from the client after redirect from Stripe Checkout.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe, supabaseAdmin } from "../../../lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status });

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return jsonError("Stripe is not configured.", 503, "MISSING_STRIPE_KEY");
    }

    // --- Auth ---
    const body = await request.json();
    const { access_token } = body as { access_token?: string };

    if (!access_token) {
      return jsonError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(access_token);
    const user = authData?.user;

    if (authError || !user) {
      return jsonError("Unauthorized", 401, "UNAUTHORIZED");
    }

    // --- Check if already premium ---
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_status, role, stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profile?.subscription_status === "active") {
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

    const paidSession = sessions.data.find(
      (s) => s.payment_status === "paid" && s.metadata?.supabase_user_id === user.id
    );

    if (!paidSession) {
      return NextResponse.json({ status: "no_payment_found", activated: false });
    }

    // --- Activate premium ---
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        subscription_status: "active",
        role: "premium",
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[stripe/verify] Failed to activate premium:", updateError.message);
      return jsonError("Failed to activate premium.", 500, "DB_ERROR");
    }

    console.log("[stripe/verify] Premium activated for user:", user.id);
    return NextResponse.json({ status: "activated", activated: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Verification failed";
    console.error("[stripe/verify] Error:", message);
    return jsonError(message, 500, "VERIFY_ERROR");
  }
}

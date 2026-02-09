/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout Session for one-time Premium payment.
 * Returns { url } to redirect the user to Stripe hosted checkout.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe, supabaseAdmin, getOrCreateStripeCustomer } from "../../../lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status });

export async function POST(request: NextRequest) {
  try {
    // --- Validate config ---
    const stripe = getStripe();
    if (!stripe) {
      return jsonError("Stripe is not configured. Set STRIPE_SECRET_KEY.", 503, "MISSING_STRIPE_KEY");
    }

    const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
    if (!STRIPE_PRICE_ID) {
      return jsonError("Payment is not configured. Set STRIPE_PRICE_ID.", 503, "MISSING_STRIPE_PRICE");
    }

    // --- Auth: extract access_token from body ---
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

    // --- Check if user already has premium ---
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_status, role")
      .eq("id", user.id)
      .single();

    if (profile?.subscription_status === "active" || profile?.role === "premium" || profile?.role === "admin") {
      return jsonError("You already have Premium access.", 400, "ALREADY_PREMIUM");
    }

    // --- Get or create Stripe customer ---
    const stripeCustomerId = await getOrCreateStripeCustomer(user.id, user.email || "");

    // --- Build success/cancel URLs from request origin ---
    const origin = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/+$/, "") || "http://localhost:3000";

    // --- Create Checkout Session ---
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${origin}/profile?payment=success`,
      cancel_url: `${origin}/profile?payment=cancelled`,
      metadata: {
        supabase_user_id: user.id,
      },
      payment_intent_data: {
        metadata: {
          supabase_user_id: user.id,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session";
    console.error("[stripe/checkout] Error:", message);
    return jsonError(message, 500, "CHECKOUT_ERROR");
  }
}

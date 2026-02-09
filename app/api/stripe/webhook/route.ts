/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events.
 * Verifies signature and processes checkout.session.completed
 * to activate Premium for the user.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, supabaseAdmin } from "../../../lib/stripe";

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

  // --- Read raw body for signature verification ---
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // --- Verify webhook signature ---
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Signature verification failed";
    console.error("[stripe/webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // --- Handle events ---
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutCompleted(event.data.object);
        break;
      }
      default: {
        // Unhandled event type — acknowledge silently
        if (process.env.NODE_ENV === "development") {
          console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook handler error";
    console.error("[stripe/webhook] Handler error:", message);
    // Return 200 to prevent Stripe from retrying on application errors
    // (data is logged for manual recovery)
    return NextResponse.json({ received: true, error: message }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Handles checkout.session.completed event.
 * Activates premium for the user by updating their profile.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.supabase_user_id;

  if (!userId) {
    console.error("[stripe/webhook] checkout.session.completed missing supabase_user_id in metadata", {
      sessionId: session.id,
    });
    return;
  }

  if (session.payment_status !== "paid") {
    console.warn("[stripe/webhook] checkout.session.completed but payment_status is not 'paid':", session.payment_status, {
      sessionId: session.id,
      userId,
    });
    return;
  }

  // --- Activate premium ---
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      subscription_status: "active",
      role: "premium",
      stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    })
    .eq("id", userId);

  if (error) {
    console.error("[stripe/webhook] Failed to activate premium:", error.message, {
      userId,
      sessionId: session.id,
    });
    throw new Error(`Failed to activate premium for user ${userId}: ${error.message}`);
  }

  console.log("[stripe/webhook] Premium activated for user:", userId);
}

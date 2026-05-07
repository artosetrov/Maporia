/**
 * POST /api/stripe/portal
 *
 * Создаёт сессию Stripe Customer Portal — там пользователь сам отменяет
 * подписку, меняет план, обновляет платёжные методы. Stripe сам решает,
 * что показать.
 *
 * Body: { access_token }
 * Returns: { url }
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
    if (!stripe) return jsonError("Stripe is not configured.", 503, "MISSING_STRIPE_KEY");

    const body = (await request.json().catch(() => ({}))) as { access_token?: string };
    if (!body.access_token) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(body.access_token);
    const user = authData?.user;
    if (authError || !user) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (pErr || !profile?.stripe_customer_id) {
      return jsonError("У вас ещё нет подписки", 400, "NO_CUSTOMER");
    }

    const origin =
      request.headers.get("origin") ||
      request.headers.get("referer")?.replace(/\/+$/, "") ||
      "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/profile?section=premium`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to open billing portal";
    console.error("[stripe/portal] Error:", message);
    return jsonError(message, 500, "PORTAL_ERROR");
  }
}

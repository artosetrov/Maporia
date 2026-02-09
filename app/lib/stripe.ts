/**
 * Stripe server-side utilities
 * Lazy Stripe instance, Supabase admin client, and customer helpers
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// --- Environment ---

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// --- Stripe (lazy singleton — avoids crash when STRIPE_SECRET_KEY is missing) ---

let _stripe: Stripe | null = null;

export const getStripe = (): Stripe | null => {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[stripe] Missing STRIPE_SECRET_KEY environment variable");
    return null;
  }

  _stripe = new Stripe(key, { typescript: true });
  return _stripe;
};

// --- Supabase admin client (bypasses RLS) ---

export const supabaseAdmin = createClient(
  supabaseUrl || "",
  supabaseServiceKey || "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

// --- Helpers ---

/**
 * Finds an existing Stripe customer by stripe_customer_id in profiles,
 * or creates a new one in Stripe and saves the ID back to profiles.
 *
 * @param userId - Supabase user ID
 * @param email - User email for Stripe customer creation
 * @returns Stripe customer ID
 */
export const getOrCreateStripeCustomer = async (
  userId: string,
  email: string
): Promise<string> => {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  // 1. Check if user already has a stripe_customer_id
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  // 2. Create a new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });

  // 3. Save stripe_customer_id to profiles
  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  if (updateError) {
    throw new Error(`Failed to save stripe_customer_id: ${updateError.message}`);
  }

  return customer.id;
};

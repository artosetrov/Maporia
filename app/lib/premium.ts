/**
 * Premium subscription utilities
 * Handles Stripe checkout for one-time Premium payment
 */

import { supabase } from "./supabase";

/**
 * Starts Stripe Checkout for Premium purchase.
 * Redirects the user to Stripe hosted checkout page.
 *
 * @throws Error if user is not authenticated or checkout fails
 */
export const startPremiumCheckout = async (): Promise<void> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Not authenticated");
  }

  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: token }),
  });

  const json = await res.json();

  if (!res.ok || json.error) {
    throw new Error(json.error || "Failed to start checkout");
  }

  if (!json.url) {
    throw new Error("No checkout URL returned");
  }

  window.location.href = json.url;
};

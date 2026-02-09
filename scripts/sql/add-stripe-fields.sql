-- Add Stripe customer ID to profiles for payment tracking
-- One-time payment model: stripe_customer_id links Supabase user to Stripe customer

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- Allow monthly pricing and multiple pricing options for service/experience
-- offer cards.
--
-- Run in Supabase SQL Editor before deploying code that reads/writes
-- places.price_options or uses price_unit = 'per_month'.

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS price_options jsonb;

COMMENT ON COLUMN public.places.price_options IS
  'Optional array of service/experience pricing menu options. Supports legacy {label, amount, currency, unit, note} plus group_label, compare_at_amount, duration_minutes, badge, is_featured, and sort_order. Primary summary price remains price_amount/price_currency/price_unit.';

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_price_options_array_check;

ALTER TABLE public.places
  ADD CONSTRAINT places_price_options_array_check
  CHECK (
    price_options IS NULL OR jsonb_typeof(price_options) = 'array'
  );

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_price_unit_check;

ALTER TABLE public.places
  ADD CONSTRAINT places_price_unit_check
  CHECK (
    price_unit IS NULL OR
    price_unit IN (
      'fixed',
      'from',
      'per_hour',
      'per_person',
      'per_day',
      'per_month',
      'per_session'
    )
  );

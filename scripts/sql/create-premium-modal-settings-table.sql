-- SQL script to create table for premium modal settings
-- Execute this script in Supabase Dashboard > SQL Editor

-- Create app_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY DEFAULT 'premium_modal',
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_id ON app_settings(id);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running the script)
DROP POLICY IF EXISTS "Everyone can read app settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can insert app settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can update app settings" ON app_settings;

-- Policy: Everyone can read settings (needed for modal to display)
CREATE POLICY "Everyone can read app settings"
ON app_settings
FOR SELECT
USING (true);

-- Policy: Only admins can insert settings
CREATE POLICY "Admins can insert app settings"
ON app_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

-- Policy: Only admins can update settings
CREATE POLICY "Admins can update app settings"
ON app_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

-- Create a function to insert default settings (bypasses RLS)
CREATE OR REPLACE FUNCTION insert_default_premium_modal_settings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO app_settings (id, settings)
  VALUES (
    'premium_modal',
    '{
      "title": "Unlock Maporia Premium",
      "titleHighlight": "Maporia",
      "subtitle": "Get full access to our hidden local gems — no crowds, no tourist traps. Just authentic experiences.",
      "benefit1Title": "Premium-only places",
      "benefit1Desc": "Exclusive access to local secrets and hidden spots.",
      "benefit2Title": "Curated Collections",
      "benefit2Desc": "Secret Spots, Romantic Sunsets, Hidden Cafés & more.",
      "benefit3Title": "Custom Routes",
      "benefit3Desc": "Save favorites and build your personal itinerary.",
      "socialProof": "Discover places you''d never find on Google.",
      "price": "$20",
      "pricePeriod": "/ year",
      "priceSubtext": "Less than $2 a month",
      "priceRightTitle": "Full Access",
      "priceRightDesc": "All premium places + collections",
      "primaryButtonText": "Coming Soon",
      "primaryButtonLink": "",
      "secondaryButtonText": "Not now, thanks",
      "footerText": "Cancel anytime. Premium features will unlock instantly when available.",
      "footerLinkText": "Terms of Service apply.",
      "footerLinkUrl": "#"
    }'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Insert default settings using the function (bypasses RLS)
SELECT insert_default_premium_modal_settings();

-- Clean up: drop the function after use (optional)
DROP FUNCTION IF EXISTS insert_default_premium_modal_settings();

-- Create a function to update premium modal settings (bypasses RLS)
-- This function will be used by the API endpoint
CREATE OR REPLACE FUNCTION update_premium_modal_settings(
  p_settings JSONB,
  p_updated_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  INSERT INTO app_settings (id, settings, updated_at, updated_by)
  VALUES ('premium_modal', p_settings, NOW(), p_updated_by)
  ON CONFLICT (id) 
  DO UPDATE SET
    settings = p_settings,
    updated_at = NOW(),
    updated_by = p_updated_by;
  
  SELECT settings INTO v_result
  FROM app_settings
  WHERE id = 'premium_modal';
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users (admins will be checked in the function if needed)
GRANT EXECUTE ON FUNCTION update_premium_modal_settings(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_premium_modal_settings(JSONB, UUID) TO anon;

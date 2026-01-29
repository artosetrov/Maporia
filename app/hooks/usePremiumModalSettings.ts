import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

type PremiumModalSettings = {
  title?: string;
  titleHighlight?: string;
  subtitle?: string;
  benefit1Title?: string;
  benefit1Desc?: string;
  benefit2Title?: string;
  benefit2Desc?: string;
  benefit3Title?: string;
  benefit3Desc?: string;
  socialProof?: string;
  price?: string;
  pricePeriod?: string;
  priceSubtext?: string;
  priceRightTitle?: string;
  priceRightDesc?: string;
  primaryButtonText?: string;
  primaryButtonLink?: string;
  secondaryButtonText?: string;
  footerText?: string;
  footerLinkText?: string;
  footerLinkUrl?: string;
};

const defaultSettings: PremiumModalSettings = {
  title: "Unlock Maporia Premium",
  titleHighlight: "Maporia",
  subtitle: "Get full access to our hidden local gems — no crowds, no tourist traps. Just authentic experiences.",
  benefit1Title: "Premium-only places",
  benefit1Desc: "Exclusive access to local secrets and hidden spots.",
  benefit2Title: "Curated Collections",
  benefit2Desc: "Secret Spots, Romantic Sunsets, Hidden Cafés & more.",
  benefit3Title: "Custom Routes",
  benefit3Desc: "Save favorites and build your personal itinerary.",
  socialProof: "Discover places you'd never find on Google.",
  price: "$20",
  pricePeriod: "/ year",
  priceSubtext: "Less than $2 a month",
  priceRightTitle: "Full Access",
  priceRightDesc: "All premium places + collections",
  primaryButtonText: "Coming Soon",
  primaryButtonLink: "",
  secondaryButtonText: "Not now, thanks",
  footerText: "Cancel anytime. Premium features will unlock instantly when available.",
  footerLinkText: "Terms of Service apply.",
  footerLinkUrl: "#",
};

export function usePremiumModalSettings() {
  const [settings, setSettings] = useState<PremiumModalSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    try {
      // Try to load from Supabase directly (public read access)
      const { data, error } = await supabase
        .from("app_settings")
        .select("settings")
        .eq("id", "premium_modal")
        .single();

      if (!error && data?.settings) {
        setSettings({ ...defaultSettings, ...data.settings });
      } else if (error) {
        // Silently ignore AbortError and connection errors
        if (error?.name === 'AbortError' || error?.message?.includes('abort') || (error as any)?.code === 'ECONNABORTED') {
          return;
        }
        // PGRST116 = no rows (table empty or row missing) — use defaults silently
        if ((error as any)?.code === 'PGRST116' || (error as any)?.message?.includes('does not exist')) {
          return;
        }
        // Log with a guaranteed non-empty message so we never log "{}"
        const msg = error?.message || (error as any)?.code || 'Unknown error';
        if (process.env.NODE_ENV === 'production') {
          console.warn("Premium modal settings not available, using defaults:", msg);
        } else {
          console.error("Error loading premium modal settings:", msg);
        }
      }
    } catch (error: any) {
      // Silently ignore AbortError and connection errors
      if (error?.name === 'AbortError' || error?.message?.includes('abort') || error?.code === 'ECONNABORTED') {
        return;
      }
      // Log with a guaranteed non-empty message so we never log "{}"
      const msg = error?.message || error?.name || error?.code || (typeof error === 'object' ? 'Unknown error' : String(error));
      if (process.env.NODE_ENV === 'production') {
        console.warn("Premium modal settings not available, using defaults:", msg);
      } else {
        console.error("Error loading premium modal settings:", msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return { settings, loading, reloadSettings: loadSettings };
}

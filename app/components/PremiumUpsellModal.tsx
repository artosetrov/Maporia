"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePremiumModalSettings } from "../hooks/usePremiumModalSettings";
import Icon from "./Icon";
import Link from "next/link";
import PremiumBadge from "./PremiumBadge";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/supabase";
import { isPlacePremium } from "../lib/access";
import { startPremiumCheckout } from "../lib/premium";
import { usePremiumModalContext } from "../contexts/PremiumModalContext";
import { sanitizePostgrestValue } from "../utils";

type PlaceCoverRow = Pick<Database["public"]["Tables"]["places"]["Row"], "id" | "cover_url" | "access_level" | "visibility">;

export type PremiumUpsellModalContent = {
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

type PremiumUpsellModalProps = {
  open: boolean;
  onClose: () => void;
  customContent?: PremiumUpsellModalContent;
  context?: "place" | "collection";
  placeTitle?: string;
};

export default function PremiumUpsellModal({
  open,
  onClose,
  customContent,
  context: _context = "place",
  placeTitle: _placeTitle,
}: PremiumUpsellModalProps) {
  const { settings, loading: _loading, reloadSettings } = usePremiumModalSettings();
  const [premiumPlaces, setPremiumPlaces] = useState<{ id: string; cover_url: string | null }[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const slideIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [dynamicHeight, setDynamicHeight] = useState<string>("100dvh");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { openAuthModal } = usePremiumModalContext();

  const handleCheckout = useCallback(async () => {
    // Check if user is logged in first
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Not logged in — close premium modal, open auth modal
      onClose();
      openAuthModal("/profile", "default");
      return;
    }

    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      await startPremiumCheckout();
      // User will be redirected to Stripe — no further action needed
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Payment error";
      setCheckoutError(message);
      setCheckoutLoading(false);
    }
  }, [onClose, openAuthModal]);
  
  // Handle dynamic viewport height for mobile Chrome and safe areas
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateHeight = () => {
      if (window.visualViewport) {
        setDynamicHeight(`${window.visualViewport.height}px`);
      } else {
        setDynamicHeight("100dvh");
      }
    };

    updateHeight();
    window.visualViewport?.addEventListener("resize", updateHeight);
    window.addEventListener("resize", updateHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateHeight);
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  // Reload settings when modal opens to ensure we have the latest data
  // Use a ref to prevent multiple simultaneous calls
  const reloadingRef = useRef(false);
  useEffect(() => {
    if (open && reloadSettings && !reloadingRef.current) {
      reloadingRef.current = true;
      reloadSettings().finally(() => {
        reloadingRef.current = false;
      });
    }
  }, [open, reloadSettings]);

  // Load premium places with cover images when modal opens
  useEffect(() => {
    if (!open) {
      setPremiumPlaces([]);
      setCurrentImageIndex(0);
      return;
    }

    async function loadPremiumPlaces() {
      try {
        // Load premium places with cover_url, filtered server-side.
        // Why: previously we pulled the latest 50 places and filtered client-side,
        // but if no premium places fell into that window the slider was empty.
        // Server-side OR filter on access_level/visibility avoids that truncation.
        // Only filter on fields that actually exist in the DB.
        const { data: rawData, error } = await supabase
          .from("places")
          .select("id, cover_url, access_level, visibility")
          .not("cover_url", "is", null)
          .or(
            `access_level.eq.${sanitizePostgrestValue("premium")},visibility.eq.${sanitizePostgrestValue("premium")}`
          )
          .order("created_at", { ascending: false })
          .limit(20);

        const data = rawData as PlaceCoverRow[] | null;
        if (error) {
          // Silently handle RLS errors - it's expected if policy doesn't exist yet
          if (error.code === 'PGRST301' || error.code === '42501' || 
              error.message?.includes('permission') || error.message?.includes('policy') ||
              error.message?.includes('row-level security')) {
            // RLS blocked access - this is expected if policy not set up, use fallback
            console.log("RLS blocked access to premium places (expected if policy not applied)");
            setPremiumPlaces([]);
            return;
          }
          // Log unexpected errors for debugging
          console.error("Error loading premium places:", error.code, error.message, error);
          setPremiumPlaces([]);
          return;
        }

        if (!data || data.length === 0) {
          console.log("No places with cover_url found");
          setPremiumPlaces([]);
          return;
        }

        // Filter to only premium places using isPlacePremium function
        // This catches all variations: access_level and visibility
        // Note: isPlacePremium also checks is_premium and premium_only for backward compatibility,
        // but these fields don't exist in the database, so only access_level and visibility are used
        const premium = (data || []).filter(place => isPlacePremium(place));
        
        console.log(`Found ${premium.length} premium places out of ${data.length} total places with cover_url`);

        // Extract only id and cover_url, limit to 20 for slider
        const placesWithCovers = premium
          .filter(place => place.cover_url)
          .slice(0, 20)
          .map(place => ({ id: place.id, cover_url: place.cover_url }));

        console.log(`Loaded ${placesWithCovers.length} premium places with covers for slider`);
        setPremiumPlaces(placesWithCovers);
        setCurrentImageIndex(0);
      } catch (error: unknown) {
        const err =
          error && typeof error === "object"
            ? (error as { name?: string; message?: string })
            : { message: String(error) };
        // Silently handle errors - use fallback gradient
        if (err.name === 'AbortError' || err.message?.includes('abort')) {
          return;
        }
        // Log for debugging
        console.error("Exception loading premium places:", err.message || error, error);
        setPremiumPlaces([]);
      }
    }

    loadPremiumPlaces();
  }, [open]);

  // Auto-rotate images every 4 seconds
  useEffect(() => {
    if (!open || premiumPlaces.length <= 1) {
      if (slideIntervalRef.current) {
        clearInterval(slideIntervalRef.current);
        slideIntervalRef.current = null;
      }
      return;
    }

    slideIntervalRef.current = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % premiumPlaces.length);
    }, 4000); // Change image every 4 seconds

    return () => {
      if (slideIntervalRef.current) {
        clearInterval(slideIntervalRef.current);
        slideIntervalRef.current = null;
      }
    };
  }, [open, premiumPlaces.length]);

  // Merge custom content with settings (customContent takes precedence)
  const content = {
    ...settings,
    ...customContent,
  };

  // Highlight the titleHighlight word in the title
  const renderTitle = () => {
    if (!content.title) return null;
    
    if (content.titleHighlight && content.title.includes(content.titleHighlight)) {
      const parts = content.title.split(content.titleHighlight);
      return (
        <>
          {parts[0]}
          <span className="font-fraunces font-semibold">{content.titleHighlight}</span>
          {parts[1]}
        </>
      );
    }
    return content.title;
  };

  if (!open) return null;

  // Render modal in a portal to ensure it's on top of everything
  const modalContent = (
    <div 
      className="fixed inset-0 z-[9999] flex items-end lg:items-center justify-center pt-6 pb-0 lg:py-4 bg-black/60 backdrop-blur-sm"
      style={{ height: dynamicHeight }}
    >
      <div 
        className="w-full lg:max-w-4xl lg:h-auto lg:max-h-[85vh] rounded-t-3xl lg:rounded-3xl bg-white overflow-hidden relative flex flex-col lg:flex-row animate-slide-up max-h-[calc(100vh-1.5rem)]"
        style={{ 
          height: typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'auto' : 'calc(100% - 1.5rem)',
          maxHeight: typeof window !== 'undefined' && window.innerWidth >= 1024 ? '85vh' : 'calc(100vh - 1.5rem)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        }}
      >
        
        {/* Left Pane - Image Slider with Badge and Quote (1/3 width); hidden on mobile */}
        <div className="hidden lg:flex relative w-full lg:w-1/3 h-64 lg:h-auto bg-gradient-to-br from-[#8F9E4F] to-[#6F7A5A] flex-col p-6 overflow-hidden">
          {/* Background Image Slider - автоматический слайдер из обложек премиум-мест */}
          {premiumPlaces.length > 0 ? (
            <div className="absolute inset-0">
              {premiumPlaces.map((place, index) => (
                <div
                  key={place.id}
                  className={`absolute inset-0 transition-opacity duration-1000 ${
                    index === currentImageIndex ? 'opacity-100 z-0' : 'opacity-0 z-0'
                  }`}
                >
                  {place.cover_url && (
                    <img
                      src={place.cover_url}
                      alt="Premium place"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Hide broken images
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Fallback gradient if no premium places loaded
            <div className="absolute inset-0 bg-gradient-to-br from-[#8F9E4F] to-[#6F7A5A]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-[#8F9E4F]/40 to-[#6F7A5A]/40 z-0" />
          {/* Brand gradient from bottom for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1F2A1F]/80 via-[#1F2A1F]/40 to-transparent z-[1]" />
          
          {/* Top Row - Premium Badge and Slider Indicators */}
          <div className="relative z-10 flex items-center justify-between">
            {/* Premium Badge - Left */}
            <div className="flex items-center">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D6B25E] text-white text-xs font-semibold badge-shadow">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>Premium</span>
              </div>
            </div>
            
            {/* Slider Indicators - Right, aligned vertically with Premium badge */}
            {premiumPlaces.length > 1 && (
              <div className="flex items-center gap-1.5">
                {premiumPlaces.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`h-1.5 rounded-full transition-all ${
                      index === currentImageIndex
                        ? 'w-6 bg-white'
                        : 'w-1.5 bg-white/40 hover:bg-white/60'
                    }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Quote - Bottom Left */}
          <div className="relative z-20 mt-auto">
            <p className="text-sm italic font-serif leading-relaxed mb-2 text-white drop-shadow-lg" style={{ color: '#ffffff' }}>
              "The real voyage of discovery consists not in seeking new landscapes, but in having new eyes."
            </p>
            <p className="text-xs font-medium text-white drop-shadow-lg" style={{ color: '#ffffff' }}>— MARCEL PROUST</p>
          </div>

        </div>

        {/* Right Pane - Content (2/3 width), no scroll */}
        <div className="w-full lg:w-2/3 flex flex-col relative max-h-[85vh] min-h-0">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full hover:bg-[#FAFAF7] transition-colors z-10"
            aria-label="Close modal"
          >
            <Icon name="close" size={20} className="text-[#6F7A5A]" />
          </button>

          {/* Content without scroll */}
          <div 
            className="flex-1 overflow-hidden flex flex-col p-8 pb-0 lg:pb-8 min-h-0"
            style={{ 
              paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024 
                ? 'env(safe-area-inset-bottom, 0px)' 
                : undefined 
            }}
          >
            <div className="space-y-6 pr-4 pb-24 lg:pb-0 min-h-0">
            {/* Title */}
            {content.title && (
              <h2 className="text-3xl lg:text-4xl font-semibold font-fraunces text-[#1F2A1F]">
                {renderTitle()}
              </h2>
            )}

            {/* Premium badge - mobile only, under title */}
            <div className="lg:hidden">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D6B25E] text-white text-xs font-semibold badge-shadow">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>Premium</span>
              </div>
            </div>

            {/* Subtitle */}
            {content.subtitle && (
              <p className="text-base text-[#6F7A5A] leading-relaxed">
                {content.subtitle}
              </p>
            )}

            {/* Benefits */}
            <div className="space-y-5">
              {content.benefit1Title && (
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    {/* Diamond/Star icon for Premium-only places */}
                    <Icon name="star" size={24} className="text-[#6F7A5A]" filled />
                  </div>
                  <div>
                    <div className="font-semibold text-[#1F2A1F] text-base mb-1">
                      {content.benefit1Title}
                    </div>
                    {content.benefit1Desc && (
                      <div className="text-sm text-[#6F7A5A] leading-relaxed">
                        {content.benefit1Desc}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {content.benefit2Title && (
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    {/* Leaf/Collection icon for Curated Collections */}
                    <Icon name="location" size={24} className="text-[#6F7A5A]" />
                  </div>
                  <div>
                    <div className="font-semibold text-[#1F2A1F] text-base mb-1">
                      {content.benefit2Title}
                    </div>
                    {content.benefit2Desc && (
                      <div className="text-sm text-[#6F7A5A] leading-relaxed">
                        {content.benefit2Desc}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Social Proof */}
            {content.socialProof && (
              <div className="text-sm text-[#8F9E4F] italic font-serif">
                {content.socialProof}
              </div>
            )}

            {/* Price Section */}
            <div className="rounded-2xl bg-[#FAFAF7] border border-[#ECEEE4] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    {content.price && (
                      <span className="text-4xl font-semibold text-[#1F2A1F]">
                        {content.price}
                      </span>
                    )}
                    {content.pricePeriod && (
                      <span className="text-base text-[#6F7A5A]">
                        {content.pricePeriod}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {content.priceRightTitle && (
                    <div className="font-semibold text-[#1F2A1F] text-base">
                      {content.priceRightTitle}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            {(content.footerText || content.footerLinkText) && (
              <div className="text-center text-xs text-[#6F7A5A] leading-relaxed">
                {content.footerText && <span>{content.footerText} </span>}
                {content.footerLinkText && content.footerLinkUrl && (
                  <Link
                    href={content.footerLinkUrl}
                    className="underline hover:text-[#1F2A1F]"
                  >
                    {content.footerLinkText}
                  </Link>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Fixed Buttons at Bottom - 32px from bottom */}
          <div 
            className="sticky bottom-0 bg-white border-t border-[#ECEEE4] px-4 pt-4 pb-8 lg:border-0 lg:bg-transparent lg:p-0 lg:px-8 lg:pb-8 lg:static"
            style={{ 
              paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024 
                ? `max(32px, env(safe-area-inset-bottom, 0px))` 
                : undefined 
            }}
          >
            {/* Checkout Error */}
            {checkoutError && (
              <div className="mb-3 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm text-center">
                {checkoutError}
              </div>
            )}

            {/* Primary Button — Stripe Checkout */}
            <div className="mb-3 lg:mb-0">
              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="w-full px-6 py-4 rounded-xl bg-[#8F9E4F] text-white font-semibold text-base hover:bg-[#7A8A42] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label="Get Premium access"
                tabIndex={0}
              >
                {checkoutLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Переход к оплате...</span>
                  </>
                ) : (
                  <span>{content.primaryButtonText || "Получить Premium"}</span>
                )}
              </button>
            </div>

            {/* Secondary Button */}
            {content.secondaryButtonText && (
              <button
                onClick={onClose}
                className="w-full px-6 py-3 rounded-xl border-0 bg-transparent text-[#6F7A5A] font-medium text-sm hover:text-[#1F2A1F] transition-colors"
              >
                {content.secondaryButtonText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render modal at document body level, ensuring it's above all content
  if (typeof window === 'undefined') return null;
  
  return createPortal(modalContent, document.body);
}

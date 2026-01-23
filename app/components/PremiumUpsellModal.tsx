"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { startPremiumCheckout } from "../lib/premium";
import PremiumBadge from "./PremiumBadge";
import { supabase } from "../lib/supabase";
import { isPlacePremium } from "../lib/access";
import { usePremiumModalSettings } from "../hooks/usePremiumModalSettings";

type PremiumUpsellModalContent = {
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
  context?: "place" | "collection";
  placeTitle?: string;
  collectionTitle?: string;
  customContent?: PremiumUpsellModalContent;
};

/**
 * Premium upsell modal component
 * Appears when non-premium users try to access premium content
 * Two-panel design: image on left, content on right
 */
export default function PremiumUpsellModal({
  open,
  onClose,
  context = "place",
  placeTitle,
  collectionTitle,
  customContent,
}: PremiumUpsellModalProps) {
  // Load saved settings from database
  const { settings: savedSettings } = usePremiumModalSettings();

  // Default content (fallback if settings not loaded)
  const defaultContent: Required<PremiumUpsellModalContent> = {
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

  // Merge: saved settings (from DB) -> defaults -> custom content (props override)
  const content = { ...defaultContent, ...savedSettings, ...customContent };
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [premiumCovers, setPremiumCovers] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const slideIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!open) return;

    // Store the previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the modal
    const modal = modalRef.current;
    if (modal) {
      const firstFocusable = modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      firstFocusable?.focus();
    }

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Handle focus trap
    const handleTab = (e: KeyboardEvent) => {
      if (!modal) return;

      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleTab);

    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
      document.body.style.overflow = "";
      // Restore focus to previous element
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  // Handle click outside
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Load premium places covers
  useEffect(() => {
    if (!open) return;

    let isUnmounting = false;

    (async () => {
      try {
        // Query places with cover_url and access_level
        // Filter client-side to get premium places
        const query = supabase
          .from("places")
          .select("cover_url, access_level, visibility")
          .not("cover_url", "is", null)
          .limit(20);

        // Try to filter by access_level if possible
        // Use OR condition to catch all premium indicators
        const { data, error } = await query;

        if (error) {
          // Silently handle AbortError
          if (error.message?.includes('abort') || error.name === 'AbortError') {
            return;
          }
          
          // Check if error has meaningful content before logging
          const errorMessage = error.message;
          const errorCode = error.code;
          const errorDetails = error.details;
          const errorHint = error.hint;
          
          // Only log if there's actual error content (not empty object)
          if (errorMessage || errorCode || errorDetails || errorHint) {
            // Log only meaningful errors
            if (errorMessage || errorCode) {
              console.error("Error loading premium covers:", errorMessage || errorCode);
            }
          }
          // If error is empty object, silently handle it
          
          // Set empty array on error to show fallback (silently)
          if (!isUnmounting) {
            setPremiumCovers([]);
          }
          return;
        }

        if (isUnmounting) return;

        // Filter to only premium places and extract cover URLs
        const covers = (data || [])
          .filter((place) => {
            try {
              return isPlacePremium(place);
            } catch (e) {
              return false;
            }
          })
          .map((place) => place.cover_url)
          .filter((url): url is string => typeof url === "string" && url.length > 0)
          .slice(0, 8); // Limit to 8 covers

        if (!isUnmounting) {
          setPremiumCovers(covers);
          setCurrentSlideIndex(0);
        }
      } catch (err) {
        // Silently ignore AbortError
        if (err instanceof Error && (err.name === 'AbortError' || err.message?.includes('abort'))) {
          return;
        }
        
        console.error("Exception loading premium covers:", err instanceof Error ? err.message : String(err));
        
        // Set empty array on exception to show fallback
        if (!isUnmounting) {
          setPremiumCovers([]);
        }
      }
    })();

    return () => {
      isUnmounting = true;
    };
  }, [open]);

  // Auto-advance slides
  useEffect(() => {
    if (!open || premiumCovers.length <= 1) {
      if (slideIntervalRef.current) {
        clearInterval(slideIntervalRef.current);
        slideIntervalRef.current = null;
      }
      return;
    }

    slideIntervalRef.current = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % premiumCovers.length);
    }, 4000); // Change slide every 4 seconds

    return () => {
      if (slideIntervalRef.current) {
        clearInterval(slideIntervalRef.current);
        slideIntervalRef.current = null;
      }
    };
  }, [open, premiumCovers.length]);

  // Handle Stripe checkout
  const handleStartCheckout = async () => {
    if (content.primaryButtonLink) {
      window.location.href = content.primaryButtonLink;
    } else {
      await startPremiumCheckout();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end min-[900px]:items-center justify-center p-0 min-[900px]:p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-modal-title"
      aria-describedby="premium-modal-description"
    >
      {/* Mobile: Bottom sheet | Desktop: Two-panel modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-[900px] bg-white rounded-t-3xl min-[900px]:rounded-2xl shadow-lg overflow-hidden max-h-[90vh] min-[900px]:max-h-[85vh] overflow-y-auto safe-area-bottom min-[900px]:flex"
        style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Panel - Image Slider */}
        <div className="relative w-full min-[900px]:w-1/2 h-64 min-[900px]:h-auto bg-gradient-to-br from-[#8F9E4F] to-[#556036] overflow-hidden">
          {/* Slider Container */}
          <div className="relative w-full h-full">
            {premiumCovers.length > 0 ? (
              premiumCovers.map((coverUrl, index) => (
                <div
                  key={index}
                  className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${
                    index === currentSlideIndex ? "opacity-100 z-0" : "opacity-0 z-0"
                  }`}
                  style={{
                    backgroundImage: `url('${coverUrl}')`,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[#6b7d47]/80 via-[#8F9E4F]/70 to-[#556036]/80"></div>
                </div>
              ))
            ) : (
              // Fallback gradient when no covers loaded
              <div className="absolute inset-0 bg-gradient-to-br from-[#6b7d47] via-[#8F9E4F] to-[#556036]"></div>
            )}
          </div>
          
          {/* Premium Badge */}
          <div className="absolute top-4 left-4 z-20 flex items-center h-6">
            <PremiumBadge />
          </div>

          {/* Slide Indicators - Top Right, aligned with Premium Badge */}
          {premiumCovers.length > 1 && (
            <div className="absolute top-4 right-4 z-20 flex gap-2 items-center h-6">
              {premiumCovers.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setCurrentSlideIndex(index);
                    // Reset auto-advance timer
                    if (slideIntervalRef.current) {
                      clearInterval(slideIntervalRef.current);
                    }
                    slideIntervalRef.current = setInterval(() => {
                      setCurrentSlideIndex((prev) => (prev + 1) % premiumCovers.length);
                    }, 4000);
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentSlideIndex
                      ? "w-6 bg-white"
                      : "w-1.5 bg-white/60 hover:bg-white/80"
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          )}

          {/* Quote Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 min-[900px]:p-8 bg-gradient-to-t from-black/90 via-black/70 to-transparent z-10">
            <p className="text-white !text-white text-base min-[900px]:text-lg italic leading-relaxed mb-2 drop-shadow-lg font-medium" style={{ color: '#ffffff' }}>
              "The real voyage of discovery consists not in seeking new landscapes, but in having new eyes."
            </p>
            <p className="text-white !text-white text-sm font-semibold drop-shadow-lg" style={{ color: '#ffffff' }}>
              — MARCEL PROUST
            </p>
          </div>
        </div>

        {/* Right Panel - Content */}
        <div className="relative w-full min-[900px]:w-1/2 flex flex-col">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 rounded-full flex items-center justify-center text-[#A8B096] hover:bg-[#FAFAF7] hover:text-[#8F9E4F] transition-colors z-10"
            aria-label="Close modal"
          >
            <Icon name="close" size={20} />
          </button>

          {/* Content */}
          <div className="p-6 min-[900px]:p-8 pb-8 min-[900px]:pb-8 flex-1 flex flex-col">
            {/* Header */}
            <div className="mb-6">
              <h2
                id="premium-modal-title"
                className="font-fraunces text-2xl min-[900px]:text-3xl font-semibold text-[#1F2A1F] mb-2"
              >
                {(() => {
                  const parts = content.title.split(content.titleHighlight);
                  const result = [];
                  for (let i = 0; i < parts.length; i++) {
                    if (parts[i]) {
                      result.push(<span key={`text-${i}`}>{parts[i]}</span>);
                    }
                    if (i < parts.length - 1) {
                      result.push(<span key={`highlight-${i}`} className="text-[#8F9E4F]">{content.titleHighlight}</span>);
                    }
                  }
                  return result;
                })()}
              </h2>
              <p
                id="premium-modal-description"
                className="text-base text-[#6F7A5A] leading-relaxed"
              >
                {content.subtitle}
              </p>
            </div>

            {/* Benefits list */}
            <div className="mb-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#ECEEE4] flex items-center justify-center">
                  <Icon name="check" size={16} className="text-[#8F9E4F]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2A1F] mb-0.5">
                    {content.benefit1Title}
                  </p>
                  <p className="text-sm text-[#6F7A5A] leading-relaxed">
                    {content.benefit1Desc}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#ECEEE4] flex items-center justify-center">
                  <Icon name="check" size={16} className="text-[#8F9E4F]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2A1F] mb-0.5">
                    {content.benefit2Title}
                  </p>
                  <p className="text-sm text-[#6F7A5A] leading-relaxed">
                    {content.benefit2Desc}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#ECEEE4] flex items-center justify-center">
                  <Icon name="check" size={16} className="text-[#8F9E4F]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2A1F] mb-0.5">
                    {content.benefit3Title}
                  </p>
                  <p className="text-sm text-[#6F7A5A] leading-relaxed">
                    {content.benefit3Desc}
                  </p>
                </div>
              </div>
            </div>

            {/* Social proof */}
            <p className="text-sm text-[#6F7A5A] italic mb-6 text-center">
              {content.socialProof}
            </p>

            {/* Price block */}
            <div className="mb-6 p-5 rounded-xl bg-[#FAFAF7] border border-[#ECEEE4]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-1">
                    <span className="font-fraunces text-3xl font-semibold text-[#8F9E4F]">{content.price}</span>
                    <span className="text-base text-[#6F7A5A] ml-1">{content.pricePeriod}</span>
                  </div>
                  <p className="text-xs text-[#A8B096]">
                    {content.priceSubtext}
                  </p>
                </div>
                <div className="h-12 w-px bg-[#ECEEE4]"></div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#1F2A1F] mb-0.5">
                    {content.priceRightTitle}
                  </p>
                  <p className="text-xs text-[#6F7A5A]">
                    {content.priceRightDesc}
                  </p>
                </div>
              </div>
            </div>

            {/* CTA buttons */}
            <div className="space-y-3 mt-auto">
              <div className="relative group">
                <button
                  onClick={handleStartCheckout}
                  disabled={!content.primaryButtonLink}
                  className={`w-full py-3.5 px-4 rounded-xl bg-gradient-to-b from-[#8F9E4F] to-[#556036] text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                    content.primaryButtonLink 
                      ? "hover:brightness-110 active:brightness-90" 
                      : "opacity-60 cursor-not-allowed"
                  }`}
                  aria-label={content.primaryButtonLink ? content.primaryButtonText : "Coming soon - Stripe checkout is coming soon"}
                >
                  <span>{content.primaryButtonText}</span>
                  {!content.primaryButtonLink && (
                    <div className="relative">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4" strokeLinecap="round" />
                        <path d="M12 16h.01" strokeLinecap="round" />
                      </svg>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#1F2A1F] text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                        Stripe checkout is coming soon
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1F2A1F]"></div>
                      </div>
                    </div>
                  )}
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 px-4 rounded-xl border-0 bg-transparent text-[#6F7A5A] font-medium text-sm hover:text-[#1F2A1F] transition-colors"
              >
                {content.secondaryButtonText}
              </button>
            </div>

            {/* Footer note */}
            <p className="mt-4 text-xs text-[#A8B096] text-center">
              {content.footerText}{" "}
              {content.footerLinkText && (
                <a 
                  href={content.footerLinkUrl} 
                  className="underline hover:text-[#6F7A5A] transition-colors"
                  onClick={(e) => {
                    if (content.footerLinkUrl === "#") {
                      e.preventDefault();
                    }
                  }}
                >
                  {content.footerLinkText}
                </a>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

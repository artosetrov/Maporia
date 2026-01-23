"use client";

import { usePremiumModalSettings } from "../hooks/usePremiumModalSettings";
import Icon from "./Icon";
import Link from "next/link";
import PremiumBadge from "./PremiumBadge";

type PremiumUpsellModalProps = {
  open: boolean;
  onClose: () => void;
  customContent?: {
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
  context?: "place" | "collection";
  placeTitle?: string;
};

export default function PremiumUpsellModal({
  open,
  onClose,
  customContent,
  context = "place",
  placeTitle,
}: PremiumUpsellModalProps) {
  const { settings, loading } = usePremiumModalSettings();

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white border border-[#ECEEE4] p-8 relative max-h-[90vh] overflow-y-auto"
           style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-[#FAFAF7] transition-colors"
          aria-label="Close modal"
        >
          <Icon name="close" size={20} className="text-[#6F7A5A]" />
        </button>

        {/* Content */}
        <div className="space-y-6">
          {/* Premium Badge */}
          <div className="flex justify-center">
            <PremiumBadge />
          </div>

          {/* Title */}
          {content.title && (
            <h2 className="text-2xl font-semibold text-[#1F2A1F] text-center">
              {renderTitle()}
            </h2>
          )}

          {/* Subtitle */}
          {content.subtitle && (
            <p className="text-sm text-[#6F7A5A] text-center">
              {content.subtitle}
            </p>
          )}

          {/* Benefits */}
          <div className="space-y-4">
            {content.benefit1Title && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#D6B25E] flex items-center justify-center">
                  <Icon name="check" size={16} className="text-white" />
                </div>
                <div>
                  <div className="font-semibold text-[#1F2A1F] text-sm">
                    {content.benefit1Title}
                  </div>
                  {content.benefit1Desc && (
                    <div className="text-xs text-[#6F7A5A] mt-0.5">
                      {content.benefit1Desc}
                    </div>
                  )}
                </div>
              </div>
            )}

            {content.benefit2Title && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#D6B25E] flex items-center justify-center">
                  <Icon name="check" size={16} className="text-white" />
                </div>
                <div>
                  <div className="font-semibold text-[#1F2A1F] text-sm">
                    {content.benefit2Title}
                  </div>
                  {content.benefit2Desc && (
                    <div className="text-xs text-[#6F7A5A] mt-0.5">
                      {content.benefit2Desc}
                    </div>
                  )}
                </div>
              </div>
            )}

            {content.benefit3Title && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#D6B25E] flex items-center justify-center">
                  <Icon name="check" size={16} className="text-white" />
                </div>
                <div>
                  <div className="font-semibold text-[#1F2A1F] text-sm">
                    {content.benefit3Title}
                  </div>
                  {content.benefit3Desc && (
                    <div className="text-xs text-[#6F7A5A] mt-0.5">
                      {content.benefit3Desc}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Social Proof */}
          {content.socialProof && (
            <div className="text-center text-xs text-[#6F7A5A] italic">
              {content.socialProof}
            </div>
          )}

          {/* Price Section */}
          <div className="rounded-xl border-2 border-[#D6B25E] bg-[#FAFAF7] p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-baseline gap-1">
                  {content.price && (
                    <span className="text-3xl font-semibold text-[#1F2A1F]">
                      {content.price}
                    </span>
                  )}
                  {content.pricePeriod && (
                    <span className="text-sm text-[#6F7A5A]">
                      {content.pricePeriod}
                    </span>
                  )}
                </div>
                {content.priceSubtext && (
                  <div className="text-xs text-[#6F7A5A] mt-1">
                    {content.priceSubtext}
                  </div>
                )}
              </div>
              <div className="text-right">
                {content.priceRightTitle && (
                  <div className="font-semibold text-[#1F2A1F] text-sm">
                    {content.priceRightTitle}
                  </div>
                )}
                {content.priceRightDesc && (
                  <div className="text-xs text-[#6F7A5A] mt-0.5">
                    {content.priceRightDesc}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Primary Button */}
          {content.primaryButtonText && (
            <div>
              {content.primaryButtonLink ? (
                <Link
                  href={content.primaryButtonLink}
                  className="w-full px-6 py-3 rounded-xl bg-[#8F9E4F] text-white font-semibold text-sm hover:brightness-110 transition-colors text-center block"
                >
                  {content.primaryButtonText}
                </Link>
              ) : (
                <button
                  onClick={onClose}
                  className="w-full px-6 py-3 rounded-xl bg-[#8F9E4F] text-white font-semibold text-sm hover:brightness-110 transition-colors"
                >
                  {content.primaryButtonText}
                </button>
              )}
            </div>
          )}

          {/* Secondary Button */}
          {content.secondaryButtonText && (
            <button
              onClick={onClose}
              className="w-full px-6 py-3 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] font-medium text-sm hover:bg-[#FAFAF7] transition-colors"
            >
              {content.secondaryButtonText}
            </button>
          )}

          {/* Footer */}
          {(content.footerText || content.footerLinkText) && (
            <div className="text-center text-xs text-[#6F7A5A]">
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
    </div>
  );
}

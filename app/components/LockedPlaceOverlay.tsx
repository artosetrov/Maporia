"use client";

import Link from "next/link";
import PremiumBadge from "./PremiumBadge";

type LockedPlaceOverlayProps = {
  placeTitle?: string;
  coverUrl?: string | null;
  onUpgradeClick?: () => void;
};

/**
 * Overlay shown when a premium place is locked for non-premium users
 */
export default function LockedPlaceOverlay({ placeTitle, coverUrl, onUpgradeClick }: LockedPlaceOverlayProps) {
  return (
    <div className="absolute inset-0 rounded-2xl overflow-hidden bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-30">
      {/* Blurred cover image in background */}
      {coverUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 blur-md scale-110"
          style={{ backgroundImage: `url(${coverUrl})` }}
        />
      )}
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <PremiumBadge />
        
        <div className="text-white">
          <h3 className="text-lg font-semibold mb-2">
            {placeTitle ? `${placeTitle} is Premium` : "Premium Place"}
          </h3>
          <p className="text-sm text-white/90 mb-4">
            Upgrade to Premium to unlock exclusive places
          </p>
        </div>
        
        {onUpgradeClick ? (
          <button
            onClick={onUpgradeClick}
            className="px-6 py-3 rounded-xl bg-white text-[#1F2A1F] font-semibold text-sm hover:bg-[#FAFAF7] transition active:scale-[0.98]"
          >
            Go Premium
          </button>
        ) : (
          <Link
            href="/premium"
            className="px-6 py-3 rounded-xl bg-white text-[#1F2A1F] font-semibold text-sm hover:bg-[#FAFAF7] transition active:scale-[0.98] inline-block"
          >
            Go Premium
          </Link>
        )}
      </div>
    </div>
  );
}

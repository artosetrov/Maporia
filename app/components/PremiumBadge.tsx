"use client";

/**
 * Premium badge component - displays ⭐ Premium indicator
 */
export default function PremiumBadge({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-[#D6B25E] to-[#C96A5B] text-white text-xs font-semibold badge-shadow ${className}`}>
      <span>⭐</span>
      <span>Premium</span>
    </div>
  );
}

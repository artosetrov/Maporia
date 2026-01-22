"use client";

/**
 * Premium badge component - displays Premium indicator in brand style
 */
export default function PremiumBadge({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D6B25E] text-white text-xs font-semibold badge-shadow ${className}`}>
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      <span>Premium</span>
    </div>
  );
}

"use client";

/**
 * Premium badge — звезда + подпись (на <sm только звезда, если showText).
 * @param showText — false: только иконка на всех ширинах (узкие карточки).
 */
export default function PremiumBadge({ className = "", showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div
      role="img"
      aria-label="Premium"
      className={[
        "inline-flex items-center justify-center rounded-full bg-[#D6B25E] py-1 text-xs font-semibold text-white badge-shadow",
        showText ? "gap-0 px-1.5 sm:gap-1.5 sm:px-2.5" : "gap-0 px-1.5",
        className,
      ].join(" ")}
    >
      <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      {showText ? (
        <span className="hidden sm:inline">Premium</span>
      ) : null}
    </div>
  );
}

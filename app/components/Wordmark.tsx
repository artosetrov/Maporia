"use client";

import Link from "next/link";

type WordmarkProps = {
  /**
   * Show the ® symbol (only for marketing/brand contexts, not in product UI)
   * @default false
   */
  showRegistered?: boolean;
  /**
   * Inverted color scheme (white text on brand green background)
   * @default false
   */
  inverted?: boolean;
  /**
   * Icon + wordmark lockup (for desktop/marketing)
   * @default false
   */
  withIcon?: boolean;
  /**
   * Size variant
   * @default "default"
   */
  size?: "small" | "default" | "large";
  /**
   * Link href (if provided, wordmark becomes a link)
   */
  href?: string;
  /**
   * Custom className
   */
  className?: string;
};

/**
 * Maporia® Wordmark Component
 * 
 * Brand Guidelines:
 * - Font: Manrope, SemiBold (600)
 * - Letter-spacing: -0.02em
 * - Case: Title Case — "Maporia"
 * - Color: Maporia Brand Green (#8F9E4F) or White (inverted)
 * - ® symbol: Only in marketing contexts, ~60% of x-height, top-right with optical offset
 * - Small sizes (<120px): use icon-only
 */
export default function Wordmark({
  showRegistered = false,
  inverted = false,
  withIcon = false,
  size = "default",
  href,
  className = "",
}: WordmarkProps) {
  const textColor = inverted ? "text-white" : "text-[#8F9E4F]";
  
  const sizeClasses = {
    small: "text-base",
    default: "text-lg",
    large: "text-xl",
  };

  const registeredSymbol = showRegistered ? (
    <span className="text-[0.6em] leading-none" style={{ marginLeft: "0.05em", verticalAlign: "0.15em" }}>
      ®
    </span>
  ) : null;

  // If className contains a text-* class, don't apply sizeClasses
  const hasTextSizeInClassName = className.match(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/);
  const sizeClass = hasTextSizeInClassName ? "" : sizeClasses[size];
  
  const wordmarkContent = (
    <span
      className={`font-manrope font-extrabold ${textColor} ${sizeClass} ${className}`}
      style={{ letterSpacing: "-0.02em" }}
    >
      Maporia{registeredSymbol}
    </span>
  );

  const iconContent = withIcon ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      fill="none"
      className={`${inverted ? "text-white" : "text-[#8F9E4F]"} ${size === "small" ? "h-4 w-4" : size === "large" ? "h-6 w-6" : "h-5 w-5"}`}
    >
      <g fill="currentColor" fillRule="evenodd" clipRule="evenodd">
        <path d="M512 132C391 132 292 231 292 352C292 442 346 516 420 570C458 598 476 636 493 674L512 716L531 674C548 636 566 598 604 570C678 516 732 442 732 352C732 231 633 132 512 132ZM512 232C595 232 662 299 662 382C662 465 595 532 512 532C429 532 362 465 362 382C362 299 429 232 512 232Z" />
        <path d="M232 604C232 574 256 550 286 550L338 550C358 550 376 560 388 576L512 740L636 576C648 560 666 550 686 550L738 550C768 550 792 574 792 604L792 836C792 866 768 890 738 890L706 890C676 890 652 866 652 836L652 702L552 834C542 848 527 856 512 856C497 856 482 848 472 834L372 702L372 836C372 866 348 890 318 890L286 890C256 890 232 866 232 836Z" />
      </g>
    </svg>
  ) : null;

  const content = (
    <div className={`flex items-center gap-2 ${href ? "cursor-pointer" : ""}`}>
      {iconContent}
      {wordmarkContent}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block">
        {content}
      </Link>
    );
  }

  return <div className="inline-block">{content}</div>;
}

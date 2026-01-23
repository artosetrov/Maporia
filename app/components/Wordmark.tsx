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
    <img
      src="/Pin.svg"
      alt="Maporia Pin"
      className={`${size === "small" ? "h-4 w-4" : size === "large" ? "h-6 w-6" : "h-5 w-5"}`}
      style={{
        filter: inverted ? 'brightness(0) invert(1)' : undefined,
      }}
    />
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

"use client";

/**
 * Error/404 illustration in Maporia brand style.
 * Reusable graphic: map pin + central badge (! or status code), compass hint, soft palette.
 */

const BRAND = {
  olive: "#8F9E4F",
  oliveDark: "#7A8A3F",
  sage: "#C9D2A3",
  sageLight: "rgba(201, 210, 163, 0.25)",
  warmWhite: "#FAFAF7",
  error: "#C96A5B",
  textPrimary: "#1F2A1F",
} as const;

interface ErrorIllustrationProps {
  /** "error" shows "!", "404" shows "404", number shows that code */
  variant?: "error" | "404" | number;
  /** Size in px (width/height of SVG) */
  size?: number;
  className?: string;
}

export default function ErrorIllustration({
  variant = "error",
  size = 220,
  className = "",
}: ErrorIllustrationProps) {
  const badgeText = variant === "error" ? "!" : variant === "404" ? "404" : String(variant);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 220 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Outer glow / background */}
      <circle cx="110" cy="110" r="102" fill={BRAND.sageLight} />
      <circle cx="110" cy="110" r="88" fill="none" stroke={BRAND.sage} strokeWidth="1" strokeOpacity="0.5" />

      {/* Compass ticks (N E S W) — subtle map vibe */}
      <g stroke={BRAND.sage} strokeWidth="1.5" strokeOpacity="0.4">
        <line x1="110" y1="28" x2="110" y2="38" strokeLinecap="round" />
        <line x1="182" y1="110" x2="172" y2="110" strokeLinecap="round" />
        <line x1="110" y1="192" x2="110" y2="182" strokeLinecap="round" />
        <line x1="38" y1="110" x2="48" y2="110" strokeLinecap="round" />
      </g>

      {/* Decorative corner dots (brand soft-sage) */}
      <circle cx="52" cy="52" r="8" fill={BRAND.sage} fillOpacity="0.45" />
      <circle cx="168" cy="52" r="6" fill={BRAND.sage} fillOpacity="0.45" />
      <circle cx="52" cy="168" r="6" fill={BRAND.sage} fillOpacity="0.45" />
      <circle cx="168" cy="168" r="8" fill={BRAND.sage} fillOpacity="0.45" />

      {/* Main pin group (centered) */}
      <g transform="translate(110, 110)">
        {/* Pin shadow */}
        <ellipse cx="0" cy="48" rx="28" ry="10" fill={BRAND.olive} fillOpacity="0.15" />

        {/* Teardrop pin body (brand-style) */}
        <path
          d="M 0 -52
             C -22 8, -26 28, -18 42
             C -10 54, 0 58, 0 58
             C 0 58, 10 54, 18 42
             C 26 28, 22 8, 0 -52 Z"
          fill={BRAND.olive}
          stroke={BRAND.oliveDark}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Inner circle (badge background) */}
        <circle cx="0" cy="-8" r="22" fill={BRAND.warmWhite} stroke={BRAND.olive} strokeWidth="2" />

        {/* Badge content: ! or 404 / status code */}
        <text
          x="0"
          y={variant === "error" ? "-4" : "-5"}
          textAnchor="middle"
          fontSize={variant === "error" ? 28 : badgeText.length > 2 ? 11 : 14}
          fontWeight="700"
          fill={BRAND.error}
          fontFamily="var(--font-fraunces), Georgia, serif"
        >
          {badgeText}
        </text>
      </g>
    </svg>
  );
}

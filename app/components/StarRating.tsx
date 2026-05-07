"use client";

/**
 * StarRating — звёздочки 1–5 в брендовых токенах.
 *
 *   <StarRating value={4.5} />                 // read-only, показывает 4.5★
 *   <StarRating value={rating} onChange={…} />  // interactive, для формы review
 *
 * Цвет — Premium gold (#D6B25E) из brand-guide. Размер настраивается через size.
 */

import { useState } from "react";

type StarRatingProps = {
  value: number; // 0–5, можно дробное (для read-only avg)
  onChange?: (next: number) => void;
  size?: number; // px
  className?: string;
  ariaLabel?: string;
};

export default function StarRating({
  value,
  onChange,
  size = 18,
  className = "",
  ariaLabel,
}: StarRatingProps) {
  const interactive = typeof onChange === "function";
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role={interactive ? "radiogroup" : "img"}
      aria-label={ariaLabel || `Rating: ${value.toFixed(1)} of 5`}
      onMouseLeave={interactive ? () => setHover(null) : undefined}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        // % заполнения этой конкретной звезды (для дробных значений в read-only)
        const fill = Math.max(0, Math.min(1, display - (i - 1)));
        return (
          <Star
            key={i}
            index={i}
            fill={fill}
            size={size}
            interactive={interactive}
            onClick={interactive ? () => onChange!(i) : undefined}
            onMouseEnter={interactive ? () => setHover(i) : undefined}
          />
        );
      })}
    </div>
  );
}

function Star({
  index,
  fill,
  size,
  interactive,
  onClick,
  onMouseEnter,
}: {
  index: number;
  fill: number; // 0..1
  size: number;
  interactive: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  const id = `star-clip-${index}-${Math.random().toString(36).slice(2, 7)}`;
  const path =
    "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
  const Tag = interactive ? "button" : "span";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      aria-label={interactive ? `${index} star${index > 1 ? "s" : ""}` : undefined}
      className={
        "inline-flex items-center justify-center " +
        (interactive
          ? "cursor-pointer hover:scale-110 transition-transform p-0.5"
          : "")
      }
      style={{ width: size + (interactive ? 4 : 0), height: size + (interactive ? 4 : 0) }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <defs>
          <clipPath id={id}>
            <rect x="0" y="0" width={24 * fill} height="24" />
          </clipPath>
        </defs>
        {/* Empty star (background) */}
        <path d={path} fill="#ECEEE4" />
        {/* Filled portion clipped */}
        <path d={path} fill="#D6B25E" clipPath={`url(#${id})`} />
      </svg>
    </Tag>
  );
}

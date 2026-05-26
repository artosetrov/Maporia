"use client";

import type { MouseEvent } from "react";

type PhotoPaginationDotsProps = {
  total: number;
  currentIndex: number;
  onDotClick: (index: number, event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
};

function getVisibleDotIndices(total: number, currentIndex: number): number[] {
  const maxDots = 5;
  if (total <= maxDots) {
    return Array.from({ length: total }, (_, index) => index);
  }

  const start = Math.min(Math.max(currentIndex - 2, 0), total - maxDots);
  return Array.from({ length: maxDots }, (_, index) => start + index);
}

export default function PhotoPaginationDots({
  total,
  currentIndex,
  onDotClick,
  className = "",
}: PhotoPaginationDotsProps) {
  if (total <= 1) return null;

  const visibleDots = getVisibleDotIndices(total, currentIndex);

  return (
    <div
      className={`absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center justify-center gap-1 rounded-full bg-[#1F2A1F]/35 px-2 py-1 shadow-[0_2px_10px_rgba(31,42,31,0.18)] backdrop-blur-[2px] ${className}`}
      aria-label={`Photo ${currentIndex + 1} of ${total}`}
    >
      {visibleDots.map((index) => {
        const isActive = index === currentIndex;

        return (
          <button
            key={index}
            onClick={(event) => onDotClick(index, event)}
            className="group flex h-3.5 w-3.5 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1F2A1F]/50"
            aria-label={`Go to photo ${index + 1}`}
            aria-current={isActive ? "true" : undefined}
          >
            <span
              className={`h-1.5 rounded-full transition-all duration-200 ${
                isActive
                  ? "w-4 bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.25)]"
                  : "w-1.5 bg-white/65 group-hover:bg-white/90"
              }`}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

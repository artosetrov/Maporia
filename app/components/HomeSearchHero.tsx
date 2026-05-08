"use client";

import { useState } from "react";
import Icon from "./Icon";

/**
 * HomeSearchHero (v2) — REAL search input. NOT a trigger.
 *
 * v1 was a 3-zone trigger that opened SearchModal. v2 is a Dribbble-style
 * pill with a real `<input>`: the user types, hits Enter (or clicks the
 * green search button) and we call onSubmit(query). Page.tsx uses the
 * same `handleSearchChange` it already uses — that means the URL
 * contract `router.push("/map?q=…&city=…&categories=…")` is unchanged.
 *
 * Filters icon stays inside the pill (small button before the magnifier),
 * because keeping it adjacent to search is the cheapest way to preserve
 * "search + refine" as one mental unit.
 *
 * Why ONE component for both desktop and mobile (unlike v1):
 * the new layout is identical on both viewports — pill with input + two
 * icon buttons. Only the size changes, controlled via Tailwind responsive
 * utilities. One component, one source of truth, no hydration risk.
 *
 * iOS zoom-on-focus prevention: input font-size is 16px (matches iOS
 * Safari's threshold below which the page auto-zooms).
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phases D + G).
 */

type Props = {
  /** Initial query value (e.g. when arriving from /?q=cafe). */
  initialQuery?: string;
  /** Submit (Enter or magnifier click). Page wires this to handleSearchChange. */
  onSubmit: (query: string) => void;
  /** Open FiltersModal trigger. */
  onFiltersClick: () => void;
  /** Active filters count for the badge on the filter button. */
  activeFiltersCount: number;
};

export default function HomeSearchHero({
  initialQuery = "",
  onSubmit,
  onFiltersClick,
  activeFiltersCount,
}: Props) {
  const [value, setValue] = useState(initialQuery);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(value);
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={[
        "w-full max-w-[560px]",
        "flex items-center gap-2 sm:gap-3",
        "bg-[#f1ece0] rounded-full",
        "h-14 sm:h-16 pl-5 sm:pl-6 pr-1.5",
        "border border-transparent transition-colors",
        "focus-within:border-[#ebe7d8] hover:border-[#ebe7d8]",
      ].join(" ")}
    >
      {/* leading pin icon — a quiet visual anchor, not interactive */}
      <span aria-hidden className="text-[#8a8f7d] flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2c4 0 7 3 7 7 0 5.2-7 13-7 13S5 14.2 5 9c0-4 3-7 7-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      </span>

      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search beaches, bars, hidden gems…"
        aria-label="Search places"
        className={[
          "flex-1 min-w-0 bg-transparent border-0 outline-none",
          // 16px on mobile prevents iOS auto-zoom on focus.
          "text-[16px] sm:text-[16px] font-medium text-[#16190f]",
          "placeholder:text-[#8a8f7d] placeholder:font-normal",
        ].join(" ")}
      />

      {/* Filters trigger — small, neutral, sits inside the pill. */}
      <button
        type="button"
        onClick={onFiltersClick}
        aria-label={
          activeFiltersCount > 0
            ? `Filters (${activeFiltersCount} applied)`
            : "Filters"
        }
        className={[
          "relative flex-shrink-0 size-9 rounded-full",
          "bg-white/0 hover:bg-white text-[#4a4f3d] border border-transparent hover:border-[#ebe7d8]",
          "inline-flex items-center justify-center transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1",
        ].join(" ")}
      >
        <Icon name="filter" size={18} />
        {activeFiltersCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 h-[18px] min-w-[18px] px-1 rounded-full bg-[#8F9E4F] text-white text-[10px] font-semibold flex items-center justify-center"
          >
            {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
          </span>
        )}
      </button>

      {/* Primary CTA — submits the form. */}
      <button
        type="submit"
        aria-label="Search"
        className={[
          "flex-shrink-0 size-12 sm:size-13 rounded-full",
          "bg-[#8F9E4F] text-white",
          "inline-flex items-center justify-center",
          "transition-colors hover:bg-[#4d5b27]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-2",
        ].join(" ")}
        style={{
          boxShadow: "0 4px 12px rgba(143,158,79,0.35)",
        }}
      >
        <Icon name="search" size={20} />
      </button>
    </form>
  );
}

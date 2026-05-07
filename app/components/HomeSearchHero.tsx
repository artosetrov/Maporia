"use client";

import Icon from "./Icon";
import { DEFAULT_CITY } from "../constants";

/**
 * HomeSearchHero — Airbnb-style composite search trigger for the home
 * page (DESKTOP ONLY).
 *
 * It is a TRIGGER, not a real form: clicking any of the three zones
 * opens the existing <SearchModal> via `onSearchBarClick`, and the
 * Filters zone opens <FiltersModal> via `onFiltersClick`. The actual
 * city / query / filter state still lives in page.tsx and travels via
 * the same callbacks the legacy <SearchBar> uses — so URL contracts
 * (`/map?city=…&q=…&categories=…`) are untouched.
 *
 * Why three zones (Where / When / Filters) when "When" has no logic
 * yet: it's a UI anchor for the upcoming dates support on
 * service/experience cards. Wiring it to the SearchModal trigger now
 * keeps the layout future-proof; we'll plug real date logic later.
 * See open question #1 in HOME_REDESIGN_INTEGRATION_PLAN.md.
 *
 * A11y:
 *   • Outer container has role="search" (no click handler — events
 *     come only from the buttons inside, no `<div onClick>` smell).
 *   • Each zone is a real <button type="button">: tab order is
 *     Where → When → Filters → magnifier; Enter/Space activate as
 *     expected without extra keyboard handlers.
 *   • Filters button calls `e.stopPropagation()` defensively even
 *     though the parent has no onClick — keeps behaviour stable if
 *     someone wraps this with a click handler in the future.
 *
 * Cross-link: docs/HOME_REDESIGN_INTEGRATION_PLAN.md (Phase 3).
 */

type Props = {
  selectedCity: string | null;
  searchValue: string;
  activeFiltersCount: number;
  onSearchBarClick: () => void;
  onFiltersClick: () => void;
};

export default function HomeSearchHero({
  selectedCity,
  searchValue,
  activeFiltersCount,
  onSearchBarClick,
  onFiltersClick,
}: Props) {
  const cityLabel = selectedCity ? selectedCity : DEFAULT_CITY;
  const isAnywhere = !selectedCity;
  const queryLabel = searchValue?.trim() ? searchValue.trim() : null;
  const filtersLabel =
    activeFiltersCount > 0
      ? `${activeFiltersCount} applied`
      : "Cuisine, price, mood";

  return (
    <div
      role="search"
      aria-label="Discover places, experiences and services"
      className="grid items-stretch w-full max-w-[760px]
                 grid-cols-[1.5fr_1fr_1fr_auto]
                 bg-white border border-[#ECEEE4] rounded-full p-2
                 shadow-[0_4px_16px_rgba(31,36,23,0.08)]
                 hover:shadow-[0_6px_20px_rgba(31,36,23,0.10)] transition-shadow"
    >
      {/* Where */}
      <button
        type="button"
        onClick={onSearchBarClick}
        className="text-left px-5 py-2.5 border-r border-[#ECEEE4]
                   rounded-l-full hover:bg-[#FAFAF7] transition-colors
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1"
      >
        <div className="text-[11px] font-semibold text-[#1F2A1F] tracking-[0.04em]">
          Where
        </div>
        <div className="text-[14px] text-[#8A8F7D] mt-0.5 truncate">
          {isAnywhere ? "City, region or vibe…" : cityLabel}
        </div>
      </button>

      {/* When (UI-якорь под будущие даты) */}
      <button
        type="button"
        onClick={onSearchBarClick}
        className="text-left px-5 py-2.5 border-r border-[#ECEEE4]
                   hover:bg-[#FAFAF7] transition-colors
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1"
      >
        <div className="text-[11px] font-semibold text-[#1F2A1F] tracking-[0.04em]">
          {queryLabel ? "Search" : "When"}
        </div>
        <div className="text-[14px] text-[#8A8F7D] mt-0.5 truncate">
          {queryLabel ?? "Any time"}
        </div>
      </button>

      {/* Filters */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFiltersClick();
        }}
        className="text-left px-5 py-2.5 hover:bg-[#FAFAF7] transition-colors relative
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1"
      >
        <div className="text-[11px] font-semibold text-[#1F2A1F] tracking-[0.04em]">
          Filters
        </div>
        <div className="text-[14px] text-[#8A8F7D] mt-0.5 truncate">
          {filtersLabel}
        </div>
        {activeFiltersCount > 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 h-5 min-w-[20px] px-1 rounded-full
                       bg-[#8F9E4F] text-white text-[10px] font-medium
                       flex items-center justify-center"
          >
            {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
          </span>
        )}
      </button>

      {/* Magnifier — primary CTA */}
      <button
        type="button"
        onClick={onSearchBarClick}
        aria-label="Open search"
        className="self-center mr-1 ml-2 size-12 rounded-full
                   bg-[#8F9E4F] text-white inline-flex items-center justify-center
                   hover:bg-[#556036] transition-colors
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1"
      >
        <Icon name="search" size={18} />
      </button>
    </div>
  );
}

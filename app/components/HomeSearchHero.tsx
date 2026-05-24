"use client";

import Icon from "./Icon";

/**
 * HomeSearchHero (v2.3) — Dribbble-style search PILL that acts as a
 * TRIGGER for the existing SearchModal.
 *
 * Why trigger again (vs the real input we tried earlier):
 *   The home page sends every search through `<SearchModal>` because
 *   that's where city + tag pickers live. Splitting "type query here"
 *   from "pick city + filters there" felt natural in the prototype but
 *   in practice forced users to fill out a 2nd modal anyway. One tap →
 *   one modal that owns all of search input is simpler.
 *
 *   Filters button stays a separate trigger for FiltersModal — same
 *   contract as the legacy SearchBar.
 *
 * Visual:
 *   • Pill with leading pin glyph + placeholder/selected text + filter
 *     button + green primary magnifier. The whole pill is one big
 *     clickable surface; the filter button stops propagation so it
 *     opens FiltersModal instead of SearchModal.
 *
 * A11y:
 *   • The pill is a grouped surface with separate real buttons, avoiding
 *     nested interactive elements.
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase D revision).
 */

type Props = {
  /** Currently selected city (used in the trigger label). */
  selectedCity: string | null;
  /** Currently typed query, if any (used in the trigger label). */
  searchValue: string;
  /** Click on the pill (or magnifier) opens SearchModal. */
  onSearchBarClick: () => void;
  /** Click on filter icon opens FiltersModal. */
  onFiltersClick: () => void;
  /** Active filters count for the badge on the filter button. */
  activeFiltersCount: number;
};

const PLACEHOLDER = "Search beaches, bars, hidden gems…";

function summary(city: string | null, query: string): string {
  const q = query.trim();
  if (q && city) return `${q} · ${city}`;
  if (q) return q;
  if (city) return city;
  return PLACEHOLDER;
}

export default function HomeSearchHero({
  selectedCity,
  searchValue,
  onSearchBarClick,
  onFiltersClick,
  activeFiltersCount,
}: Props) {
  const hasContent = !!searchValue.trim() || !!selectedCity;
  const label = summary(selectedCity, searchValue);

  return (
    <div
      role="search"
      className={[
        "w-full max-w-full min-w-0",
        "flex items-center gap-2 sm:gap-3",
        "bg-[#f1ece0] rounded-full",
        "h-14 sm:h-16 pl-5 sm:pl-6 pr-1.5",
        "border border-transparent transition-colors",
        "hover:border-[#ebe7d8]",
        "text-left",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSearchBarClick}
        aria-label={hasContent ? `Search: ${label}` : "Open search"}
        className={[
          "flex h-full flex-1 min-w-0 items-center text-left truncate",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1 rounded-full",
          // 16px on mobile prevents iOS auto-zoom if/when this ever
          // becomes a real input again.
          "text-[16px] font-medium",
          hasContent ? "text-[#16190f]" : "text-[#8a8f7d] font-normal",
        ].join(" ")}
      >
        {label}
      </button>

      <button
        type="button"
        onClick={onFiltersClick}
        aria-label={
          activeFiltersCount > 0
            ? `Filters (${activeFiltersCount} applied)`
            : "Filters"
        }
        className={[
          "relative flex-shrink-0 size-11 rounded-full",
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

      {/* Primary CTA — opens SearchModal (same as the pill itself). */}
      <button
        type="button"
        onClick={onSearchBarClick}
        aria-label="Open search"
        className={[
          "flex-shrink-0 size-12 sm:size-13 rounded-full",
          "bg-[#8F9E4F] text-white",
          "inline-flex items-center justify-center",
          "transition-colors",
        ].join(" ")}
        style={{
          boxShadow: "0 4px 12px rgba(143,158,79,0.35)",
        }}
      >
        <Icon name="search" size={20} />
      </button>
    </div>
  );
}

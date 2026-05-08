"use client";

import { useEffect, useRef, useState } from "react";
import { CITIES, DEFAULT_CITY } from "../constants";
import type { HomeKind } from "../types/home";
import { useHomeKindCounts } from "../hooks/useHomeKindCounts";
import HomeTabsSegmented from "./HomeTabsSegmented";
import HomeSearchHero from "./HomeSearchHero";
import HomePopularTags from "./HomePopularTags";
import HomeVisualPanel from "./HomeVisualPanel";

/**
 * HomeHero (v2) — composite hero for the home page (Dribbble-style).
 *
 * Layout (responsive grid via Tailwind):
 *   • >= lg → split: left column (text + tabs + search + popular) and
 *                    right column (HomeVisualPanel)
 *   • <  lg → single column, centered, no visual panel
 *
 * The hero is a COMPOSER: it owns layout, the city picker dropdown, and
 * passes callbacks through to the building blocks. Page.tsx wires it
 * once, doesn't need to know about the inner grid.
 *
 * Counts: this component owns the `useHomeKindCounts` call. The
 * StatsTicker further down the page uses the same hook independently —
 * React caches identical fetches and we accept the duplicate to keep the
 * components independently rerouteable. (If perf shows duplicate counts,
 * we lift to a Context. For now: keep it simple.)
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase C).
 */

type Props = {
  // City selection
  selectedCity: string | null;
  onCityChange: (city: string | null) => void;

  // Tabs
  activeKind: HomeKind;
  onChangeKind: (kind: HomeKind) => void;

  // Search
  initialQuery?: string;
  onSubmitSearch: (query: string) => void;

  // Filters
  onFiltersClick: () => void;
  activeFiltersCount: number;

  // Popular tag click → /map?categories=…
  onTagClick: (category: string) => void;
};

export default function HomeHero({
  selectedCity,
  onCityChange,
  activeKind,
  onChangeKind,
  initialQuery,
  onSubmitSearch,
  onFiltersClick,
  activeFiltersCount,
  onTagClick,
}: Props) {
  const cityLabel = selectedCity ?? DEFAULT_CITY;
  const { counts } = useHomeKindCounts();

  // City picker — local dropdown state. Closes on outside-click and on Esc.
  const [cityOpen, setCityOpen] = useState(false);
  const cityRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cityOpen) return;
    function onClick(e: MouseEvent) {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setCityOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCityOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [cityOpen]);

  return (
    <section
      aria-labelledby="home-hero-title"
      className="px-4 sm:px-6 lg:px-10 pt-6 sm:pt-10 lg:pt-6"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-12 items-start">
          {/* ── LEFT column ─────────────────────────────────────────── */}
          <div className="text-center lg:text-left">
            <p className="inline-flex items-center gap-1.5 text-[12px] tracking-[0.18em] uppercase font-bold text-[#4d5b27]">
              <span
                aria-hidden
                className="w-1.5 h-1.5 rounded-full bg-[#8F9E4F]"
                style={{ boxShadow: "0 0 0 4px rgba(143,158,79,0.2)" }}
              />
              Curated by locals · {cityLabel}
            </p>

            <h1
              id="home-hero-title"
              className="mt-4 font-extrabold text-[36px] sm:text-[48px] lg:text-[60px] leading-[1.02] tracking-[-0.025em] text-[#16190f]"
            >
              Discover<br />
              <em className="not-italic font-fraunces italic font-semibold text-[#8F9E4F]">
                local gems
              </em>{" "}
              of{" "}
              {/* Inline city picker. The button itself is the hit target;
                  the dropdown is absolutely positioned beneath it. */}
              <span ref={cityRef} className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setCityOpen((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={cityOpen}
                  className="font-extrabold border-b-[3px] border-[#8F9E4F] pb-0.5 text-[#16190f] hover:text-[#8F9E4F] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1 rounded-sm"
                >
                  {cityLabel}.
                </button>
                {cityOpen && (
                  <div
                    role="listbox"
                    aria-label="Choose a city"
                    className="absolute left-1/2 lg:left-0 -translate-x-1/2 lg:translate-x-0 top-[calc(100%+8px)] z-30 min-w-[240px] bg-white border border-[#ebe7d8] rounded-2xl py-1.5 shadow-[0_8px_24px_rgba(31,36,23,0.10)]"
                  >
                    {CITIES.map((c) => {
                      const isSelected = (selectedCity ?? DEFAULT_CITY) === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            onCityChange(c);
                            setCityOpen(false);
                          }}
                          className={[
                            "w-full text-left px-4 py-2.5 text-[14px] font-semibold",
                            isSelected
                              ? "text-[#4d5b27] bg-[#eef0e0]"
                              : "text-[#16190f] hover:bg-[#faf8f1]",
                          ].join(" ")}
                        >
                          {c}
                        </button>
                      );
                    })}
                    <div className="border-t border-[#ebe7d8] mt-1 pt-1">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedCity === null}
                        onClick={() => {
                          onCityChange(null);
                          setCityOpen(false);
                        }}
                        className={[
                          "w-full text-left px-4 py-2.5 text-[14px] font-semibold",
                          selectedCity === null
                            ? "text-[#4d5b27] bg-[#eef0e0]"
                            : "text-[#16190f] hover:bg-[#faf8f1]",
                        ].join(" ")}
                      >
                        Anywhere
                      </button>
                    </div>
                  </div>
                )}
              </span>
            </h1>

            <p className="mt-4 text-[15px] sm:text-[17px] leading-[1.5] text-[#4a4f3d] max-w-[520px] mx-auto lg:mx-0">
              Места, опыт и сервисы — отбираем локалы из Fort Lauderdale,
              Dania Beach, Lighthouse Point. Без рекламы и без бесконечных
              списков фильтров на старте.
            </p>

            <div className="mt-6 flex flex-col items-center lg:items-start gap-3.5">
              <HomeTabsSegmented
                active={activeKind}
                onChange={onChangeKind}
                counts={counts}
              />
              <HomeSearchHero
                initialQuery={initialQuery}
                onSubmit={onSubmitSearch}
                onFiltersClick={onFiltersClick}
                activeFiltersCount={activeFiltersCount}
              />
              <HomePopularTags
                activeKind={activeKind}
                onTagClick={onTagClick}
              />
            </div>
          </div>

          {/* ── RIGHT column (desktop only) ─────────────────────────── */}
          <HomeVisualPanel city={cityLabel} counts={counts} />
        </div>
      </div>
    </section>
  );
}

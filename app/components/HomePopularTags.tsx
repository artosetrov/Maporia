"use client";

import { useMemo } from "react";
import type { HomeKind } from "../types/home";

/**
 * HomePopularTags (v2) — curated category chips below the hero search.
 *
 * The list is a hand-picked subset of the kind-specific category arrays
 * from `app/constants.ts`. We don't show all categories on the home page —
 * Filters modal does that. Home is the "warm welcome" surface, where 4-5
 * recognisable taps are more useful than a wall of options.
 *
 * Click semantics:
 *   onTagClick(category) is the same handler page.tsx uses for tag clicks
 *   inside HomeSection (router.push("/map?categories=…")). We pass the
 *   *full* category string with emoji — that matches what FiltersModal
 *   stores in `activeFilters.categories` and what `places.categories`
 *   column contains.
 *
 * Future: this list could come from `app_settings(id='home_popular_tags')`
 * so that admins can re-curate without a redeploy. For MVP it's hardcoded.
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase F).
 */

const POPULAR_BY_KIND: Record<HomeKind, string[]> = {
  location: [
    "🌅 Scenic & Views",
    "🤫 Hidden & Unique",
    "🍸 Bars & Wine",
    "🍽 Food & Drinks",
    "🌳 Nature & Walks",
  ],
  experience: [
    "🏊 Water Sports",
    "🗺 Tours & Walks",
    "🍷 Tastings",
    "📷 Photo Walks",
    "🥾 Adventures",
  ],
  service: [
    "📸 Photography",
    "💆 Massage",
    "✂️ Hair",
    "🧖 Spa & Wellness",
    "👨‍🍳 Chefs & Catering",
  ],
};

/** Splits an emoji prefix from a category label, e.g. "🌅 Scenic & Views". */
function splitEmoji(label: string): { emoji: string | null; text: string } {
  // Categories in constants.ts always start with an emoji + space.
  const m = label.match(/^(\p{Extended_Pictographic}+)\s+(.*)$/u);
  if (!m) return { emoji: null, text: label };
  return { emoji: m[1], text: m[2] };
}

export default function HomePopularTags({
  activeKind,
  onTagClick,
}: {
  activeKind: HomeKind;
  onTagClick: (category: string) => void;
}) {
  const tags = useMemo(() => POPULAR_BY_KIND[activeKind] ?? [], [activeKind]);

  return (
    <div className="mt-4 flex items-center flex-wrap gap-2.5 text-[14px] text-[#16190f]">
      <span className="font-bold mr-1">Popular:</span>
      {tags.map((tag) => {
        const { emoji, text } = splitEmoji(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onTagClick(tag)}
            className={[
              "h-8 px-3.5 rounded-full",
              "bg-white border border-[#ebe7d8]",
              "text-[13px] text-[#4a4f3d]",
              "inline-flex items-center gap-1.5 whitespace-nowrap",
              "transition-colors hover:border-[#8F9E4F] hover:text-[#4d5b27]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1",
            ].join(" ")}
          >
            {emoji && <span aria-hidden>{emoji}</span>}
            <span>{text}</span>
          </button>
        );
      })}
    </div>
  );
}

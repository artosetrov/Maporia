"use client";

import { useMemo } from "react";
import type { HomeKind } from "../types/home";
import { CategoryVisualIcon, getCategoryLabel } from "../lib/categoryVisuals";

/**
 * HomePopularTags (v2) — curated category chips below the hero search.
 *
 * The list is a hand-picked subset of the kind-specific category arrays
 * from `app/constants.ts`. We don't show all categories on the home page —
 * Filters modal does that. Home is the "warm welcome" surface, where 4-5
 * recognisable taps are more useful than a wall of options.
 *
 * Click semantics:
 *   onCategoryClick(category) → page.tsx делает
 *   router.push("/map?categories=<encoded>"). Передаём *полную* строку
 *   категории с эмодзи — это совпадает с тем, что FiltersModal хранит
 *   в `activeFilters.categories` и что лежит в колонке `places.categories`.
 *
 *   ВАЖНО: это НЕ то же самое, что onTagClick на PlaceCard. PlaceCard
 *   передаёт свободные `places.tags[]` — они идут в ?q=… (поиск). А
 *   здесь жёсткие категории — они идут в ?categories=… (фильтр). См.
 *   handleCategoryClick / handleTagClick в app/page.tsx.
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

export default function HomePopularTags({
  activeKind,
  onCategoryClick,
}: {
  activeKind: HomeKind;
  onCategoryClick: (category: string) => void;
}) {
  const tags = useMemo(() => POPULAR_BY_KIND[activeKind] ?? [], [activeKind]);

  return (
    <div className="mt-4 flex items-center flex-wrap gap-2.5 text-[14px] text-[#16190f]">
      <span className="font-bold mr-1">Popular:</span>
      {tags.map((tag) => {
        const text = getCategoryLabel(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onCategoryClick(tag)}
            className={[
              "h-8 px-3.5 rounded-full",
              "bg-white border border-[#ebe7d8]",
              "text-[13px] text-[#4a4f3d]",
              "inline-flex items-center gap-1.5 whitespace-nowrap",
              "transition-colors hover:border-[#8F9E4F] hover:text-[#4d5b27]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1",
            ].join(" ")}
          >
            <CategoryVisualIcon category={tag} className="h-3.5 w-3.5" />
            <span>{text}</span>
          </button>
        );
      })}
    </div>
  );
}

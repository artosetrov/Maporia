"use client";

import { useState, useEffect } from "react";
import { CATEGORIES, VIBES, SORT_OPTIONS, DISTANCE_OPTIONS } from "../constants";

export type ActiveFilters = {
  vibes: string[];
  categories: string[];
  tags: string[];
  distance: string | null;
  sort: string | null;
};

type FiltersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: ActiveFilters) => void;
  
  // Applied filters (current state)
  appliedFilters: ActiveFilters;
  
  // Optional: callback to get filtered places count for "Show X places" button
  getFilteredCount?: () => number;
};

export default function FiltersModal({
  isOpen,
  onClose,
  onApply,
  appliedFilters,
  getFilteredCount,
}: FiltersModalProps) {
  // Draft state (changes while modal is open)
  const [draftFilters, setDraftFilters] = useState<ActiveFilters>(appliedFilters);

  // Reset draft to applied when modal opens
  useEffect(() => {
    if (isOpen) {
      setDraftFilters(appliedFilters);
    }
  }, [isOpen, appliedFilters]);

  if (!isOpen) return null;

  const handleToggleVibe = (vibe: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(vibe)
        ? prev.vibes.filter((v) => v !== vibe)
        : [...prev.vibes, vibe],
    }));
  };

  const handleToggleCategory = (category: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  const handleToggleTag = (tag: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const handleDistanceChange = (distance: string | null) => {
    setDraftFilters((prev) => ({
      ...prev,
      distance: prev.distance === distance ? null : distance,
    }));
  };

  const handleSortChange = (sort: string | null) => {
    setDraftFilters((prev) => ({
      ...prev,
      sort: prev.sort === sort ? null : sort,
    }));
  };

  const handleClearAll = () => {
    setDraftFilters({
      vibes: [],
      categories: [],
      tags: [],
      distance: null,
      sort: null,
    });
  };

  const handleApply = () => {
    onApply(draftFilters);
    onClose();
  };

  const handleClose = () => {
    // Reset draft to applied state
    setDraftFilters(appliedFilters);
    onClose();
  };

  const hasChanges =
    JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters);
  const filteredCount = getFilteredCount ? getFilteredCount() : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[860px] min-[900px]:max-w-[980px] max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#6b7d47]/10">
          <h2 className="text-xl font-semibold text-[#2d2d2d]">Filters</h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full hover:bg-[#f5f4f2] transition flex items-center justify-center text-[#6b7d47]/60"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* Vibe / Emotions Section */}
          <div>
            <h3 className="text-sm font-semibold text-[#2d2d2d] mb-4">Vibe / Emotions</h3>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((vibe) => {
                const isSelected = draftFilters.vibes.includes(vibe);
                return (
                  <button
                    key={vibe}
                    onClick={() => handleToggleVibe(vibe)}
                    className={`px-4 py-2 rounded-full border-2 transition ${
                      isSelected
                        ? "border-[#6b7d47] bg-[#6b7d47]/10 text-[#6b7d47] font-medium"
                        : "border-[#6b7d47]/20 bg-white text-[#2d2d2d] hover:border-[#6b7d47]/40 hover:bg-[#f5f4f2]"
                    }`}
                  >
                    <span className="text-sm">{vibe}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categories Section */}
          <div>
            <h3 className="text-sm font-semibold text-[#2d2d2d] mb-4">Category</h3>
            <div className="grid grid-cols-2 min-[600px]:grid-cols-3 min-[900px]:grid-cols-4 gap-3">
              {CATEGORIES.map((category) => {
                const isSelected = draftFilters.categories.includes(category);
                return (
                  <button
                    key={category}
                    onClick={() => handleToggleCategory(category)}
                    className={`px-4 py-3 rounded-xl border-2 transition text-left ${
                      isSelected
                        ? "border-[#6b7d47] bg-[#6b7d47]/10 text-[#6b7d47] font-medium"
                        : "border-[#6b7d47]/20 bg-white text-[#2d2d2d] hover:border-[#6b7d47]/40 hover:bg-[#f5f4f2]"
                    }`}
                  >
                    <span className="text-sm">{category}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags Section (placeholder - можно расширить позже) */}
          <div>
            <h3 className="text-sm font-semibold text-[#2d2d2d] mb-4">Tags</h3>
            <div className="text-sm text-[#6b7d47]/60">
              Tags filtering coming soon
            </div>
          </div>

          {/* Distance Section */}
          <div>
            <h3 className="text-sm font-semibold text-[#2d2d2d] mb-4">Distance</h3>
            <div className="flex flex-wrap gap-2">
              {DISTANCE_OPTIONS.map((option) => {
                const isSelected = draftFilters.distance === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleDistanceChange(option.value)}
                    className={`px-4 py-2 rounded-full border-2 transition ${
                      isSelected
                        ? "border-[#6b7d47] bg-[#6b7d47]/10 text-[#6b7d47] font-medium"
                        : "border-[#6b7d47]/20 bg-white text-[#2d2d2d] hover:border-[#6b7d47]/40 hover:bg-[#f5f4f2]"
                    }`}
                  >
                    <span className="text-sm">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort Section */}
          <div>
            <h3 className="text-sm font-semibold text-[#2d2d2d] mb-4">Sort</h3>
            <div className="space-y-2">
              {SORT_OPTIONS.map((option) => {
                const isSelected = draftFilters.sort === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleSortChange(option.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${
                      isSelected
                        ? "border-[#6b7d47] bg-[#6b7d47]/10 text-[#6b7d47] font-medium"
                        : "border-[#6b7d47]/20 bg-white text-[#2d2d2d] hover:border-[#6b7d47]/40 hover:bg-[#f5f4f2]"
                    }`}
                  >
                    <span className="text-sm">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer (sticky) */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#6b7d47]/10 bg-white rounded-b-2xl">
          <button
            onClick={handleClearAll}
            className="text-sm font-medium text-[#6b7d47] hover:text-[#556036] underline transition"
          >
            Clear all
          </button>
          <button
            onClick={handleApply}
            disabled={!hasChanges}
            className={`px-6 py-3 rounded-xl font-medium transition ${
              hasChanges
                ? "bg-[#6b7d47] text-white hover:bg-[#556036]"
                : "bg-[#6b7d47]/30 text-white/60 cursor-not-allowed"
            }`}
          >
            {filteredCount !== null && hasChanges
              ? `Show ${filteredCount} places`
              : filteredCount !== null
              ? `Show ${filteredCount} places`
              : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

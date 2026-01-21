"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { DEFAULT_CITY } from "../constants";
import { CATEGORIES, VIBES, SORT_OPTIONS } from "../constants";

export type ActiveFilters = {
  vibes: string[];
  categories: string[];
  sort: string | null;
};

type FiltersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: ActiveFilters) => void;
  
  // Applied filters (current state)
  appliedFilters: ActiveFilters;
  
  // Optional: callback to get filtered places count for "Show X places" button
  // Takes draft filters as parameter to calculate count based on current selections
  // Can be async (returns Promise<number>) or sync (returns number)
  getFilteredCount?: (filters: ActiveFilters) => number | Promise<number>;
};

export default function FiltersModal({
  isOpen,
  onClose,
  onApply,
  appliedFilters,
  getFilteredCount,
}: FiltersModalProps) {
  // Ensure appliedFilters is always defined
  const safeAppliedFilters: ActiveFilters = appliedFilters || {
    vibes: [],
    categories: [],
    sort: null,
  };
  
  // Draft state (changes while modal is open)
  const [draftFilters, setDraftFilters] = useState<ActiveFilters>(safeAppliedFilters);
  
  // State for filtered count (can be async)
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  
  // Use ref to store getFilteredCount to avoid dependency issues
  const getFilteredCountRef = useRef(getFilteredCount);
  useEffect(() => {
    getFilteredCountRef.current = getFilteredCount;
  }, [getFilteredCount]);

  // Reset draft to applied when modal opens
  useEffect(() => {
    if (isOpen) {
      setDraftFilters(safeAppliedFilters);
    }
  }, [isOpen, safeAppliedFilters]);
  
  // Update count when draftFilters change
  useEffect(() => {
    // Всегда вызываем useEffect, но проверяем условия внутри
    if (!isOpen) {
      setFilteredCount(null);
      setCountLoading(false);
      return;
    }
    
    const getCountFn = getFilteredCountRef.current;
    if (!getCountFn) {
      setFilteredCount(null);
      setCountLoading(false);
      return;
    }
    
    setCountLoading(true);
    const result = getCountFn(draftFilters);
    
    if (result instanceof Promise) {
      result
        .then(count => {
          setFilteredCount(count);
          setCountLoading(false);
        })
        .catch(error => {
          console.error("Error getting filtered count:", error);
          setFilteredCount(null);
          setCountLoading(false);
        });
    } else {
      setFilteredCount(result);
      setCountLoading(false);
    }
  }, [draftFilters, isOpen]);

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
      sort: null,
    });
  };

  const handleApply = () => {
    onApply(draftFilters);
    onClose();
  };

  const handleClose = () => {
    // Reset draft to applied state
    setDraftFilters(safeAppliedFilters);
    onClose();
  };

  const hasChanges =
    JSON.stringify(draftFilters) !== JSON.stringify(safeAppliedFilters);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl w-full max-w-[860px] min-[900px]:max-w-[980px] max-h-[80vh] flex flex-col mx-4 border border-[#ECEEE4]"
           style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECEEE4]">
          <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F]">Filters</h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full hover:bg-[#FAFAF7] transition-colors flex items-center justify-center text-[#A8B096]"
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
            <h3 className="text-sm font-semibold text-[#1F2A1F] mb-4">Vibe / Emotions</h3>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((vibe) => {
                const isSelected = draftFilters.vibes.includes(vibe);
                return (
                  <button
                    key={vibe}
                    onClick={() => handleToggleVibe(vibe)}
                    className={`px-4 py-2 rounded-full border-2 transition-colors ${
                      isSelected
                        ? "border-[#8F9E4F] bg-[#FAFAF7] text-[#8F9E4F] font-medium"
                        : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
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
            <h3 className="text-sm font-semibold text-[#1F2A1F] mb-4">Category</h3>
            <div className="grid grid-cols-2 min-[600px]:grid-cols-3 min-[900px]:grid-cols-4 gap-3">
              {CATEGORIES.map((category) => {
                const isSelected = draftFilters.categories.includes(category);
                return (
                  <button
                    key={category}
                    onClick={() => handleToggleCategory(category)}
                    className={`px-4 py-3 rounded-xl border-2 transition-colors text-left ${
                      isSelected
                        ? "border-[#8F9E4F] bg-[#FAFAF7] text-[#8F9E4F] font-medium"
                        : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
                    }`}
                  >
                    <span className="text-sm">{category}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort Section */}
          <div>
            <h3 className="text-sm font-semibold text-[#1F2A1F] mb-4">Sort</h3>
            <div className="space-y-2">
              {SORT_OPTIONS.map((option) => {
                const isSelected = draftFilters.sort === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleSortChange(option.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                      isSelected
                        ? "border-[#8F9E4F] bg-[#FAFAF7] text-[#8F9E4F] font-medium"
                        : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#ECEEE4] bg-white rounded-b-2xl">
          <button
            onClick={handleClearAll}
            className="text-sm font-medium text-[#8F9E4F] hover:text-[#6F7A5A] underline transition-colors"
          >
            Clear all
          </button>
          <button
            onClick={handleApply}
            disabled={!hasChanges}
            className={`px-6 py-3 h-11 rounded-xl font-medium transition-all ${
              hasChanges
                ? "bg-[#8F9E4F] text-white hover:brightness-110 active:brightness-90"
                : "bg-[#DADDD0] text-white cursor-not-allowed"
            }`}
          >
            {countLoading
              ? "Loading..."
              : filteredCount !== null && hasChanges
              ? `Show ${filteredCount} ${filteredCount === 1 ? "place" : "places"}`
              : filteredCount !== null
              ? `Show ${filteredCount} ${filteredCount === 1 ? "place" : "places"}`
              : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

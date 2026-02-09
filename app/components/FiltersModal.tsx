"use client";

 

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CATEGORIES, getTagEmoji, stripTagEmoji } from "../constants";
import Icon from "./Icon";
import { type UserAccess } from "../lib/access";

export type ActiveFilters = {
  categories: string[];
  sort: string | null;
  tags?: string[];
  premium?: boolean;
  // Для обратной совместимости
  premiumOnly?: boolean;
};

type FiltersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: ActiveFilters) => void;
  
  // Applied filters (current state)
  appliedFilters: ActiveFilters;
  
  // Applied cities (for display in tags and city selection)
  appliedCity?: string | null;
  appliedCities?: string[];
  onCityChange?: (city: string | null) => void;
  onCitiesChange?: (cities: string[]) => void;
  
  // Optional: callback to get filtered places count for "Show X places" button
  // Takes draft filters and draft cities as parameters to calculate count based on current selections
  // Can be async (returns Promise<number>) or sync (returns number)
  getFilteredCount?: (filters: ActiveFilters, cities: string[]) => number | Promise<number>;
  
  // Optional: get count for each city
  getCityCount?: (city: string) => number | Promise<number>;
  
  // Optional: get count for each category. premiumOnly filters to only premium places.
  getCategoryCount?: (category: string, premiumOnly?: boolean) => number | Promise<number>;
  
  // Optional: list of available tags filtered by selected categories
  getAvailableTags?: (categories: string[]) => string[] | Promise<string[]>;
  // Optional: get counts for all tags in one call (batched). Returns map tagName -> count.
  // premiumOnly filters to only premium places.
  getTagCounts?: (tags: string[], categories?: string[], premiumOnly?: boolean) => Record<string, number> | Promise<Record<string, number>>;
  
  // Optional: user access level - used to determine if Premium filter should be shown
  userAccess?: UserAccess;
  
  // Optional: callback to reset all filters (cities, categories, tags, search query, premium/hidden/vibe toggles)
  onResetAll?: () => void;
};

export default function FiltersModal({
  isOpen,
  onClose,
  onApply,
  appliedFilters,
  appliedCity: _appliedCity,
  appliedCities: _appliedCities,
  onCityChange: _onCityChange,
  onCitiesChange: _onCitiesChange,
  getFilteredCount,
  getCityCount: _getCityCount,
  getCategoryCount,
  getAvailableTags,
  getTagCounts,
  userAccess,
  onResetAll,
}: FiltersModalProps) {
  // Ensure appliedFilters is always defined
  const safeAppliedFilters: ActiveFilters = appliedFilters || {
    categories: [],
    sort: null,
    tags: [],
    premium: false,
    premiumOnly: false, // Для обратной совместимости
  };
  
  // Draft state (changes while modal is open)
  const [draftFilters, setDraftFilters] = useState<ActiveFilters>(safeAppliedFilters);
  
  // Draft cities state (changes while modal is open)
  const safeAppliedCities = _appliedCities || [];
  const [draftCities, setDraftCities] = useState<string[]>(safeAppliedCities);
  
  // State for filtered count (can be async)
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  
  // Category counts
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  // Available tags and tag counts
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  
  // Use ref to store getFilteredCount to avoid dependency issues
  const getFilteredCountRef = useRef(getFilteredCount);
  useEffect(() => {
    getFilteredCountRef.current = getFilteredCount;
  }, [getFilteredCount]);

  // Reset draft to applied only when modal opens (avoid deps that change every render)
  const appliedFiltersRef = useRef(safeAppliedFilters);
  const appliedCitiesRef = useRef(safeAppliedCities);
  useLayoutEffect(() => {
    appliedFiltersRef.current = safeAppliedFilters;
    appliedCitiesRef.current = safeAppliedCities;
  }, [safeAppliedFilters, safeAppliedCities]);
  useEffect(() => {
    if (isOpen) {
      let filtersToSet = appliedFiltersRef.current;
      filtersToSet = { ...filtersToSet, tags: filtersToSet.tags ?? [] };
      // If user doesn't have premium access, remove premium filter
      if (!userAccess?.hasPremium && !userAccess?.isAdmin) {
        filtersToSet = {
          ...filtersToSet,
          premium: false,
          premiumOnly: false,
        };
      }
      setDraftFilters(filtersToSet);
      setDraftCities(appliedCitiesRef.current);
    }
  }, [isOpen, userAccess]);

  
  // Load category counts (re-triggers when premium toggle changes)
  const draftPremium = !!draftFilters.premium;
  useEffect(() => {
    if (!isOpen) return;
    
    // Load category counts
    if (getCategoryCount) {
      const loadCategoryCounts = async () => {
        const counts: Record<string, number> = {};
        for (const category of CATEGORIES) {
          try {
            const count = await getCategoryCount(category, draftPremium);
            counts[category] = count;
          } catch {
            counts[category] = 0;
          }
        }
        setCategoryCounts(counts);
      };
      loadCategoryCounts();
    }
  }, [isOpen, getCategoryCount, draftPremium]);

  // Ref for stable getAvailableTags / getTagCounts to avoid re-triggering on every render
  const getAvailableTagsRef = useRef(getAvailableTags);
  useEffect(() => { getAvailableTagsRef.current = getAvailableTags; }, [getAvailableTags]);
  const getTagCountsRef = useRef(getTagCounts);
  useEffect(() => { getTagCountsRef.current = getTagCounts; }, [getTagCounts]);

  // Load available tags when categories change (reactive to draftFilters.categories)
  const draftCategories = draftFilters.categories;
  useEffect(() => {
    if (!isOpen) return;
    const fn = getAvailableTagsRef.current;
    if (!fn) return;

    // No categories selected → hide tags
    if (draftCategories.length === 0) {
      setAvailableTags([]);
      setTagCounts({});
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const tags = await fn(draftCategories);
        if (cancelled) return;
        const tagsList = Array.isArray(tags) ? tags : [];
        setAvailableTags(tagsList);

        // Clean up orphaned selected tags that are no longer available
        setDraftFilters((prev) => {
          const currentTags = prev.tags ?? [];
          if (currentTags.length === 0) return prev;
          const tagsSet = new Set(tagsList);
          const filtered = currentTags.filter((t) => tagsSet.has(t));
          if (filtered.length === currentTags.length) return prev;
          return { ...prev, tags: filtered };
        });
      } catch {
        if (!cancelled) {
          setAvailableTags([]);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, draftCategories]);

  // Load tag counts in one batch when availableTags or premium changes
  useEffect(() => {
    if (!isOpen || availableTags.length === 0) return;
    const fn = getTagCountsRef.current;
    if (!fn) return;

    let cancelled = false;
    const load = async () => {
      try {
        const result = fn(availableTags, draftCategories, draftPremium);
        const counts = result instanceof Promise ? await result : result;
        if (!cancelled) {
          setTagCounts(typeof counts === "object" && counts !== null ? counts : {});
        }
      } catch {
        if (!cancelled) setTagCounts({});
      }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, availableTags, draftPremium]);
  
  // Lock body scroll when modal is open (prevents iOS Safari scroll-through)
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    
    // Save current styles
    const originalBodyOverflow = body.style.overflow;
    const originalBodyPosition = body.style.position;
    const originalBodyTop = body.style.top;
    const originalBodyWidth = body.style.width;
    const originalHtmlOverflow = html.style.overflow;
    
    // Lock scroll
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    html.style.overflow = 'hidden';
    
    return () => {
      body.style.overflow = originalBodyOverflow;
      body.style.position = originalBodyPosition;
      body.style.top = originalBodyTop;
      body.style.width = originalBodyWidth;
      html.style.overflow = originalHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

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
    // Передаем выбранные города для правильного подсчета
    const result = getCountFn(draftFilters, draftCities);
    
    if (result instanceof Promise) {
      result
        .then(count => {
          setFilteredCount(count);
          setCountLoading(false);
        })
        .catch(error => {
          console.error("Error getting filtered count:", {
            message: error?.message,
            name: error?.name,
            code: (error as any)?.code,
          });
          setFilteredCount(null);
          setCountLoading(false);
        });
    } else {
      setFilteredCount(result);
      setCountLoading(false);
    }
  }, [draftFilters, draftCities, isOpen]);

  if (!isOpen) return null;

  const handleToggleCategory = (category: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  // Unused - kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleSortChange = (sort: string | null) => {
    setDraftFilters((prev) => ({
      ...prev,
      sort: prev.sort === sort ? null : sort,
    }));
  };
  
  const handleTogglePremium = () => {
    setDraftFilters((prev) => ({
      ...prev,
      premium: !prev.premium,
      premiumOnly: !prev.premium, // Для обратной совместимости
    }));
  };


  const handleToggleTag = (tag: string) => {
    setDraftFilters((prev) => {
      const tags = prev.tags ?? [];
      const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
      return { ...prev, tags: next };
    });
  };
  
  const handleClearAll = () => {
    // If onResetAll callback is provided, use it to reset everything (cities, search, tags, filters)
    if (onResetAll) {
      onResetAll();
      onClose();
      return;
    }
    
    // Otherwise, just reset filters in modal (backward compatibility)
    const clearedFilters: ActiveFilters = {
      categories: [],
      sort: null,
      tags: [],
      premium: false,
      premiumOnly: false, // For backward compatibility
    };
    setDraftFilters(clearedFilters);
    // Immediately apply cleared filters and close modal
    onApply(clearedFilters);
    onClose();
  };
  
  // Unused - kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleRemoveFilter = (type: "city" | "category" | "premium", value?: string) => {
    if (type === "category" && value) {
      setDraftFilters((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c !== value),
      }));
    } else if (type === "premium") {
      setDraftFilters((prev) => ({
        ...prev,
        premium: false,
        premiumOnly: false,
      }));
    }
  };

  const handleApply = () => {
    // Применяем фильтры и обновляем родительский компонент
    onApply(draftFilters);
    
    // Обновляем города в родительском компоненте
    // Важно: вызываем это ДО onClose, чтобы состояние обновилось до закрытия модального окна
    if (_onCitiesChange) {
      if (process.env.NODE_ENV === 'development') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[FiltersModal] handleApply: calling onCitiesChange with:', draftCities);
        }
      }
      _onCitiesChange(draftCities);
    }
    
    onClose();
  };

  const handleClose = () => {
    // Reset draft to applied state
    setDraftFilters(safeAppliedFilters);
    onClose();
  };

  // Unused - kept for potential future use (e.g., disable apply button when no changes)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hasChanges =
    JSON.stringify(draftFilters) !== JSON.stringify(safeAppliedFilters);
  
  // Get applied filters for display
  const appliedFiltersList: Array<{ type: "city" | "category" | "tag" | "premium"; label: string; value?: string }> = [];
  if (draftFilters.premium) {
    appliedFiltersList.push({ type: "premium", label: "Premium" });
  }
  draftFilters.categories.forEach((cat) => {
    appliedFiltersList.push({ type: "category", label: cat, value: cat });
  });
  (draftFilters.tags ?? []).forEach((tag) => {
    appliedFiltersList.push({ type: "tag", label: tag, value: tag });
  });
  if (draftFilters.premiumOnly) {
    appliedFiltersList.push({ type: "premium", label: "Premium" });
  }

  // Get category emoji
  const getCategoryEmoji = (category: string) => {
    // Match any emoji at the start (including ✨, 🤫, etc.)
    const emojiMatch = category.match(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
    return emojiMatch ? emojiMatch[0] : "📍";
  };
  

  const modalEl = (
    <div className="fixed inset-0 z-[9999] flex items-end lg:items-center justify-center" aria-modal="true" role="dialog">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm lg:bg-black/50"
        onClick={handleClose}
        onTouchMove={(e) => e.preventDefault()}
        style={{ touchAction: 'none' }}
      />

      {/* Modal - Desktop: centered, Mobile: bottom sheet */}
      <div className="relative w-full lg:w-[600px] lg:max-w-[600px] lg:max-h-[85vh] lg:mx-4 lg:rounded-2xl bg-white flex flex-col border-t lg:border border-[#ECEEE4] transition-transform duration-300 ease-out lg:animate-none shadow-sm"
           style={{ 
             maxHeight: '90vh',
             height: 'auto',
             minHeight: '50vh',
             borderTopLeftRadius: '1rem',
             borderTopRightRadius: '1rem',
             animation: 'slide-up 0.3s ease-out',
           }}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#ECEEE4] flex-shrink-0">
          {/* Mobile: Drag handle */}
          <div className="lg:hidden flex justify-center mb-3">
            <div className="w-12 h-1.5 bg-[#ECEEE4] rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-[#1F2A1F] font-fraunces">Filters</h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full hover:bg-[#FAFAF7] transition-colors flex items-center justify-center text-[#1F2A1F]"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 pt-1.5 pb-6 space-y-6 min-h-0" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {/* Premium Toggle - Only visible for admin and premium users */}
          {(userAccess?.hasPremium || userAccess?.isAdmin) && (
            <div>
              <button
                onClick={handleTogglePremium}
                className="w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 border-[#ECEEE4] bg-white transition-all hover:bg-[#FAFAF7]"
                role="switch"
                aria-checked={!!draftFilters.premium}
                aria-label="Only Premium places"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">⭐</span>
                  <span className="text-sm font-medium text-[#1F2A1F]">Only Premium places</span>
                </div>
                <div
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                    draftFilters.premium ? "bg-[#8F9E4F]" : "bg-[#D1D5C4]"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      draftFilters.premium ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </div>
              </button>
            </div>
          )}

          {/* Category Section */}
          <div>
            <h3 className="text-xs font-semibold text-[#6F7A5A] uppercase tracking-wide mb-4">CATEGORY</h3>
            <div className="grid grid-cols-3 gap-3">
              {CATEGORIES.map((category) => {
                const isSelected = draftFilters.categories.includes(category);
                const count = categoryCounts[category];
                const emoji = getCategoryEmoji(category);
                const label = category.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+\s*/u, "").trim();
                return (
                  <button
                    key={category}
                    onClick={() => handleToggleCategory(category)}
                    className={`relative flex flex-col items-center justify-center px-2 py-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? "border-[#8F9E4F] bg-[#F4F6EF]"
                        : "border-[#ECEEE4] bg-white hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
                    }`}
                  >
                    {count !== undefined && (
                      <span className={`absolute top-1.5 right-2 text-xs font-medium ${isSelected ? "text-[#6F7A5A]" : "text-[#A8B096]"}`}>
                        {count}
                      </span>
                    )}
                    <span className="text-2xl mb-1.5">{emoji}</span>
                    <span className="text-sm font-medium text-[#1F2A1F] text-center leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags Section — visible only when categories are selected */}
          {draftFilters.categories.length > 0 && availableTags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#6F7A5A] uppercase tracking-wide mb-4">TAGS</h3>
              <div className="grid grid-cols-4 gap-2">
                {availableTags.map((tag) => {
                  const isSelected = (draftFilters.tags ?? []).includes(tag);
                  const count = tagCounts[tag];
                  return (
                    <button
                      key={tag}
                      onClick={() => handleToggleTag(tag)}
                      className={`relative flex flex-col items-center justify-center px-1 py-3 rounded-xl border-2 transition-all ${
                        isSelected
                          ? "border-[#8F9E4F] bg-[#F4F6EF]"
                          : "border-[#ECEEE4] bg-white hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
                      }`}
                    >
                      {count !== undefined && (
                        <span className={`absolute top-1 right-1.5 text-xs font-medium ${isSelected ? "text-[#6F7A5A]" : "text-[#A8B096]"}`}>
                          {count}
                        </span>
                      )}
                      <span className="text-lg mb-1">{getTagEmoji(tag)}</span>
                      <span className="text-sm font-medium text-[#1F2A1F] text-center leading-tight line-clamp-2">{stripTagEmoji(tag)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer (sticky) */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#ECEEE4] bg-white lg:rounded-b-2xl flex-shrink-0"
             style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleClearAll}
            className="text-sm font-medium text-[#6F7A5A] hover:text-[#1F2A1F] underline transition-colors"
          >
            Reset all
          </button>
          <button
            onClick={handleApply}
            disabled={countLoading || filteredCount === null || filteredCount === 0}
            className={`px-5 h-11 rounded-xl font-medium text-sm transition-all flex items-center gap-2 ${
              !countLoading && filteredCount !== null && filteredCount > 0
                ? "bg-[#8F9E4F] text-white hover:bg-[#7A8A42] shadow-sm"
                : "bg-[#DADDD0] text-white cursor-not-allowed"
            }`}
          >
            {(draftFilters.premium || draftFilters.premiumOnly) && (
              <svg className="w-4 h-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            )}
            {countLoading
              ? "Loading..."
              : filteredCount !== null
              ? `Show ${filteredCount} ${filteredCount === 1 ? "place" : "places"}`
              : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(modalEl, document.body) : null;
}

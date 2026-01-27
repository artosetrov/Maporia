"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_CITY, CATEGORIES } from "../constants";
import { getCitiesWithPlaces } from "../lib/cities";
import { supabase } from "../lib/supabase";
import Icon from "./Icon";

// Component for search result item with image error handling
function SearchResultItem({ 
  result, 
  color, 
  iconName, 
  idx, 
  totalResults,
  onCitySelect,
  onQuerySet,
  onPlaceClick,
  onClose
}: { 
  result: SearchResult; 
  color: { bg: string; hover: string; icon: string };
  iconName: string;
  idx: number;
  totalResults: number;
  onCitySelect: (city: string) => void;
  onQuerySet: (query: string) => void;
  onPlaceClick: (placeId: string) => void;
  onClose: () => void;
}) {
  const [imageError, setImageError] = useState(false);
  
  return (
    <button
      onClick={() => {
        if (result.type === "city") {
          onCitySelect(result.title);
        } else if (result.type === "place") {
          // Navigate to place page
          onPlaceClick(result.id);
          onClose();
        } else {
          // For other types, set as query
          onQuerySet(result.title);
        }
      }}
      className={`w-full text-left px-0 py-4 hover:bg-[#FAFAF7] transition flex items-center gap-4 group ${
        idx < totalResults - 1 ? "border-b border-[#ECEEE4]" : ""
      }`}
    >
      {result.type === "place" && result.coverUrl && !imageError ? (
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#ECEEE4]">
          <img 
            src={result.coverUrl} 
            alt={result.title}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className={`w-12 h-12 rounded-xl ${color.bg} ${color.hover} flex items-center justify-center flex-shrink-0 transition-colors`}>
          <Icon 
            name={iconName as any} 
            size={24} 
            className={color.icon} 
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[#1F2A1F] font-medium text-base mb-0.5">{result.title}</div>
        {result.subtitle && (
          <div className="text-sm text-[#6F7A5A]">{result.subtitle}</div>
        )}
      </div>
    </button>
  );
}

type SearchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCitySelect: (city: string | null) => void;
  onSearchSubmit?: (city: string | null, query: string, tags?: string[]) => void;
  selectedCity?: string | null;
  searchQuery?: string;
  selectedTags?: string[];
};

type SearchResult = {
  type: "city" | "place" | "tag";
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  coverUrl?: string | null;
};

export default function SearchModal({
  isOpen,
  onClose,
  onCitySelect,
  onSearchSubmit,
  selectedCity,
  searchQuery: initialSearchQuery = "",
  selectedTags: initialSelectedTags = [],
}: SearchModalProps) {
  const router = useRouter();
  // Step management: "where" | "vibe"
  const [step, setStep] = useState<"where" | "vibe">("where");
  const [query, setQuery] = useState(initialSearchQuery);
  const [tempSelectedCity, setTempSelectedCity] = useState<string | null>(selectedCity || null);
  const [tempSelectedTags, setTempSelectedTags] = useState<string[]>(initialSelectedTags);
  const [cities, setCities] = useState<Array<{ id: string; name: string }>>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [placesCount, setPlacesCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<Array<{ city: string | null; query: string; tags?: string[] }>>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [dynamicHeight, setDynamicHeight] = useState<string>("100dvh");

  // Handle dynamic viewport height for mobile Chrome
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateHeight = () => {
      if (window.visualViewport) {
        setDynamicHeight(`${window.visualViewport.height}px`);
      } else {
        setDynamicHeight("100dvh");
      }
    };

    updateHeight();
    window.visualViewport?.addEventListener("resize", updateHeight);
    window.addEventListener("resize", updateHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateHeight);
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  // Load cities
  useEffect(() => {
    let isUnmounting = false;

    (async () => {
      if (isUnmounting) return;
      
      try {
        const citiesData = await getCitiesWithPlaces();
        if (isUnmounting) return;
        setCities(citiesData.map(c => ({ id: c.id, name: c.name })));
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
          return;
        }
        console.error("Error loading cities:", err);
      }
    })();

    return () => {
      isUnmounting = true;
    };
  }, []);

  // Load recent searches from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("recentSearches");
      if (stored) {
        try {
          setRecentSearches(JSON.parse(stored));
        } catch (e) {
          console.error("Error parsing recent searches:", e);
        }
      }
    }
  }, []);

  // Save to recent searches
  const saveToRecent = useCallback((city: string | null, query: string, tags: string[] = []) => {
    if (typeof window === "undefined") return;
    const search = { city, query: query.trim(), tags };
    const updated = [search, ...recentSearches.filter(s => 
      !(s.city === city && s.query === query.trim() && JSON.stringify(s.tags || []) === JSON.stringify(tags))
    )].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  }, [recentSearches]);

  // Get count for a single tag in a city
  const getTagCount = useCallback(async (city: string | null, tag: string) => {
    try {
      let countQuery = supabase.from("places").select("*", { count: 'exact', head: true });
      
      // Filter by city
      if (city) {
        countQuery = countQuery.or(`city_name_cached.eq.${city},city.eq.${city}`);
      }

      // Filter by single tag (category)
      countQuery = countQuery.contains("categories", [tag]);

      const { count, error } = await countQuery;
      if (error) {
        // Silently ignore AbortError
        if (error.message?.includes('abort') || error.name === 'AbortError' || (error as any).code === 'ECONNABORTED') {
          return 0;
        }
        // Enhanced logging for production
        if (process.env.NODE_ENV === 'production') {
          console.error("Error counting places for tag:", {
            tag,
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          });
        } else {
          console.error("Error counting places for tag:", error);
        }
        return 0;
      }
      return count || 0;
    } catch (err: any) {
      if (err?.name !== 'AbortError' && !err?.message?.includes('abort')) {
        console.error("Error in getTagCount:", err);
      }
      return 0;
    }
  }, []);

  // Load tag counts when city is selected
  useEffect(() => {
    if (!isOpen || step !== "vibe" || !tempSelectedCity) {
      setTagCounts({});
      return;
    }

    const loadTagCounts = async () => {
      const counts: Record<string, number> = {};
      for (const category of CATEGORIES) {
        const count = await getTagCount(tempSelectedCity, category);
        counts[category] = count;
      }
      setTagCounts(counts);
    };

    const timeoutId = setTimeout(loadTagCounts, 300);
    return () => clearTimeout(timeoutId);
  }, [isOpen, step, tempSelectedCity, getTagCount]);

  // Get filtered places count (with city, tags, query)
  const getFilteredPlacesCount = useCallback(async (
    city: string | null, 
    tags: string[], 
    searchQuery: string
  ) => {
    try {
      let countQuery = supabase.from("places").select("*", { count: 'exact', head: true });
      
      // Filter by city
      if (city) {
        countQuery = countQuery.or(`city_name_cached.eq.${city},city.eq.${city}`);
      }

      // Filter by tags (categories)
      if (tags.length > 0) {
        // Use overlaps to match any of the selected tags in categories array
        countQuery = countQuery.overlaps("categories", tags);
      }

      // Filter by query (title, description, country)
      if (searchQuery.trim()) {
        const s = searchQuery.trim();
        countQuery = countQuery.or(
          `title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`
        );
      }

      const { count, error } = await countQuery;
      if (error) {
        // Silently ignore AbortError
        if (error.message?.includes('abort') || error.name === 'AbortError' || (error as any).code === 'ECONNABORTED') {
          return 0;
        }
        // Enhanced logging for production
        if (process.env.NODE_ENV === 'production') {
          console.error("Error counting places:", {
            city,
            tags,
            query: searchQuery,
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          });
        } else {
          console.error("Error counting places:", error);
        }
        return 0;
      }
      return count || 0;
    } catch (err: any) {
      // Silently ignore AbortError
      if (err?.name === 'AbortError' || err?.message?.includes('abort') || (err as any).code === 'ECONNABORTED') {
        return 0;
      }
      // Enhanced logging for production
      if (process.env.NODE_ENV === 'production') {
        console.error("Error in getFilteredPlacesCount:", {
          city,
          tags,
          query: searchQuery,
          error: err?.message || String(err),
        });
      } else {
        console.error("Error in getFilteredPlacesCount:", err);
      }
      return 0;
    }
  }, []);

  // Search places and cities (for search results display)
  const performSearch = useCallback(async (searchQuery: string, city: string | null, tags: string[]) => {
    if (!searchQuery.trim() && !city) {
      setSearchResults([]);
      setPlacesCount(null);
      return;
    }

    setLoading(true);
    try {
      // Update count with current filters
      const count = await getFilteredPlacesCount(city, tags, searchQuery);
      setPlacesCount(count);

      // Get search results for display
      const results: SearchResult[] = [];

      // Search cities
      if (searchQuery.trim()) {
        const matchingCities = cities.filter(c => 
          c.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        matchingCities.forEach(city => {
          results.push({
            type: "city",
            id: city.id,
            title: city.name,
            subtitle: "City",
            icon: "location",
          });
        });
      }

      // Search places (limit to 10 for display)
      if (searchQuery.trim()) {
        const placesQuery = supabase
          .from("places")
          .select("id,title,city,city_name_cached,cover_url")
          .or(`title.ilike.%${searchQuery.trim()}%,description.ilike.%${searchQuery.trim()}%`)
          .limit(20); // Get more to filter client-side if needed

        const { data: placesData } = await placesQuery;
        if (placesData) {
          // Filter by city client-side if needed (since we can't chain .or() after .or())
          // Fix: Ensure proper city matching using both city and city_name_cached fields, normalizing for casing and possible nulls
          const filtered = city
            ? placesData.filter((p: any) =>
                (p.city_name_cached?.toLowerCase() === city.toLowerCase()) ||
                (p.city?.toLowerCase() === city.toLowerCase())
              )
            : placesData;
          filtered.slice(0, 10).forEach((place: any) => {
            results.push({
              type: "place",
              id: place.id,
              title: typeof place.title === "string" ? place.title : "",
              subtitle: typeof place.city_name_cached === "string"
                ? place.city_name_cached
                : typeof place.city === "string"
                  ? place.city
                  : "",
              icon: "photo",
              coverUrl: typeof place.cover_url === "string" ? place.cover_url : null,
            });
          });
        }
      }

      setSearchResults(results);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && !err?.message?.includes('abort')) {
        console.error("Error searching:", err);
      }
      setSearchResults([]);
      setPlacesCount(0);
    } finally {
      setLoading(false);
    }
  }, [cities, getFilteredPlacesCount]);

  // Update places count when filters change
  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = setTimeout(async () => {
      const count = await getFilteredPlacesCount(tempSelectedCity, tempSelectedTags, query);
      setPlacesCount(count);
      
      // Also perform search if there's a query
      if (query.trim()) {
        performSearch(query, tempSelectedCity, tempSelectedTags);
      } else {
        setSearchResults([]);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query, tempSelectedCity, tempSelectedTags, isOpen, getFilteredPlacesCount, performSearch]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery(initialSearchQuery);
      setTempSelectedCity(selectedCity || null);
      setTempSelectedTags(initialSelectedTags);
      setStep("where"); // Always start at "where" step
    }
  }, [isOpen, initialSearchQuery, selectedCity, initialSelectedTags]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  // Handle outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const handleCitySelect = (city: string | null) => {
    setTempSelectedCity(city);
    // Auto-advance to vibe step after city selection
    if (city) {
      setStep("vibe");
    }
  };

  const handleTagToggle = (tag: string) => {
    setTempSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        // Soft limit: warn if >3, but don't block
        if (prev.length >= 3) {
          // Could show a toast/notification here, but for now just allow
        }
        return [...prev, tag];
      }
    });
  };

  const handleReset = () => {
    if (step === "vibe") {
      // Reset tags only on vibe step
      setTempSelectedTags([]);
    } else {
      // Reset everything on where step
      setQuery("");
      setTempSelectedCity(null);
      setTempSelectedTags([]);
      setPlacesCount(null);
      setSearchResults([]);
    }
  };

  const handleBack = () => {
    if (step === "vibe") {
      setStep("where");
    } else {
      onClose();
    }
  };

  const handleNext = () => {
    if (step === "where") {
      // Move to vibe step if city is selected
      if (tempSelectedCity) {
        setStep("vibe");
      }
    }
  };

  const handleSubmit = () => {
    saveToRecent(tempSelectedCity, query, tempSelectedTags);
    onCitySelect(tempSelectedCity);
    if (onSearchSubmit) {
      onSearchSubmit(tempSelectedCity, query, tempSelectedTags);
    }
    onClose();
  };

  const canSubmit = tempSelectedCity !== null || query.trim() !== "" || tempSelectedTags.length > 0;
  const hasChanges = step === "vibe" 
    ? tempSelectedTags.length > 0 
    : tempSelectedCity !== null || query.trim() !== "" || tempSelectedTags.length > 0;

  // Get popular cities (first 6 from cities list)
  const popularCities = useMemo(() => cities.slice(0, 6), [cities]);

  // Get current city (from profile or last selected)
  const currentCity = selectedCity || DEFAULT_CITY;

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-white lg:bg-black/50 lg:flex lg:items-center lg:justify-center"
      style={{ height: dynamicHeight }}
    >
      <div
        ref={modalRef}
        className="bg-white w-full h-full lg:h-auto lg:max-w-2xl lg:rounded-2xl lg:shadow-xl flex flex-col"
        style={{ 
          height: typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'auto' : dynamicHeight,
          maxHeight: typeof window !== 'undefined' && window.innerWidth >= 1024 ? '90vh' : '100%',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECEEE4] flex-shrink-0">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-full hover:bg-[#FAFAF7] transition flex items-center justify-center"
            aria-label="Back"
          >
            {step === "vibe" ? (
              <Icon name="back" size={20} className="text-[#1F2A1F]" />
            ) : (
              <div className="w-10" /> // Spacer when no back needed
            )}
          </button>
          <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F]">
            {step === "where" ? "Where?" : "What's your vibe?"}
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-[#FAFAF7] transition flex items-center justify-center"
            aria-label="Close"
          >
            <Icon name="close" size={20} className="text-[#1F2A1F]" />
          </button>
        </div>

        {/* Step 1: Where (City selection) */}
        {step === "where" && (
          <>
            {/* Search Input */}
            <div className="px-6 py-4 flex-shrink-0 border-b border-[#ECEEE4]">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search destinations"
                  className="w-full px-4 py-3.5 pl-12 rounded-xl border border-[#E5E8DB] focus:border-[#8F9E4F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-opacity-20 text-[#1F2A1F] text-base bg-white placeholder:text-[#A8B096]"
                  autoFocus
                />
                <Icon name="search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6F7A5A]" />
              </div>
            </div>

            {/* Content (scrollable) */}
            <div className="flex-1 overflow-y-auto" style={{ 
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}>
          {query.trim() === "" ? (
            // Suggested content when input is empty (Airbnb-style)
            <div className="px-6 py-4 space-y-0">
              <h3 className="text-sm font-medium text-[#1F2A1F] mb-4 px-0">Suggested destinations</h3>
              
              <div className="space-y-0">
                {/* Nearby */}
                <button
                  onClick={() => {
                    // TODO: Implement geolocation
                    handleCitySelect(currentCity);
                  }}
                  className="w-full text-left px-0 py-4 border-b border-[#ECEEE4] hover:bg-[#FAFAF7] transition flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#E8F0E8] flex items-center justify-center flex-shrink-0 group-hover:bg-[#D4E4D4] transition-colors">
                    <Icon name="my-location" size={24} className="text-[#8F9E4F]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[#1F2A1F] font-medium text-base mb-0.5">Nearby</div>
                    <div className="text-sm text-[#6F7A5A]">Find what's around you</div>
                  </div>
                </button>

                {/* Current city */}
                <button
                  onClick={() => handleCitySelect(currentCity)}
                  className="w-full text-left px-0 py-4 border-b border-[#ECEEE4] hover:bg-[#FAFAF7] transition flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#F5E8D8] flex items-center justify-center flex-shrink-0 group-hover:bg-[#E8D4C0] transition-colors">
                    <Icon name="location" size={24} className="text-[#C96A5B]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[#1F2A1F] font-medium text-base mb-0.5">{currentCity}</div>
                    <div className="text-sm text-[#6F7A5A]">Current location</div>
                  </div>
                </button>

                {/* Popular cities */}
                {popularCities.map((city, idx) => {
                  const colors = [
                    { bg: "bg-[#E8F0E8]", hover: "group-hover:bg-[#D4E4D4]", icon: "text-[#8F9E4F]" },
                    { bg: "bg-[#F5E8D8]", hover: "group-hover:bg-[#E8D4C0]", icon: "text-[#C96A5B]" },
                    { bg: "bg-[#F0E8F5]", hover: "group-hover:bg-[#E0D4E8]", icon: "text-[#9E4F8F]" },
                    { bg: "bg-[#E8F5F0]", hover: "group-hover:bg-[#D4E8E0]", icon: "text-[#4F9E8F]" },
                    { bg: "bg-[#F5F0E8]", hover: "group-hover:bg-[#E8E0D4]", icon: "text-[#9E8F4F]" },
                    { bg: "bg-[#E8E8F5]", hover: "group-hover:bg-[#D4D4E8]", icon: "text-[#4F4F9E]" },
                  ];
                  const color = colors[idx % colors.length];
                  
                  return (
                    <button
                      key={city.id}
                      onClick={() => handleCitySelect(city.name)}
                      className="w-full text-left px-0 py-4 border-b border-[#ECEEE4] hover:bg-[#FAFAF7] transition flex items-center gap-4 group"
                    >
                      <div className={`w-12 h-12 rounded-xl ${color.bg} ${color.hover} flex items-center justify-center flex-shrink-0 transition-colors`}>
                        <Icon name="location" size={24} className={color.icon} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[#1F2A1F] font-medium text-base mb-0.5">{city.name}</div>
                        <div className="text-sm text-[#6F7A5A]">Popular destination</div>
                      </div>
                    </button>
                  );
                })}

                {/* Recent searches */}
                {recentSearches.length > 0 && (
                  <>
                    {recentSearches.map((search, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setQuery(search.query);
                          handleCitySelect(search.city);
                        }}
                        className={`w-full text-left px-0 py-4 hover:bg-[#FAFAF7] transition flex items-center gap-4 group ${
                          idx < recentSearches.length - 1 ? "border-b border-[#ECEEE4]" : ""
                        }`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-[#F5F5F5] flex items-center justify-center flex-shrink-0 group-hover:bg-[#ECEEE4] transition-colors">
                          <Icon name="clock" size={24} className="text-[#6F7A5A]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[#1F2A1F] font-medium text-base mb-0.5">
                            {search.query || search.city || "Where?"}
                          </div>
                          {search.city && (
                            <div className="text-sm text-[#6F7A5A]">{search.city}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : (
            // Search results when typing (Airbnb-style with colored icons)
            <div className="px-6 py-2">
              {loading ? (
                <div className="px-0 py-8 text-center text-[#6F7A5A]">Searching...</div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-0">
                  {searchResults.map((result, idx) => {
                    const colors = [
                      { bg: "bg-[#E8F0E8]", hover: "group-hover:bg-[#D4E4D4]", icon: "text-[#8F9E4F]" },
                      { bg: "bg-[#F5E8D8]", hover: "group-hover:bg-[#E8D4C0]", icon: "text-[#C96A5B]" },
                      { bg: "bg-[#F0E8F5]", hover: "group-hover:bg-[#E0D4E8]", icon: "text-[#9E4F8F]" },
                      { bg: "bg-[#E8F5F0]", hover: "group-hover:bg-[#D4E8E0]", icon: "text-[#4F9E8F]" },
                      { bg: "bg-[#F5F0E8]", hover: "group-hover:bg-[#E8E0D4]", icon: "text-[#9E8F4F]" },
                      { bg: "bg-[#E8E8F5]", hover: "group-hover:bg-[#D4D4E8]", icon: "text-[#4F4F9E]" },
                    ];
                    const color = colors[idx % colors.length];
                    const iconName = result.type === "city" ? "location" : result.icon || "photo";
                    
                    return (
                      <SearchResultItem 
                        key={`${result.type}-${result.id}`}
                        result={result}
                        color={color}
                        iconName={iconName}
                        idx={idx}
                        totalResults={searchResults.length}
                        onCitySelect={handleCitySelect}
                        onQuerySet={setQuery}
                        onPlaceClick={(placeId) => {
                          router.push(`/id/${placeId}`);
                        }}
                        onClose={onClose}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="px-0 py-8 text-center text-[#6F7A5A]">
                  No results found
                </div>
              )}
            </div>
          )}
            </div>
          </>
        )}

        {/* Step 2: Vibe (Tags selection) */}
        {step === "vibe" && (
          <div className="flex-1 overflow-y-auto" style={{ 
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}>
            {/* Selected City Info */}
            {tempSelectedCity && (
              <div className="px-6 pt-6 pb-4 border-b border-[#ECEEE4]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-[#E8F0E8] flex items-center justify-center flex-shrink-0">
                    <Icon name="location" size={20} className="text-[#8F9E4F]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-[#1F2A1F] mb-0.5">
                      {tempSelectedCity}
                    </div>
                    {placesCount !== null && placesCount > 0 ? (
                      <div className="text-sm text-[#6F7A5A]">
                        {placesCount} {placesCount === 1 ? 'location' : 'locations'} available
                      </div>
                    ) : (
                      <div className="text-sm text-[#6F7A5A]">
                        Searching locations...
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setStep("where")}
                    className="text-sm font-medium text-[#8F9E4F] hover:text-[#7A8A42] transition underline"
                  >
                    Change
                  </button>
                </div>
              </div>
            )}

            {/* Section Title */}
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-lg font-semibold font-fraunces text-[#1F2A1F] mb-1">
                What's your vibe?
              </h3>
              <p className="text-sm text-[#6F7A5A]">
                Pick one or a few — we'll handle the rest.
              </p>
            </div>

            {/* Tag Selection Rows (Airbnb-style) */}
            <div className="px-6 space-y-0">
              {CATEGORIES.map((category, idx) => {
                const isSelected = tempSelectedTags.includes(category);
                const emoji = category.match(/^[^\s]+/)?.[0] || "✨";
                const label = category.replace(/^[^\s]+\s/, "");
                
                return (
                  <button
                    key={category}
                    onClick={() => handleTagToggle(category)}
                    className={`w-full text-left px-0 py-4 transition-colors ${
                      idx < CATEGORIES.length - 1 ? "border-b border-[#ECEEE4]" : ""
                    } ${
                      isSelected 
                        ? "bg-[#FAFAF7]" 
                        : "hover:bg-[#FAFAF7]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Left: Emoji + Label + Count */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="text-2xl flex-shrink-0">{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-base font-medium text-[#1F2A1F]">
                              {label}
                            </div>
                            {tempSelectedCity && tagCounts[category] !== undefined && (
                              <span className="text-sm text-[#6F7A5A]">
                                ({tagCounts[category]})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Right: Selection Indicator */}
                      <div className="flex-shrink-0 ml-4">
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-[#8F9E4F] flex items-center justify-center">
                            <Icon name="check" size={14} className="text-white" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-[#ECEEE4] flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-transparent" />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Soft limit warning */}
            {tempSelectedTags.length > 3 && (
              <div className="px-6 pt-4 pb-2">
                <p className="text-xs text-[#6F7A5A] text-center">
                  Try 3 or fewer for best results
                </p>
              </div>
            )}
          </div>
        )}

        {/* Sticky Footer (Airbnb-style) */}
        <div 
          className="border-t border-[#ECEEE4] px-6 py-4 flex items-center justify-between flex-shrink-0 bg-white"
          style={{ 
            paddingBottom: `max(16px, env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className="px-0 py-2 text-sm font-medium text-[#1F2A1F] underline disabled:text-[#A8B096] disabled:no-underline disabled:cursor-not-allowed hover:text-[#6F7A5A] transition"
          >
            {step === "vibe" ? "Clear tags" : "Clear all"}
          </button>
          <button
            onClick={step === "where" && query.trim() ? handleSubmit : step === "where" ? handleNext : handleSubmit}
            disabled={step === "where" && query.trim() ? !canSubmit : step === "where" ? !tempSelectedCity : !canSubmit}
            className="h-11 rounded-xl bg-[#8F9E4F] text-white px-5 text-sm font-medium disabled:bg-[#DADDD0] disabled:cursor-not-allowed hover:bg-[#7A8A42] transition flex items-center justify-center gap-2"
          >
            {step === "where" && query.trim() ? (
              <>
                <Icon name="search" size={20} className="text-white flex-shrink-0" />
                <span>Search</span>
              </>
            ) : step === "where" ? (
              <>
                <span>Next</span>
                <Icon name="forward" size={20} className="text-white flex-shrink-0" />
              </>
            ) : (
              <>
                <Icon name="search" size={20} className="text-white flex-shrink-0" />
                <span>Search</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

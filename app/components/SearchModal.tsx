"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { DEFAULT_CITY, getCategoriesByKind } from "../constants";
import { CategoryVisualIcon, getCategoryLabel } from "../lib/categoryVisuals";
import { HOME_TABS, type HomeKind } from "../types/home";
import { useIsDesktop } from "../hooks/useIsDesktop";
import { getCitiesWithPlaces, type City } from "../lib/cities";
import { supabase } from "../lib/supabase";
import { fetchTopCities, topCityNames, type TopCity } from "../lib/topCities";
import Icon, { type IconName } from "./Icon";
import { sanitizePostgrestValueForLike, tokenizeQuery, buildTokenSearchExpr } from "../utils";
import {
  CITY_RADIUS_MILES,
  buildCityRadiusFilter,
  getCityCoords,
  populateCityCoordsCache,
} from "../lib/cityRadius";
import { filterPlaces, type FilterablePlace } from "../lib/filterPlaces";

// Fields searched for free-text token matching across the places table.
// Keep in sync with the columns selected in performSearch below.
const PLACE_SEARCH_FIELDS = [
  "title",
  "description",
  "country",
  "city",
  "city_name_cached",
  "address",
  "kind",
] as const;

const GENERIC_SEARCH_TOKENS = new Set([
  "place",
  "places",
  "location",
  "locations",
  "spot",
  "spots",
  "near",
  "nearby",
  "around",
]);

const getMeaningfulSearchTokens = (raw: string): string[] => {
  const tokens = tokenizeQuery(raw);
  const meaningful = tokens.filter((token) => !GENERIC_SEARCH_TOKENS.has(token));
  return meaningful.length > 0 ? meaningful : tokens;
};

type ErrorLike = {
  name?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type SearchPlaceRow = {
  id: string;
  title: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  city_name_cached: string | null;
  address: string | null;
  kind: string | null;
  categories: string[] | null;
  cover_url: string | null;
  lat?: number | null;
  lng?: number | null;
};

type CountPlaceRow = FilterablePlace & {
  id: string;
  title: string | null;
  description: string | null;
  country: string | null;
  address: string | null;
};

const toErrorLike = (error: unknown): ErrorLike => {
  if (error && typeof error === "object") {
    return error as ErrorLike;
  }
  return { message: String(error) };
};

const isAbortLikeError = (error: unknown): boolean => {
  const err = toErrorLike(error);
  return (
    err.name === "AbortError" ||
    err.message?.includes("abort") === true ||
    err.code === "ECONNABORTED"
  );
};

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
  iconName: IconName;
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
          <Image
            src={result.coverUrl} 
            alt={result.title}
            width={48}
            height={48}
            sizes="48px"
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className={`w-12 h-12 rounded-xl ${color.bg} ${color.hover} flex items-center justify-center flex-shrink-0 transition-colors`}>
          <Icon 
            name={iconName} 
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
  onSearchSubmit?: (
    city: string | null,
    query: string,
    tags?: string[],
    kind?: HomeKind | null,
  ) => void;
  selectedCity?: string | null;
  searchQuery?: string;
  selectedTags?: string[];
  /**
   * Если SearchModal открывается со страницы, у которой уже есть выбранный
   * тип карточки (главная с табами, /map с ?kinds=…), можно прокинуть его
   * сюда — модал предвыберет соответствующую карту на шаге Type.
   */
  initialKind?: HomeKind | null;
};

type SearchResult = {
  type: "city" | "place" | "tag";
  id: string;
  title: string;
  subtitle?: string;
  icon?: IconName;
  coverUrl?: string | null;
};

const orderCitiesByTopNames = (
  cities: City[],
  topNames: readonly string[],
): City[] => {
  if (topNames.length === 0) return cities;

  const cityByName = new Map(
    cities.map((city) => [city.name.toLowerCase(), city]),
  );
  const ordered: City[] = [];
  const seen = new Set<string>();

  for (const name of topNames) {
    const city = cityByName.get(name.toLowerCase());
    if (!city || seen.has(city.id)) continue;
    ordered.push(city);
    seen.add(city.id);
  }

  return [...ordered, ...cities.filter((city) => !seen.has(city.id))];
};

export default function SearchModal({
  isOpen,
  onClose,
  onCitySelect,
  onSearchSubmit,
  selectedCity,
  searchQuery: initialSearchQuery = "",
  selectedTags: initialSelectedTags = [],
  initialKind = null,
}: SearchModalProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  // Step management: "where" | "kind" | "vibe"
  // После выбора города показываем шаг с тремя картами (Locations /
  // Experiences / Services), и только потом — категории, отфильтрованные
  // под выбранный тип (см. getCategoriesByKind в constants.ts).
  const [step, setStep] = useState<"where" | "kind" | "vibe">("where");
  const [query, setQuery] = useState(initialSearchQuery);
  const [tempSelectedCity, setTempSelectedCity] = useState<string | null>(selectedCity || null);
  const [tempSelectedTags, setTempSelectedTags] = useState<string[]>(initialSelectedTags);
  const [tempSelectedKind, setTempSelectedKind] = useState<HomeKind | null>(initialKind);
  const [cities, setCities] = useState<City[]>([]);
  const [topCities, setTopCities] = useState<TopCity[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [placesCount, setPlacesCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<Array<{ city: string | null; query: string; tags?: string[] }>>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [tagCountsLoading, setTagCountsLoading] = useState(false);
  const [suggestedCityCounts, setSuggestedCityCounts] = useState<Record<string, number>>({});
  // Счётчики на шаге Type. null = ещё не загружено.
  const [kindCounts, setKindCounts] = useState<Record<HomeKind, number | null>>({
    location: null,
    experience: null,
    service: null,
  });
  const [kindCountsLoading, setKindCountsLoading] = useState(false);

  // Категории, доступные на текущем шаге vibe.
  const currentCategories = useMemo(
    () => getCategoriesByKind(tempSelectedKind),
    [tempSelectedKind],
  );
  const visibleCategories = useMemo(
    () =>
      currentCategories.filter((category) => {
        if (tempSelectedTags.includes(category)) return true;
        const count = tagCounts[category];
        return count !== undefined && count > 0;
      }),
    [currentCategories, tagCounts, tempSelectedTags],
  );
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

  // Load cities. Suggested destinations use the same top-by-visible-count
  // order as the home hero dropdown, while the full city rows keep coords for
  // radius filters and autocomplete search.
  useEffect(() => {
    let isUnmounting = false;

    (async () => {
      if (isUnmounting) return;
      
      try {
        const [citiesData, topCities] = await Promise.all([
          getCitiesWithPlaces(),
          fetchTopCities(5),
        ]);
        if (isUnmounting) return;
        const orderedCities = orderCitiesByTopNames(
          citiesData,
          topCityNames(topCities),
        );
        setTopCities(topCities);
        setCities(orderedCities);
        populateCityCoordsCache(orderedCities);
      } catch (err: unknown) {
        if (isAbortLikeError(err)) {
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

  // Look up city coordinates from loaded cities
  const getCityLatLng = useCallback(
    (cityName: string): { lat: number | null; lng: number | null } => {
      const matches = cities.filter(
        (c) => c.name.toLowerCase() === cityName.toLowerCase(),
      );
      const match =
        matches.find((city) => city.lat != null && city.lng != null) ??
        matches[0];
      return { lat: match?.lat ?? null, lng: match?.lng ?? null };
    },
    [cities],
  );

  const countPlacesWithClientFilters = useCallback(async (
    city: string | null,
    tags: string[],
    searchQuery: string,
    kind: HomeKind | null,
  ): Promise<number> => {
    try {
      let placesQuery = supabase
        .from("places")
        .select("id,title,description,country,city,city_name_cached,address,kind,categories,lat,lng,access_level,visibility")
        .eq("is_hidden", false);

      if (kind) {
        placesQuery = placesQuery.eq("kind", kind);
      }

      const { data, error } = await placesQuery;
      if (error) {
        if (!isAbortLikeError(error)) {
          console.error("Error counting places:", error);
        }
        return 0;
      }

      let rows = (data ?? []) as CountPlaceRow[];

      if (searchQuery.trim()) {
        const tokens = getMeaningfulSearchTokens(searchQuery);
        const normalizeForMatch = (s: string): string =>
          s.toLowerCase().replace(/[''`‘’]/g, "_");
        const fallbackNeedle = normalizeForMatch(searchQuery.trim());

        rows = rows.filter((place) => {
          const haystack = PLACE_SEARCH_FIELDS
            .map((field) => place[field])
            .filter((value) => typeof value === "string" && value.length > 0)
            .map((value) => normalizeForMatch(String(value)))
            .join(" || ");

          if (tokens.length > 0) {
            return tokens.some((token) => haystack.includes(token));
          }

          return fallbackNeedle.length > 0 && haystack.includes(fallbackNeedle);
        });
      }

      const coords = city ? await getCityCoords(city) : null;
      const cityCoordsMap = city
        ? new Map([[city.toLowerCase().trim(), coords ?? { lat: null, lng: null }]])
        : undefined;

      return filterPlaces(rows, {
        cities: city ? [city] : undefined,
        categories: tags.length > 0 ? tags : undefined,
        kinds: kind ? [kind] : undefined,
        cityCoordsMap,
      }).length;
    } catch (err: unknown) {
      if (!isAbortLikeError(err)) {
        console.error("Error in countPlacesWithClientFilters:", err);
      }
      return 0;
    }
  }, [getCityLatLng]);

  // Get count for a single tag in a city (optionally constrained by kind).
  const getTagCount = useCallback(async (
    city: string | null,
    tag: string,
    kind: HomeKind | null,
  ) => {
    return countPlacesWithClientFilters(city, [tag], "", kind);
  }, [countPlacesWithClientFilters]);

  // Load tag counts when city + kind are selected
  useEffect(() => {
    if (!isOpen || step !== "vibe" || !tempSelectedCity) {
      setTagCounts({});
      setTagCountsLoading(false);
      return;
    }

    let cancelled = false;
    const loadTagCounts = async () => {
      setTagCountsLoading(true);
      const counts: Record<string, number> = {};
      try {
        await Promise.all(
          currentCategories.map(async (category) => {
            const count = await getTagCount(tempSelectedCity, category, tempSelectedKind);
            counts[category] = count;
          }),
        );
        if (!cancelled) {
          setTagCounts(counts);
        }
      } finally {
        if (!cancelled) {
          setTagCountsLoading(false);
        }
      }
    };

    const timeoutId = setTimeout(loadTagCounts, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isOpen, step, tempSelectedCity, tempSelectedKind, currentCategories, getTagCount]);

  // Load kind counts on the "kind" step.
  useEffect(() => {
    if (!isOpen || step !== "kind" || !tempSelectedCity) {
      return;
    }

    let cancelled = false;
    const loadKindCounts = async () => {
      setKindCountsLoading(true);
      try {
        const next: Record<HomeKind, number | null> = {
          location: 0,
          experience: 0,
          service: 0,
        };
        const tabs: HomeKind[] = ["location", "experience", "service"];
        await Promise.all(
          tabs.map(async (tab) => {
            next[tab] = await countPlacesWithClientFilters(tempSelectedCity, [], "", tab);
          }),
        );
        if (!cancelled) setKindCounts(next);
      } catch (err: unknown) {
        if (!isAbortLikeError(err)) {
          console.error("Error loading kind counts:", err);
        }
      } finally {
        if (!cancelled) setKindCountsLoading(false);
      }
    };

    const timeoutId = setTimeout(loadKindCounts, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isOpen, step, tempSelectedCity, countPlacesWithClientFilters]);

  // Get filtered places count (with city, tags, query, kind)
  const getFilteredPlacesCount = useCallback(async (
    city: string | null,
    tags: string[],
    searchQuery: string,
    kind: HomeKind | null,
  ) => {
    return countPlacesWithClientFilters(city, tags, searchQuery, kind);
  }, [countPlacesWithClientFilters]);

  // Search places and cities (for search results display)
  const performSearch = useCallback(async (
    searchQuery: string,
    city: string | null,
    tags: string[],
    kind: HomeKind | null,
  ) => {
    if (!searchQuery.trim() && !city) {
      setSearchResults([]);
      setPlacesCount(null);
      return;
    }

    setLoading(true);
    try {
      // Update count with current filters
      const count = await getFilteredPlacesCount(city, tags, searchQuery, kind);
      setPlacesCount(count);

      // Get search results for display.
      // Order matters: places (catalog matches) come first, cities after.
      const results: SearchResult[] = [];

      const tokens = getMeaningfulSearchTokens(searchQuery);
      const fullQ = searchQuery.trim().toLowerCase();
      // Normalize a string the same way the tokenizer normalizes the query,
      // so client-side substring matches stay consistent with what the DB
      // ILIKE returned (e.g. "cap_s" must match "cap's place").
      const normalizeForMatch = (s: string): string =>
        s.toLowerCase().replace(/[''`‘’]/g, "_");

      // Search places — token-based OR across multiple fields, then ranked
      // on the client by number of unique tokens hit. This makes
      // "Cap's Restaurant" still surface "Cap's Place" via the "cap" token.
      if (searchQuery.trim()) {
        let placesQuery = supabase
          .from("places")
          .select(
            "id,title,description,city,city_name_cached,country,address,kind,categories,cover_url,lat,lng",
          )
          .eq("is_hidden", false);

        if (tokens.length > 0) {
          const expr = buildTokenSearchExpr(tokens, [...PLACE_SEARCH_FIELDS]);
          if (expr) placesQuery = placesQuery.or(expr);
        } else {
          const s = sanitizePostgrestValueForLike(searchQuery.trim());
          placesQuery = placesQuery.or(
            `title.ilike.%${s}%,description.ilike.%${s}%`,
          );
        }

        // Apply city radius filter at DB level
        if (city) {
          const coords = getCityLatLng(city);
          placesQuery = placesQuery.or(
            buildCityRadiusFilter(city, coords.lat, coords.lng),
          );
        }

        // Сужаем выдачу под выбранный тип.
        if (kind) {
          placesQuery = placesQuery.eq("kind", kind);
        }

        // Pull a wider candidate set so client-side ranking has material to work with.
        placesQuery = placesQuery.limit(50);

        const { data: placesData } = await placesQuery;
        if (placesData && placesData.length > 0) {
          const normFullQ = normalizeForMatch(fullQ);
          const places = placesData as SearchPlaceRow[];
          const ranked = places
            .map((place) => {
              const title = normalizeForMatch(String(place.title ?? ""));
              const haystack = [
                place.title,
                place.description,
                place.country,
                place.city,
                place.city_name_cached,
                place.address,
                place.kind,
                ...(Array.isArray(place.categories) ? place.categories : []),
              ]
                .filter((v) => typeof v === "string" && v.length > 0)
                .map((v) => normalizeForMatch(String(v)))
                .join(" || ");

              let tokenHits = 0;
              let titleHits = 0;
              for (const t of tokens) {
                if (haystack.includes(t)) tokenHits += 1;
                if (title.includes(t)) titleHits += 1;
              }

              // Bonus weighting: exact title match > prefix match > title hits.
              const exactBonus = title === normFullQ ? 100 : 0;
              const prefixBonus =
                normFullQ && title.startsWith(normFullQ) ? 25 : 0;
              const score =
                tokenHits * 10 + titleHits * 2 + prefixBonus + exactBonus;

              return { place, score, tokenHits };
            })
            // Drop rows that didn't match any token at all (DB returned them
            // only because of the city-radius .or() branch, not the text one).
            .filter((r) => tokens.length === 0 || r.tokenHits > 0)
            .sort((a, b) => b.score - a.score);

          ranked.slice(0, 10).forEach(({ place }) => {
            results.push({
              type: "place",
              id: place.id,
              title: typeof place.title === "string" ? place.title : "",
              subtitle:
                typeof place.city_name_cached === "string"
                  ? place.city_name_cached
                  : typeof place.city === "string"
                    ? place.city
                    : "",
              icon: "photo",
              coverUrl:
                typeof place.cover_url === "string" ? place.cover_url : null,
            });
          });
        }
      }

      // Search cities — match if ANY token appears in the city name.
      // Falls back to substring of full query when tokenization yields nothing
      // (e.g. user typed "S." which is below the min-len threshold).
      // Pushed after places so the catalog matches surface first.
      if (searchQuery.trim()) {
        const matchingCities = cities.filter((c) => {
          const name = normalizeForMatch(c.name);
          if (tokens.length === 0) return name.includes(normalizeForMatch(fullQ));
          // Token may contain `_` as single-char wildcard. For client-side
          // matching we treat `_` literally — it'll still match the
          // normalized apostrophe in the haystack.
          return tokens.some((t) => name.includes(t));
        });
        matchingCities.forEach((city) => {
          results.push({
            type: "city",
            id: city.id,
            title: city.name,
            subtitle: "City",
            icon: "location",
          });
        });
      }

      setSearchResults(results);
    } catch (err: unknown) {
      if (!isAbortLikeError(err)) {
        console.error("Error searching:", err);
      }
      setSearchResults([]);
      setPlacesCount(0);
    } finally {
      setLoading(false);
    }
  }, [cities, getCityLatLng, getFilteredPlacesCount]);

  // Update places count when filters change
  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = setTimeout(async () => {
      const count = await getFilteredPlacesCount(
        tempSelectedCity,
        tempSelectedTags,
        query,
        tempSelectedKind,
      );
      setPlacesCount(count);

      // Also perform search if there's a query
      if (query.trim()) {
        performSearch(query, tempSelectedCity, tempSelectedTags, tempSelectedKind);
      } else {
        setSearchResults([]);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query, tempSelectedCity, tempSelectedTags, tempSelectedKind, isOpen, getFilteredPlacesCount, performSearch]);

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
      setTempSelectedKind(initialKind ?? null);
      setKindCounts({ location: null, experience: null, service: null });
      setStep("where"); // Always start at "where" step
    }
  }, [isOpen, initialSearchQuery, selectedCity, initialSelectedTags, initialKind]);

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
    // После выбора города ведём не сразу на vibe, а на шаг с типом карточки.
    if (city) {
      setStep("kind");
    }
  };

  const handleKindSelect = (kind: HomeKind) => {
    // Disabled: тип, у которого 0 карточек в этом городе, не выбираем.
    if (kindCounts[kind] === 0) return;
    if (kind !== tempSelectedKind) {
      // Меняем тип → старые теги (категории прежнего kind) сбрасываем,
      // иначе на vibe появятся «инородные» категории, которые не дадут счёт.
      setTempSelectedTags([]);
    }
    setTempSelectedKind(kind);
    setStep("vibe");
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
    } else if (step === "kind") {
      // Сбрасываем тип и теги, но город оставляем — юзер уже выбрал.
      setTempSelectedKind(null);
      setTempSelectedTags([]);
    } else {
      // Reset everything on where step and close the modal
      setQuery("");
      setTempSelectedCity(null);
      setTempSelectedKind(null);
      setTempSelectedTags([]);
      setPlacesCount(null);
      setSearchResults([]);
      // Close the search modal after clearing
      onClose();
    }
  };

  const handleBack = () => {
    if (step === "vibe") {
      setStep("kind");
    } else if (step === "kind") {
      setStep("where");
    } else {
      onClose();
    }
  };

  const handleNext = () => {
    if (step === "where") {
      if (tempSelectedCity) {
        setStep("kind");
      }
    } else if (step === "kind") {
      if (tempSelectedKind) {
        setStep("vibe");
      }
    }
  };

  const handleSubmit = () => {
    saveToRecent(tempSelectedCity, query, tempSelectedTags);
    onCitySelect(tempSelectedCity);
    if (onSearchSubmit) {
      onSearchSubmit(tempSelectedCity, query, tempSelectedTags, tempSelectedKind);
    }
    onClose();
  };

  const canSubmit =
    tempSelectedCity !== null ||
    query.trim() !== "" ||
    tempSelectedTags.length > 0 ||
    tempSelectedKind !== null;
  const hasChanges =
    step === "vibe"
      ? tempSelectedTags.length > 0
      : step === "kind"
        ? tempSelectedKind !== null || tempSelectedTags.length > 0
        : tempSelectedCity !== null ||
          query.trim() !== "" ||
          tempSelectedTags.length > 0 ||
          tempSelectedKind !== null;

  // Get current city (from profile or last selected)
  const currentCity = selectedCity || DEFAULT_CITY;

  // Get popular cities in home-hero order, excluding the current city row that
  // is already rendered above as "Current location".
  const popularCities = useMemo(
    () =>
      cities
        .filter((city) => city.name.toLowerCase() !== currentCity.toLowerCase())
        .slice(0, 5),
    [cities, currentCity],
  );

  const suggestedCityNames = useMemo(
    () => [currentCity, ...popularCities.map((city) => city.name)],
    [currentCity, popularCities],
  );

  useEffect(() => {
    let isCancelled = false;

    setSuggestedCityCounts({});

    (async () => {
      const resolvedCounts = await Promise.all(
        suggestedCityNames.map(async (cityName) => [
          cityName.toLowerCase(),
          await getFilteredPlacesCount(cityName, [], "", null),
        ] as const),
      );

      if (isCancelled) return;

      setSuggestedCityCounts(Object.fromEntries(resolvedCounts));
    })();

    return () => {
      isCancelled = true;
    };
  }, [getFilteredPlacesCount, suggestedCityNames]);

  const formatLocationsCount = useCallback((count?: number) => {
    if (count === undefined) return null;
    return `${count.toLocaleString()} ${count === 1 ? "location" : "locations"}`;
  }, []);

  if (!isOpen) return null;

  const modalEl = (
    <div 
      className="fixed inset-0 z-[9999] bg-white lg:bg-black/50 lg:flex lg:items-center lg:justify-center"
      style={{ height: dynamicHeight }}
      aria-modal="true"
      role="dialog"
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
            {step !== "where" ? (
              <Icon name="back" size={20} className="text-[#1F2A1F]" />
            ) : (
              <div className="w-10" /> // Spacer when no back needed
            )}
          </button>
          <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F]">
            {step === "where"
              ? "Where?"
              : step === "kind"
                ? "What are you looking for?"
                : "What's your vibe?"}
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
                    // Future flow: implement geolocation.
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
                    <div className="text-sm text-[#6F7A5A]">
                      {(() => {
                        const countLabel = formatLocationsCount(
                          suggestedCityCounts[currentCity.toLowerCase()],
                        );
                        return countLabel
                          ? `Current location · ${countLabel}`
                          : "Current location";
                      })()}
                    </div>
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
                        <div className="text-sm text-[#6F7A5A]">
                          {(() => {
                            const countLabel = formatLocationsCount(
                              suggestedCityCounts[city.name.toLowerCase()],
                            );
                            return countLabel
                              ? `Popular destination · ${countLabel}`
                              : "Popular destination";
                          })()}
                        </div>
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
                (() => {
                  const colors = [
                    { bg: "bg-[#E8F0E8]", hover: "group-hover:bg-[#D4E4D4]", icon: "text-[#8F9E4F]" },
                    { bg: "bg-[#F5E8D8]", hover: "group-hover:bg-[#E8D4C0]", icon: "text-[#C96A5B]" },
                    { bg: "bg-[#F0E8F5]", hover: "group-hover:bg-[#E0D4E8]", icon: "text-[#9E4F8F]" },
                    { bg: "bg-[#E8F5F0]", hover: "group-hover:bg-[#D4E8E0]", icon: "text-[#4F9E8F]" },
                    { bg: "bg-[#F5F0E8]", hover: "group-hover:bg-[#E8E0D4]", icon: "text-[#9E8F4F]" },
                    { bg: "bg-[#E8E8F5]", hover: "group-hover:bg-[#D4D4E8]", icon: "text-[#4F4F9E]" },
                  ];
                  const placeResults = searchResults.filter((r) => r.type === "place");
                  const cityResults = searchResults.filter((r) => r.type === "city");
                  const otherResults = searchResults.filter(
                    (r) => r.type !== "place" && r.type !== "city",
                  );
                  const handlePlaceClick = (placeId: string) => {
                    if (isDesktop) {
                      window.open(`/id/${placeId}`, "_blank", "noopener,noreferrer");
                    } else {
                      router.push(`/id/${placeId}`);
                    }
                  };
                  const renderSection = (
                    sectionTitle: string,
                    items: SearchResult[],
                  ) => (
                    <div className="space-y-0">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6F7A5A] pt-4 pb-2">
                        {sectionTitle}
                      </h3>
                      {items.map((result, idx) => {
                        const color = colors[idx % colors.length];
                        const iconName =
                          result.type === "city"
                            ? "location"
                            : result.icon || "photo";
                        return (
                          <SearchResultItem
                            key={`${result.type}-${result.id}`}
                            result={result}
                            color={color}
                            iconName={iconName}
                            idx={idx}
                            totalResults={items.length}
                            onCitySelect={handleCitySelect}
                            onQuerySet={setQuery}
                            onPlaceClick={handlePlaceClick}
                            onClose={onClose}
                          />
                        );
                      })}
                    </div>
                  );
                  return (
                    <>
                      {placeResults.length > 0 && renderSection("Places", placeResults)}
                      {cityResults.length > 0 && renderSection("Cities", cityResults)}
                      {otherResults.length > 0 && renderSection("Other", otherResults)}
                    </>
                  );
                })()
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

        {/* Step 2: Kind (Locations / Experiences / Services) */}
        {step === "kind" && (
          <div
            className="flex-1 overflow-y-auto"
            style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom, 0px))' }}
          >
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
                    <div className="text-xs text-[#A8B096] mt-0.5">
                      Including places within {CITY_RADIUS_MILES} miles
                    </div>
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
                What are you looking for?
              </h3>
              <p className="text-sm text-[#6F7A5A]">
                Pick a type — we'll show categories for it next.
              </p>
            </div>

            {/* Three big cards (Locations / Experiences / Services) */}
            <div className="px-6 grid grid-cols-3 gap-3">
              {HOME_TABS.map((tab) => {
                const count = kindCounts[tab.id];
                const isSelected = tempSelectedKind === tab.id;
                const isEmpty = count === 0;
                const isLoading = count === null && kindCountsLoading;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleKindSelect(tab.id)}
                    disabled={isEmpty}
                    className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-5 transition ${
                      isSelected
                        ? "border-[#8F9E4F] bg-[#F4F7E8] ring-2 ring-[#8F9E4F]/30"
                        : isEmpty
                          ? "border-[#ECEEE4] bg-[#FAFAF7] opacity-50 cursor-not-allowed"
                          : "border-[#ECEEE4] bg-white hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
                    }`}
                  >
                    {count !== null && (
                      <span
                        className={`absolute top-2 right-3 text-xs font-medium ${
                          isEmpty ? "text-[#C4C9B6]" : "text-[#6F7A5A]"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                    {isLoading && (
                      <span className="absolute top-2 right-3 text-xs text-[#C4C9B6]">…</span>
                    )}
                    <Icon
                      name={tab.icon}
                      size={32}
                      strokeWidth={1.8}
                      className={isEmpty ? "text-[#C4C9B6]" : "text-[#8F9E4F]"}
                    />
                    <span className="text-sm font-medium text-[#1F2A1F]">
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Помощь, если в этом городе вообще нет ни одного типа */}
            {tempSelectedCity &&
              kindCounts.location === 0 &&
              kindCounts.experience === 0 &&
              kindCounts.service === 0 && (
                <div className="px-6 pt-4 pb-2">
                  <p className="text-sm text-[#6F7A5A] text-center">
                    Nothing here yet — try another city.
                  </p>
                </div>
              )}
          </div>
        )}

        {/* Step 3: Vibe (Tags selection) */}
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
                        {placesCount}{" "}
                        unique{" "}
                        {tempSelectedKind === "service"
                          ? placesCount === 1 ? "service" : "services"
                          : tempSelectedKind === "experience"
                            ? placesCount === 1 ? "experience" : "experiences"
                            : placesCount === 1 ? "location" : "locations"}
                        {" "}available
                      </div>
                    ) : (
                      <div className="text-sm text-[#6F7A5A]">
                        Searching...
                      </div>
                    )}
                    <div className="text-xs text-[#A8B096] mt-0.5">
                      Including places within {CITY_RADIUS_MILES} miles
                    </div>
                  </div>
                  <button
                    onClick={() => setStep("kind")}
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
                Pick one or a few — places can match multiple vibes.
              </p>
            </div>

            {/* Tag Selection Rows (Airbnb-style) */}
            <div className="px-6 space-y-0">
              {tagCountsLoading ? (
                <div className="py-10 text-center text-sm text-[#6F7A5A]">
                  Loading vibes...
                </div>
              ) : visibleCategories.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#6F7A5A]">
                  No matching vibes yet. Try a different type or city.
                </div>
              ) : visibleCategories.map((category, idx) => {
                const isSelected = tempSelectedTags.includes(category);
                const label = getCategoryLabel(category);

                return (
                  <button
                    key={category}
                    onClick={() => handleTagToggle(category)}
                    className={`w-full text-left px-0 py-4 transition-colors ${
                      idx < visibleCategories.length - 1 ? "border-b border-[#ECEEE4]" : ""
                    } ${
                      isSelected
                        ? "bg-[#FAFAF7]"
                        : "hover:bg-[#FAFAF7]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Left: Emoji + Label + Count */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#FAFAF7] border border-[#ECEEE4]">
                          <CategoryVisualIcon category={category} className="h-5 w-5" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-medium text-[#1F2A1F]">
                            {label}
                          </div>
                        </div>
                      </div>

                      {/* Right: Count + Selection Indicator */}
                      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        {tempSelectedCity && tagCounts[category] !== undefined && (
                          <span className="text-base text-[#6F7A5A]">
                            {tagCounts[category]}
                          </span>
                        )}
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
            {step === "vibe"
              ? "Clear tags"
              : step === "kind"
                ? "Clear type"
                : "Clear all"}
          </button>
          {(() => {
            // Логика основной кнопки:
            //   where + query → сразу Search (как раньше — поиск по тексту)
            //   where         → Next (требует город)
            //   kind          → Next (требует выбранный тип)
            //   vibe          → Show N places (с учётом всех фильтров)
            const isWhereWithQuery = step === "where" && query.trim() !== "";
            const onClick =
              isWhereWithQuery
                ? handleSubmit
                : step === "vibe"
                  ? handleSubmit
                  : handleNext;
            const disabled = isWhereWithQuery
              ? !canSubmit
              : step === "where"
                ? !tempSelectedCity
                : step === "kind"
                  ? !tempSelectedKind
                  : !canSubmit;
            return (
              <button
                onClick={onClick}
                disabled={disabled}
                className="h-11 rounded-xl bg-[#8F9E4F] text-white px-5 text-sm font-medium disabled:bg-[#DADDD0] disabled:cursor-not-allowed hover:bg-[#7A8A42] transition flex items-center justify-center gap-2"
              >
                {isWhereWithQuery ? (
                  <>
                    <Icon name="search" size={20} className="text-white flex-shrink-0" />
                    <span>Search</span>
                  </>
                ) : step === "where" || step === "kind" ? (
                  <>
                    <span>Next</span>
                    <Icon name="forward" size={20} className="text-white flex-shrink-0" />
                  </>
                ) : (
                  <>
                    <Icon name="search" size={20} className="text-white flex-shrink-0" />
                    <span>
                      {placesCount !== null
                        ? `Show ${placesCount} ${placesCount === 1 ? 'place' : 'places'}`
                        : 'Show places'}
                    </span>
                  </>
                )}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(modalEl, document.body) : null;
}

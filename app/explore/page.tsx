"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleMap, InfoWindow } from "@react-google-maps/api";
import { useGoogleMaps } from "../providers/GoogleMapsProvider";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { MaporiaClusterRenderer } from "../lib/clusterRenderer";
import { CATEGORIES } from "../constants";
import TopBar from "../components/TopBar";
import PlaceCard from "../components/PlaceCard";
import FavoriteIcon from "../components/FavoriteIcon";
import PremiumBadge from "../components/PremiumBadge";
// Heavy modals — only loaded when user opens them.
import nextDynamic from "next/dynamic";
const SearchModal = nextDynamic(() => import("../components/SearchModal"), { ssr: false });
import { getMapOptions } from "../config/googleMaps";
import { getCategoryEmoji, createMarkerIcon } from "../lib/mapMarkers";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { DEFAULT_CITY } from "../constants";
import { useUserAccessContext } from "../contexts/UserAccessContext";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import { useIsDesktop } from "../hooks/useIsDesktop";
import { usePremiumGate } from "../hooks/usePremiumGate";
import { isPlacePremium, canUserViewPlace, type UserAccess } from "../lib/access";
import Icon from "../components/Icon";
import { PlaceCardGridSkeleton, MapSkeleton, Empty } from "../components/Skeleton";
import { sanitizePostgrestValue, cx, initialsFromEmail, timeAgo, isValidPhotoUrl } from "../utils";
import type { PlaceListItem as Place } from "../types";
import { buildMultiCityRadiusFilter } from "../lib/cityRadius";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

// Result types for Supabase (Database['public']['Tables'][table]['Row'] + Pick)
type PlacesRow = Database["public"]["Tables"]["places"]["Row"];
type ReactionsRow = Database["public"]["Tables"]["reactions"]["Row"];
type PlacePhotosRow = Database["public"]["Tables"]["place_photos"]["Row"];

type PlacesResult = { data: PlacesRow[] | null; error: PostgrestError | null };

type ReactionPlaceId = Pick<ReactionsRow, "place_id">;
type ReactionsPlaceIdResult = { data: ReactionPlaceId[] | null; error: PostgrestError | null };

type PlacePhotoUrl = Pick<PlacePhotosRow, "url">;
type PlacePhotosUrlResult = { data: PlacePhotoUrl[] | null; error: PostgrestError | null };
type PlacePhotoPlaceIdUrl = Pick<PlacePhotosRow, "place_id" | "url">;
type PlacePhotosBatchResult = { data: PlacePhotoPlaceIdUrl[] | null; error: PostgrestError | null };

export default function ExplorePage() {
  const router = useRouter();
  const { redirectToAuth } = useAuthRedirect();
  const isDesktop = useIsDesktop();

  const [view, setView] = useState<"list" | "map">("list");
  
  const shouldLoadMap = view === "map";
  const [showMapMobile, setShowMapMobile] = useState(false);
  const [bottomSheetPosition, setBottomSheetPosition] = useState<number>(0.6); // 0.3, 0.6, or 0.9
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number | null>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // Batch-loaded place photos: one IN(...) query per `places` change instead
  // of N parallel requests from each PlaceCard. Keyed by place_id; falls back
  // to cover_url when there are no photos in `place_photos`.
  const [placePhotosMap, setPlacePhotosMap] = useState<Map<string, string[]>>(new Map());
  // Batch-loaded creator profiles for cards (display name + avatar). Same
  // motivation as placePhotosMap but for the profiles table.
  const [creatorsMap, setCreatorsMap] = useState<Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>>(new Map());

  // User access and profile from context (single session/profile request; no pathname re-fetch)
  const { loading: accessLoading, access, user, profile } = useUserAccessContext();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const userDisplayName = profile?.display_name ?? user?.email?.split("@")[0] ?? null;
  const userAvatar = profile?.avatar_url ?? null;

  // Calculate locked premium places for Haunted Gem indexing
  const defaultUserAccess: UserAccess = access ?? { 
    role: "guest", plan: "free",
    hasPremium: false, 
    isAdmin: false 
  };
  
  const lockedPlacesMap = useMemo(() => {
    const lockedPlaces = places
      .filter(p => {
        const pIsPremium = isPlacePremium(p);
        const pCanView = canUserViewPlace(defaultUserAccess, p);
        const pIsOwner = userId && p.created_by === userId;
        return pIsPremium && !pCanView && !pIsOwner;
      })
      .sort((a, b) => {
        // Sort by created_at for consistent ordering
        if (a.created_at && b.created_at) {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        // Fallback to id for consistent ordering
        return a.id.localeCompare(b.id);
      });
    
    // Create a map of place id -> index (1-based)
    const map = new Map<string, number>();
    lockedPlaces.forEach((p, idx) => {
      map.set(p.id, idx + 1);
    });
    return map;
  }, [places, defaultUserAccess, userId]);

  // Batch-load creator profiles whenever the `places` list changes.
  // One IN(...) query replaces N per-card profile fetches.
  const creatorIdsKey = useMemo(() => {
    const ids = Array.from(new Set(places.map(p => p.created_by).filter(Boolean) as string[]));
    return ids.sort().join(",");
  }, [places]);
  useEffect(() => {
    if (!creatorIdsKey) {
      setCreatorsMap(new Map());
      return;
    }
    const userIds = creatorIdsKey.split(",");
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", userIds);
        if (cancelled || error || !data) return;
        const map = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();
        for (const row of data as Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>) {
          map.set(row.id, { display_name: row.display_name, username: row.username, avatar_url: row.avatar_url });
        }
        if (!cancelled) setCreatorsMap(map);
      } catch {
        // PlaceCard will fall back to "Unknown".
      }
    })();
    return () => { cancelled = true; };
  }, [creatorIdsKey]);

  // Batch-load photos whenever the `places` list changes. One IN(place_id...)
  // query replaces what used to be N parallel queries from each <PlaceCard>.
  // Keyed by joined-and-sorted ids so we don't re-fetch on identical lists.
  const placeIdsKey = useMemo(() => places.map(p => p.id).sort().join(","), [places]);
  useEffect(() => {
    if (places.length === 0) {
      setPlacePhotosMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("place_photos")
          .select("place_id,url")
          .in("place_id", places.map(p => p.id))
          .order("sort", { ascending: true });
        if (cancelled) return;
        const grouped = new Map<string, string[]>();
        if (!error && data) {
          for (const row of data as { place_id: string; url: string }[]) {
            if (!row.place_id || !row.url) continue;
            if (!grouped.has(row.place_id)) grouped.set(row.place_id, []);
            grouped.get(row.place_id)!.push(row.url);
          }
        }
        // Fallback to cover_url for places without any rows in place_photos.
        for (const p of places) {
          if (!grouped.has(p.id) && p.cover_url) {
            grouped.set(p.id, [p.cover_url]);
          }
        }
        if (!cancelled) setPlacePhotosMap(grouped);
      } catch {
        if (cancelled) return;
        const fallback = new Map<string, string[]>();
        for (const p of places) {
          if (p.cover_url) fallback.set(p.id, [p.cover_url]);
        }
        setPlacePhotosMap(fallback);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeIdsKey]);

  // search + filters - инициализируем из query params
  const [searchDraft, setSearchDraft] = useState("");
  const [q, setQ] = useState("");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");

  // Читаем query params при монтировании
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const searchParams = new URLSearchParams(window.location.search);
    const city = searchParams.get('city');
    const category = searchParams.get('category');
    
    if (city) {
      setSelectedCities([city]);
    }
    if (category) {
      setSelectedCategories([category]);
    }
  }, []);

  // modal
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const cities = useMemo(() => {
    // Get unique cities from places (use city_name_cached if available, fallback to city)
    const cityNames = places
      .map((p) => p.city_name_cached || p.city)
      .filter(Boolean) as string[];
    const list = Array.from(new Set(cityNames));
    list.sort((a, b) => a.localeCompare(b));
    return list;
  }, [places]);

  // Получаем популярные теги из всех мест
  const popularTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    places.forEach((place) => {
      if (place.tags && Array.isArray(place.tags)) {
        place.tags.forEach((tag) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
    });
    const sortedTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
    return sortedTags;
  }, [places]);

  // Fetch places when filters change
  // DIAGNOSTIC: Does not wait for accessLoading; places request runs on mount alongside useUserAccess.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let query = supabase.from("places").select("id,title,description,city,city_name_cached,lat,lng,cover_url,categories,tags,created_at,created_by,access_level,country,address,visibility").order("created_at", { ascending: false });
        if (selectedCities.length > 0) {
          const radiusFilter = await buildMultiCityRadiusFilter(selectedCities);
          query = query.or(radiusFilter);
        }
        if (selectedCategories.length > 0) {
          query = query.overlaps("categories", selectedCategories);
        }
        if (q.trim()) {
          const s = sanitizePostgrestValue(q.trim());
          query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`);
        }
        if (selectedTag) {
          query = query.contains("tags", [selectedTag]);
        }
        const queryResult = (await query) as PlacesResult;
        const { data, error } = queryResult;
        if (cancelled) return;
        if (error) {
          console.error("Error loading places:", error);
          setPlaces([]);
          return;
        }
        setPlaces((data ?? []).map((p) => ({
          ...p,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
        })) as Place[]);
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading places:", err);
          setPlaces([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCities, selectedCategories, q, selectedTag]);

  // Fetch favorites when userId becomes available (from context)
  useEffect(() => {
    if (!userId) {
      setFavorites(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from("reactions")
      .select("place_id")
      .eq("user_id", userId)
      .eq("reaction", "like")
      .then((res) => {
        const { data, error } = res as ReactionsPlaceIdResult;
        if (cancelled) return;
        if (error) return;
        setFavorites(new Set((data || []).map((r) => r.place_id)));
      });
    return () => { cancelled = true; };
  }, [userId]);

  // Live search: автоматически применяем поиск при вводе (с небольшой задержкой)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchDraft);
    }, 300); // Debounce 300ms

    return () => clearTimeout(timer);
  }, [searchDraft]);

  function applySearch() {
    setQ(searchDraft);
  }

  function resetFilters() {
    setSelectedCities([]);
    setSelectedCategories([]);
    setQ("");
    setSearchDraft("");
    setSelectedTag("");
  }

  function toggleCity(cityName: string) {
    setSelectedCities((prev) =>
      prev.includes(cityName) ? prev.filter((c) => c !== cityName) : [...prev, cityName]
    );
  }

  function toggleCategory(category: string) {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  async function toggleFavorite(placeId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!userId) {
      redirectToAuth();
      return;
    }

    const isCurrentlyFavorite = favorites.has(placeId);

    try {
      if (isCurrentlyFavorite) {
        // Удаляем из избранного
        const { error } = await supabase
          .from("reactions")
          .delete()
          .eq("place_id", placeId)
          .eq("user_id", userId)
          .eq("reaction", "like");

        if (error) {
          console.error("Error removing favorite:", error);
          alert("Failed to remove from favorites: " + error.message);
        } else {
          setFavorites((prev) => {
            const next = new Set(prev);
            next.delete(placeId);
            return next;
          });
        }
      } else {
        // Добавляем в избранное
        const { error } = await supabase
          .from("reactions")
          // @ts-expect-error — Insert inferred as never when client not typed with Database; payload is valid
          .insert({
            place_id: placeId,
            user_id: userId,
            reaction: "like",
          });

        if (error) {
          console.error("Error adding favorite:", error);
          alert("Failed to add to favorites: " + error.message);
        } else {
          setFavorites((prev) => new Set(prev).add(placeId));
        }
      }
    } catch (err) {
      console.error("Toggle favorite error:", err);
      alert("An error occurred. Check console for details.");
    }
  }

  // Count active filters for badge
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    if (selectedCities.length > 0) count += selectedCities.length;
    if (q.trim()) count += 1;
    if (selectedTag) count += 1;
    return count;
  }, [selectedCategories, selectedCities, q, selectedTag]);

  // Quick search chips
  const quickSearchChips = ["Romantic", "Quiet", "Sunset", "Coffee", "Nature"];

  return (
    <main className="h-screen bg-[#FAFAF7] flex flex-col overflow-hidden">
      <TopBar
        showSearchBar={true}
        searchValue={q}
        onSearchChange={(value) => {
          setQ(value);
          const params = new URLSearchParams();
          // Use first selected city if any
          const firstCity = selectedCities.length > 0 ? selectedCities[0] : null;
          if (firstCity) params.set("city", encodeURIComponent(firstCity));
          if (value.trim()) params.set("q", encodeURIComponent(value.trim()));
          if (selectedCategories.length > 0) {
            params.set("categories", selectedCategories.map(c => encodeURIComponent(c)).join(','));
          }
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={selectedCities.length > 0 ? selectedCities[0] : null}
        onCityChange={(city) => {
          if (city) {
            setSelectedCities([city]);
          } else {
            setSelectedCities([]);
          }
          const params = new URLSearchParams();
          if (city && city.trim()) {
            params.set("city", encodeURIComponent(city.trim()));
          }
          if (q && q.trim()) {
            params.set("q", encodeURIComponent(q.trim()));
          }
          if (selectedCategories.length > 0) {
            params.set("categories", selectedCategories.map(c => encodeURIComponent(c)).join(','));
          }
          router.push(`/map?${params.toString()}`);
        }}
        onFiltersClick={() => router.push("/map")}
        activeFiltersCount={activeFiltersCount}
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
        onSearchBarClick={() => setSearchModalOpen(true)}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onCitySelect={(city) => {
          if (city) {
            setSelectedCities([city]);
          } else {
            setSelectedCities([]);
          }
          const params = new URLSearchParams();
          if (city) params.set("city", encodeURIComponent(city));
          if (q) params.set("q", encodeURIComponent(q));
          if (selectedCategories.length > 0) {
            params.set("categories", selectedCategories.map(c => encodeURIComponent(c)).join(','));
          }
          router.push(`/map?${params.toString()}`);
        }}
        onSearchSubmit={(city, query, tags, kind) => {
          if (city) {
            setSelectedCities([city]);
          } else {
            setSelectedCities([]);
          }
          setQ(query);
          if (tags && tags.length > 0) {
            setSelectedCategories(tags);
          }
          const params = new URLSearchParams();
          if (city && city.trim()) {
            params.set("city", encodeURIComponent(city.trim()));
          }
          if (query.trim()) {
            params.set("q", encodeURIComponent(query.trim()));
          }
          const categoriesToUse = tags || selectedCategories;
          if (categoriesToUse.length > 0) {
            params.set("categories", categoriesToUse.map(c => encodeURIComponent(c)).join(','));
          }
          if (kind) {
            params.set("kinds", kind);
          }
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={selectedCities.length > 0 ? selectedCities[0] : null}
        searchQuery={q}
        selectedTags={selectedCategories}
      />

      {/* 
        MAIN CONTENT - Airbnb-like responsive layout
        ============================================
        
        Breakpoints Table:
        ┌─────────────┬─────────┬──────────────────┬─────────────────┬──────────────────────────┬──────┐
        │ Breakpoint  │ Columns │ Card Width       │ List/Map Ratio  │ Map Mode                 │ Gap  │
        ├─────────────┼─────────┼──────────────────┼─────────────────┼──────────────────────────┼──────┤
        │ < 600px     │ 1       │ 100% (full)      │ 100% / 0%       │ Floating button → Bottom │ 16px │
        │             │         │                  │                 │ sheet (50vh map + sheet) │      │
        ├─────────────┼─────────┼──────────────────┼─────────────────┼──────────────────────────┼──────┤
        │ 600-900px   │ 1       │ 100% (max 680)   │ 100% / 0%       │ Hidden (button "Map")    │ 16px │
        │             │         │ centered         │                 │                          │      │
        ├─────────────┼─────────┼──────────────────┼─────────────────┼──────────────────────────┼──────┤
        │ 900-1120px  │ 2       │ 300-420px        │ 100% / 0%       │ Hidden (button "Show map")│18-20px│
        ├─────────────┼─────────┼──────────────────┼─────────────────┼──────────────────────────┼──────┤
        │ 1120-1440px │ 2       │ 320-420px        │ 62.5% / 37.5%   │ Sticky right (top: 80px) │22-24px│
        ├─────────────┼─────────┼──────────────────┼─────────────────┼──────────────────────────┼──────┤
        │ >= 1440px   │ 3       │ 320-420px        │ 60% / 40%       │ Sticky right (top: 80px) │ 24px │
        │             │         │                  │                 │ border-radius: 16px      │row:28px│
        └─────────────┴─────────┴──────────────────┴─────────────────┴──────────────────────────┴──────┘
        
        Container: max-width 1920px, padding 24px (desktop) / 16-20px (mobile)
        Card image: aspect 4:3, radius 18-22px, carousel dots
        See app/config/layout.ts for detailed configuration
      */}
      <div className="flex-1 min-h-0 pt-[64px] overflow-hidden">
        {/* Desktop XL & Desktop: Split view (≥1120px) - Airbnb-like responsive rules */}
        {/* On very large screens (>=1920px), container stretches to full width, map takes 100% of right side */}
        <div className="hidden lg:flex h-full max-w-[1920px] lg:max-w-none mx-auto px-6">
          {/* Left: Scrollable list - 60% on XL (>=1440px), 62.5% on Desktop (1120-1439px) */}
          {/* On very large screens (>=1920px), list has fixed max-width, map stretches to fill remaining space */}
          <div className="w-[62.5%] lg:w-[60%] lg:w-auto lg:max-w-[1152px] overflow-y-auto scrollbar-hide pr-6">
            {/* Search and Filter Bar */}
            <div className="sticky top-0 z-30 bg-[#FAFAF7] pt-4 pb-3 border-b border-[#ECEEE4] mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 relative">
                  <input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSearchFocused(false);
                      }
                    }}
                    placeholder="Search by vibe, mood, or place"
                    className="w-full h-10 rounded-xl border border-[#ECEEE4] bg-white px-4 pl-10 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] focus:bg-white transition"
                  />
                  <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6F7A5A]" />
                </div>
                <button
                  onClick={() => setFilterOpen(true)}
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-[#8F9E4F] hover:bg-[#FAFAF7] transition relative border border-[#ECEEE4]"
                  aria-label="Filters"
                >
                  <Icon name="filter" size={20} />
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#8F9E4F] text-white text-[10px] font-medium flex items-center justify-center">
                      {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
                    </span>
                  )}
                </button>
              </div>
              {/* Active filter chips */}
              {(selectedCities.length > 0 || selectedCategories.length > 0) && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1 flex-wrap">
                  {selectedCities.map((city) => (
                    <button
                      key={city}
                      onClick={() => {
                        setSelectedCities(prev => prev.filter(c => c !== city));
                      }}
                      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition"
                    >
                      {city}
                      <Icon name="close" size={16} />
                    </button>
                  ))}
                  {selectedCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategories(prev => prev.filter(c => c !== cat));
                      }}
                      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition"
                    >
                      {cat}
                      <Icon name="close" size={16} />
                    </button>
                  ))}
                </div>
              )}
              {/* Quick search chips - always visible */}
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {quickSearchChips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => {
                      setSearchDraft(chip);
                      setSearchFocused(false);
                    }}
                    className="shrink-0 rounded-full px-3 py-1.5 text-sm sm:text-base font-medium text-[#8F9E4F] bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] transition whitespace-nowrap"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-6 lg:gap-y-7">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="w-full">
                    <div className="relative w-full mb-2" style={{ paddingBottom: '100%' }}>
                      <div className="absolute inset-0 rounded-2xl bg-[#ECEEE4] animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-5 w-3/4 bg-[#ECEEE4] rounded animate-pulse" />
                      <div className="h-4 w-1/2 bg-[#ECEEE4] rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : places.length === 0 ? (
              <Empty text="No places with this vibe yet. Try fewer filters." />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-6 lg:gap-y-7">
                {/* Airbnb-like responsive grid: 2 cols on desktop, 3 cols on XL */}
                {/* Cards: min 320px, ideal 360-380px, max 420px */}
                {places.map((p) => {
                  const isFavorite = favorites.has(p.id);
                  const isHovered = hoveredPlaceId === p.id || selectedPlaceId === p.id;
                  const hauntedGemIndex = lockedPlacesMap.get(p.id);
                  return (
                    <div
                      key={p.id}
                      onMouseEnter={() => setHoveredPlaceId(p.id)}
                      onMouseLeave={() => setHoveredPlaceId(null)}
                      onClick={() => {
                        setSelectedPlaceId(p.id);
                        // Обновляем карту только если есть координаты
                        if (p.lat != null && p.lng != null) {
                          setMapCenter({ lat: p.lat, lng: p.lng });
                          setMapZoom(15);
                        }
                      }}
                      className="transition-all relative z-0"
                    >
                      <PlaceCard
                        place={p}
                        userAccess={access}
                        userId={userId}
                        isFavorite={isFavorite}
                        batchPhotos={placePhotosMap.get(p.id)}
                        batchProfile={p.created_by ? creatorsMap.get(p.created_by) : undefined}
                        hauntedGemIndex={hauntedGemIndex}
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F] flex items-center justify-center transition-colors ${
                                isFavorite ? "bg-[#FAFAF7] border-[#8F9E4F]" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <FavoriteIcon 
                                isActive={isFavorite} 
                                size={16}
                                className={isFavorite ? "scale-110" : ""}
                              />
                            </button>
                          ) : undefined
                        }
                        onTagClick={(tag) => {
                          setSelectedTag(tag);
                          setFilterOpen(true);
                        }}
                        onPhotoClick={() => {
                          if (isDesktop) {
                            window.open(`/id/${p.id}`, "_blank", "noopener,noreferrer");
                          } else {
                            router.push(`/id/${p.id}`);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Sticky map - 37.5% on Desktop (1120-1439px), 40% on XL (1440-1919px), 100% of remaining on >=1920px */}
          <div className="w-[37.5%] lg:w-[40%] lg:flex-1 h-full flex-shrink-0 max-w-full pb-8">
            <div className="sticky top-20 h-[calc(100vh-96px-32px)] rounded-2xl overflow-hidden w-full max-w-full">
              <MapView
                shouldLoadMap={shouldLoadMap}
                places={places}
                loading={loading}
                selectedPlaceId={hoveredPlaceId || selectedPlaceId}
                mapCenter={mapCenter}
                mapZoom={mapZoom}
                onMapStateChange={(center, zoom) => {
                  setMapCenter(center);
                  setMapZoom(zoom);
                }}
                userId={userId}
                userAccess={defaultUserAccess}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
              />
            </div>
          </div>
        </div>

        {/* Tablet Large: List only with Show Map button (900px - 1119px) */}
        <div className="hidden max-lg:block h-full">
          <div className="max-w-[1920px] mx-auto px-5">
            {/* Search and Filter Bar */}
            <div className="sticky top-[64px] z-30 bg-[#FAFAF7] pt-4 pb-3 border-b border-[#ECEEE4] mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 relative">
                  <input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    placeholder="Search by vibe, mood, or place"
                    className="w-full h-10 rounded-xl border border-[#ECEEE4] bg-white px-4 pl-10 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#E5E8DB] focus:bg-white transition"
                  />
                  <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8B096]" />
                </div>
                <button
                  onClick={() => setFilterOpen(true)}
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-[#6F7A5A] hover:bg-[#FAFAF7] transition relative border border-[#ECEEE4]"
                  aria-label="Filters"
                >
                  <Icon name="filter" size={20} />
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#6b7d47] text-white text-[10px] font-medium flex items-center justify-center">
                      {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setView("map")}
                  className="h-10 px-4 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
                >
                  Show map
                </button>
              </div>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="w-full">
                    <div className="relative w-full mb-2" style={{ paddingBottom: '100%' }}>
                      <div className="absolute inset-0 rounded-2xl bg-[#ECEEE4] animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-5 w-3/4 bg-[#ECEEE4] rounded animate-pulse" />
                      <div className="h-4 w-1/2 bg-[#ECEEE4] rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : places.length === 0 ? (
              <Empty text="No places with this vibe yet. Try fewer filters." />
            ) : (
              <div className="grid grid-cols-2 gap-5">
                {places.map((p) => {
                  const isFavorite = favorites.has(p.id);
                  return (
                    <div key={p.id} className="transition-all relative z-0">
                      <PlaceCard
                        place={p}
                        userAccess={access}
                        userId={userId}
                        isFavorite={isFavorite}
                        batchPhotos={placePhotosMap.get(p.id)}
                        batchProfile={p.created_by ? creatorsMap.get(p.created_by) : undefined}
                        hauntedGemIndex={lockedPlacesMap.get(p.id)}
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F] flex items-center justify-center transition-colors ${
                                isFavorite ? "bg-[#FAFAF7] border-[#8F9E4F]" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <FavoriteIcon 
                                isActive={isFavorite} 
                                size={16}
                                className={isFavorite ? "scale-110" : ""}
                              />
                            </button>
                          ) : undefined
                        }
                        onTagClick={(tag) => {
                          setSelectedTag(tag);
                          setFilterOpen(true);
                        }}
                        onPhotoClick={() => {
                          if (isDesktop) {
                            window.open(`/id/${p.id}`, "_blank", "noopener,noreferrer");
                          } else {
                            router.push(`/id/${p.id}`);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tablet: List only (600px - 899px) */}
        <div className="hidden max-lg:block h-full">
          <div className="max-w-[680px] mx-auto px-6">
            {/* Search and Filter Bar */}
            <div className="sticky top-[64px] z-30 bg-[#FAFAF7] pt-4 pb-3 border-b border-[#ECEEE4] mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 relative">
                  <input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    placeholder="Search by vibe, mood, or place"
                    className="w-full h-10 rounded-xl border border-[#ECEEE4] bg-white px-4 pl-10 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#E5E8DB] transition"
                  />
                  <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8B096]" />
                </div>
                <button
                  onClick={() => setFilterOpen(true)}
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-[#6F7A5A] hover:bg-[#FAFAF7] transition relative border border-[#ECEEE4]"
                  aria-label="Filters"
                >
                  <Icon name="filter" size={20} />
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#6b7d47] text-white text-[10px] font-medium flex items-center justify-center">
                      {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setView("map")}
                  className="h-10 px-4 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
                >
                  Map
                </button>
              </div>
            </div>
            {loading ? (
              <div className="grid grid-cols-1 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="w-full">
                    <div className="relative w-full mb-2" style={{ paddingBottom: '100%' }}>
                      <div className="absolute inset-0 rounded-2xl bg-[#ECEEE4] animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-5 w-3/4 bg-[#ECEEE4] rounded animate-pulse" />
                      <div className="h-4 w-1/2 bg-[#ECEEE4] rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : places.length === 0 ? (
              <Empty text="No places with this vibe yet. Try fewer filters." />
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {places.map((p) => {
                  const isFavorite = favorites.has(p.id);
                  return (
                    <div key={p.id} className="transition-all relative z-0">
                      <PlaceCard
                        place={p}
                        userAccess={access}
                        userId={userId}
                        isFavorite={isFavorite}
                        batchPhotos={placePhotosMap.get(p.id)}
                        batchProfile={p.created_by ? creatorsMap.get(p.created_by) : undefined}
                        hauntedGemIndex={lockedPlacesMap.get(p.id)}
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F] flex items-center justify-center transition-colors ${
                                isFavorite ? "bg-[#FAFAF7] border-[#8F9E4F]" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <FavoriteIcon 
                                isActive={isFavorite} 
                                size={16}
                                className={isFavorite ? "scale-110" : ""}
                              />
                            </button>
                          ) : undefined
                        }
                        onTagClick={(tag) => {
                          setSelectedTag(tag);
                          setFilterOpen(true);
                        }}
                        onPhotoClick={() => {
                          if (isDesktop) {
                            window.open(`/id/${p.id}`, "_blank", "noopener,noreferrer");
                          } else {
                            router.push(`/id/${p.id}`);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Mobile: List or Map view (< 600px) */}
        <div className="lg:hidden h-full flex flex-col transition-opacity duration-300">
          {/* Search and Filter for Mobile */}
          <div className="sticky top-[64px] z-30 bg-[#faf9f7] pb-4 -mt-4 px-6 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      applySearch();
                    }
                  }}
                  placeholder="Search by vibe, mood, or place"
                  className="w-full rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-2.5 pl-10 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/50 outline-none focus:border-[#6b7d47]/40 focus:bg-white transition"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7d47]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button
                onClick={() => setFilterOpen(true)}
                className="h-10 w-10 rounded-xl flex items-center justify-center text-[#556036] hover:bg-[#f5f4f2] transition relative border border-[#6b7d47]/20"
                aria-label="Filters"
              >
                <Icon name="filter" size={20} className="text-[#556036]" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#6b7d47] text-white text-[10px] font-medium flex items-center justify-center">
                    {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
                  </span>
                )}
              </button>
            </div>
            {/* Quick search chips - always visible */}
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {quickSearchChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => {
                    setSearchDraft(chip);
                    setQ(chip);
                  }}
                  className="shrink-0 rounded-full px-3 py-1.5 text-sm sm:text-base font-medium text-[#556036] bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] transition whitespace-nowrap"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
          {view === "map" ? (
            <>
              {/* Map View: Top map + Bottom sheet */}
              <div className="flex-1 min-h-0 flex flex-col">
                {/* Map takes 50vh */}
                <div className="h-[50vh] flex-shrink-0">
                  <MapView
                    shouldLoadMap={shouldLoadMap}
                    places={places}
                    loading={loading}
                    selectedPlaceId={selectedPlaceId}
                    mapCenter={mapCenter}
                    mapZoom={mapZoom}
                    onMapStateChange={(center, zoom) => {
                      setMapCenter(center);
                      setMapZoom(zoom);
                    }}
                    userId={userId}
                    userAccess={defaultUserAccess}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                  />
                </div>
                
                {/* Bottom Sheet - draggable */}
                <div 
                  className="flex-1 bg-white rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
                  style={{ 
                    height: `${bottomSheetPosition * 100}%`,
                    transition: 'height 0.3s ease-out'
                  }}
                >
                  {/* Drag handle */}
                  <div className="flex-shrink-0 py-3 flex justify-center cursor-grab active:cursor-grabbing" 
                    onTouchStart={(e) => {
                      const startY = e.touches[0].clientY;
                      const startHeight = bottomSheetPosition;
                      
                      const handleMove = (moveEvent: TouchEvent) => {
                        const deltaY = startY - moveEvent.touches[0].clientY;
                        const newHeight = Math.max(0.3, Math.min(0.9, startHeight + deltaY / window.innerHeight));
                        setBottomSheetPosition(newHeight);
                      };
                      
                      const handleEnd = () => {
                        // Snap to nearest point
                        const snapPoints = [0.3, 0.6, 0.9];
                        const nearest = snapPoints.reduce((prev, curr) => 
                          Math.abs(curr - bottomSheetPosition) < Math.abs(prev - bottomSheetPosition) ? curr : prev
                        );
                        setBottomSheetPosition(nearest);
                        document.removeEventListener('touchmove', handleMove);
                        document.removeEventListener('touchend', handleEnd);
                      };
                      
                      document.addEventListener('touchmove', handleMove);
                      document.addEventListener('touchend', handleEnd);
                    }}
                  >
                    <div className="w-12 h-1.5 bg-[#ECEEE4] rounded-full"></div>
                  </div>
                  
                  {/* Sheet content */}
                  <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-20">
                    {selectedPlaceId ? (
                      <div className="py-4">
                        {(() => {
                          const selectedPlace = places.find(p => p.id === selectedPlaceId);
                          if (!selectedPlace) return null;
                          const isFavorite = favorites.has(selectedPlace.id);
                          return (
                            <PlaceCard
                              place={selectedPlace}
                              userAccess={access}
                              userId={userId}
                              hauntedGemIndex={lockedPlacesMap.get(selectedPlace.id)}
                              favoriteButton={
                                userId ? (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      toggleFavorite(selectedPlace.id, e);
                                    }}
                                    className={`h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] flex items-center justify-center transition shadow-sm ${
                                      isFavorite ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                                    }`}
                                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                                  >
                                    <FavoriteIcon 
                                      isActive={isFavorite} 
                                      size={16}
                                      className={isFavorite ? "scale-110" : ""}
                                    />
                                  </button>
                                ) : undefined
                              }
                              onTagClick={(tag) => {
                                setSelectedTag(tag);
                                setFilterOpen(true);
                              }}
                              onPhotoClick={() => {
                                if (isDesktop) {
                                  window.open(`/id/${selectedPlace.id}`, "_blank", "noopener,noreferrer");
                                } else {
                                  router.push(`/id/${selectedPlace.id}`);
                                }
                              }}
                            />
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="py-4">
                        {loading ? (
                          <div className="grid grid-cols-1 gap-4">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} className="w-full">
                                <div className="relative w-full mb-2" style={{ paddingBottom: '100%' }}>
                                  <div className="absolute inset-0 rounded-2xl bg-[#ECEEE4] animate-pulse" />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <div className="h-5 w-3/4 bg-[#ECEEE4] rounded animate-pulse" />
                                  <div className="h-4 w-1/2 bg-[#ECEEE4] rounded animate-pulse" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : places.length === 0 ? (
                          <Empty text="No places with this vibe yet. Try fewer filters." />
                        ) : (
                          <div className="grid grid-cols-1 gap-4">
                            {places.map((p) => {
                              const isFavorite = favorites.has(p.id);
                              return (
                                <div 
                                  key={p.id}
                                  onClick={() => {
                                    setSelectedPlaceId(p.id);
                                    if (p.lat != null && p.lng != null) {
                                      setMapCenter({ lat: p.lat, lng: p.lng });
                                      setMapZoom(15);
                                    }
                                  }}
                                >
                                  <PlaceCard
                                    place={p}
                                    userAccess={access}
                                    userId={userId}
                                    isFavorite={isFavorite}
                                    hauntedGemIndex={lockedPlacesMap.get(p.id)}
                                    favoriteButton={
                                      userId ? (
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            toggleFavorite(p.id, e);
                                          }}
                                          className={`h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F] flex items-center justify-center transition-colors ${
                                            isFavorite ? "bg-[#FAFAF7] border-[#8F9E4F]" : ""
                                          }`}
                                          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                                        >
                                          <FavoriteIcon 
                                            isActive={isFavorite} 
                                            size={16}
                                            className={isFavorite ? "scale-110" : ""}
                                          />
                                        </button>
                                      ) : undefined
                                    }
                                    onTagClick={(tag) => {
                                      setSelectedTag(tag);
                                      setFilterOpen(true);
                                    }}
                                    onPhotoClick={() => {
                                      if (isDesktop) {
                                        window.open(`/id/${p.id}`, "_blank", "noopener,noreferrer");
                                      } else {
                                        router.push(`/id/${p.id}`);
                                      }
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-hide px-6 pt-4 pb-24">
              {loading ? (
                <PlaceCardGridSkeleton count={3} columns={1} />
              ) : places.length === 0 ? (
                <Empty text="No places with this vibe yet. Try fewer filters." />
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {places.map((p) => {
                    const isFavorite = favorites.has(p.id);
                    return (
                      <PlaceCard
                        key={p.id}
                        place={p}
                        userAccess={access}
                        userId={userId}
                        isFavorite={isFavorite}
                        batchPhotos={placePhotosMap.get(p.id)}
                        batchProfile={p.created_by ? creatorsMap.get(p.created_by) : undefined}
                        hauntedGemIndex={lockedPlacesMap.get(p.id)}
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F] flex items-center justify-center transition-colors ${
                                isFavorite ? "bg-[#FAFAF7] border-[#8F9E4F]" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <FavoriteIcon 
                                isActive={isFavorite} 
                                size={16}
                                className={isFavorite ? "scale-110" : ""}
                              />
                            </button>
                          ) : undefined
                        }
                        onTagClick={(tag) => {
                          setSelectedTag(tag);
                          setFilterOpen(true);
                        }}
                        onPhotoClick={() => {
                          if (isDesktop) {
                            window.open(`/id/${p.id}`, "_blank", "noopener,noreferrer");
                          } else {
                            router.push(`/id/${p.id}`);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
          
          {/* Floating Map Button - показываем только в list view на мобильных */}
          {view === "list" && (
            <button
              onClick={() => setView("map")}
              className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 h-12 px-6 rounded-full bg-[#6b7d47] text-white text-sm font-medium shadow-lg hover:bg-[#556036] transition active:scale-95"
            >
              Map
            </button>
          )}
        </div>
      </div>


      {/* FILTER MODAL */}
      {filterOpen && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setFilterOpen(false)}
            aria-label="Close"
          />

          <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-[#6b7d47]/10 overflow-hidden max-h-[80vh]">
              <div className="px-5 py-4 overflow-y-auto max-h-[calc(80vh-80px)]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-[#6b7d47]/60">Maporia</div>
                    <div className="text-lg font-semibold text-[#2d2d2d]">Filters</div>
                  </div>

                  <button
                    onClick={() => setFilterOpen(false)}
                    className="h-9 w-9 rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] hover:bg-[#6b7d47]/10 text-[#6b7d47] transition"
                  >
                    ✕
                  </button>
                </div>
                
                {/* Active filters count */}
                <div className="mb-4 text-sm text-[#6b7d47]/70">
                  {places.length} {places.length === 1 ? "place" : "places"} match
                </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        className={cx(
                          "px-3 py-2 rounded-full text-sm border transition",
                          selectedCategories.includes(cat)
                            ? "bg-[#6b7d47] text-white border-[#6b7d47]"
                            : "bg-white border-[#6b7d47]/20 text-[#2d2d2d] hover:bg-[#f5f4f2]"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {selectedCategories.length > 0 && (
                    <button
                      onClick={() => setSelectedCategories([])}
                      className="mt-2 text-xs text-[#6b7d47]/70 hover:text-[#556036]"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Cities</label>
                  <div className="flex flex-wrap gap-2">
                    {cities.map((c) => (
                      <button
                        key={c}
                        onClick={() => toggleCity(c)}
                        className={cx(
                          "px-3 py-2 rounded-full text-sm border transition",
                          selectedCities.includes(c)
                            ? "bg-[#6b7d47] text-white border-[#6b7d47]"
                            : "bg-white border-[#6b7d47]/20 text-[#2d2d2d] hover:bg-[#f5f4f2]"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {selectedCities.length > 0 && (
                    <button
                      onClick={() => setSelectedCities([])}
                      className="mt-2 text-xs text-[#6b7d47]/70 hover:text-[#556036]"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Search</label>
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setSearchDraft(e.target.value);
                    }}
                    placeholder="Title, country, description…"
                    className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#6b7d47]/40 text-[#2d2d2d] transition"
                  />
                </div>

                {selectedTag && (
                  <div>
                    <label className="text-sm font-medium text-[#6b7d47] mb-2 block">Selected Tag</label>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#6b7d47]/10 text-[#556036] px-3 py-2 text-base font-medium border border-[#6b7d47]/20">
                        #{selectedTag}
                      </span>
                      <button
                        onClick={() => setSelectedTag("")}
                        className="text-xs text-[#6b7d47]/70 hover:text-[#556036]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-2 sticky bottom-0 bg-white pt-4 pb-2">
                <button
                  onClick={resetFilters}
                  className="flex-1 rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-3 text-sm font-medium text-[#6b7d47] hover:bg-[#f5f4f2] transition"
                >
                  Reset
                </button>
                <button
                  onClick={() => setFilterOpen(false)}
                  className="flex-1 rounded-xl bg-[#6b7d47] text-white px-4 py-3 text-sm font-medium hover:bg-[#556036] transition"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-[#6b7d47]/10 shadow-sm p-4 hover:shadow-md transition cursor-pointer">
      {children}
    </div>
  );
}


// getCategoryEmoji and createMarkerIcon are imported from ../lib/mapMarkers

function MapView({
  shouldLoadMap = true,
  places,
  loading,
  selectedPlaceId: externalSelectedPlaceId,
  mapCenter: externalMapCenter,
  mapZoom: externalMapZoom,
  onMapStateChange,
  userId,
  userAccess,
  favorites,
  onToggleFavorite,
}: {
  shouldLoadMap?: boolean;
  places: Place[];
  loading: boolean;
  selectedPlaceId?: string | null;
  mapCenter?: { lat: number; lng: number } | null;
  mapZoom?: number | null;
  onMapStateChange?: (center: { lat: number; lng: number }, zoom: number) => void;
  userId?: string | null;
  userAccess?: UserAccess;
  favorites?: Set<string>;
  onToggleFavorite?: (placeId: string, e: React.MouseEvent) => void;
}) {
  const isDesktop = useIsDesktop();
  const { openPremiumLocation } = usePremiumGate();
  const defaultAccess: UserAccess = userAccess ?? { role: "guest", hasPremium: false, isAdmin: false, plan: "free" };
  const [internalSelectedPlaceId, setInternalSelectedPlaceId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [placePhotos, setPlacePhotos] = useState<Map<string, string[]>>(new Map());
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<Map<string, number>>(new Map());
  const isUpdatingFromPropsRef = useRef(false);
  const lastReportedStateRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null);
  const onMapStateChangeRef = useRef(onMapStateChange);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Refs for imperative markers and MarkerClusterer
  const markersRef = useRef<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);

  // Обновляем ref при изменении callback
  useEffect(() => {
    onMapStateChangeRef.current = onMapStateChange;
  }, [onMapStateChange]);

  // Функции управления картой
  const handleZoomIn = () => {
    if (mapInstance) {
      const currentZoom = mapInstance.getZoom() || 10;
      mapInstance.setZoom(currentZoom + 1);
    }
  };

  const handleZoomOut = () => {
    if (mapInstance) {
      const currentZoom = mapInstance.getZoom() || 10;
      mapInstance.setZoom(currentZoom - 1);
    }
  };

  const handleMyLocation = () => {
    if (mapInstance && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          mapInstance.panTo(userLocation);
          mapInstance.setZoom(15);
          if (onMapStateChangeRef.current) {
            onMapStateChangeRef.current(userLocation, 15);
          }
        },
        (error) => {
          console.error("Error getting user location:", error);
        }
      );
    }
  };

  const handleFullscreen = () => {
    // Находим ближайший родительский контейнер карты
    const mapContainer = document.querySelector('[data-map-container]')?.closest('.rounded-2xl') as HTMLElement;
    const targetElement = mapContainer || document.querySelector('[data-map-container]') as HTMLElement;
    if (!targetElement) return;

    if (!isFullscreen) {
      if (targetElement.requestFullscreen) {
        targetElement.requestFullscreen();
      } else if ((targetElement as any).webkitRequestFullscreen) {
        (targetElement as any).webkitRequestFullscreen();
      } else if ((targetElement as any).msRequestFullscreen) {
        (targetElement as any).msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  };

  // Отслеживаем изменение fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!(document.fullscreenElement || 
           (document as any).webkitFullscreenElement || 
           (document as any).msFullscreenElement)
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);
  // SDK loaded once at app shell level (GoogleMapsProvider in RootLayout).
  // Avoids re-triggering the script tag every time the user navigates here.
  const { isLoaded, loadError } = useGoogleMaps();

  // Log Google Maps loading status (production diagnostics)
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      import('../lib/diagnostics').then(({ logGoogleMapsStatus }) => {
        logGoogleMapsStatus(isLoaded, loadError);
      });
    } else if (loadError) {
      console.error("Google Maps load error:", loadError);
    }
  }, [isLoaded, loadError]);

  // Prevent page scroll when interacting with map on mobile
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
      }
    };

    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  const selectedPlaceId = externalSelectedPlaceId ?? internalSelectedPlaceId;

  const placesWithCoords = useMemo(
    () => places.filter((p) => p.lat != null && p.lng != null),
    [places]
  );

  // Загружаем фото для всех мест одним запросом (batch)
  useEffect(() => {
    if (!isLoaded) return;

    const placeIds = placesWithCoords.map((p) => p.id);
    if (placeIds.length === 0) {
      setPlacePhotos(new Map());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const photosResult = (await supabase
          .from("place_photos")
          .select("place_id, url")
          .in("place_id", placeIds)
          .order("sort", { ascending: true })) as PlacePhotosBatchResult;
        const { data: photosData, error } = photosResult;
        if (cancelled) return;

        const grouped = new Map<string, string[]>();
        if (!error && photosData && photosData.length > 0) {
          for (const row of photosData) {
            if (!row.place_id || !isValidPhotoUrl(row.url)) continue;
            if (!grouped.has(row.place_id)) grouped.set(row.place_id, []);
            grouped.get(row.place_id)!.push(row.url!);
          }
        }
        for (const place of placesWithCoords) {
          if (!grouped.has(place.id) && isValidPhotoUrl(place.cover_url)) {
            grouped.set(place.id, [place.cover_url!]);
          }
        }
        if (!cancelled) setPlacePhotos(grouped);
      } catch {
        if (cancelled) return;
        const fallback = new Map<string, string[]>();
        for (const place of placesWithCoords) {
          if (isValidPhotoUrl(place.cover_url)) fallback.set(place.id, [place.cover_url!]);
        }
        setPlacePhotos(fallback);
      }
    })();
    return () => { cancelled = true; };
  }, [placesWithCoords.map((p) => p.id).join(","), isLoaded]);

  // Вычисляем центр карты на основе всех мест с координатами или используем внешний
  const center = useMemo(() => {
    if (externalMapCenter) return externalMapCenter;
    if (placesWithCoords.length === 0) {
      return { lat: 0, lng: 0 };
    }
    const avgLat =
      placesWithCoords.reduce((sum, p) => sum + (p.lat ?? 0), 0) / placesWithCoords.length;
    const avgLng =
      placesWithCoords.reduce((sum, p) => sum + (p.lng ?? 0), 0) / placesWithCoords.length;
    return { lat: avgLat, lng: avgLng };
  }, [placesWithCoords, externalMapCenter]);

  // Вычисляем zoom
  const zoom = useMemo(() => {
    if (externalMapZoom !== null && externalMapZoom !== undefined) return externalMapZoom;
    if (placesWithCoords.length === 1) return 15;
    if (placesWithCoords.length === 0) return 2;
    return 10;
  }, [placesWithCoords.length, externalMapZoom]);

  // Обновляем карту при изменении внешних пропсов center/zoom
  useEffect(() => {
    if (!mapInstance) return;
    if (externalMapCenter && externalMapZoom !== null && externalMapZoom !== undefined) {
      isUpdatingFromPropsRef.current = true;
      mapInstance.panTo(externalMapCenter);
      mapInstance.setZoom(externalMapZoom);
      lastReportedStateRef.current = { center: externalMapCenter, zoom: externalMapZoom };
      // Сбрасываем флаг после небольшой задержки
      setTimeout(() => {
        isUpdatingFromPropsRef.current = false;
      }, 100);
    }
     
  }, [externalMapCenter, externalMapZoom, mapInstance]);

  // Убрали автоматическое перемещение и увеличение карты при выборе места
  // Теперь карточка просто появляется без изменения масштаба и позиции карты

  // --- Marker Clustering ---
  useEffect(() => {
    if (!mapInstance || !isLoaded) return;

    // Очищаем старые маркеры и кластерер
    if (clustererRef.current) {
      clustererRef.current.setMap(null);
      clustererRef.current = null;
    }
    markersRef.current.forEach((m) => {
      google.maps.event.clearInstanceListeners(m);
      m.setMap(null);
    });
    markersRef.current = [];

    const newMarkers = placesWithCoords.map((place) => {
      const emoji = getCategoryEmoji(place.categories);
      const isPremium = isPlacePremium(place);

      const marker = new google.maps.Marker({
        position: { lat: place.lat!, lng: place.lng! },
        title: place.title,
        icon: createMarkerIcon(emoji, "default", isPremium),
      });

      (marker as any).__placeId = place.id;

      marker.addListener("click", () => {
        if (!externalSelectedPlaceId) {
          setInternalSelectedPlaceId(place.id);
          setCurrentPhotoIndex((prev) => new Map(prev).set(place.id, 0));
        }
        if (navigator.vibrate) navigator.vibrate(10);
      });

      return marker;
    });

    markersRef.current = newMarkers;

    clustererRef.current = new MarkerClusterer({
      map: mapInstance,
      markers: newMarkers,
      renderer: new MaporiaClusterRenderer(),
      onClusterClick: (_event, cluster, map) => {
        if (!externalSelectedPlaceId) {
          setInternalSelectedPlaceId(null);
        }
        const bounds = cluster.bounds;
        if (bounds) {
          map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
        }
      },
    });

    return () => {
      if (clustererRef.current) {
        clustererRef.current.setMap(null);
        clustererRef.current = null;
      }
      newMarkers.forEach((m) => {
        google.maps.event.clearInstanceListeners(m);
        m.setMap(null);
      });
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstance, isLoaded, placesWithCoords, externalSelectedPlaceId]);

  // Обновляем иконку выбранного маркера без пересоздания кластерера
  useEffect(() => {
    if (!isLoaded || markersRef.current.length === 0) return;

    for (const marker of markersRef.current) {
      const placeId = (marker as any).__placeId as string;
      const isSelected = placeId === selectedPlaceId;
      const place = placesWithCoords.find((p) => p.id === placeId);
      if (!place) continue;

      const emoji = getCategoryEmoji(place.categories);
      const isPremium = isPlacePremium(place);
      const state = isSelected ? "active" : "default";

      marker.setIcon(createMarkerIcon(emoji, state, isPremium));

      marker.setZIndex(isSelected ? (google.maps.Marker.MAX_ZINDEX ?? 1000000) + 1 : undefined);
    }
  }, [selectedPlaceId, placesWithCoords, isLoaded]);

  if (loading) {
    return <MapSkeleton className="h-full w-full" />;
  }

  if (placesWithCoords.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-sm font-medium text-[#2d2d2d] mb-1">No places yet</div>
          <div className="text-xs text-[#6b7d47]/60">
            Add places with coordinates to see them on the map.
          </div>
        </div>
      </div>
    );
  }

  // Don't render map content if lazy loading hasn't triggered yet
  if (!shouldLoadMap) {
    return <MapSkeleton className="h-full w-full" />;
  }

  if (!isLoaded) {
    return <MapSkeleton className="h-full w-full" />;
  }

  return (
    <>
    <div className="relative h-full w-full transition-all duration-300 overflow-hidden" data-map-container>
      {/* Custom Map Controls - Bottom Right Corner on Mobile, Top Right on Desktop */}
      <div 
        className="absolute lg:top-3 lg:bottom-auto right-3 z-10 flex flex-col gap-2"
        style={{
          bottom: 'calc(64px + 24px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* My Location Button */}
        <button
          onClick={handleMyLocation}
          className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-[#FAFAF7] transition-colors"
          aria-label="My Location"
          title="My Location"
        >
          <Icon name="my-location" size={20} className="text-green-500" />
        </button>

        {/* Fullscreen Button */}
        <button
          onClick={handleFullscreen}
          className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-[#FAFAF7] transition-colors"
          aria-label="Fullscreen"
          title="Fullscreen"
        >
          {isFullscreen ? (
            <Icon name="minimize" size={20} className="text-[#1F2A1F]" />
          ) : (
            <Icon name="maximize" size={20} className="text-[#1F2A1F]" />
          )}
        </button>

        {/* Zoom Controls */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
          <button
            onClick={handleZoomIn}
            className="w-10 h-10 flex items-center justify-center hover:bg-[#FAFAF7] transition-colors border-b border-[#ECEEE4]"
            aria-label="Zoom In"
            title="Zoom In"
          >
            <Icon name="zoom-in" size={20} className="text-[#1F2A1F]" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-10 h-10 flex items-center justify-center hover:bg-[#FAFAF7] transition-colors"
            aria-label="Zoom Out"
            title="Zoom Out"
          >
            <Icon name="zoom-out" size={20} className="text-[#1F2A1F]" />
          </button>
        </div>
      </div>

      <div 
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {!isLoaded && (
          <div className="absolute inset-0">
            {loadError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#ECEEE4] text-[#6F7A5A]">
                <div className="text-center">
                  <div className="text-sm font-medium mb-1">Error loading map</div>
                  <div className="text-xs">Check console for details</div>
                </div>
              </div>
            ) : (
              <MapSkeleton className="h-full w-full" />
            )}
          </div>
        )}
        {isLoaded && (
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%", maxWidth: "100%" }}
          center={center}
          zoom={zoom}
          onLoad={(map) => setMapInstance(map)}
          onClick={() => {
            // Close InfoWindow when clicking on the map
            if (!externalSelectedPlaceId) {
              setInternalSelectedPlaceId(null);
            }
          }}
          options={getMapOptions()}
          onDragEnd={() => {
            if (isUpdatingFromPropsRef.current) return;
            if (mapInstance && onMapStateChangeRef.current) {
              const center = mapInstance.getCenter();
              const zoom = mapInstance.getZoom();
              if (center && zoom !== undefined) {
                const newState = { lat: center.lat(), lng: center.lng() };
                // Проверяем, изменилось ли состояние
                const lastState = lastReportedStateRef.current;
                if (!lastState || 
                    Math.abs(lastState.center.lat - newState.lat) > 0.0001 ||
                    Math.abs(lastState.center.lng - newState.lng) > 0.0001 ||
                    lastState.zoom !== zoom) {
                  lastReportedStateRef.current = { center: newState, zoom };
                  onMapStateChangeRef.current(newState, zoom);
                }
              }
            }
          }}
          onZoomChanged={() => {
            if (isUpdatingFromPropsRef.current) return;
            if (mapInstance && onMapStateChangeRef.current) {
              const center = mapInstance.getCenter();
              const zoom = mapInstance.getZoom();
              if (center && zoom !== undefined) {
                const newState = { lat: center.lat(), lng: center.lng() };
                // Проверяем, изменилось ли состояние
                const lastState = lastReportedStateRef.current;
                if (!lastState || 
                    Math.abs(lastState.center.lat - newState.lat) > 0.0001 ||
                    Math.abs(lastState.center.lng - newState.lng) > 0.0001 ||
                    lastState.zoom !== zoom) {
                  lastReportedStateRef.current = { center: newState, zoom };
                  onMapStateChangeRef.current(newState, zoom);
                }
              }
            }
          }}
        >
          {/* InfoWindow для выбранного места (standalone, маркеры управляются императивно через MarkerClusterer) */}
          {selectedPlaceId && (() => {
            const place = placesWithCoords.find((p) => p.id === selectedPlaceId);
            if (!place || !place.lat || !place.lng) return null;
            if (typeof window === "undefined" || !(window as any).google?.maps) return null;

            const photos = placePhotos.get(place.id) || (isValidPhotoUrl(place.cover_url) ? [place.cover_url!] : []);
            const currentIndex = currentPhotoIndex.get(place.id) || 0;
            const currentPhoto = photos[currentIndex] || (isValidPhotoUrl(place.cover_url) ? place.cover_url : undefined);
            const hasMultiplePhotos = photos.length > 1;

            const handlePreviousPhoto = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentPhotoIndex((prev) => {
                const newMap = new Map(prev);
                const current = newMap.get(place.id) || 0;
                newMap.set(place.id, current > 0 ? current - 1 : photos.length - 1);
                return newMap;
              });
            };

            const handleNextPhoto = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentPhotoIndex((prev) => {
                const newMap = new Map(prev);
                const current = newMap.get(place.id) || 0;
                newMap.set(place.id, current < photos.length - 1 ? current + 1 : 0);
                return newMap;
              });
            };

            const handleDotClick = (e: React.MouseEvent, index: number) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentPhotoIndex((prev) => new Map(prev).set(place.id, index));
            };

            return (
              <InfoWindow
                position={{ lat: place.lat, lng: place.lng }}
                onCloseClick={() => {
                  if (!externalSelectedPlaceId) {
                    setInternalSelectedPlaceId(null);
                  }
                }}
                options={{
                  pixelOffset: new (window as any).google.maps.Size(0, -10),
                }}
              >
                <div className="w-80 bg-white rounded-xl shadow-xl overflow-hidden">
                  {/* Image Section with Carousel */}
                  <div className="relative w-full" style={{ paddingBottom: '100%' }}>
                    {currentPhoto ? (
                      <div className="absolute inset-0">
                        <img
                          src={currentPhoto}
                          alt={place.title}
                          className="absolute inset-0 w-full h-full object-cover rounded-t-xl"
                        />
                        
                        {/* Premium Badge - Top Left */}
                        {isPlacePremium(place) && (
                          <div className="absolute top-3 left-3 z-10">
                            <PremiumBadge />
                          </div>
                        )}
                        
                        {/* Top Right Buttons - Favorite Icon Always Visible */}
                        <div className="absolute top-3 right-3 flex gap-2 z-10">
                          {userId && onToggleFavorite && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onToggleFavorite(place.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border flex items-center justify-center transition shadow-sm ${
                                favorites?.has(place.id) 
                                  ? "border-[#8F9E4F] bg-[#FAFAF7]" 
                                  : "border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F]"
                              }`}
                              title={favorites?.has(place.id) ? "Remove from favorites" : "Add to favorites"}
                              aria-label={favorites?.has(place.id) ? "Remove from favorites" : "Add to favorites"}
                            >
                              <FavoriteIcon 
                                isActive={favorites?.has(place.id) || false} 
                                size={16}
                              />
                            </button>
                          )}
                        </div>
                        
                        {/* Navigation Arrows */}
                        {hasMultiplePhotos && (
                          <>
                            <button
                              onClick={handlePreviousPhoto}
                              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center transition-colors z-10"
                              aria-label="Previous photo"
                            >
                              <Icon name="back" size={16} className="text-[#1F2A1F]" />
                            </button>
                            <button
                              onClick={handleNextPhoto}
                              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center transition-colors z-10"
                              aria-label="Next photo"
                            >
                              <svg className="w-4 h-4 text-[#2d2d2d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </>
                        )}
                        
                        {/* Pagination Dots */}
                        {hasMultiplePhotos && (
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                            {photos.map((_, index) => (
                              <button
                                key={index}
                                onClick={(e) => handleDotClick(e, index)}
                                className={`h-1.5 rounded-full transition-all duration-200 ${
                                  index === currentIndex
                                    ? 'w-6 bg-white'
                                    : 'w-1.5 bg-white/60 hover:bg-white/80'
                                }`}
                                aria-label={`Go to photo ${index + 1}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-[#f5f4f2] rounded-t-xl flex items-center justify-center">
                        <Icon name="photo" size={24} className="text-[#A8B096]" aria-label="No photo available" />
                      </div>
                    )}
                  </div>
                  {/* Text Content Section */}
                  {(() => {
                    const isPremium = isPlacePremium(place);
                    const canView = canUserViewPlace(defaultAccess, place);
                    const isLocked = isPremium && !canView;
                    const content = (
                      <>
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="text-base font-semibold text-[#2d2d2d] line-clamp-1 flex-1 pr-2">
                            {place.title}
                          </h3>
                        </div>
                        {place.description && (
                          <div className="text-sm text-[#6F7A5A] line-clamp-1 mb-2">
                            {place.description}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-base text-[#2d2d2d]">
                          {place.city && (
                            <>
                              <span>{place.city}</span>
                              {place.tags && place.tags.length > 0 && (
                                <span className="text-[#A8B096]">•</span>
                              )}
                            </>
                          )}
                          {place.tags && place.tags.length > 0 && (
                            <span className="text-[#6F7A5A]">
                              {place.tags.slice(0, 2).join(", ")}
                              {place.tags.length > 2 && ` +${place.tags.length - 2}`}
                            </span>
                          )}
                        </div>
                      </>
                    );
                    if (isLocked) {
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPremiumLocation("place", place.title, place.id);
                            if (!externalSelectedPlaceId) {
                              setInternalSelectedPlaceId(null);
                            }
                          }}
                          className="block w-full text-left p-4 hover:bg-[#FAFAF7] transition-colors rounded-b-xl"
                        >
                          {content}
                        </button>
                      );
                    }
                    return (
                      <Link
                        href={`/id/${place.id}`}
                        target={isDesktop ? "_blank" : undefined}
                        rel={isDesktop ? "noopener noreferrer" : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!externalSelectedPlaceId) {
                            setInternalSelectedPlaceId(null);
                          }
                        }}
                        className="block p-4"
                      >
                        {content}
                      </Link>
                    );
                  })()}
                </div>
              </InfoWindow>
            );
          })()}
        </GoogleMap>
        )}
      </div>
    </div>
    </>
  );
}

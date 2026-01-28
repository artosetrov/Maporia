"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES } from "../constants";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import PlaceCard from "../components/PlaceCard";
import FavoriteIcon from "../components/FavoriteIcon";
import PremiumBadge from "../components/PremiumBadge";
import SearchModal from "../components/SearchModal";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "../config/googleMaps";
import { supabase } from "../lib/supabase";
import { DEFAULT_CITY } from "../constants";
import { useUserAccess } from "../hooks/useUserAccess";
import { isPlacePremium, canUserViewPlace, type UserAccess } from "../lib/access";
import Icon from "../components/Icon";
import { PlaceCardGridSkeleton, MapSkeleton, Empty } from "../components/Skeleton";

type Place = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  categories: string[] | null;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  created_by?: string | null;
  access_level?: string | null;
  is_premium?: boolean | null;
  premium_only?: boolean | null;
  visibility?: string | null;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function initialsFromEmail(email?: string | null) {
  if (!email) return "U";
  const name = email.split("@")[0] || "U";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? name[1] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function ExplorePage() {
  const router = useRouter();
  const pathname = usePathname();
  
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

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // User access for premium filtering
  const { loading: accessLoading, access } = useUserAccess();

  // Calculate locked premium places for Haunted Gem indexing
  const defaultUserAccess: UserAccess = access ?? { 
    role: "guest", 
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
      .map((p) => (p as any).city_name_cached || p.city)
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

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (!u) {
      setUserEmail(null);
      setUserId(null);
      setUserDisplayName(null);
      return;
    }
    setUserEmail(u.email ?? null);
    setUserId(u.id);

    // Загружаем профиль для получения display_name и avatar_url
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", u.id)
      .maybeSingle();
    
    if (profileError) {
      console.error("Error loading user profile:", profileError);
    }
    
    if (profile?.display_name) {
      setUserDisplayName(profile.display_name);
    } else {
      setUserDisplayName(u.email?.split("@")[0] || null);
    }
    
    if (profile?.avatar_url) {
      setUserAvatar(profile.avatar_url);
    }
  }

  // Fetch places when filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let query = supabase.from("places").select("*").order("created_at", { ascending: false });
        if (selectedCities.length > 0) {
          const cityFilters = selectedCities.flatMap(city => [
            `city_name_cached.eq.${city}`,
            `city.eq.${city}`
          ]);
          query = query.or(cityFilters.join(','));
        }
        if (selectedCategories.length > 0) {
          query = query.overlaps("categories", selectedCategories);
        }
        if (q.trim()) {
          const s = q.trim();
          query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`);
        }
        if (selectedTag) {
          query = query.contains("tags", [selectedTag]);
        }
        const { data, error } = await query;
        if (cancelled) return;
        if (error) {
          console.error("Error loading places:", error);
          setPlaces([]);
          return;
        }
        setPlaces((data ?? []).map((p: any) => ({
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

  useEffect(() => {
    (async () => {
      try {
        await loadUser();
      } catch (err: any) {
        // Silently ignore AbortError
        if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
          return;
        }
        console.error("[ExplorePage] Error in initial load:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]); // Add pathname to re-trigger on route change

  // Fetch favorites when userId changes
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
      .then(({ data, error }) => {
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
      router.push("/auth");
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
        onSearchSubmit={(city, query, tags) => {
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
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#8F9E4F] bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] transition whitespace-nowrap"
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
                    <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
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
                          router.push(`/id/${p.id}`);
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
                    <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
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
                          router.push(`/id/${p.id}`);
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
                    <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
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
                          router.push(`/id/${p.id}`);
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
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#556036] bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] transition whitespace-nowrap"
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
                                router.push(`/id/${selectedPlace.id}`);
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
                                <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
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
                                      router.push(`/id/${p.id}`);
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
                          router.push(`/id/${p.id}`);
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
                    <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Selected Tag</label>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#6b7d47]/10 text-[#556036] px-3 py-2 text-sm font-medium border border-[#6b7d47]/20">
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

      <BottomNav />
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


// Функция для создания круглого изображения
function createRoundIcon(imageUrl: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      
      // Создаем круглую обрезку
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
      ctx.clip();
      
      // Рисуем изображение
      ctx.drawImage(img, 0, 0, size, size);
      
      // Добавляем белую обводку
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, 2 * Math.PI);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
      
      resolve(canvas.toDataURL());
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

function MapView({
  places,
  loading,
  selectedPlaceId: externalSelectedPlaceId,
  mapCenter: externalMapCenter,
  mapZoom: externalMapZoom,
  onMapStateChange,
  userId,
  favorites,
  onToggleFavorite,
}: {
  places: Place[];
  loading: boolean;
  selectedPlaceId?: string | null;
  mapCenter?: { lat: number; lng: number } | null;
  mapZoom?: number | null;
  onMapStateChange?: (center: { lat: number; lng: number }, zoom: number) => void;
  userId?: string | null;
  favorites?: Set<string>;
  onToggleFavorite?: (placeId: string, e: React.MouseEvent) => void;
}) {
  const [internalSelectedPlaceId, setInternalSelectedPlaceId] = useState<string | null>(null);
  const [roundIcons, setRoundIcons] = useState<Map<string, string>>(new Map());
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [placePhotos, setPlacePhotos] = useState<Map<string, string[]>>(new Map());
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<Map<string, number>>(new Map());
  const isUpdatingFromPropsRef = useRef(false);
  const lastReportedStateRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null);
  const onMapStateChangeRef = useRef(onMapStateChange);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  
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
  // Always use consistent parameters for useJsApiLoader
  // The component will only render when shouldLoadMap is true
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

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

  // Создаем круглые иконки для всех мест
  useEffect(() => {
    if (!isLoaded) return;
    
    for (const place of placesWithCoords) {
      if (place.cover_url) {
        const smallKey = `${place.id}-small`;
        const largeKey = `${place.id}-large`;
        
        setRoundIcons(prev => {
          const needsSmall = !prev.has(smallKey);
          const needsLarge = !prev.has(largeKey);
          
          if (needsSmall) {
            createRoundIcon(place.cover_url!, 36)
              .then(smallIcon => {
                setRoundIcons(current => {
                  if (!current.has(smallKey)) {
                    return new Map(current).set(smallKey, smallIcon);
                  }
                  return current;
                });
              })
              .catch(err => console.error("Error creating small round icon:", err));
          }
          
          if (needsLarge) {
            createRoundIcon(place.cover_url!, 44)
              .then(largeIcon => {
                setRoundIcons(current => {
                  if (!current.has(largeKey)) {
                    return new Map(current).set(largeKey, largeIcon);
                  }
                  return current;
                });
              })
              .catch(err => console.error("Error creating large round icon:", err));
          }
          
          return prev;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesWithCoords.map(p => `${p.id}-${p.cover_url || ''}`).join(','), isLoaded]);

  // Загружаем фото для всех мест
  useEffect(() => {
    if (!isLoaded) return;
    
    const loadPhotos = async () => {
      for (const place of placesWithCoords) {
        if (placePhotos.has(place.id)) continue;
        
        try {
          const { data: photosData, error } = await supabase
            .from("place_photos")
            .select("url")
            .eq("place_id", place.id)
            .order("sort", { ascending: true });
          
          if (error) {
            console.error("Error loading photos for place:", place.id, error);
            if (place.cover_url) {
              setPlacePhotos(prev => new Map(prev).set(place.id, [place.cover_url!]));
            }
          } else if (photosData && photosData.length > 0) {
            const urls = photosData.map(p => p.url).filter(Boolean);
            if (urls.length > 0) {
              setPlacePhotos(prev => new Map(prev).set(place.id, urls));
            } else if (place.cover_url) {
              setPlacePhotos(prev => new Map(prev).set(place.id, [place.cover_url!]));
            }
          } else if (place.cover_url) {
            setPlacePhotos(prev => new Map(prev).set(place.id, [place.cover_url!]));
          }
        } catch (error) {
          console.error("Exception loading photos:", error);
          if (place.cover_url) {
            setPlacePhotos(prev => new Map(prev).set(place.id, [place.cover_url!]));
          }
        }
      }
    };
    
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesWithCoords.map(p => p.id).join(','), isLoaded]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMapCenter, externalMapZoom, mapInstance]);

  // Убрали автоматическое перемещение и увеличение карты при выборе места
  // Теперь карточка просто появляется без изменения масштаба и позиции карты

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
            <svg className="w-5 h-5 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={handleZoomOut}
            className="w-10 h-10 flex items-center justify-center hover:bg-[#FAFAF7] transition-colors"
            aria-label="Zoom Out"
            title="Zoom Out"
          >
            <svg className="w-5 h-5 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
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
          options={{
            gestureHandling: "greedy",
            disableDefaultUI: true,
            zoomControl: false,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }],
              },
            ],
          }}
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
          {placesWithCoords.map((place) => {
            if (typeof window === "undefined" || !(window as any).google?.maps) return null;
            
            const coverUrl = place.cover_url;
            const isSelected = selectedPlaceId === place.id;
            const iconSize = isSelected ? 44 : 36;
            
            let iconConfig: any;
            
            if (coverUrl) {
              const iconKey = `${place.id}-${isSelected ? "large" : "small"}`;
              const roundIconUrl = roundIcons.get(iconKey);
              
              if (roundIconUrl) {
                // Используем круглую иконку
                iconConfig = {
                  url: roundIconUrl,
                  scaledSize: new (window as any).google.maps.Size(iconSize, iconSize),
                  anchor: new (window as any).google.maps.Point(iconSize / 2, iconSize / 2),
                };
              } else {
                // Fallback на обычное изображение пока загружается круглое
                iconConfig = {
                  url: coverUrl,
                  scaledSize: new (window as any).google.maps.Size(iconSize, iconSize),
                  anchor: new (window as any).google.maps.Point(iconSize / 2, iconSize / 2),
                };
              }
            } else {
              // Fallback на стандартный маркер
              iconConfig = {
                path: (window as any).google?.maps?.SymbolPath?.CIRCLE,
                scale: isSelected ? 8 : 7,
                fillColor: isSelected ? "#556036" : "#6b7d47",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              };
            }

            return (
              <Marker
                key={place.id}
                position={{ lat: place.lat!, lng: place.lng! }}
                title={place.title}
                icon={iconConfig}
                onClick={() => {
                  if (!externalSelectedPlaceId) {
                    setInternalSelectedPlaceId(place.id);
                    // Reset photo index when opening a new place
                    setCurrentPhotoIndex(prev => {
                      const newMap = new Map(prev);
                      newMap.set(place.id, 0);
                      return newMap;
                    });
                  }
                  // Haptic feedback simulation
                  if (navigator.vibrate) {
                    navigator.vibrate(10);
                  }
                }}
              >
                {selectedPlaceId === place.id && (() => {
                  const photos = placePhotos.get(place.id) || (place.cover_url ? [place.cover_url] : []);
                  const currentIndex = currentPhotoIndex.get(place.id) || 0;
                  const currentPhoto = photos[currentIndex] || place.cover_url;
                  const hasMultiplePhotos = photos.length > 1;
                  
                  const handlePreviousPhoto = (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentPhotoIndex(prev => {
                      const newMap = new Map(prev);
                      const current = newMap.get(place.id) || 0;
                      newMap.set(place.id, current > 0 ? current - 1 : photos.length - 1);
                      return newMap;
                    });
                  };
                  
                  const handleNextPhoto = (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentPhotoIndex(prev => {
                      const newMap = new Map(prev);
                      const current = newMap.get(place.id) || 0;
                      newMap.set(place.id, current < photos.length - 1 ? current + 1 : 0);
                      return newMap;
                    });
                  };
                  
                  const handleDotClick = (e: React.MouseEvent, index: number) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentPhotoIndex(prev => new Map(prev).set(place.id, index));
                  };
                  
                  return (
                    <InfoWindow
                      position={{ lat: place.lat!, lng: place.lng! }}
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
                        <div className="relative w-full" style={{ paddingBottom: '66.67%' }}>
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
                              
                              {/* Navigation Arrows - круглые как в карточках */}
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
                              
                              {/* Pagination Dots - как в карточках */}
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
                        <Link
                          href={`/id/${place.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!externalSelectedPlaceId) {
                              setInternalSelectedPlaceId(null);
                            }
                          }}
                          className="block p-4"
                        >
                          {/* Title Row */}
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="text-base font-semibold text-[#2d2d2d] line-clamp-1 flex-1 pr-2">
                              {place.title}
                            </h3>
                            {/* Rating placeholder - можно добавить когда будет рейтинг */}
                          </div>
                          
                          {/* Description */}
                          {place.description && (
                            <div className="text-sm text-[#6F7A5A] line-clamp-1 mb-2">
                              {place.description}
                            </div>
                          )}
                          
                          {/* City and Tags */}
                          <div className="flex items-center gap-1.5 text-sm text-[#2d2d2d]">
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
                                {place.tags.slice(0, 2).join(', ')}
                                {place.tags.length > 2 && ` +${place.tags.length - 2}`}
                              </span>
                            )}
                          </div>
                        </Link>
                      </div>
                    </InfoWindow>
                  );
                })()}
              </Marker>
            );
          })}
        </GoogleMap>
        )}
      </div>
    </div>
  );
}
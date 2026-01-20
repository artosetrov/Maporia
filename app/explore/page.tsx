"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES } from "../constants";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import PlaceCard from "../components/PlaceCard";
import Pill from "../components/Pill";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "../config/googleMaps";
import { supabase } from "../lib/supabase";
import { DEFAULT_CITY } from "../constants";
import { LAYOUT_BREAKPOINTS, LAYOUT_CONFIG } from "../config/layout";

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
  
  const [view, setView] = useState<"list" | "map">("list");
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

  const cities = useMemo(() => {
    const list = Array.from(new Set(places.map((p) => p.city).filter(Boolean))) as string[];
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

  async function loadPlaces() {
    setLoading(true);

    let query = supabase.from("places").select("*").order("created_at", { ascending: false });

    // Фильтрация по городам - если выбраны города, проверяем что place.city входит в список
    if (selectedCities.length > 0) {
      query = query.in("city", selectedCities);
    }

    // Фильтрация по категориям - если выбраны категории, проверяем что place.categories содержит хотя бы одну из них
    if (selectedCategories.length > 0) {
      // Используем overlaps для проверки пересечения массивов
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
    console.log("places data", data, error);
    
    if (error) {
      console.error("Error loading places:", error);
      setPlaces([]);
    } else if (!data || data.length === 0) {
      console.log("No places found");
      setPlaces([]);
    } else {
      const placesWithCoords = (data ?? []).map((p: any) => ({
        ...p,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
      }));
      const placesWithValidCoords = placesWithCoords.filter((p: any) => p.lat !== null && p.lng !== null);
      console.log("Loaded places:", placesWithCoords.length, "places with coordinates:", placesWithValidCoords.length);
      
      // Логируем места без координат для отладки
      const placesWithoutCoords = placesWithCoords.filter((p: any) => p.lat === null || p.lng === null);
      if (placesWithoutCoords.length > 0) {
        console.warn("Places without coordinates:", placesWithoutCoords.map((p: any) => ({
          id: p.id,
          title: p.title,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
        })));
      }
      
      setPlaces(placesWithCoords as Place[]);
    }

    setLoading(false);
  }


  useEffect(() => {
    (async () => {
      await loadUser();
      await loadPlaces();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Загружаем избранное пользователя
  useEffect(() => {
    if (!userId) {
      setFavorites(new Set());
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("reactions")
          .select("place_id")
          .eq("user_id", userId)
          .eq("reaction", "like");

        if (error) {
          console.error("Error loading favorites:", error);
          return;
        }

        if (data) {
          setFavorites(new Set(data.map((r) => r.place_id)));
        }
      } catch (err) {
        console.error("Exception loading favorites:", err);
      }
    })();
  }, [userId]);

  useEffect(() => {
    loadPlaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, selectedCities, selectedCategories, selectedTag]);

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
    <main className="h-screen bg-[#faf9f7] flex flex-col overflow-hidden">
      <TopBar
        showSearchBar={true}
        searchValue={""}
        onSearchChange={(value) => {
          const params = new URLSearchParams();
          if (value) params.set("q", value);
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={null}
        onCityChange={(city) => {
          const params = new URLSearchParams();
          if (city) params.set("city", city);
          router.push(`/map?${params.toString()}`);
        }}
        onFiltersClick={() => router.push("/map")}
        activeFiltersCount={0}
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
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
        <div className="hidden min-[1120px]:flex h-full max-w-[1920px] min-[1920px]:max-w-none mx-auto px-6">
          {/* Left: Scrollable list - 60% on XL (>=1440px), 62.5% on Desktop (1120-1439px) */}
          {/* On very large screens (>=1920px), list has fixed max-width, map stretches to fill remaining space */}
          <div className="w-[62.5%] min-[1440px]:w-[60%] min-[1920px]:w-auto min-[1920px]:max-w-[1152px] overflow-y-auto scrollbar-hide pr-6">
            {/* Search and Filter Bar */}
            <div className="sticky top-0 z-30 bg-[#faf9f7] pt-4 pb-3 border-b border-[#6b7d47]/10 mb-4">
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
                    className="w-full h-10 rounded-xl border border-[#6b7d47]/20 bg-white px-4 pl-10 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/50 outline-none focus:border-[#6b7d47]/40 focus:bg-white transition"
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
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#6b7d47] text-white text-[10px] font-medium flex items-center justify-center">
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
                      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#6b7d47] bg-[#6b7d47]/10 border border-[#6b7d47]/30 hover:bg-[#6b7d47]/20 transition"
                    >
                      {city}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ))}
                  {selectedCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategories(prev => prev.filter(c => c !== cat));
                      }}
                      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#6b7d47] bg-[#6b7d47]/10 border border-[#6b7d47]/30 hover:bg-[#6b7d47]/20 transition"
                    >
                      {cat}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
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
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#556036] bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] transition whitespace-nowrap"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <Empty text="Loading…" />
            ) : places.length === 0 ? (
              <Empty text="No places with this vibe yet. Try fewer filters." />
            ) : (
              <div className="grid grid-cols-2 min-[1440px]:grid-cols-3 gap-6 min-[1440px]:gap-6 min-[1440px]:gap-y-7">
                {/* Airbnb-like responsive grid: 2 cols on desktop, 3 cols on XL */}
                {/* Cards: min 320px, ideal 360-380px, max 420px */}
                {places.map((p) => {
                  const isFavorite = favorites.has(p.id);
                  const isHovered = hoveredPlaceId === p.id || selectedPlaceId === p.id;
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
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] hover:border-[#6b7d47]/40 flex items-center justify-center transition shadow-sm ${
                                isFavorite ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${
                                  isFavorite 
                                    ? "text-[#6b7d47] scale-110" 
                                    : "text-[#6b7d47]/60"
                                }`}
                                fill={isFavorite ? "currentColor" : "none"}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                />
                              </svg>
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
          <div className="w-[37.5%] min-[1440px]:w-[40%] min-[1920px]:flex-1 h-full flex-shrink-0 max-w-full pb-8">
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
        <div className="hidden min-[900px]:max-[1119px]:block h-full">
          <div className="max-w-[1920px] mx-auto px-5">
            {/* Search and Filter Bar */}
            <div className="sticky top-[64px] z-30 bg-[#faf9f7] pt-4 pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 relative">
                  <input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    placeholder="Search by vibe, mood, or place"
                    className="w-full h-10 rounded-xl border border-gray-200 bg-white px-4 pl-10 text-sm text-[#2d2d2d] placeholder:text-gray-400 outline-none focus:border-gray-300 focus:bg-white transition"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button
                  onClick={() => setFilterOpen(true)}
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100 transition relative border border-gray-200"
                  aria-label="Filters"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
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
              <Empty text="Loading…" />
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
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition shadow-sm ${
                                isFavorite ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${
                                  isFavorite 
                                    ? "text-[#6b7d47] scale-110" 
                                    : "text-gray-400"
                                }`}
                                fill={isFavorite ? "currentColor" : "none"}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                />
                              </svg>
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
        <div className="hidden min-[600px]:max-[899px]:block h-full">
          <div className="max-w-[680px] mx-auto px-4">
            {/* Search and Filter Bar */}
            <div className="sticky top-[64px] z-30 bg-[#faf9f7] pt-4 pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 relative">
                  <input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    placeholder="Search by vibe, mood, or place"
                    className="w-full h-10 rounded-xl border border-gray-200 bg-white px-4 pl-10 text-sm text-[#2d2d2d] placeholder:text-gray-400 outline-none focus:border-gray-300 transition"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button
                  onClick={() => setFilterOpen(true)}
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100 transition relative border border-gray-200"
                  aria-label="Filters"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
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
              <Empty text="Loading…" />
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
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition shadow-sm ${
                                isFavorite ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${
                                  isFavorite 
                                    ? "text-[#6b7d47] scale-110" 
                                    : "text-gray-400"
                                }`}
                                fill={isFavorite ? "currentColor" : "none"}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                />
                              </svg>
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
        <div className="min-[600px]:hidden h-full flex flex-col transition-opacity duration-300">
          {/* Search and Filter for Mobile */}
          <div className="sticky top-[64px] z-30 bg-[#faf9f7] pb-4 -mt-4 px-4 flex-shrink-0">
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
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
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
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
                              favoriteButton={
                                userId ? (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      toggleFavorite(selectedPlace.id, e);
                                    }}
                                    className={`h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition shadow-sm ${
                                      isFavorite ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                                    }`}
                                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                                  >
                                    <svg
                                      className={`w-4 h-4 transition-transform ${
                                        isFavorite 
                                          ? "text-[#6b7d47] scale-110" 
                                          : "text-gray-400"
                                      }`}
                                      fill={isFavorite ? "currentColor" : "none"}
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                      />
                                    </svg>
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
                          <Empty text="Loading…" />
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
                                    favoriteButton={
                                      userId ? (
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            toggleFavorite(p.id, e);
                                          }}
                                          className={`h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition shadow-sm ${
                                            isFavorite ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                                          }`}
                                          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                                        >
                                          <svg
                                            className={`w-4 h-4 transition-transform ${
                                              isFavorite 
                                                ? "text-[#6b7d47] scale-110" 
                                                : "text-gray-400"
                                            }`}
                                            fill={isFavorite ? "currentColor" : "none"}
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                            />
                                          </svg>
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
            <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-4 pb-24">
              {loading ? (
                <Empty text="Loading…" />
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
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition shadow-sm ${
                                isFavorite ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${
                                  isFavorite 
                                    ? "text-[#6b7d47] scale-110" 
                                    : "text-gray-400"
                                }`}
                                fill={isFavorite ? "currentColor" : "none"}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                />
                              </svg>
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

      <BottomNav />

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

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-[#6b7d47]/60 py-10">{text}</div>;
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
  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

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
    return (
      <div className="h-full flex items-center justify-center">
        <Empty text="Loading…" />
      </div>
    );
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

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <Empty text="Loading map…" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full transition-all duration-300 overflow-hidden" data-map-container>
      {/* Custom Map Controls - Top Right Corner */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        {/* My Location Button */}
        <button
          onClick={handleMyLocation}
          className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
          aria-label="My Location"
          title="My Location"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" fill="#22c55e" />
            <circle cx="12" cy="12" r="8" stroke="#22c55e" strokeWidth="1.5" fill="none" opacity="0.3" />
          </svg>
        </button>

        {/* Fullscreen Button */}
        <button
          onClick={handleFullscreen}
          className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
          aria-label="Fullscreen"
          title="Fullscreen"
        >
          {isFullscreen ? (
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>

        {/* Zoom Controls */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
          <button
            onClick={handleZoomIn}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-50 transition-colors border-b border-gray-100"
            aria-label="Zoom In"
            title="Zoom In"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={handleZoomOut}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-50 transition-colors"
            aria-label="Zoom Out"
            title="Zoom Out"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="absolute inset-0 w-full h-full">
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
          options={{
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
                              
                              {/* Top Right Buttons */}
                              <div className="absolute top-3 right-3 flex gap-2 z-10">
                                {userId && onToggleFavorite && (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onToggleFavorite(place.id, e);
                                    }}
                                    className={`h-8 w-8 rounded-full bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] hover:border-[#6b7d47]/40 flex items-center justify-center transition shadow-sm ${
                                      favorites?.has(place.id) ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                                    }`}
                                    title={favorites?.has(place.id) ? "Remove from favorites" : "Add to favorites"}
                                    aria-label={favorites?.has(place.id) ? "Remove from favorites" : "Add to favorites"}
                                  >
                                    <svg
                                      className={`w-4 h-4 transition-transform ${
                                        favorites?.has(place.id)
                                          ? "text-[#6b7d47] scale-110"
                                          : "text-[#6b7d47]/60"
                                      }`}
                                      fill={favorites?.has(place.id) ? "currentColor" : "none"}
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                      />
                                    </svg>
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!externalSelectedPlaceId) {
                                      setInternalSelectedPlaceId(null);
                                    }
                                  }}
                                  className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors"
                                  aria-label="Close"
                                >
                                  <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                              
                              {/* Navigation Arrows - круглые как в карточках */}
                              {hasMultiplePhotos && (
                                <>
                                  <button
                                    onClick={handlePreviousPhoto}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center transition-colors z-10"
                                    aria-label="Previous photo"
                                  >
                                    <svg className="w-4 h-4 text-[#2d2d2d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
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
                              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
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
                            <div className="text-sm text-gray-600 line-clamp-1 mb-2">
                              {place.description}
                            </div>
                          )}
                          
                          {/* City and Tags */}
                          <div className="flex items-center gap-1.5 text-sm text-[#2d2d2d]">
                            {place.city && (
                              <>
                                <span>{place.city}</span>
                                {place.tags && place.tags.length > 0 && (
                                  <span className="text-gray-400">•</span>
                                )}
                              </>
                            )}
                            {place.tags && place.tags.length > 0 && (
                              <span className="text-gray-600">
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
      </div>
    </div>
  );
}
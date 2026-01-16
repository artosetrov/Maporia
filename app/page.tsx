"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES } from "./constants";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import PlaceCard from "./components/PlaceCard";
import Pill from "./components/Pill";

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


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

export default function HomePage() {
  const router = useRouter();
  const [view, setView] = useState<"list" | "map">("map");
  const [searchFocused, setSearchFocused] = useState(false);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // search + filters
  const [searchDraft, setSearchDraft] = useState("");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");

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

    // Загружаем профиль для получения display_name
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", u.id)
      .single();
    
    if (profile?.display_name) {
      setUserDisplayName(profile.display_name);
    } else {
      setUserDisplayName(u.email?.split("@")[0] || null);
    }
  }

  async function loadPlaces() {
    setLoading(true);

    let query = supabase.from("places").select("*").order("created_at", { ascending: false });

    if (city) query = query.ilike("city", city);

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
    if (error) {
      console.error("Error loading places:", error);
      setPlaces([]);
    } else {
      setPlaces((data ?? []) as Place[]);
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
      const { data } = await supabase
        .from("reactions")
        .select("place_id")
        .eq("user_id", userId)
        .eq("reaction", "like");

      if (data) {
        setFavorites(new Set(data.map((r) => r.place_id)));
      }
    })();
  }, [userId]);

  useEffect(() => {
    loadPlaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, city, selectedCategories, selectedTag]);

  function applySearch() {
    setQ(searchDraft);
  }

  function resetFilters() {
    setCity("");
    setSelectedCategories([]);
    setQ("");
    setSearchDraft("");
    setSelectedTag("");
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
    if (city) count += 1;
    if (q.trim()) count += 1;
    if (selectedTag) count += 1;
    return count;
  }, [selectedCategories, city, q, selectedTag]);

  // Quick search chips
  const quickSearchChips = ["Romantic", "Quiet", "Sunset", "Coffee", "Nature"];

  return (
    <main className="min-h-screen bg-[#faf9f7] flex flex-col">
      {/* TOP BAR - Fixed at top */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-[#faf9f7]/95 backdrop-blur-sm border-b border-[#6b7d47]/10">
        <div className="mx-auto max-w-7xl px-4 pt-safe-top pt-3 pb-3">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-[#6b7d47]/10 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src="/logo.png" 
                alt="Maporia Logo" 
                className="w-8 h-8 object-contain"
                style={{ display: 'block' }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  // Пробуем другие возможные имена файлов
                  if (target.src.includes('logo.png')) {
                    target.src = '/logo.jpg';
                  } else if (target.src.includes('logo.jpg')) {
                    target.src = '/logo.jpeg';
                  } else if (target.src.includes('logo.jpeg')) {
                    target.src = '/logo.svg';
                  } else {
                    // Если все варианты не сработали, показываем заглушку
                    target.style.display = "none";
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.logo-fallback')) {
                      const fallback = document.createElement('span');
                      fallback.className = 'logo-fallback text-[#6b7d47] font-bold text-sm';
                      fallback.textContent = 'M';
                      parent.appendChild(fallback);
                    }
                  }
                }}
              />
            </div>

            {/* Search input */}
            <div className="flex-1 relative">
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applySearch();
                    setSearchFocused(false);
                  }
                }}
                placeholder="Search by vibe, mood, or place"
                className="w-full rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-2.5 pl-10 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/50 outline-none focus:border-[#6b7d47]/40 focus:bg-white transition"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7d47]/50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Filter button with badge */}
            <button
              onClick={() => setFilterOpen(true)}
              className="h-10 w-10 rounded-xl flex items-center justify-center text-[#556036] hover:bg-[#f5f4f2] transition relative"
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

          {/* Quick search chips - shown on focus */}
          {searchFocused && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {quickSearchChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => {
                    setSearchDraft(chip);
                    setQ(chip);
                    setSearchFocused(false);
                  }}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#556036] bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] transition whitespace-nowrap"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Segmented switch for Map/List */}
          <div className="mt-3 flex rounded-xl bg-[#f5f4f2] p-1">
            <button
              onClick={() => setView("map")}
              className={cx(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                view === "map"
                  ? "bg-white text-[#556036] shadow-sm"
                  : "text-[#6b7d47]/60 hover:text-[#556036]"
              )}
            >
              Map
            </button>
            <button
              onClick={() => setView("list")}
              className={cx(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                view === "list"
                  ? "bg-white text-[#556036] shadow-sm"
                  : "text-[#6b7d47]/60 hover:text-[#556036]"
              )}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT - Map first (70% of screen) */}
      <div className="flex-1 pt-[120px] pb-20 min-h-0">
        {view === "map" ? (
          <MapView places={places} loading={loading} />
        ) : (
          <div className="mx-auto max-w-7xl px-4">
            {loading ? (
              <Empty text="Loading…" />
            ) : places.length === 0 ? (
              <Empty text="No places with this vibe yet. Try fewer filters." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
                            className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm"
                            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                          >
                            <svg
                              className={`w-4 h-4 text-white transition-transform ${isFavorite ? "scale-110" : ""}`}
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
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
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
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">City</label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#6b7d47]/40 text-[#2d2d2d] transition"
                  >
                    <option value="">All cities</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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

function MapView({ places, loading }: { places: Place[]; loading: boolean }) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [roundIcons, setRoundIcons] = useState<Map<string, string>>(new Map());
  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    libraries: ["places"],
  });

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

  // Вычисляем центр карты на основе всех мест с координатами
  const center = useMemo(() => {
    if (placesWithCoords.length === 0) {
      return { lat: 0, lng: 0 };
    }
    const avgLat =
      placesWithCoords.reduce((sum, p) => sum + (p.lat ?? 0), 0) / placesWithCoords.length;
    const avgLng =
      placesWithCoords.reduce((sum, p) => sum + (p.lng ?? 0), 0) / placesWithCoords.length;
    return { lat: avgLat, lng: avgLng };
  }, [placesWithCoords]);

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
    <div className="relative" style={{ height: "70vh", minHeight: "500px" }}>
      <div className="absolute inset-0">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={center}
          zoom={placesWithCoords.length === 1 ? 15 : placesWithCoords.length === 0 ? 2 : 10}
          options={{
            disableDefaultUI: false,
            zoomControl: true,
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
                  setSelectedPlaceId(place.id);
                  // Haptic feedback simulation
                  if (navigator.vibrate) {
                    navigator.vibrate(10);
                  }
                }}
              />
            );
          })}
        </GoogleMap>
      </div>
      {/* Selected place card overlay */}
      {selectedPlaceId && (
        <div className="absolute bottom-4 left-4 right-4 z-10">
          {(() => {
            const place = places.find((p) => p.id === selectedPlaceId);
            if (!place) return null;
            return (
              <Link
                href={`/id/${place.id}`}
                onClick={() => setSelectedPlaceId(null)}
                className="flex gap-3 bg-white rounded-2xl shadow-lg border border-[#6b7d47]/10 p-4"
              >
                {place.cover_url && (
                  <img
                    src={place.cover_url}
                    alt={place.title}
                    className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#2d2d2d]">{place.title}</div>
                  {place.address && (
                    <div className="mt-1 text-xs text-[#6b7d47]/70">{place.address}</div>
                  )}
                  {place.city && (
                    <div className="mt-1 text-xs text-[#6b7d47]/60">{place.city}</div>
                  )}
                </div>
              </Link>
            );
          })()}
        </div>
      )}
    </div>
  );
}
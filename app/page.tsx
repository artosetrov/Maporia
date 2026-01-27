"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import HomeSection from "./components/HomeSection";
import FiltersModal, { ActiveFilters } from "./components/FiltersModal";
import SearchModal from "./components/SearchModal";
import { HOME_SECTIONS } from "./constants/homeSections";
import { supabase, hasValidSupabaseConfig } from "./lib/supabase";
import { DEFAULT_CITY } from "./constants";
import { useUserAccess } from "./hooks/useUserAccess";

export default function HomePage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  // Search and filter state
  const [searchValue, setSearchValue] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    categories: [],
    sort: null,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  // User access and profile data
  const { loading: accessLoading, access, user, profile } = useUserAccess();
  
  // Bootstrap ready state - wait for auth/profile before rendering sections
  const [bootReady, setBootReady] = useState(false);
  
  // Derive display values from profile
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const userDisplayName = profile?.display_name ?? (userEmail ? userEmail.split("@")[0] : null);
  const userAvatar = profile?.avatar_url ?? null;

  // Check Supabase configuration
  useEffect(() => {
    if (!hasValidSupabaseConfig) {
      console.error('[HomePage] Supabase configuration is missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
    }
  }, []);

  // Wait for bootstrap to complete before rendering sections
  useEffect(() => {
    if (!accessLoading) {
      // Auth and profile are ready, allow sections to render
      if (process.env.NODE_ENV === 'production') {
        console.log('[HomePage] Bootstrap ready:', {
          hasUser: !!user,
          hasProfile: !!profile,
          access: {
            role: access.role,
            hasPremium: access.hasPremium,
            isAdmin: access.isAdmin,
          },
        });
      }
      setBootReady(true);
    }
  }, [accessLoading, user, profile, access]);

  // Загружаем избранное пользователя
  useEffect(() => {
    if (!userId) {
      setFavorites(new Set());
      return;
    }

    let isUnmounting = false;
    const capturedUserId = userId;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("reactions")
          .select("place_id")
          .eq("user_id", capturedUserId)
          .eq("reaction", "like");

        if (isUnmounting || userId !== capturedUserId) {
          return;
        }

        if (error) {
          // Silently ignore AbortError
          if (error.message?.includes('abort') || error.name === 'AbortError' || (error as any).code === 'ECONNABORTED') {
            return;
          }
          
          console.error("Error loading favorites:", error);
          return;
        }

        if (!isUnmounting && userId === capturedUserId && data) {
          setFavorites(new Set(data.map((r) => r.place_id)));
        }
      } catch (err: any) {
        // Silently ignore AbortError
        if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
          return;
        }
        
        console.error("Exception loading favorites:", err);
      }
    })();

    return () => {
      isUnmounting = true;
    };
  }, [userId]);

  // No need for separate loadUser - useUserAccess handles it

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
        const { error } = await supabase
          .from("reactions")
          .delete()
          .eq("place_id", placeId)
          .eq("user_id", userId)
          .eq("reaction", "like");

        if (error) {
          console.error("Error removing favorite:", error);
        } else {
          setFavorites((prev) => {
            const next = new Set(prev);
            next.delete(placeId);
            return next;
          });
        }
      } else {
        const { error } = await supabase
          .from("reactions")
          .insert({
            place_id: placeId,
            user_id: userId,
            reaction: "like",
          });

        if (error) {
          console.error("Error adding favorite:", error);
        } else {
          setFavorites((prev) => new Set(prev).add(placeId));
        }
      }
    } catch (err) {
      console.error("Toggle favorite error:", err);
    }
  }

  // Handle search - always redirect to /map
  function handleSearchChange(value: string) {
    setSearchValue(value);
    const params = new URLSearchParams();
    if (selectedCity) params.set("city", selectedCity);
    if (value.trim()) params.set("q", value);
    if (activeFilters.categories.length > 0) {
      params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
    }
    router.push(`/map?${params.toString()}`);
  }

  function handleCityChange(city: string | null) {
    setSelectedCity(city);
    // Always redirect to /map with city filter
    const params = new URLSearchParams();
    if (city && city.trim()) {
      // Кодируем город для безопасной передачи в URL
      params.set("city", encodeURIComponent(city.trim()));
    }
    if (searchValue && searchValue.trim()) {
      params.set("q", encodeURIComponent(searchValue.trim()));
    }
    if (activeFilters.categories.length > 0) {
      params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
    }
    router.push(`/map?${params.toString()}`);
  }

  // Handle search modal submit
  function handleSearchSubmit(city: string | null, query: string, tags?: string[]) {
    setSelectedCity(city);
    setSearchValue(query);
    if (tags) {
      setSelectedTags(tags);
      // Also update activeFilters.categories to match tags
      setActiveFilters(prev => ({
        ...prev,
        categories: tags,
      }));
    }
    const params = new URLSearchParams();
    if (city && city.trim()) {
      params.set("city", encodeURIComponent(city.trim()));
    }
    if (query.trim()) {
      params.set("q", encodeURIComponent(query.trim()));
    }
    // Use tags if provided, otherwise use activeFilters.categories
    const categoriesToUse = tags || activeFilters.categories;
    if (categoriesToUse.length > 0) {
      params.set("categories", categoriesToUse.map(c => encodeURIComponent(c)).join(','));
    }
    router.push(`/map?${params.toString()}`);
  }

  function handleFiltersClick() {
    // Open filters modal
    setFilterOpen(true);
  }

  function handleFiltersApply(filters: ActiveFilters) {
    setActiveFilters(filters);
    // Always redirect to /map with applied filters
    const params = new URLSearchParams();
    if (selectedCity) params.set("city", selectedCity);
    if (searchValue) params.set("q", searchValue);
    if (filters.categories.length > 0) {
      params.set("categories", filters.categories.map(c => encodeURIComponent(c)).join(','));
    }
    if (filters.sort) {
      params.set("sort", filters.sort);
    }
    router.push(`/map?${params.toString()}`);
  }

  // Handle tag click - redirect to /map with tag as search query
  function handleTagClick(tag: string) {
    const params = new URLSearchParams();
    if (selectedCity) params.set("city", selectedCity);
    params.set("q", tag);
    if (activeFilters.categories.length > 0) {
      params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
    }
    router.push(`/map?${params.toString()}`);
  }

  // Calculate active filters count and summary
  const activeFiltersSummary = useMemo(() => {
    const parts: string[] = [];
    if (activeFilters.categories.length > 0) {
      const cats = activeFilters.categories.slice(0, 2).map(c => c.replace(/^[^\s]+\s/, ""));
      parts.push(cats.join(" • "));
    }
    return parts.join(" • ") || undefined;
  }, [activeFilters]);

  useEffect(() => {
    let count = 0;
    if (selectedCity && selectedCity !== DEFAULT_CITY) count++;
    if (searchValue) count++;
    if (activeFilters.categories.length > 0) count += activeFilters.categories.length;
    if (activeFilters.sort) count++;
    setActiveFiltersCount(count);
  }, [selectedCity, searchValue, activeFilters]);

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <TopBar
        showSearchBar={true}
        searchValue={searchValue}
        onSearchChange={handleSearchChange}
        selectedCity={selectedCity}
        onCityChange={handleCityChange}
        onFiltersClick={handleFiltersClick}
        activeFiltersCount={activeFiltersCount}
        activeFiltersSummary={activeFiltersSummary}
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
        onSearchBarClick={() => setSearchModalOpen(true)}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onCitySelect={handleCityChange}
        onSearchSubmit={handleSearchSubmit}
        selectedCity={selectedCity}
        searchQuery={searchValue}
        selectedTags={selectedTags}
      />

      {/* Filters Modal */}
      <FiltersModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={handleFiltersApply}
        appliedFilters={activeFilters}
        getFilteredCount={async (draftFilters: ActiveFilters) => {
          // Подсчитываем количество мест с учетом фильтров
          try {
            let countQuery = supabase.from("places").select("*", { count: 'exact', head: true });

            // Фильтрация по городу (use city_name_cached if available, fallback to city)
            if (selectedCity && selectedCity !== DEFAULT_CITY) {
              countQuery = countQuery.or(`city_name_cached.eq.${selectedCity},city.eq.${selectedCity}`);
            }

            // Фильтрация по категориям
            if (draftFilters.categories.length > 0) {
              countQuery = countQuery.overlaps("categories", draftFilters.categories);
            }

            // Фильтрация по поисковому запросу
            if (searchValue && searchValue.trim()) {
              const s = searchValue.trim();
              countQuery = countQuery.or(`title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`);
            }

            const { count, error } = await countQuery;
            if (error) {
              // Silently ignore AbortError
              if (error.message?.includes('abort') || error.name === 'AbortError' || (error as any).code === 'ECONNABORTED') {
                return 0;
              }
              // Enhanced logging for production
              if (process.env.NODE_ENV === 'production') {
                console.error("Error counting filtered places:", {
                  selectedCity,
                  categories: draftFilters.categories,
                  searchValue,
                  message: error.message,
                  code: error.code,
                  details: error.details,
                  hint: error.hint,
                });
              } else {
                console.error("Error counting filtered places:", error);
              }
              return 0;
            }
            return count || 0;
          } catch (error: any) {
            // Silently ignore AbortError
            if (error?.name === 'AbortError' || error?.message?.includes('abort') || error?.code === 'ECONNABORTED') {
              return 0;
            }
            // Enhanced logging for production
            if (process.env.NODE_ENV === 'production') {
              console.error("Error in getFilteredCount:", {
                error: error?.message || String(error),
              });
            } else {
              console.error("Error in getFilteredCount:", error);
            }
            return 0;
          }
        }}
      />

      <div className="flex-1 pt-[64px] pb-20">
        <div 
          className="mx-auto pb-6 lg:py-8 max-w-full lg:max-w-[960px] lg:max-w-[1120px] lg:max-w-[1440px] lg:max-w-[1920px]"
          style={{
            paddingLeft: 'var(--home-page-padding, 16px)',
            paddingRight: 'var(--home-page-padding, 16px)',
          }}
        >
          {!bootReady ? (
            // Show skeleton while bootstrapping
            <div className="space-y-6 pt-6 lg:pt-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="mb-6 lg:mb-8 lg:mb-9">
                  <div className="flex items-center justify-between mb-3 lg:mb-4 h-10 lg:h-12">
                    <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
                    <div className="h-8 w-8 rounded-full bg-[#ECEEE4] animate-pulse" />
                  </div>
                  <div className="overflow-x-auto scrollbar-hide">
                    <div className="flex gap-3 pb-2" style={{ width: "max-content" }}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <div key={j} className="flex-shrink-0" style={{ width: 'var(--home-card-width, 220px)' }}>
                          <div className="w-full">
                            <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
                              <div className="absolute inset-0 rounded-2xl bg-[#ECEEE4] animate-pulse" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <div className="h-5 w-3/4 bg-[#ECEEE4] rounded animate-pulse" />
                              <div className="h-4 w-1/2 bg-[#ECEEE4] rounded animate-pulse" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Render sections only after bootstrap is ready
            HOME_SECTIONS.map((section, index) => (
              <HomeSection
                key={section.title}
                section={section}
                userId={userId}
                userAccess={access}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onTagClick={handleTagClick}
                isFirst={index === 0}
              />
            ))
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}

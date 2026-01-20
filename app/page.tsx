"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import HomeSection from "./components/HomeSection";
import FiltersModal, { ActiveFilters } from "./components/FiltersModal";
import { HOME_SECTIONS } from "./constants/homeSections";
import { supabase } from "./lib/supabase";
import { DEFAULT_CITY } from "./constants";

export default function HomePage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  // Search and filter state
  const [searchValue, setSearchValue] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    vibes: [],
    categories: [],
    tags: [],
    distance: null,
    sort: null,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

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
    loadUser();
  }, []);

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
    if (city) params.set("city", city);
    if (searchValue) params.set("q", searchValue);
    if (activeFilters.categories.length > 0) {
      params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
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
    if (filters.vibes.length > 0) {
      params.set("vibes", filters.vibes.map(v => encodeURIComponent(v)).join(','));
    }
    if (filters.distance) {
      params.set("distance", filters.distance);
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
    if (activeFilters.vibes.length > 0) {
      parts.push(activeFilters.vibes.slice(0, 2).join(" • "));
    }
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
    if (activeFilters.vibes.length > 0) count += activeFilters.vibes.length;
    if (activeFilters.categories.length > 0) count += activeFilters.categories.length;
    if (activeFilters.tags.length > 0) count += activeFilters.tags.length;
    if (activeFilters.distance) count++;
    if (activeFilters.sort) count++;
    setActiveFiltersCount(count);
  }, [selectedCity, searchValue, activeFilters]);

  return (
    <main className="min-h-screen bg-[#faf9f7] flex flex-col">
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
      />

      {/* Filters Modal */}
      <FiltersModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={handleFiltersApply}
        appliedFilters={activeFilters}
        getFilteredCount={() => {
          // For home page, we can't easily count filtered places without loading all
          return 0;
        }}
      />

      <div className="flex-1 pt-[64px] pb-20">
        <div 
          className="mx-auto py-6 min-[600px]:py-8 max-w-full min-[900px]:max-w-[960px] min-[1120px]:max-w-[1120px] min-[1440px]:max-w-[1440px] min-[1920px]:max-w-[1920px]"
          style={{
            paddingLeft: 'var(--home-page-padding, 16px)',
            paddingRight: 'var(--home-page-padding, 16px)',
          }}
        >
          {HOME_SECTIONS.map((section) => (
            <HomeSection
              key={section.title}
              section={section}
              userId={userId}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onTagClick={handleTagClick}
            />
          ))}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}

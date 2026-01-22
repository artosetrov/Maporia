"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import PlaceCard from "../components/PlaceCard";
import FiltersModal, { ActiveFilters } from "../components/FiltersModal";
import { supabase } from "../lib/supabase";
import { DEFAULT_CITY } from "../constants";
import { useUserAccess } from "../hooks/useUserAccess";
import { isPlacePremium, canUserViewPlace, type UserAccess } from "../lib/access";
import { useMemo } from "react";

type Place = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  categories: string[] | null;
  created_at?: string;
  created_by?: string | null;
  access_level?: string | null;
  is_premium?: boolean | null;
  premium_only?: boolean | null;
  visibility?: string | null;
};

export default function SavedPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search and filter state
  const [searchValue, setSearchValue] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    categories: [],
    sort: null,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  // User access and profile data
  const { loading: accessLoading, access, user, profile } = useUserAccess(true);
  
  // Derive display values from profile
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const userDisplayName = profile?.display_name ?? null;
  const userAvatar = profile?.avatar_url ?? null;

  useEffect(() => {
    if (!accessLoading && userId) {
      loadSavedPlaces(userId);
    } else if (!accessLoading && !user) {
      // useUserAccess with requireAuth=true will handle redirect
      setLoading(false);
    }
  }, [accessLoading, userId, user]);

  // Calculate active filters count
  useEffect(() => {
    let count = 0;
    if (selectedCity && selectedCity !== DEFAULT_CITY) count++;
    if (searchValue) count++;
    if (activeFilters.categories.length > 0) count += activeFilters.categories.length;
    if (activeFilters.sort) count++;
    setActiveFiltersCount(count);
  }, [selectedCity, searchValue, activeFilters]);

  async function loadSavedPlaces(userId: string) {
    setLoading(true);
    const { data: reactions } = await supabase
      .from("reactions")
      .select("place_id")
      .eq("user_id", userId)
      .eq("reaction", "like");

    if (reactions && reactions.length > 0) {
      const placeIds = reactions.map((r) => r.place_id);
      const { data, error } = await supabase
        .from("places")
        .select("id,title,city,country,address,cover_url,categories")
        .in("id", placeIds)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setPlaces(data as Place[]);
      }
    } else {
      setPlaces([]);
    }
    setLoading(false);
  }

  async function handleRemoveFavorite(placeId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!userId) return;

    try {
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("place_id", placeId)
        .eq("user_id", userId)
        .eq("reaction", "like");

      if (error) {
        console.error("Error removing favorite:", error);
      } else {
        // Remove from local state
        setPlaces((prev) => prev.filter((p) => p.id !== placeId));
        // Reload to ensure consistency
        if (userId) {
          await loadSavedPlaces(userId);
        }
      }
    } catch (err) {
      console.error("Remove favorite error:", err);
    }
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <TopBar
        showSearchBar={true}
        searchValue={searchValue}
        onSearchChange={(value) => {
          setSearchValue(value);
          // Always redirect to /map
          const params = new URLSearchParams();
          if (selectedCity) params.set("city", selectedCity);
          if (value.trim()) params.set("q", value);
            if (activeFilters.categories.length > 0) {
              params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
            }
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={selectedCity}
        onCityChange={(city) => {
          setSelectedCity(city);
          // Always redirect to /map with city filter
          const params = new URLSearchParams();
          if (city) params.set("city", city);
          if (searchValue) params.set("q", searchValue);
            if (activeFilters.categories.length > 0) {
              params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
            }
          router.push(`/map?${params.toString()}`);
        }}
        onFiltersClick={() => {
          // Open filters modal
          setFilterOpen(true);
        }}
        activeFiltersCount={activeFiltersCount}
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
      />

      {/* Filters Modal */}
      <FiltersModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={(filters) => {
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
        }}
        appliedFilters={activeFilters}
        getFilteredCount={() => 0}
      />

      <div className="flex-1 pt-[80px] pb-20">
        <div className="px-6 lg:px-8">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-full">
                  <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
                    <div className="absolute inset-0 rounded-2xl bg-gray-200 animate-pulse" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : places.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-sm text-[#6F7A5A] mb-1">No saved places</div>
              <div className="text-xs text-[#A8B096]">Saved places appear here</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(() => {
                // Calculate locked premium places for Haunted Gem indexing
                const defaultUserAccess: UserAccess = access ?? { 
                  role: "guest", 
                  hasPremium: false, 
                  isAdmin: false 
                };
                
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
                
                const lockedPlacesMap = new Map<string, number>();
                lockedPlaces.forEach((p, idx) => {
                  lockedPlacesMap.set(p.id, idx + 1);
                });
                
                return places.map((place) => {
                  const hauntedGemIndex = lockedPlacesMap.get(place.id);
                  return (
                    <div key={place.id} className="h-full">
                      <PlaceCard 
                        place={place}
                        userAccess={access}
                        userId={userId}
                        hauntedGemIndex={hauntedGemIndex}
                        onRemoveFavorite={handleRemoveFavorite}
                      />
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}

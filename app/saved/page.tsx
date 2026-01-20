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

type Place = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  categories: string[] | null;
};

export default function SavedPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
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

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/auth");
        return;
      }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? null);
      
      // Загружаем профиль
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", data.user.id)
        .single();
      
      if (profile?.display_name) {
        setUserDisplayName(profile.display_name);
      }
      if (profile?.avatar_url) {
        setUserAvatar(profile.avatar_url);
      }
      
      await loadSavedPlaces(data.user.id);
    })();
  }, [router]);

  // Calculate active filters count
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
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#faf9f7] flex flex-col">
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
        }}
        appliedFilters={activeFilters}
        getFilteredCount={() => 0}
      />

      <div className="flex-1 pt-[80px] pb-20">
        <div className="px-4 lg:px-8">
          {loading ? (
            <div className="text-center py-16">
              <div className="text-sm text-[#6b7d47]/60">Loading…</div>
            </div>
          ) : places.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-sm text-[#6b7d47]/60 mb-1">No saved places</div>
              <div className="text-xs text-[#6b7d47]/50">Saved places appear here</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {places.map((place) => (
                <div key={place.id} className="h-full">
                  <PlaceCard place={place} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}

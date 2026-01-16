"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES } from "../constants";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import PlaceCard from "../components/PlaceCard";
import Pill from "../components/Pill";

type Place = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  lat: number | null;
  lng: number | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function PlacesPage() {
  const router = useRouter();
  const [searchFocused, setSearchFocused] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);

  const cities = useMemo(() => {
    const list = Array.from(new Set(places.map((p) => p.city).filter(Boolean))) as string[];
    list.sort((a, b) => a.localeCompare(b));
    return list;
  }, [places]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    if (city) count += 1;
    if (q.trim()) count += 1;
    if (selectedTag) count += 1;
    return count;
  }, [selectedCategories, city, q, selectedTag]);

  const quickSearchChips = ["Romantic", "Quiet", "Sunset", "Coffee", "Nature"];

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserId(data.user.id);
        const { data: reactions } = await supabase
          .from("reactions")
          .select("place_id")
          .eq("user_id", data.user.id)
          .eq("reaction", "like");
        if (reactions) {
          setFavorites(new Set(reactions.map((r) => r.place_id)));
        }
      }
      await loadPlaces();
    })();
  }, []);

  useEffect(() => {
    loadPlaces();
  }, [q, city, selectedCategories, selectedTag]);

  async function loadPlaces() {
    setLoading(true);
    let query = supabase.from("places").select("*").order("created_at", { ascending: false });

    if (city) query = query.ilike("city", city);
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
    if (error) {
      console.error("Error loading places:", error);
      setPlaces([]);
    } else {
      setPlaces((data ?? []) as Place[]);
    }
    setLoading(false);
  }

  function applySearch() {
    setQ(searchDraft);
    setSearchFocused(false);
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

  return (
    <main className="min-h-screen bg-[#faf9f7] flex flex-col">
      <TopBar
        center={
          <div className="relative">
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  applySearch();
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
        }
        right={
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
        }
      />

      <div className="flex-1 pt-[140px] pb-20">
        <div className="mx-auto max-w-7xl px-4">
          {/* Quick search chips */}
          {searchFocused && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
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

          {loading ? (
            <div className="text-center py-16">
              <div className="text-sm text-[#6b7d47]/60">Loading…</div>
            </div>
          ) : places.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-sm text-[#6b7d47]/60">No places found</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {places.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />

      {/* Filter Modal - Same as Home */}
      {filterOpen && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
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
                  className="h-9 w-9 rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] hover:bg-[#6b7d47]/10 text-[#6b7d47] transition flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
              <div className="mb-4 text-sm text-[#6b7d47]/70">
                {places.length} {places.length === 1 ? "place" : "places"} match
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <Pill
                        key={cat}
                        active={selectedCategories.includes(cat)}
                        onClick={() => toggleCategory(cat)}
                      >
                        {cat}
                      </Pill>
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

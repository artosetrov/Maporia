"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "../components/TopBar";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { useAuthRedirect } from "../hooks/useAuthRedirect";

type ProfileDisplay = Pick<Database["public"]["Tables"]["profiles"]["Row"], "display_name" | "avatar_url">;
type ProfileResult = { data: ProfileDisplay | null; error: PostgrestError | null };
import { ActiveFilters } from "../components/FiltersModal";
import SearchModal from "../components/SearchModal";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
import { PageSkeleton } from "../components/Skeleton";

export default function SettingsPage() {
  const router = useRouter();
  const { replaceToAuth } = useAuthRedirect();
  // 2026-05-10: useAuthRedirect возвращает свежую ссылку на каждый render —
  // прямое использование в useEffect deps вызывает re-render loop
  // (см. feedback_useauthredirect_deps). Кэшируем в ref, синкаем
  // через эффект (React 19 запрещает писать в .current во время render).
  const replaceToAuthRef = useRef(replaceToAuth);
  useEffect(() => {
    replaceToAuthRef.current = replaceToAuth;
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  // Search and filter state (for SearchBar)
  const [searchValue, setSearchValue] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    categories: [],
    sort: null,
  });
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  
  // Calculate active filters count
  useEffect(() => {
    let count = 0;
    if (selectedCity) count++;
    if (searchValue) count++;
    if (activeFilters.categories.length > 0) count += activeFilters.categories.length;
    if (activeFilters.sort) count++;
    setActiveFiltersCount(count);
  }, [selectedCity, searchValue, activeFilters]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setAuthLoading(false);
        replaceToAuthRef.current();
        return;
      }
      setUserEmail(data.user.email ?? null);

      // Load profile
      const profileRes = (await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", data.user.id)
        .maybeSingle()) as ProfileResult;
      const { data: profile } = profileRes;

      if (profile?.display_name) {
        setUserDisplayName(profile.display_name);
      } else {
        setUserDisplayName(data.user.email?.split("@")[0] || null);
      }

      if (profile?.avatar_url) {
        setUserAvatar(profile.avatar_url);
      }
      setAuthLoading(false);
    })();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (authLoading) {
    return <PageSkeleton />;
  }

  return (
    <SectionErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <TopBar
        showSearchBar={true}
        searchValue={searchValue}
        onSearchChange={(value) => {
          setSearchValue(value);
          const params = new URLSearchParams();
          if (selectedCity) params.set("city", selectedCity);
          if (value.trim()) params.set("q", value.trim());
          if (activeFilters.categories.length > 0) {
            params.set("categories", activeFilters.categories.join(','));
          }
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={selectedCity}
        onCityChange={(city) => {
          setSelectedCity(city);
          const params = new URLSearchParams();
          if (city && city.trim()) {
            params.set("city", city.trim());
          }
          if (searchValue && searchValue.trim()) {
            params.set("q", searchValue.trim());
          }
          if (activeFilters.categories.length > 0) {
            params.set("categories", activeFilters.categories.join(','));
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
          setSelectedCity(city);
          const params = new URLSearchParams();
          if (city && city.trim()) {
            params.set("city", city.trim());
          }
          if (searchValue && searchValue.trim()) {
            params.set("q", searchValue.trim());
          }
          router.push(`/map?${params.toString()}`);
        }}
        onSearchSubmit={(city, query, tags, kind) => {
          setSelectedCity(city);
          setSearchValue(query);
          if (tags) {
            setSelectedTags(tags);
            setActiveFilters(prev => ({
              ...prev,
              categories: tags,
            }));
          }
          const params = new URLSearchParams();
          if (city && city.trim()) {
            params.set("city", city.trim());
          }
          if (query.trim()) {
            params.set("q", query.trim());
          }
          const categoriesToUse = tags || activeFilters.categories;
          if (categoriesToUse.length > 0) {
            params.set("categories", categoriesToUse.join(','));
          }
          if (kind) {
            params.set("kinds", kind);
          }
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={selectedCity}
        searchQuery={searchValue}
        selectedTags={selectedTags}
      />

      <div className="flex-1 pt-[80px]">
        <div className="mx-auto max-w-md px-6">
          <div className="space-y-6">
            {/* Account Section */}
            <div>
              <div className="text-xs font-medium text-[#6F7A5A] mb-3 uppercase tracking-wide">Account</div>
              <div className="rounded-2xl bg-white border border-[#ECEEE4] p-5 space-y-3">
                <button
                  onClick={() => router.push("/profile")}
                  className="w-full text-left text-sm text-[#1F2A1F] hover:text-[#8F9E4F] transition-colors"
                >
                  Edit profile
                </button>
              </div>
            </div>

            {/* Preferences Section */}
            <div>
              <div className="text-xs font-medium text-[#6F7A5A] mb-3 uppercase tracking-wide">Preferences</div>
              <div className="rounded-2xl bg-white border border-[#ECEEE4] p-5 space-y-3">
                <div className="text-sm text-[#A8B096]">More options coming soon</div>
              </div>
            </div>

            {/* Logout */}
            <div className="pt-4">
              <button
                onClick={handleLogout}
                className="w-full rounded-xl bg-white border border-[#ECEEE4] text-[#C96A5B] px-5 py-3 text-sm font-medium hover:bg-[#FAFAF7] transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      </main>
    </SectionErrorBoundary>
  );
}

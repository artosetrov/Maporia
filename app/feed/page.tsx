"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import FiltersModal, { ActiveFilters } from "../components/FiltersModal";
import SearchModal from "../components/SearchModal";
import { supabase } from "../lib/supabase";
import { DEFAULT_CITY } from "../constants";
import Icon from "../components/Icon";

type ActivityItem =
  | { type: "liked"; created_at: string; placeId: string; placeTitle?: string | null; coverUrl?: string | null; address?: string | null; userId: string; userName: string; userAvatar: string | null }
  | { type: "commented"; created_at: string; placeId: string; placeTitle?: string | null; commentText?: string | null; coverUrl?: string | null; address?: string | null; userId: string; userName: string; userAvatar: string | null }
  | { type: "added"; created_at: string; placeId: string; placeTitle?: string | null; coverUrl?: string | null; address?: string | null; userId: string; userName: string; userAvatar: string | null };

function initialsFromName(name?: string | null) {
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (daysAgo === 0) return `today · ${timeStr}`;
  if (daysAgo === 1) return `1 day ago · ${timeStr}`;
  return `${daysAgo} days ago · ${timeStr}`;
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const getIcon = () => {
    if (item.type === "liked") {
      return (
        <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
          <Icon name="favorite" size={20} className="text-[#8F9E4F]" filled active />
        </div>
      );
    }
    if (item.type === "commented") {
      return (
        <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
          <Icon name="comment" size={20} className="text-[#A8B096]" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] flex items-center justify-center flex-shrink-0">
        <Icon name="add" size={20} className="text-[#8F9E4F]" />
      </div>
    );
  };

  const getActionText = () => {
    if (item.type === "liked") return "Added to favorites";
    if (item.type === "commented") return "commented";
    return "added a place";
  };

  return (
    <Link
      href={`/id/${item.placeId}`}
      className="block w-full py-5 px-6 hover:bg-[#FAFAF7] transition-colors border-b border-[#ECEEE4] last:border-b-0"
    >
      <div className="flex items-start gap-6">
        {/* Иконка события слева */}
        <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>

        {/* Контент в центре */}
        <div className="flex-1 min-w-0">
          {/* Основная строка: аватар + имя → действие */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-[#FAFAF7] overflow-hidden flex-shrink-0 border border-[#ECEEE4]">
              {item.userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.userAvatar} alt={item.userName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-semibold text-[#8F9E4F] flex items-center justify-center h-full">
                  {initialsFromName(item.userName)}
                </span>
              )}
            </div>
            <span className="text-sm font-medium text-[#1F2A1F]">
              <span className="font-semibold">{item.userName}</span> {getActionText()}
            </span>
          </div>

          {/* Комментарий (если есть) */}
          {item.type === "commented" && item.commentText && (
            <div className="text-sm text-[#1F2A1F] bg-[#FAFAF7] rounded-xl p-3 mb-3 border border-[#ECEEE4] line-clamp-2">
              {item.commentText}
            </div>
          )}

          {/* Блок локации: карточка-превью */}
          <div className="flex items-center gap-3 rounded-xl bg-white border border-[#ECEEE4] p-3">
            {item.coverUrl ? (
              <div className="w-14 h-14 rounded-lg bg-[#FAFAF7] overflow-hidden flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverUrl}
                  alt={item.placeTitle ?? "Place"}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-lg bg-[#FAFAF7] flex items-center justify-center flex-shrink-0">
                <Icon name="location" size={24} className="text-[#A8B096]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#1F2A1F] line-clamp-1 mb-0.5">{item.placeTitle ?? "Place"}</div>
              {item.address && (
                <div className="text-xs text-[#6F7A5A] line-clamp-1">{item.address}</div>
              )}
            </div>
          </div>
        </div>

        {/* Время справа */}
        <div className="flex-shrink-0 text-xs text-[#A8B096] mt-0.5">{formatTime(item.created_at)}</div>
      </div>
    </Link>
  );
}

export default function FeedPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  
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

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserId(data.user.id);
        setUserEmail(data.user.email || null);

        // Загружаем профиль пользователя
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Error loading user profile:", profileError);
        }

        if (profile) {
          setUserDisplayName(profile.display_name);
          setUserAvatar(profile.avatar_url);
        }
      }
    })();
  }, []);

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]); // Add pathname to re-trigger on route change

  async function loadActivities() {
    setLoading(true);

    // Загружаем все активности: добавленные места, лайки, комментарии
    const [placesResult, likesResult, commentsResult] = await Promise.all([
      supabase
        .from("places")
        .select("id, title, cover_url, address, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("reactions")
        .select("place_id, created_at, user_id")
        .eq("reaction", "like")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("comments")
        .select("place_id, text, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    // Собираем все уникальные ID пользователей и мест для batch-загрузки
    const userIds = new Set<string>();
    const placeIds = new Set<string>();

    if (placesResult.data) {
      placesResult.data.forEach((p) => {
        if (p.created_by) userIds.add(p.created_by);
        placeIds.add(p.id);
      });
    }
    if (likesResult.data) {
      likesResult.data.forEach((l) => {
        userIds.add(l.user_id);
        placeIds.add(l.place_id);
      });
    }
    if (commentsResult.data) {
      commentsResult.data.forEach((c) => {
        userIds.add(c.user_id);
        placeIds.add(c.place_id);
      });
    }

    // Загружаем все профили и места одним запросом
    const [profilesResult, placesDataResult] = await Promise.all([
      userIds.size > 0
        ? supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url")
            .in("id", Array.from(userIds))
        : { data: [], error: null },
      placeIds.size > 0
        ? supabase
            .from("places")
            .select("id, title, cover_url, address")
            .in("id", Array.from(placeIds))
        : { data: [], error: null },
    ]);

    // Создаем кэш для быстрого доступа
    const profilesCache = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();
    if (profilesResult.data) {
      profilesResult.data.forEach((p) => {
        profilesCache.set(p.id, {
          display_name: p.display_name,
          username: p.username,
          avatar_url: p.avatar_url,
        });
      });
    }

    const placesCache = new Map<string, { title: string | null; cover_url: string | null; address: string | null }>();
    if (placesDataResult.data) {
      placesDataResult.data.forEach((p) => {
        placesCache.set(p.id, {
          title: p.title,
          cover_url: p.cover_url,
          address: p.address,
        });
      });
    }

    const allActivities: ActivityItem[] = [];

    // Добавляем добавленные места
    if (placesResult.data) {
      for (const place of placesResult.data) {
        const profile = place.created_by ? profilesCache.get(place.created_by) : null;
        const userName = profile?.display_name || profile?.username || "Unknown";
        allActivities.push({
          type: "added",
          created_at: place.created_at,
          placeId: place.id,
          placeTitle: place.title,
          coverUrl: place.cover_url,
          address: place.address,
          userId: place.created_by || "",
          userName,
          userAvatar: profile?.avatar_url || null,
        });
      }
    }

    // Добавляем лайки
    if (likesResult.data) {
      for (const like of likesResult.data) {
        const profile = profilesCache.get(like.user_id);
        const place = placesCache.get(like.place_id);
        const userName = profile?.display_name || profile?.username || "Unknown";
        allActivities.push({
          type: "liked",
          created_at: like.created_at,
          placeId: like.place_id,
          placeTitle: place?.title || null,
          coverUrl: place?.cover_url || null,
          address: place?.address || null,
          userId: like.user_id,
          userName,
          userAvatar: profile?.avatar_url || null,
        });
      }
    }

    // Добавляем комментарии
    if (commentsResult.data) {
      for (const comment of commentsResult.data) {
        const profile = profilesCache.get(comment.user_id);
        const place = placesCache.get(comment.place_id);
        const userName = profile?.display_name || profile?.username || "Unknown";
        allActivities.push({
          type: "commented",
          created_at: comment.created_at,
          placeId: comment.place_id,
          placeTitle: place?.title || null,
          commentText: comment.text || null,
          coverUrl: place?.cover_url || null,
          address: place?.address || null,
          userId: comment.user_id,
          userName,
          userAvatar: profile?.avatar_url || null,
        });
      }
    }

    // Сортируем по дате (новые сверху)
    allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setActivities(allActivities.slice(0, 100)); // Ограничиваем 100 последними
    setLoading(false);
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
        onSearchBarClick={() => setSearchModalOpen(true)}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onCitySelect={(city) => {
          setSelectedCity(city);
          const params = new URLSearchParams();
          if (city) params.set("city", city);
          if (searchValue) params.set("q", searchValue);
          if (activeFilters.categories.length > 0) {
            params.set("categories", activeFilters.categories.map(c => encodeURIComponent(c)).join(','));
          }
          router.push(`/map?${params.toString()}`);
        }}
        onSearchSubmit={(city, query, tags) => {
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
            params.set("city", encodeURIComponent(city.trim()));
          }
          if (query.trim()) {
            params.set("q", encodeURIComponent(query.trim()));
          }
          const categoriesToUse = tags || activeFilters.categories;
          if (categoriesToUse.length > 0) {
            params.set("categories", categoriesToUse.map(c => encodeURIComponent(c)).join(','));
          }
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={selectedCity}
        searchQuery={searchValue}
        selectedTags={selectedTags}
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

      <div className="flex-1 pt-[64px] pb-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-4">
          {loading ? (
            <div className="bg-white rounded-2xl border border-[#ECEEE4] overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <ActivityItemSkeleton key={i} />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 text-[#6F7A5A]">No activity yet</div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#ECEEE4] overflow-hidden">
              {activities.map((activity, index) => (
                <ActivityCard key={`${activity.type}-${activity.placeId}-${activity.created_at}-${index}`} item={activity} />
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}

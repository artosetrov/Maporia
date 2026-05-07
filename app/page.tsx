"use client";

import Link from "next/link";
import { useEffect, useState, useMemo, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type HomeKind = "location" | "service" | "experience";

const HOME_TABS: { id: HomeKind; label: string; emoji: string }[] = [
  { id: "location", label: "Locations", emoji: "📍" },
  { id: "experience", label: "Experiences", emoji: "✨" },
  { id: "service", label: "Services", emoji: "🛠" },
];
import { useAuthRedirect } from "./hooks/useAuthRedirect";
import TopBar from "./components/TopBar";
import SearchBar from "./components/SearchBar";
import HomeSection from "./components/HomeSection";
import Pill from "./components/Pill";
import CategoryCarousel from "./components/CategoryCarousel";
import StatsBanner from "./components/StatsBanner";
import { ActiveFilters } from "./components/FiltersModal";
// Heavy modals — only loaded when the user actually opens them.
// Same pattern is already used on /map; this keeps the home-page main
// chunk ~tens of KB lighter and shaves time-to-interactive on first paint.
import nextDynamic from "next/dynamic";
const SearchModal = nextDynamic(() => import("./components/SearchModal"), { ssr: false });
const FiltersModal = nextDynamic(() => import("./components/FiltersModal"), { ssr: false });
import { HOME_SECTIONS } from "./constants/homeSections";
import { supabase, hasValidSupabaseConfig } from "./lib/supabase";
import type { Database } from "./types/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { DEFAULT_CITY } from "./constants";

type ReactionPlaceId = Pick<Database["public"]["Tables"]["reactions"]["Row"], "place_id">;
type ReactionsPlaceIdResult = { data: ReactionPlaceId[] | null; error: PostgrestError | null };
import { useUserAccessContext } from "./contexts/UserAccessContext";
import { SectionErrorBoundary } from "./components/SectionErrorBoundary";
import { sanitizePostgrestValue } from "./utils";
import { buildCityRadiusFilter, getCityCoords } from "./lib/cityRadius";
import { canUserCreate } from "./lib/access";
import Icon from "./components/Icon";

/**
 * HomePage — обёртка с Suspense.
 * useSearchParams() на этой странице (для ?tab=…) требует Suspense boundary
 * в Next.js App Router, иначе prerender падает с CSR-bailout.
 */
export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
          <div className="text-sm text-[#6F7A5A]">Loading…</div>
        </main>
      }
    >
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { redirectToAuth } = useAuthRedirect();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Active home tab — управляется через ?tab=services|experiences|locations
  const tabParam = searchParams?.get("tab");
  const activeKind: HomeKind =
    tabParam === "services" ? "service" :
    tabParam === "experiences" ? "experience" :
    "location";

  // Для service/experience узнаём, есть ли вообще такие карточки в БД.
  // null = ещё не проверили, true = пусто, false = есть.
  // Для location всегда false (там 292+ записи), не делаем лишний запрос.
  const [kindIsEmpty, setKindIsEmpty] = useState<boolean | null>(null);

  function setActiveKind(kind: HomeKind) {
    const url = new URL(window.location.href);
    if (kind === "location") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", kind === "service" ? "services" : "experiences");
    }
    router.replace(`${url.pathname}${url.search}`);
  }
  
  // Search and filter state
  const [searchValue, setSearchValue] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    categories: [],
    sort: null,
    tags: [],
  });
  const [filterOpen, setFilterOpen] = useState(false);
  // Places with tags & categories for filter modal
  const [placesForTags, setPlacesForTags] = useState<{ id: string; tags: string[] | null; categories: string[] | null; access_level: string | null }[]>([]);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  // User access and profile data (from context — single session/profile request)
  const { access, user, profile } = useUserAccessContext();

  // We deliberately do NOT block rendering of public sections on auth.
  // 8 of 9 default home sections are public (city/category-based) and don't
  // depend on `user`/`access`. Showing skeletons until Supabase replies to
  // getSession() was the dominant visible stall on the home page.
  // Section components consume `userAccess` reactively — when auth resolves,
  // they re-render with premium filtering applied.
  // (Tags-for-filter modal data is loaded lazily on first open instead of
  // eagerly here — see `ensurePlacesForTagsLoaded` below.)
  
  // Derive display values from profile
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const userDisplayName = profile?.display_name ?? (userEmail ? userEmail.split("@")[0] : null);
  const userAvatar = profile?.avatar_url ?? null;

  // Check if user has interests for Recommended section
  const hasInterests = useMemo(() => {
    if (!profile) return false;
    const hasCategories = profile.favorite_categories && profile.favorite_categories.length > 0;
    const hasTags = profile.favorite_tags && profile.favorite_tags.length > 0;
    return hasCategories || hasTags;
  }, [profile]);

  // Build sections list with conditional Recommended section
  const sectionsToRender = useMemo(() => {
    const sections = [...HOME_SECTIONS];
    
    // Add Recommended section at the beginning if user has interests
    if (hasInterests) {
      sections.unshift({
        title: "Recommended for you",
        recommended: true,
      });
    }
    
    return sections;
  }, [hasInterests]);

  // Check Supabase configuration
  useEffect(() => {
    if (!hasValidSupabaseConfig) {
      console.error('[HomePage] Supabase configuration is missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
    }
  }, []);

  // Проверяем «есть ли вообще карточки этого kind'а». Дешёвый count(*).
  // Только для service / experience, потому что location всегда непустой.
  useEffect(() => {
    if (activeKind === "location") {
      setKindIsEmpty(false);
      return;
    }
    let cancelled = false;
    setKindIsEmpty(null); // показываем секции (skeletons), пока считаем
    (async () => {
      try {
        const { count, error } = await supabase
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("kind", activeKind)
          .eq("is_hidden", false);
        if (cancelled) return;
        if (error) {
          // Не блокируем UI — показываем секции, они сами справятся.
          setKindIsEmpty(false);
          return;
        }
        setKindIsEmpty((count ?? 0) === 0);
      } catch {
        if (!cancelled) setKindIsEmpty(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeKind]);

  // Lazy loader for `placesForTags`. Previously this dragged in the FULL
  // places table (no LIMIT) on every home-page mount — for sites with
  // thousands of places this is a multi-MB request blocking nothing the
  // user can see until they open the Filters modal.
  // Now we only fetch on first open and cap at 2000 rows.
  const placesForTagsLoadedRef = useRef(false);
  const ensurePlacesForTagsLoaded = useCallback(async () => {
    if (placesForTagsLoadedRef.current) return;
    if (!hasValidSupabaseConfig) return;
    placesForTagsLoadedRef.current = true;
    try {
      const { data, error } = await supabase
        .from("places")
        .select("id,tags,categories,access_level")
        .limit(2000);
      if (error) {
        placesForTagsLoadedRef.current = false; // allow retry on next open
        return;
      }
      setPlacesForTags(
        (data ?? []).map((r: { id: string; tags: string[] | null; categories: string[] | null; access_level: string | null }) => ({
          id: r.id,
          tags: r.tags ?? null,
          categories: r.categories ?? null,
          access_level: r.access_level ?? null,
        }))
      );
    } catch (err: any) {
      placesForTagsLoadedRef.current = false; // allow retry on next open
      if (err?.name === 'AbortError' || err?.message?.includes('abort')) return;
      if (err?.name === 'TypeError' && err?.message?.includes('fetch')) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[HomePage] Не удалось загрузить теги (сеть недоступна).');
        }
        return;
      }
      console.error('[HomePage] Error loading tags:', err);
    }
  }, []);

  // Tags are now loaded dynamically by FiltersModal based on selected categories
  // (via getAvailableTags callback that queries Supabase tags table with category_ids filter)

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
        const res = (await supabase
          .from("reactions")
          .select("place_id")
          .eq("user_id", capturedUserId)
          .eq("reaction", "like")) as ReactionsPlaceIdResult;
        const { data, error } = res;

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
        // Сетевые ошибки — тихо обрабатываем
        if (err?.name === 'TypeError' && (err?.message === 'Failed to fetch' || err?.message?.includes('fetch'))) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[HomePage] Не удалось загрузить избранное (сеть недоступна).');
          }
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
      redirectToAuth();
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
          // @ts-expect-error — Insert inferred as never when client not typed with Database; payload is valid
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
      params.set("categories", activeFilters.categories.join(','));
    }
    router.push(`/map?${params.toString()}`);
  }

  function handleCityChange(city: string | null) {
    setSelectedCity(city);
    // Always redirect to /map with city filter
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
    // Open filters modal — kick off the lazy tags-data fetch on first click.
    // Subsequent opens are free (memoised in placesForTagsLoadedRef).
    ensurePlacesForTagsLoaded();
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
    if ((filters.tags ?? []).length > 0) {
      params.set("tags", (filters.tags ?? []).map(t => encodeURIComponent(t)).join(','));
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
    if ((activeFilters.tags ?? []).length > 0) count += (activeFilters.tags ?? []).length;
    if (activeFilters.sort) count++;
    setActiveFiltersCount(count);
  }, [selectedCity, searchValue, activeFilters]);

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex flex-col">
      {/*
        Airbnb-style header on home:
        – TopBar держит только Logo + правые экшены (showSearchBar=false).
        – Табы (Locations / Experiences / Services) и SearchBar выезжают
          отдельной sticky-зоной под TopBar — поиск всегда под табами.
        Search-handlers всё равно прокидываем: они привязаны к собственному
        SearchBar ниже.
      */}
      <TopBar
        showSearchBar={false}
        hideMobileSearchPill={true}
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
        userAccess={access}
        getCategoryCount={async (category: string, premiumOnly?: boolean) => {
          try {
            let query = supabase
              .from("places")
              .select("*", { count: 'exact', head: true })
              .overlaps("categories", [category]);
            if (premiumOnly) {
              query = query.eq("access_level", "premium");
            }
            const { count, error } = await query;
            if (error) return 0;
            return count || 0;
          } catch {
            return 0;
          }
        }}
        getAvailableTags={async (categories: string[]) => {
          if (!categories || categories.length === 0) return [];
          const { data } = await supabase
            .from("tags")
            .select("name")
            .overlaps("category_ids", categories)
            .order("name") as { data: { name: string | null }[] | null };
          return (data ?? []).map((t) => t.name).filter((n): n is string => Boolean(n));
        }}
        getTagCounts={(tags: string[], categories?: string[], premiumOnly?: boolean) => {
          const counts: Record<string, number> = {};
          tags.forEach((t) => (counts[t] = 0));
          let source = categories && categories.length > 0
            ? placesForTags.filter((p) =>
                categories.some((cat) => (p.categories ?? []).includes(cat))
              )
            : placesForTags;
          if (premiumOnly) {
            source = source.filter((p) => p.access_level === "premium");
          }
          source.forEach((p) => {
            (p.tags ?? []).forEach((t) => {
              if (t in counts) counts[t]++;
            });
          });
          return counts;
        }}
        getFilteredCount={async (draftFilters: ActiveFilters) => {
          // Подсчитываем количество мест с учетом фильтров
          try {
            let countQuery = supabase.from("places").select("*", { count: 'exact', head: true });

            // Фильтрация по городу с радиусом 10 миль
            if (selectedCity && selectedCity !== DEFAULT_CITY) {
              const coords = await getCityCoords(selectedCity);
              countQuery = countQuery.or(buildCityRadiusFilter(selectedCity, coords.lat, coords.lng));
            }

            // Фильтрация по категориям
            if (draftFilters.categories.length > 0) {
              countQuery = countQuery.overlaps("categories", draftFilters.categories);
            }

            // Фильтрация по тегам
            if ((draftFilters.tags ?? []).length > 0) {
              countQuery = countQuery.overlaps("tags", draftFilters.tags ?? []);
            }

            // Фильтрация по поисковому запросу
            if (searchValue && searchValue.trim()) {
              const s = sanitizePostgrestValue(searchValue.trim());
              countQuery = countQuery.or(`title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`);
            }

            const { count, error } = await countQuery;
            if (error) {
              // Silently ignore AbortError
              if (error.message?.includes('abort') || error.name === 'AbortError' || (error as any).code === 'ECONNABORTED') {
                return 0;
              }
              console.error("Error counting filtered places:", {
                message: error.message,
                code: (error as any).code,
                details: (error as any).details,
                hint: (error as any).hint,
                context: { selectedCity, categories: draftFilters.categories, searchValue },
              });
              return 0;
            }
            return count || 0;
          } catch (error: any) {
            // Silently ignore AbortError
            if (error?.name === 'AbortError' || error?.message?.includes('abort') || error?.code === 'ECONNABORTED') {
              return 0;
            }
            console.error("Error in getFilteredCount:", {
              message: error?.message,
              name: error?.name,
              code: (error as any)?.code,
              string: String(error),
            });
            return 0;
          }
        }}
      />

      <div className="flex-1 pt-[64px]">
        {/*
          Airbnb-style sticky header zone: tabs row → search row.
          Обе строки залипают вместе при скролле, поэтому пользователь
          всегда видит и тип контента, и строку поиска.
        */}
        <div className="border-b border-[#ECEEE4] bg-[#FAFAF7] sticky top-[64px] z-20">
          <div
            className="mx-auto max-w-[1920px]"
            style={{
              paddingLeft: 'var(--home-page-padding, 16px)',
              paddingRight: 'var(--home-page-padding, 16px)',
            }}
          >
            {/* Row 1: Tabs — centered, like Airbnb's Homes/Experiences/Services */}
            <div className="flex justify-center">
              <div className="flex gap-2 overflow-x-auto pt-3 pb-2 max-w-full">
                {HOME_TABS.map((tab) => {
                  const isActive = activeKind === tab.id;
                  return (
                    <Pill
                      key={tab.id}
                      variant="tab"
                      active={isActive}
                      onClick={() => setActiveKind(tab.id)}
                    >
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span aria-hidden>{tab.emoji}</span>
                        <span>{tab.label}</span>
                      </span>
                    </Pill>
                  );
                })}
              </div>
            </div>

            {/* Row 2: SearchBar — always under the tabs.
                Mobile vs desktop через CSS, без JS-флага, чтобы не было
                hydration-моргания. */}
            <div className="pb-3 pt-1">
              {/* Mobile (< lg) */}
              <div className="lg:hidden">
                <SearchBar
                  selectedCity={selectedCity}
                  onCityChange={handleCityChange}
                  searchValue={searchValue}
                  onSearchChange={handleSearchChange}
                  onFiltersClick={handleFiltersClick}
                  activeFiltersCount={activeFiltersCount}
                  isMobile={true}
                  onSearchBarClick={() => setSearchModalOpen(true)}
                />
              </div>
              {/* Desktop (>= lg) */}
              <div className="hidden lg:flex justify-center">
                <SearchBar
                  selectedCity={selectedCity}
                  onCityChange={handleCityChange}
                  searchValue={searchValue}
                  onSearchChange={handleSearchChange}
                  onFiltersClick={handleFiltersClick}
                  activeFiltersCount={activeFiltersCount}
                  onSearchBarClick={() => setSearchModalOpen(true)}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className="mx-auto pb-6 lg:py-8 max-w-full lg:max-w-[960px] lg:max-w-[1120px] lg:max-w-[1440px] lg:max-w-[1920px]"
          style={{
            paddingLeft: 'var(--home-page-padding, 16px)',
            paddingRight: 'var(--home-page-padding, 16px)',
          }}
        >
          {/*
            Sections render immediately. Each <HomeSection> kicks off its own
            Supabase fetch in parallel, independent of auth, so the user sees
            real content as soon as the cheapest section returns instead of
            waiting for the full auth round-trip.

            kindFilter передаём только если это не Locations — для location
            оставляем legacy-поведение (показываем все типы), потому что
            services/experiences пока почти нет и их карточки могут попадать
            и в общую ленту через текущий ?tab=… отсутствует.
            При активных вкладках Services/Experiences секции жёстко
            фильтруются по kind.
          */}
          {/*
            Live-статистика по проекту: users / locations / services / experiences.
            Показываем всегда (не зависит от активного таба) — это «пульс» Maporia.
            Числа тянутся из Supabase через дешёвые count-запросы внутри компонента.
          */}
          <StatsBanner />

          {/* Category carousel — только для service/experience табов */}
          {activeKind !== "location" && kindIsEmpty !== true && (
            <CategoryCarousel kind={activeKind} />
          )}

          {kindIsEmpty === true ? (
            <EmptyKindState
              kind={activeKind as Exclude<HomeKind, "location">}
              canCreate={canUserCreate(access, activeKind)}
              onCreate={() =>
                router.push(`/add?kind=${activeKind}&returnTo=${encodeURIComponent(`/?tab=${activeKind === "service" ? "services" : "experiences"}`)}`)
              }
              onUpgrade={() => router.push("/pricing")}
            />
          ) : (
            sectionsToRender.map((section, index) => (
              <SectionErrorBoundary key={`${section.title}-${activeKind}`}>
                <HomeSection
                  section={section}
                  userId={userId}
                  userAccess={access}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  onTagClick={handleTagClick}
                  isFirst={index === 0}
                  kindFilter={activeKind === "location" ? undefined : activeKind}
                />
              </SectionErrorBoundary>
            ))
          )}
        </div>
      </div>

    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state для пустых табов Services/Experiences.
// Если creator → CTA «Создать», если зритель → CTA «Тарифы».
// ─────────────────────────────────────────────────────────────────────────────

function EmptyKindState({
  kind,
  canCreate,
  onCreate,
  onUpgrade,
}: {
  kind: "service" | "experience";
  canCreate: boolean;
  onCreate: () => void;
  onUpgrade: () => void;
}) {
  const config = kind === "service"
    ? {
        emoji: "🛠",
        title: "No services yet",
        body: "Maporia is just starting to fill up with services — photographers, instructors, makers. Be the first to publish your service in your city.",
        creatorCta: "Create your first service",
        viewerCta: "Become a provider — Pro Service",
      }
    : {
        emoji: "✨",
        title: "No experiences yet",
        body: "Tours, workshops, food walks — all coming soon. If you run experiences, this is your chance to be first.",
        creatorCta: "Create an experience",
        viewerCta: "Become a host — Pro Experience",
      };

  return (
    <div className="py-12 sm:py-20 px-4">
      <div className="max-w-xl mx-auto text-center">
        <div className="text-6xl sm:text-7xl mb-6" aria-hidden>
          {config.emoji}
        </div>
        <h2 className="font-fraunces text-2xl sm:text-3xl font-semibold text-[#1F2A1F] mb-3">
          {config.title}
        </h2>
        <p className="text-[15px] text-[#6F7A5A] mb-8 leading-relaxed">
          {config.body}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {canCreate ? (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition"
            >
              <Icon name="add" size={18} className="mr-2" />
              {config.creatorCta}
            </button>
          ) : (
            <button
              type="button"
              onClick={onUpgrade}
              className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition"
            >
              {config.viewerCta}
            </button>
          )}
        </div>
        <div className="mt-10 pt-8 border-t border-[#ECEEE4]">
          <p className="text-xs text-[#A8B096]">
            Maporia is a directory — deals between buyers and providers happen directly.
          </p>
        </div>
      </div>
    </div>
  );
}

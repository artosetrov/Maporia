"use client";

export const dynamic = 'force-dynamic';

import Link from "next/link";
import { useEffect, useMemo, useState, Suspense, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
// NOTE: google.maps.Marker is deprecated; full migration to AdvancedMarkerElement is a separate task.
// mapId and "marker" library are already configured in config/googleMaps.ts.
import { GoogleMap, InfoWindow } from "@react-google-maps/api";
import { useGoogleMaps } from "../providers/GoogleMapsProvider";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { MaporiaClusterRenderer } from "../lib/clusterRenderer";
import TopBar from "../components/TopBar";
import PlaceCard from "../components/PlaceCard";
import nextDynamic from "next/dynamic";
import { ActiveFilters } from "../components/FiltersModal";

const FiltersModal = nextDynamic(() => import("../components/FiltersModal"), { ssr: false });
const SearchModal = nextDynamic(() => import("../components/SearchModal"), { ssr: false });
import FavoriteIcon from "../components/FavoriteIcon";
import PremiumBadge from "../components/PremiumBadge";
import { getMapOptions } from "../config/googleMaps";
import { getCategoryEmoji, createMarkerIcon } from "../lib/mapMarkers";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { DEFAULT_CITY, CATEGORIES, CITIES, getTagEmoji, stripTagEmoji } from "../constants";
import { useUserAccessContext } from "../contexts/UserAccessContext";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import { useIsDesktop } from "../hooks/useIsDesktop";
import { usePremiumGate } from "../hooks/usePremiumGate";
import { isPlacePremium, canUserViewPlace, type UserAccess } from "../lib/access";
// Heavy modals — only loaded when user opens them.
const AuthModal = nextDynamic(() => import("../components/AuthModal"), { ssr: false });
const PremiumUpsellModal = nextDynamic(() => import("../components/PremiumUpsellModal"), { ssr: false });
import Icon from "../components/Icon";
import { PlaceCardGridSkeleton, MapSkeleton, Empty } from "../components/Skeleton";
import { sanitizePostgrestValue, normalizeCity, cx, initialsFromEmail, timeAgo, isValidPhotoUrl } from "../utils";
import type { PlaceListItem as Place } from "../types";
import { buildCityRadiusFilter, getCityCoords, isPlaceWithinCityRadius } from "../lib/cityRadius";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

// Тип для фильтров
type PlaceFilters = {
  premium?: boolean;
  premiumOnly?: boolean;
  cities?: string[];
  categories?: string[];
  tags?: string[];
  /** Pre-resolved city coordinates for radius filtering */
  cityCoordsMap?: Map<string, { lat: number | null; lng: number | null }>;
};

// Result types for Supabase queries (Database['public']['Tables'][table]['Row'] + Pick)
type ProfilesRow = Database["public"]["Tables"]["profiles"]["Row"];
type PlacesRow = Database["public"]["Tables"]["places"]["Row"];
type ReactionsRow = Database["public"]["Tables"]["reactions"]["Row"];
type CommentsRow = Database["public"]["Tables"]["comments"]["Row"];
type PlacePhotosRow = Database["public"]["Tables"]["place_photos"]["Row"];

type ProfileDisplay = Pick<ProfilesRow, "display_name" | "avatar_url">;
type ProfileResult = { data: ProfileDisplay | null; error: PostgrestError | null };

type PlacesSelectRow = Pick<PlacesRow, "id" | "title" | "description" | "city" | "city_name_cached" | "lat" | "lng" | "cover_url" | "categories" | "tags" | "created_at" | "created_by" | "access_level" | "country">;
type PlacesResult = { data: PlacesSelectRow[] | null; error: PostgrestError | null; count?: number | null };

type ReactionPlaceId = Pick<ReactionsRow, "place_id">;
type ReactionsPlaceIdResult = { data: ReactionPlaceId[] | null; error: PostgrestError | null };

type CommentPlaceId = Pick<CommentsRow, "place_id">;
type CommentsPlaceIdResult = { data: CommentPlaceId[] | null; error: PostgrestError | null };

type PlacePhotoUrl = Pick<PlacePhotosRow, "url">;
type PlacePhotosUrlResult = { data: PlacePhotoUrl[] | null; error: PostgrestError | null };
type PlacePhotoPlaceIdUrl = Pick<PlacePhotosRow, "place_id" | "url">;
type PlacePhotosBatchResult = { data: PlacePhotoPlaceIdUrl[] | null; error: PostgrestError | null };

// Централизованная функция фильтрации мест
function filterPlaces(places: Place[], filters: PlaceFilters): Place[] {
  let filtered = [...places];

  // Фильтрация по Premium
  if (filters.premium) {
    filtered = filtered.filter(place => isPlacePremium(place));
  }

  // Фильтрация по городам с радиусом 10 миль (OR внутри группы)
  if (filters.cities && filters.cities.length > 0) {
    const coordsMap = filters.cityCoordsMap;
    filtered = filtered.filter(place => {
      return filters.cities!.some(cityName => {
        const coords = coordsMap?.get(cityName.toLowerCase().trim());
        if (coords) {
          return isPlaceWithinCityRadius(place, cityName, coords.lat, coords.lng);
        }
        // Fallback: strict name match
        const placeCity = normalizeCity(place.city || place.city_name_cached);
        return normalizeCity(cityName) === placeCity;
      });
    });
  }

  // Фильтрация по категориям - OR внутри группы (место имеет любую из выбранных категорий)
  if (filters.categories && filters.categories.length > 0) {
    filtered = filtered.filter(place => {
      if (!place.categories || place.categories.length === 0) return false;
      return filters.categories!.some(cat => place.categories!.includes(cat));
    });
  }

  // Фильтрация по тегам - OR (место имеет любой из выбранных тегов)
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(place => {
      if (!place.tags || place.tags.length === 0) return false;
      return filters.tags!.some(tag => place.tags!.includes(tag));
    });
  }

  return filtered;
}


function MapPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { redirectToAuth } = useAuthRedirect();
  const isDesktop = useIsDesktop();

  // На странице /map по умолчанию показываем list view (включая мобильные)
  // Всегда начинаем с "list", независимо от устройства
  // Это гарантирует, что на мобильных устройствах по умолчанию открывается список, а не карта
  const viewParam = searchParams?.get('view') === 'map' ? 'map' : 'list';
  const [view, setView] = useState<"list" | "map">(viewParam);

  // Синхронизируем view с query param при SPA-навигации
  useEffect(() => {
    setView(viewParam);
  }, [viewParam]);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number | null>(null);


  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true); // Start with true to show skeleton initially
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [filteredPlacesState, setFilteredPlacesState] = useState<Place[]>([]);

  // User access and profile from context (single session/profile request; no duplicate loadUser)
  const { loading: accessLoading, access, user, profile } = useUserAccessContext();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const userDisplayName = profile?.display_name ?? user?.email?.split("@")[0] ?? null;
  const userAvatar = profile?.avatar_url ?? null;
  
  
  // Bootstrap ready state - wait for auth/profile before loading places
  const [bootReady, setBootReady] = useState(false);
  
  useEffect(() => {
    if (!accessLoading) {
      setBootReady(true);
      if (process.env.NODE_ENV === 'development') {
        console.log('[MapPage] bootReady set to true');
      }
    }
  }, [accessLoading]);

  // Applied filters (current state, affects data)
  // Инициализируем из URL сразу, чтобы фильтры применялись при первом рендере
  // Безопасная инициализация для SSR
  const getInitialValues = () => {
    try {
      if (!searchParams) {
        return {
          initialCity: null, // null для "Anywhere"
          initialQ: "",
          initialCategories: [] as string[],
          initialTags: [] as string[],
          hasCityInUrl: false,
        };
      }
      
      const cityParam = searchParams.get('city');
      const qParam = searchParams.get('q');
      const categoriesParam = searchParams.get('categories');
      const tagsParam = searchParams.get('tags');
      
      let initialCity: string | null = null; // По умолчанию null для "Anywhere"
      let hasCityInUrl = false;
      if (cityParam && cityParam.trim()) {
        hasCityInUrl = true;
        try {
          initialCity = decodeURIComponent(cityParam.trim());
        } catch {
          initialCity = cityParam.trim();
        }
      }
      
      const initialQ = qParam ? (() => {
        try {
          return decodeURIComponent(qParam);
        } catch {
          return qParam;
        }
      })() : "";
      
      const initialCategories = categoriesParam && categoriesParam.trim() 
        ? categoriesParam.split(',').map(c => {
            try {
              return decodeURIComponent(c.trim());
            } catch {
              return c.trim();
            }
          }).filter(Boolean)
        : [];
      
      const initialTags = tagsParam && tagsParam.trim()
        ? tagsParam.split(',').map(t => {
            try {
              return decodeURIComponent(t.trim());
            } catch {
              return t.trim();
            }
          }).filter(Boolean)
        : [];
      
      return { initialCity, initialQ, initialCategories, initialTags, hasCityInUrl };
    } catch (e) {
      console.error('[MapPage] Error in getInitialValues:', e);
      // Fallback при ошибке парсинга
        return {
          initialCity: null, // null для "Anywhere"
          initialQ: "",
          initialCategories: [] as string[],
          initialTags: [] as string[],
          hasCityInUrl: false,
        };
    }
  };
  
  const { initialCity, initialQ, initialCategories, initialTags, hasCityInUrl: initialHasCityInUrl } = getInitialValues();
  
  // appliedCity всегда должен быть строкой (для фильтрации), используем DEFAULT_CITY если нет города
  const [appliedCity, setAppliedCity] = useState<string | null>(initialCity || DEFAULT_CITY);
  const [appliedQ, setAppliedQ] = useState(initialQ);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    categories: initialCategories,
    sort: null,
    tags: initialTags,
    premium: false,
    hidden: false,
    vibe: false,
    premiumOnly: false, // Для обратной совместимости
  });
  
  // Счётчик версий фильтров для принудительного обновления списка
  const [filtersVersion, setFiltersVersion] = useState(0);
  
  // Инициализируем флаг наличия города в URL
  const [hasExplicitCityInUrlState, setHasExplicitCityInUrlState] = useState(initialHasCityInUrl);
  
  // Draft filters (for search input and modal)
  const [searchDraft, setSearchDraft] = useState(initialQ);
  // selectedCity может быть null для "Anywhere"
  const [selectedCity, setSelectedCity] = useState<string | null>(initialCity);
  
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [cameFromHome, setCameFromHome] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // Backward compatibility: appliedCategories для существующего кода
  const appliedCategories = activeFilters.categories;

  // Handle city change from SearchBar or SearchModal
  const [appliedCities, setAppliedCities] = useState<string[]>(() => {
    const initialCity = getInitialValues().initialCity;
    // Если в URL есть несколько городов через запятую, разбиваем их
    if (searchParams?.get('cities')) {
      const citiesParam = searchParams.get('cities');
      if (citiesParam) {
        return citiesParam.split(',').map(c => c.trim()).filter(Boolean);
      }
    }
    return initialCity ? [initialCity] : [];
  });

  // Читаем query params из URL (реагируем на изменения)
  useEffect(() => {
    if (!searchParams) return;
    
    try {
      const city = searchParams.get('city');
      const categoriesParam = searchParams.get('categories');
      const tagsParam = searchParams.get('tags');
      const qParam = searchParams.get('q');
      const ref = searchParams.get('ref');
      
      // Устанавливаем applied filters из URL
      if (city && city.trim()) {
        try {
          const decodedCity = decodeURIComponent(city.trim());
          // Всегда устанавливаем город из URL, если он есть
          setAppliedCity(decodedCity);
          setAppliedCities([decodedCity]);
          setSelectedCity(decodedCity);
          setHasExplicitCityInUrlState(true); // Город явно указан в URL
        } catch (e) {
          const trimmedCity = city.trim();
          setAppliedCity(trimmedCity);
          setAppliedCities([trimmedCity]);
          setSelectedCity(trimmedCity);
          setHasExplicitCityInUrlState(true); // Город явно указан в URL
        }
      } else {
        // Если city нет в URL — сброс фильтра по городу: показываем все места
        setHasExplicitCityInUrlState(false);
        setAppliedCity(DEFAULT_CITY);
        setAppliedCities([]);
        setSelectedCity(null);
      }
      
      if (qParam) {
        try {
          const decodedQ = decodeURIComponent(qParam);
          setAppliedQ(decodedQ);
          setSearchDraft(decodedQ);
        } catch {
          setAppliedQ(qParam);
          setSearchDraft(qParam);
        }
      } else {
        // Если параметр q отсутствует, очищаем поиск
        setAppliedQ("");
        setSearchDraft("");
      }
      
      if (categoriesParam && categoriesParam.trim()) {
        try {
          const categories = categoriesParam.split(',').map(c => {
            try {
              return decodeURIComponent(c.trim());
            } catch {
              return c.trim();
            }
          }).filter(Boolean);
          setActiveFilters(prev => ({ ...prev, categories }));
          setFiltersVersion(prev => prev + 1);
        } catch {
          setActiveFilters(prev => ({ ...prev, categories: [] }));
          setFiltersVersion(prev => prev + 1);
        }
      } else {
        // Если параметр categories отсутствует, очищаем категории
        setActiveFilters(prev => ({ ...prev, categories: [] }));
        setFiltersVersion(prev => prev + 1);
      }
      
      if (tagsParam && tagsParam.trim()) {
        try {
          const tags = tagsParam.split(',').map(t => {
            try {
              return decodeURIComponent(t.trim());
            } catch {
              return t.trim();
            }
          }).filter(Boolean);
          setActiveFilters(prev => ({ ...prev, tags }));
          setFiltersVersion(prev => prev + 1);
        } catch {
          setActiveFilters(prev => ({ ...prev, tags: [] }));
          setFiltersVersion(prev => prev + 1);
        }
      } else {
        setActiveFilters(prev => ({ ...prev, tags: [] }));
        setFiltersVersion(prev => prev + 1);
      }
      
      // Проверяем, пришли ли с Home
      if (categoriesParam || tagsParam || ref === 'home') {
        setCameFromHome(true);
      } else {
        setCameFromHome(false);
      }
    } catch (error) {
      console.error("Error parsing search params:", error);
    }
     
  }, [searchParams]);

  // Обновляем URL при изменении applied filters (но только если они отличаются от текущих в URL)
  useEffect(() => {
    if (typeof window === 'undefined' || !searchParams) return;
    
    try {
      const currentCity = searchParams.get('city');
      const currentQ = searchParams.get('q');
      const currentCategories = searchParams.get('categories');
      const currentTags = searchParams.get('tags');
      const currentSort = searchParams.get('sort');
    
    // Сравниваем текущие значения в URL с applied filters
    // Включаем город в URL, если он явно выбран (даже если это DEFAULT_CITY)
    const expectedCity = appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) ? appliedCity : null;
    const expectedQ = appliedQ.trim() || null;
    const expectedCategories = appliedCategories.length > 0 ? appliedCategories : null;
    const expectedTags = (activeFilters.tags ?? []).length > 0 ? (activeFilters.tags ?? []) : null;
    const expectedSort = activeFilters.sort || null;
    
    const currentCityDecoded = currentCity ? (() => {
      try {
        return decodeURIComponent(currentCity);
      } catch {
        return currentCity;
      }
    })() : null;
    const currentQDecoded = currentQ ? (() => {
      try {
        return decodeURIComponent(currentQ);
      } catch {
        return currentQ;
      }
    })() : null;
    const currentCategoriesDecoded = currentCategories 
      ? currentCategories.split(',').map(c => {
          try {
            return decodeURIComponent(c.trim());
          } catch {
            return c.trim();
          }
        }).filter(Boolean).sort()
      : null;
    const expectedCategoriesSorted = expectedCategories ? [...expectedCategories].sort() : null;
    const currentTagsDecoded = currentTags
      ? currentTags.split(',').map(t => {
          try {
            return decodeURIComponent(t.trim());
          } catch {
            return t.trim();
          }
        }).filter(Boolean).sort()
      : null;
    const expectedTagsSorted = expectedTags ? [...expectedTags].sort() : null;
    
    // Проверяем, нужно ли обновлять URL
    const cityChanged = expectedCity !== currentCityDecoded;
    const qChanged = expectedQ !== currentQDecoded;
    const categoriesChanged = JSON.stringify(expectedCategoriesSorted) !== JSON.stringify(currentCategoriesDecoded);
    const tagsChanged = JSON.stringify(expectedTagsSorted) !== JSON.stringify(currentTagsDecoded);
    const sortChanged = expectedSort !== currentSort;
    
    // Если ничего не изменилось, не обновляем URL
    if (!cityChanged && !qChanged && !categoriesChanged && !tagsChanged && !sortChanged) {
      return;
    }
    
    const params = new URLSearchParams();
    
    // URLSearchParams.set() encodes values automatically — no manual encodeURIComponent needed
    if (expectedCity) {
      params.set('city', expectedCity);
    }
    
    if (expectedQ) {
      params.set('q', expectedQ);
    }
    
    if (expectedCategories) {
      params.set('categories', expectedCategories.join(','));
    }
    
    if (expectedTags) {
      params.set('tags', expectedTags.join(','));
    }
    
    if (expectedSort) {
      params.set('sort', expectedSort);
    }
    
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    
    window.history.replaceState({}, '', newUrl);
    } catch (error) {
      console.error("Error updating URL:", error);
    }
  }, [appliedCity, appliedQ, appliedCategories, activeFilters.tags, activeFilters.sort, searchParams, hasExplicitCityInUrlState]);

  // Cities are now fixed from constants, no need to compute from places

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

  // Track total count separately
  const [totalPlacesCount, setTotalPlacesCount] = useState<number | null>(null);
  const [placesData, setPlacesData] = useState<Place[] | null>(null);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [placesError, setPlacesError] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Tags are now loaded dynamically by FiltersModal based on selected categories
  // (via getAvailableTags callback that queries Supabase tags table with category_ids filter)

  // Fetch places when filters or refreshKey change
  useEffect(() => {
    if (!bootReady) return;
    let cancelled = false;
    setPlacesLoading(true);
    setPlacesError(null);
    (async () => {
      try {
        const result = await (async (): Promise<Place[]> => {
      // Загружаем все места сразу (без пагинации)
      // Оптимизация: загружаем только необходимые поля для списка и карты
      // Фильтры Premium/Hidden/Vibe применяются на клиенте через filterPlaces
      // Используем только существующие поля: access_level для premium, категории для hidden/vibe
      let query = supabase.from("places").select(
        "id,title,description,city,city_name_cached,lat,lng,cover_url,categories,tags,created_at,created_by,access_level,country",
        { count: 'exact' }
      );

      // Фильтрация по городам и категориям применяется на клиенте для скорости
      // (как и Premium/Hidden/Vibe фильтры)
      // Это позволяет избежать медленных запросов на сервере и сделать фильтрацию мгновенной

      // Фильтрация по поисковому запросу
      if (appliedQ.trim()) {
        const s = sanitizePostgrestValue(appliedQ.trim());
        query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`);
      }

      // Фильтрация по тегам
      if (selectedTag) {
        query = query.contains("tags", [selectedTag]);
      }

      // Применяем сортировку
      if (activeFilters.sort === "newest") {
        query = query.order("created_at", { ascending: false });
      } else if (activeFilters.sort === "most_liked" || activeFilters.sort === "most_commented") {
        // Для сортировки по лайкам/комментариям используем created_at как fallback
        // Счетчики будут загружены отдельно
        query = query.order("created_at", { ascending: false });
      } else {
        // По умолчанию - по дате создания
        query = query.order("created_at", { ascending: false });
      }

      // No pagination - load all places at once
      const queryResult = (await query) as PlacesResult;
      const { data, error, count } = queryResult;
      
      if (error) {
        // Enhanced error logging with full error details
        const errorDetails = {
          message: error.message || 'No error message',
          code: error.code || 'No error code',
          details: error.details || 'No details',
          hint: error.hint || 'No hint',
          name: (error as any).name || 'No name',
          stack: (error as any).stack || 'No stack',
          fullError: error,
        };
        
        console.error('[MapPage] Query error:', errorDetails);
        
        // Если ошибка связана с полями (например, поле не существует), пробуем select("*")
        if (error.code === 'PGRST116' || 
            error.message?.includes('column') || 
            error.message?.includes('field') ||
            error.message?.includes('does not exist')) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[MapPage] Retrying with select("*") due to field error');
          }
          
          // Пересоздаем запрос с select("*")
          // Фильтры по городам и категориям применяются на клиенте, не на сервере
          let fallbackQuery = supabase.from("places").select("*", { count: 'exact' });
          
          // Применяем только поисковый запрос и теги на сервере
          // Города и категории фильтруются на клиенте для скорости
          if (appliedQ.trim()) {
            const s = sanitizePostgrestValue(appliedQ.trim());
            fallbackQuery = fallbackQuery.or(`title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`);
          }
          
          if (selectedTag) {
            fallbackQuery = fallbackQuery.contains("tags", [selectedTag]);
          }
          
          fallbackQuery = fallbackQuery.order("created_at", { ascending: false });
          
          const fallbackResult = (await fallbackQuery) as PlacesResult;
          if (!fallbackResult.error) {
            // Fallback успешен
            return (fallbackResult.data?.map((p) => ({
              ...p,
              // Ensure all required fields exist (используем только существующие поля)
              id: p.id,
              title: p.title || '',
              description: p.description || null,
              city: p.city || null,
              city_name_cached: p.city_name_cached || null,
              lat: p.lat ?? null,
              lng: p.lng ?? null,
              cover_url: p.cover_url || null,
              categories: p.categories || null,
              tags: p.tags || null,
              created_at: p.created_at || new Date().toISOString(),
              created_by: p.created_by || null,
              access_level: p.access_level || null,
              country: p.country || null,
            })) || []) as Place[];
          }
        }
        
        throw error;
      }
      
      // Update total count
      if (count !== null && count !== undefined) {
        setTotalPlacesCount(count);
      }
      
      // Return empty array if no data (this is valid - means no places match filters)
      if (!data || data.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[MapPage] No places found for query:', {
            appliedCities,
            appliedCategories,
            appliedQ,
            selectedTag,
            totalCount: count,
          });
        }
        // Update total count even if no data
        if (count !== null && count !== undefined) {
          setTotalPlacesCount(count);
        }
        return [];
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[MapPage] Loaded places:', data.length, 'total:', count);
      }

      // Обрабатываем данные перед применением фильтров
      // Фильтрация (поиск, города, категории) теперь применяется в filteredPlacesMemo для динамического обновления
      // Не применяем фильтры здесь, чтобы они работали при изменении без перезагрузки данных
      const filteredData = data as Place[];

      // Если выбрана сортировка по комментариям или лайкам, нужно загрузить счетчики
      // Сортировка применяется ко всем данным, а фильтрация - в filteredPlacesMemo
      let placesWithCounts = filteredData;
      if (activeFilters.sort === "most_commented" || activeFilters.sort === "most_liked") {
        const placeIds = filteredData.map((p) => p.id);
        
        // Оптимизация: используем count вместо загрузки всех записей
        // Разбиваем на батчи по 100 мест для избежания превышения лимита запроса
        const batchSize = 100;
        const commentsCount = new Map<string, number>();
        const likesCount = new Map<string, number>();
        
        // Загружаем счетчики батчами
        for (let i = 0; i < placeIds.length; i += batchSize) {
          const batch = placeIds.slice(i, i + batchSize);
          
          const [commentsResult, likesResult] = (await Promise.all([
            supabase
              .from("comments")
              .select("place_id")
              .in("place_id", batch),
            supabase
              .from("reactions")
              .select("place_id")
              .eq("reaction", "like")
              .in("place_id", batch),
          ])) as [CommentsPlaceIdResult, ReactionsPlaceIdResult];
          
          // Check for errors in batch requests (log but don't fail the whole request)
          if (commentsResult.error) {
            console.warn('[MapPage] Error loading comments batch:', {
              message: commentsResult.error.message,
              code: commentsResult.error.code,
              details: commentsResult.error.details,
            });
          }
          if (likesResult.error) {
            console.warn('[MapPage] Error loading likes batch:', {
              message: likesResult.error.message,
              code: likesResult.error.code,
              details: likesResult.error.details,
            });
          }

          // Подсчитываем количество комментариев и лайков для каждого места в батче
          (commentsResult.data || []).forEach((c) => {
            commentsCount.set(c.place_id, (commentsCount.get(c.place_id) || 0) + 1);
          });

          (likesResult.data || []).forEach((r) => {
            likesCount.set(r.place_id, (likesCount.get(r.place_id) || 0) + 1);
          });
        }

        // Добавляем счетчики к местам и сортируем
        placesWithCounts = filteredData.map((p) => ({
          ...p,
          commentsCount: commentsCount.get(p.id) || 0,
          likesCount: likesCount.get(p.id) || 0,
        }));

        if (activeFilters.sort === "most_commented") {
          placesWithCounts.sort((a, b) => (b.commentsCount ?? 0) - (a.commentsCount ?? 0));
        } else if (activeFilters.sort === "most_liked") {
          placesWithCounts.sort((a, b) => (b.likesCount ?? 0) - (a.likesCount ?? 0));
        }
      }

      return placesWithCounts.map((p) => ({
        ...p,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        // Убеждаемся, что поля для фильтрации присутствуют
        access_level: p.access_level ?? null,
        city_name_cached: p.city_name_cached ?? null,
      })) as Place[];
        })();
        if (!cancelled) setPlacesData(result);
      } catch (e) {
        if (!cancelled) {
          setPlacesError(e);
          setPlacesData([]);
          const msg = (e as Error)?.message ?? '';
          const isNetworkError = (e as Error)?.name === 'TypeError' && (msg.includes('fetch') || msg.includes('network'));
          if (isNetworkError && process.env.NODE_ENV === 'development') {
            console.warn('[MapPage] Не удалось загрузить места (сеть или Supabase недоступны). Проверьте интернет и .env.local (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).');
          }
        }
      } finally {
        if (!cancelled) setPlacesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // SUGGESTION (deps only, do not change code): Keep refetch tied to server-affecting params as now. Do not add filteredPlaces.length or placesData?.length — would cause refetch on client-only filter changes. Optional: single filterKey = JSON.stringify({ appliedCity, appliedCities, appliedQ, appliedCategories, selectedTag, sort: activeFilters.sort }) in deps instead of listing each. See docs/SUGGESTION-USER-ACCESS-PROVIDER.md §3.
  }, [appliedCity, appliedCities, appliedQ, appliedCategories, selectedTag, activeFilters.sort, hasExplicitCityInUrlState, userId, bootReady, refreshKey]);

  // No pagination - placesData contains all places directly

  // Optimize event handlers with useCallback
  const handlePlaceClick = useCallback((place: Place) => {
    setSelectedPlaceId(place.id);
    if (place.lat != null && place.lng != null) {
      setMapCenter({ lat: place.lat, lng: place.lng });
      setMapZoom(15);
    }
  }, []);

  const handlePlaceHover = useCallback((placeId: string | null) => {
    setHoveredPlaceId(placeId);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
    setSelectedTag(tag);
  }, []);

  // Pre-resolve city coordinates for radius-based filtering
  const [cityCoordsMap, setCityCoordsMap] = useState<Map<string, { lat: number | null; lng: number | null }>>(new Map());
  
  useEffect(() => {
    const cityNames = [...new Set([
      ...(appliedCities.filter(c => c !== DEFAULT_CITY)),
      ...(appliedCity && appliedCity !== DEFAULT_CITY ? [appliedCity] : []),
    ])];
    if (cityNames.length === 0) {
      setCityCoordsMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const map = new Map<string, { lat: number | null; lng: number | null }>();
      await Promise.all(
        cityNames.map(async (name) => {
          const coords = await getCityCoords(name);
          map.set(name.toLowerCase().trim(), coords);
        }),
      );
      if (!cancelled) setCityCoordsMap(map);
    })();
    return () => { cancelled = true; };
  }, [appliedCity, appliedCities]);

  // Создаем строковые ключи для отслеживания изменений массивов
  // Используем JSON.stringify с сортировкой для надежного отслеживания изменений
  // Важно: используем сам массив в зависимостях, но создаем строковое представление для сравнения
  const categoriesKey = useMemo(() => {
    const sorted = [...activeFilters.categories].sort();
    return JSON.stringify(sorted);
  }, [activeFilters.categories]);
  
  const citiesKey = useMemo(() => {
    const sorted = [...appliedCities].sort();
    return JSON.stringify(sorted);
  }, [appliedCities]);

  const tagsKey = useMemo(() => {
    const sorted = [...(activeFilters.tags ?? [])].sort();
    return JSON.stringify(sorted);
  }, [activeFilters.tags]);

      // Apply client-side filters (Premium/Hidden/Vibe/Categories/Cities/Search) to placesData
      // Все фильтры применяются на клиенте для мгновенной скорости
      // Используем useMemo для вычисления, но обновляем через useEffect для гарантии обновления
      const filteredPlacesMemo = useMemo(() => {
        if (!placesData || placesData.length === 0) return [];
        
        // Сначала применяем поиск (если есть)
        let result = [...placesData];
        if (appliedQ.trim()) {
          const searchLower = appliedQ.trim().toLowerCase();
          result = result.filter(place => 
            place.title?.toLowerCase().includes(searchLower) ||
            place.description?.toLowerCase().includes(searchLower) ||
            place.country?.toLowerCase().includes(searchLower) ||
            place.city?.toLowerCase().includes(searchLower)
          );
        }
        
        // Определяем города для фильтрации только если пользователь явно задал город (URL или фильтры)
        // При сбросе города (hasExplicitCityInUrlState === false) не фильтруем по appliedCities, чтобы показывать все места
        let citiesForFilter: string[] | undefined;
        if (hasExplicitCityInUrlState) {
          // Не исключаем DEFAULT_CITY — пользователь мог явно выбрать его
          const citiesToFilter = appliedCities.filter(Boolean);
          const allCitiesSelected = citiesToFilter.length > 0 && 
                                   citiesToFilter.length === CITIES.length &&
                                   CITIES.every(city => citiesToFilter.includes(city));
          if (citiesToFilter.length > 0 && !allCitiesSelected) {
            citiesForFilter = citiesToFilter;
          } else if (appliedCity && !allCitiesSelected) {
            citiesForFilter = [appliedCity];
          }
        }
        
        // Затем применяем остальные фильтры (с радиусом для городов)
        result = filterPlaces(result, {
          premium: activeFilters.premium,
          premiumOnly: activeFilters.premiumOnly,
          categories: activeFilters.categories.length > 0 ? activeFilters.categories : undefined,
          tags: (activeFilters.tags ?? []).length > 0 ? (activeFilters.tags ?? []) : undefined,
          cities: citiesForFilter,
          cityCoordsMap,
        });
        
        // Применяем сортировку (только для простых случаев, без счетчиков)
        // Сортировка по комментариям и лайкам применяется в useEffect при загрузке данных
        if (activeFilters.sort === "newest") {
          result = [...result].sort((a, b) => {
            if (!a.created_at || !b.created_at) return 0;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[MapPage] filteredPlacesMemo recalculated:', {
            inputCount: placesData.length,
            outputCount: result.length,
            appliedQ: appliedQ.trim(),
            appliedCities,
            citiesForFilter,
            categories: activeFilters.categories,
            sort: activeFilters.sort,
            categoriesKey,
            citiesKey,
          });
        }
        
        return result;
      }, [
        placesData, 
        appliedQ, // Добавляем поиск в зависимости
        activeFilters.premium, 
        activeFilters.premiumOnly, 
        activeFilters.sort, // Добавляем сортировку в зависимости
        // Используем строковые ключи для отслеживания изменений массивов
        categoriesKey,
        citiesKey,
        tagsKey,
        appliedCities,
        appliedCity, 
        hasExplicitCityInUrlState,
        cityCoordsMap,
      ]);
      
      // Обновляем состояние filteredPlaces при изменении вычисленного значения
      // Это гарантирует обновление компонентов даже если useMemo не сработал правильно
      useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[MapPage] filteredPlaces updating:', {
            inputCount: placesData?.length || 0,
            outputCount: filteredPlacesMemo.length,
            filters: {
              premium: activeFilters.premium,
              categories: activeFilters.categories,
            },
            appliedCities,
            categoriesKey,
            citiesKey,
            prevLength: filteredPlacesState.length,
            prevState: filteredPlacesState.slice(0, 3).map(p => p.id),
            newState: filteredPlacesMemo.slice(0, 3).map(p => p.id),
          });
        }
        // Всегда обновляем состояние, даже если длина не изменилась
        // Это гарантирует перерендер компонентов
        setFilteredPlacesState(filteredPlacesMemo);
      }, [filteredPlacesMemo, categoriesKey, citiesKey, appliedCities, activeFilters.premium, activeFilters.premiumOnly]);
      
      // Используем состояние для отображения
      const filteredPlaces = filteredPlacesState;

  // Update places state for backward compatibility (used by map view)
  // Use filteredPlaces instead of allPlaces
  useEffect(() => {
    setPlaces(filteredPlaces);
  }, [filteredPlaces]);

  // Update loading state
  useEffect(() => {
    setLoading(placesLoading);
  }, [placesLoading]);
  
  // Debug: Log filteredPlaces changes (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[MapPage] filteredPlaces updated:', {
        length: filteredPlaces.length,
        placesDataLength: placesData?.length || 0,
        activeFilters: {
          premium: activeFilters.premium || activeFilters.premiumOnly,
        },
      });
    }
  }, [filteredPlaces.length, placesData?.length || 0, activeFilters.premium, activeFilters.premiumOnly]);

  // Handle errors
  useEffect(() => {
    if (placesError) {
      const msg = placesError?.message ?? (placesError as any)?.code ?? '';
      const isTransient = !msg || placesError?.name === 'AbortError' || (msg && (String(msg).includes('fetch') || String(msg).includes('network') || String(msg).includes('abort')));
      if (!isTransient) {
        const logMsg = msg || (placesError as any)?.details || (placesError as any)?.hint || 'Unknown error';
        console.error("Error loading places:", logMsg);
      }
      setPlaces([]);
    }
  }, [placesError]);

  // Debug: Log data loading state
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[MapPage] Data state:', {
        bootReady,
        placesLoading,
        placesDataLength: placesData?.length ?? 0,
        filteredPlacesLength: filteredPlaces.length,
      });
    }
  }, [bootReady, placesLoading, placesData?.length ?? 0, filteredPlaces.length]);


  // User data now comes from useUserAccessContext — no separate loadUser needed

  // Reload places when page becomes visible (user returns from another tab)
  useEffect(() => {
    if (!bootReady) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [bootReady]);

  // Fetch favorites when userId changes
  useEffect(() => {
    if (!userId) {
      setFavorites(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await supabase
          .from("reactions")
          .select("place_id")
          .eq("user_id", userId)
          .eq("reaction", "like");
        const { data, error } = res as ReactionsPlaceIdResult;
        if (cancelled) return;
        if (error) return;
        setFavorites(new Set((data || []).map((r) => r.place_id)));
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err as { name?: string; message?: string };
        if (e?.name === 'AbortError' || e?.message?.includes('abort')) return;
        if (e?.name === 'TypeError' && e?.message?.includes('fetch')) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[MapPage] Не удалось загрузить избранное (сеть недоступна).');
          }
          return;
        }
        console.error('[MapPage] Error loading favorites:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Live search: автоматически применяем поиск при вводе (с небольшой задержкой)
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedQ(searchDraft);
    }, 300); // Debounce 300ms

    return () => clearTimeout(timer);
  }, [searchDraft]);

  function applySearch() {
    setAppliedQ(searchDraft);
  }

  const handleCityChange = (city: string | null) => {
    // Сбрасываем viewport карты — fitBounds сам определит новые границы
    setMapCenter(null);
    setMapZoom(null);
    // Для обратной совместимости
    setAppliedCity(city || DEFAULT_CITY);
    setAppliedCities(city ? [city] : []);
    setSelectedCity(city);
    // Если город явно выбран (не null), устанавливаем его и флаг
    if (city) {
      setAppliedCity(city);
      setHasExplicitCityInUrlState(true); // Город явно выбран пользователем
      
      // Обновляем URL с выбранным городом
      const params = new URLSearchParams(window.location.search);
      params.set('city', city);
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    } else {
      // Если выбран "Anywhere" (null), сбрасываем на DEFAULT_CITY и флаг
      setAppliedCity(DEFAULT_CITY);
      setHasExplicitCityInUrlState(false);
      
      // Удаляем city из URL
      const params = new URLSearchParams(window.location.search);
      params.delete('city');
      const newUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  };

  // Handle filters apply from modal
  const handleFiltersApply = (filters: ActiveFilters) => {
    // Сбрасываем viewport карты — fitBounds сам определит новые границы
    setMapCenter(null);
    setMapZoom(null);
    // Применяем фильтры - это автоматически обновит filteredPlaces через useMemo
    // Модальное окно закрывается автоматически в FiltersModal.handleApply
    // Создаем новый объект с новым массивом категорий для гарантии обновления React
    const newFilters = {
      ...filters,
      categories: [...filters.categories], // Создаем новый массив
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[MapPage] handleFiltersApply called:', {
        prevFilters: activeFilters,
        newFilters: newFilters,
        prevCategories: activeFilters.categories,
        newCategories: newFilters.categories,
      });
    }
    
    // Обновляем фильтры - это вызовет пересчет filteredPlaces
    setActiveFilters(newFilters);
    
    // Увеличиваем версию фильтров для принудительного обновления списка
    // Вызываем отдельно, чтобы избежать батчинга React
    setFiltersVersion(prev => prev + 1);
  };
  
  // Отслеживаем изменения фильтров для отладки и принудительного обновления
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[MapPage] activeFilters or cities changed:', {
        activeFilters,
        appliedCities,
        categoriesKey,
        citiesKey,
        filteredPlacesLength: filteredPlaces.length,
        categories: activeFilters.categories,
      });
    }
  }, [activeFilters, appliedCities, categoriesKey, citiesKey, filteredPlaces.length]);
  
  // Принудительно обновляем filteredPlaces при изменении appliedCities
  // Это гарантирует, что компоненты перерендерятся при изменении городов
  const prevCitiesKeyRef = useRef(citiesKey);
  useEffect(() => {
    if (prevCitiesKeyRef.current !== citiesKey) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[MapPage] appliedCities changed, forcing update:', {
          appliedCities,
          citiesKey,
          prevCitiesKey: prevCitiesKeyRef.current,
        });
      }
      prevCitiesKeyRef.current = citiesKey;
      // Увеличиваем версию фильтров для принудительного обновления списка
      setFiltersVersion(prev => prev + 1);
    }
  }, [citiesKey, appliedCities]);

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
          // @ts-expect-error — Insert inferred as never when client not typed with Database; payload is valid
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

  // Count active filters for badge (only applied filters)
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (appliedCategories.length > 0) count += appliedCategories.length;
    // Учитываем город как активный фильтр, если он явно выбран (даже если это DEFAULT_CITY)
    if (appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) count += 1;
    if (appliedQ.trim()) count += 1;
    // Note: selectedTag is not shown in badge as it's a separate filter
    return count;
  }, [appliedCategories, appliedCity, appliedQ, hasExplicitCityInUrlState]);

  // Quick search chips
  const quickSearchChips = ["Romantic", "Quiet", "Sunset", "Coffee", "Nature"];

  // Проверяем, есть ли активные фильтры (для показа кнопки "назад")
  const hasActiveFilters = useMemo(() => {
    return (
      (appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) ||
      appliedCategories.length > 0 ||
      (activeFilters.tags ?? []).length > 0 ||
      appliedQ.trim().length > 0 ||
      selectedTag.length > 0
    );
  }, [appliedCity, hasExplicitCityInUrlState, appliedCategories, activeFilters.tags, appliedQ, selectedTag]);

  // Функция для очистки всех фильтров (Reset all)
  const handleClearAllFilters = () => {
    // Reset cities
    setAppliedCity(DEFAULT_CITY);
    setHasExplicitCityInUrlState(false);
    setSelectedCity(null);
    setAppliedCities([]);
    
    // Reset search query
    setAppliedQ("");
    setSearchDraft("");
    
    // Reset tags
    setSelectedTag("");
    setSelectedTags([]);
    
    // Reset categories, tags and premium/hidden/vibe toggles
    setActiveFilters({
      categories: [],
      sort: null,
      tags: [],
      premium: false,
      hidden: false,
      vibe: false,
      premiumOnly: false,
    });
    
    // Очищаем URL параметры и перезапускаем query без параметров
    router.push('/map');
  };

  // Calculate locked premium places for Haunted Gem indexing
  const defaultUserAccess: UserAccess = access ?? { 
    role: "guest", 
    hasPremium: false, 
    isAdmin: false 
  };
  
  const lockedPlacesMap = useMemo(() => {
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
    
    // Create a map of place id -> index (1-based)
    const map = new Map<string, number>();
    lockedPlaces.forEach((p, idx) => {
      map.set(p.id, idx + 1);
    });
    return map;
  }, [places, defaultUserAccess, userId]);

  // Формируем title для header списка с учетом количества результатов
  // Показываем реальное количество отфильтрованных мест (с учетом всех клиентских фильтров)
  const listTitle = useMemo(() => {
    // Используем реальное количество отфильтрованных мест
    // Это учитывает все фильтры: Premium/Hidden/Vibe/Categories/Cities
    const displayCount = filteredPlaces.length;
    const countText = `${displayCount} ${displayCount === 1 ? "place" : "places"}`;
    
    // Если выбран город
    if (appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) {
      return `${countText} in ${appliedCity}`;
    }
    
    // Если есть другие фильтры (категории, поиск, тег), но нет города
    if (activeFilters.categories.length > 0 || (activeFilters.tags ?? []).length > 0 || appliedQ.trim() || selectedTag) {
      return countText;
    }
    
    // Нет фильтров - показываем "All places"
    return "All places";
  }, [filteredPlaces.length, appliedCity, hasExplicitCityInUrlState, activeFilters.categories, activeFilters.tags, appliedQ, selectedTag]);

  // Subtitle для заголовка (показываем только когда нет фильтров)
  const listSubtitle = useMemo(() => {
    if (hasActiveFilters) {
      return null; // Не показываем subtitle когда есть фильтры
    }
    const count = filteredPlaces.length;
    return `${count} ${count === 1 ? "place" : "places"}`;
  }, [filteredPlaces.length, hasActiveFilters]);


  return (
    <main className="h-screen bg-[#FAFAF7] flex flex-col overflow-hidden">
      <TopBar
        showSearchBar={true}
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        selectedCity={selectedCity}
        onCityChange={handleCityChange}
        onFiltersClick={() => setFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
        view={view}
        onViewChange={setView}
        onSearchBarClick={() => setSearchModalOpen(true)}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onCitySelect={handleCityChange}
        onSearchSubmit={(city, query, tags) => {
          // Сбрасываем viewport карты — fitBounds сам определит новые границы
          setMapCenter(null);
          setMapZoom(null);
          // Update state
          setSelectedCity(city);
          if (city) {
            setAppliedCity(city);
            setAppliedCities([city]);
            setHasExplicitCityInUrlState(true);
          } else {
            setAppliedCity(DEFAULT_CITY);
            setAppliedCities([]);
            setHasExplicitCityInUrlState(false);
          }
          setAppliedQ(query);
          setSearchDraft(query);
          if (tags) {
            setSelectedTags(tags);
            // Update activeFilters with tags as categories
            setActiveFilters(prev => ({
              ...prev,
              categories: tags,
            }));
          }
          
          // Update URL
          const params = new URLSearchParams();
          if (city && city.trim()) {
            params.set("city", city.trim());
          }
          if (query.trim()) {
            params.set("q", query.trim());
          }
          // Use tags if provided, otherwise use activeFilters.categories
          const categoriesToUse = tags || activeFilters.categories;
          if (categoriesToUse.length > 0) {
            params.set("categories", categoriesToUse.join(','));
          }
          if (activeFilters.sort) {
            params.set("sort", activeFilters.sort);
          }
          
          const newUrl = params.toString() 
            ? `/map?${params.toString()}`
            : '/map';
          router.push(newUrl);
          setSearchModalOpen(false);
        }}
        selectedCity={selectedCity}
        searchQuery={searchDraft}
        selectedTags={selectedTags}
      />

      {/* Filters Modal */}
      <FiltersModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={handleFiltersApply}
        onResetAll={handleClearAllFilters}
        appliedFilters={activeFilters}
        appliedCity={appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) ? appliedCity : null}
        appliedCities={appliedCities.filter(city => city !== DEFAULT_CITY)}
        userAccess={access}
        getAvailableTags={async (categories: string[]) => {
          if (!categories || categories.length === 0) return [];
          const result = await supabase
            .from("tags")
            .select("name")
            .overlaps("category_ids", categories)
            .order("name");
          const rows = (result.data ?? []) as { name: string | null }[];
          return rows.map((t) => t.name).filter((n): n is string => Boolean(n));
        }}
        getTagCounts={(tags: string[], categories?: string[], premiumOnly?: boolean) => {
          const counts: Record<string, number> = {};
          tags.forEach((t) => (counts[t] = 0));
          let source = categories && categories.length > 0
            ? (placesData ?? []).filter((p: Place) =>
                categories.some((cat) => (p.categories ?? []).includes(cat))
              )
            : (placesData ?? []);
          if (premiumOnly) {
            source = source.filter((p: Place) => isPlacePremium(p));
          }
          source.forEach((p: Place) => {
            (p.tags ?? []).forEach((t: string) => {
              if (t in counts) counts[t]++;
            });
          });
          return counts;
        }}
        onCityChange={handleCityChange}
        onCitiesChange={(cities) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[MapPage] onCitiesChange called:', {
              prevCities: appliedCities,
              newCities: cities,
            });
          }
          setAppliedCities(cities);
          // Для обратной совместимости обновляем appliedCity
          if (cities.length > 0) {
            setAppliedCity(cities[0]);
          } else {
            setAppliedCity(DEFAULT_CITY);
          }
          // Увеличиваем версию фильтров для принудительного обновления списка
          setFiltersVersion(prev => prev + 1);
        }}
        getFilteredCount={async (draftFilters: ActiveFilters, draftCities: string[]) => {
          // Используем централизованную функцию filterPlaces для подсчета
          try {
            // Используем только draftCities из модального окна
            // НЕ применяем fallback на appliedCity/appliedCities, чтобы показывать правильное количество
            // при открытии модального окна без выбранных фильтров
            let selectedCities: string[] = [];
            if (draftCities.length > 0) {
              // Если в draftCities есть города, используем их (включая DEFAULT_CITY, если он там есть)
              selectedCities = draftCities;
            }
            // Если draftCities пустой, не применяем фильтр по городам вообще
            // Это позволяет показывать общее количество мест (37) при открытии модального окна

            // Проверяем, выбраны ли все города или все категории
            const allCitiesSelected = selectedCities.length > 0 && 
                                     selectedCities.length === CITIES.length &&
                                     CITIES.every(city => selectedCities.includes(city));
            
            const allCategoriesSelected = draftFilters.categories.length > 0 && 
                                         draftFilters.categories.length === CATEGORIES.length &&
                                         CATEGORIES.every(cat => draftFilters.categories.includes(cat));

            let dataToFilter: Place[] = [];
            
            // Оптимизация: загружаем только необходимые поля для подсчета
            // Используем только существующие поля: access_level для premium, категории для hidden/vibe
            const placesCountResult = (await supabase
              .from("places")
              .select("id,title,description,city,city_name_cached,categories,tags,access_level,country")) as { data: PlacesSelectRow[] | null; error: PostgrestError | null };
            const { data: allData, error: dataError } = placesCountResult;

            if (dataError) {
              // Silently ignore AbortError
              if (dataError.message?.includes('abort') || dataError.name === 'AbortError' || (dataError as any).code === 'ECONNABORTED') {
                if (places.length > 0) {
                  dataToFilter = places;
                } else {
                  return 0;
                }
              } else {
                // Enhanced logging for production
                if (process.env.NODE_ENV === 'production') {
                  console.error("Error fetching places for count:", {
                    message: dataError.message,
                    code: dataError.code,
                    details: dataError.details,
                    hint: dataError.hint,
                  });
                } else {
                  console.error("Error fetching places for count:", dataError);
                }
                if (places.length > 0) {
                  dataToFilter = places;
                } else {
                  return 0;
                }
              }
            } else {
              dataToFilter = (allData || []) as Place[];
            }

            if (dataToFilter.length === 0) {
              return 0;
            }

            // Не применяем поисковый запрос в модальном окне фильтров
            // Поиск применяется отдельно через SearchModal
            // Фильтруем только по фильтрам из модального окна
            const draftTags = draftFilters.tags ?? [];
            const availableTagsFromData = Array.from(new Set(dataToFilter.flatMap((p: Place) => p.tags ?? [])));
            const allTagsSelected = draftTags.length > 0 && availableTagsFromData.length > 0 && draftTags.length >= availableTagsFromData.length;
            // Pre-resolve city coords for radius filtering
            const citiesToResolve = selectedCities.length > 0 && !allCitiesSelected ? selectedCities : [];
            const resolvedCoordsMap = new Map<string, { lat: number | null; lng: number | null }>();
            await Promise.all(
              citiesToResolve.map(async (name) => {
                const coords = await getCityCoords(name);
                resolvedCoordsMap.set(name.toLowerCase().trim(), coords);
              }),
            );

            const filtered = filterPlaces(dataToFilter, {
              premium: draftFilters.premium || draftFilters.premiumOnly || false,
              cities: selectedCities.length > 0 && !allCitiesSelected ? selectedCities : undefined,
              categories: draftFilters.categories.length > 0 && !allCategoriesSelected ? draftFilters.categories : undefined,
              tags: draftTags.length > 0 && !allTagsSelected ? draftTags : undefined,
              cityCoordsMap: resolvedCoordsMap,
            });

            return filtered.length;
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
        getCityCount={async (city: string) => {
          try {
            let query = supabase.from("places").select("*", { count: 'exact', head: true });
            const coords = await getCityCoords(city);
            query = query.or(buildCityRadiusFilter(city, coords.lat, coords.lng));
            const { count, error } = await query;
            if (error) {
              // Silently ignore AbortError
              if (error.message?.includes('abort') || error.name === 'AbortError' || (error as any).code === 'ECONNABORTED') {
                return 0;
              }
              // Enhanced logging for production
              if (process.env.NODE_ENV === 'production') {
                console.error("Error counting places for city:", {
                  city,
                  message: error.message,
                  code: error.code,
                });
              }
            }
            return count || 0;
          } catch (err: any) {
            // Silently ignore AbortError
            if (err?.name === 'AbortError' || err?.message?.includes('abort') || err?.code === 'ECONNABORTED') {
              return 0;
            }
            return 0;
          }
        }}
        getCategoryCount={async (category: string, premiumOnly?: boolean) => {
          try {
            let query = supabase
              .from("places")
              .select("*", { count: 'exact', head: true })
              .overlaps("categories", [category]);
            if (premiumOnly) {
              query = query.eq("access_level", "premium");
            }
            const { count } = await query;
            return count || 0;
          } catch {
            return 0;
          }
        }}
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
      {/* Контент: Responsive layout согласно правилам */}
      {/* Mobile (≤768px): только список, карта по кнопке */}
      {/* Tablet (769-1024px): 2 колонки список/карта (55-60% / 40-45%) */}
      {/* Desktop (≥1024px): список/карта (60/40 до 1280px, 65/35 после 1440px) */}
      <div className="flex-1 min-h-0 overflow-hidden md:pt-[80px]">
        {/* Desktop & Tablet: Split view - список слева, карта справа (≥769px) */}
        {/* Максимальная ширина: от края до края с центровкой через padding */}
        <div className="hidden md:flex h-full w-full px-4 md:px-6 lg:px-8">
          {/* Left: Scrollable list - фиксированная max-width, grid центрирован */}
          {/* Колонка списка имеет фиксированную max-width (960-1100px) */}
          {/* Grid внутри центрирован, промежутки постоянные (16-24px) */}
          <div className="flex-shrink-0 overflow-y-auto scrollbar-hide pr-4 md:pr-6" style={{ maxWidth: '1100px', width: '60%' }}>
            {/* Header in List Column */}
            <div className="sticky top-0 z-30 bg-[#FAFAF7] pb-3 border-b border-[#ECEEE4] mb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg lg:text-xl font-semibold font-fraunces text-[#1F2A1F] truncate">{listTitle}</h2>
                  {listSubtitle && (
                    <div className="text-sm text-[#6F7A5A] mt-0.5">
                      {listSubtitle}
                    </div>
                  )}
                </div>
              </div>
              {/* Active filter chips */}
              {((appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) || appliedCategories.length > 0 || (activeFilters.tags ?? []).length > 0) && (
                <div className="mt-2 flex gap-2 flex-wrap items-center">
                  <button
                    onClick={handleClearAllFilters}
                    className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#6F7A5A] bg-[#ECEEE4] border border-[#ECEEE4] hover:bg-[#E2E5DA] transition whitespace-nowrap"
                  >
                    Clear all
                  </button>
                  {appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) && (
                    <button
                      onClick={() => handleCityChange(null)}
                      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition whitespace-nowrap"
                    >
                      {appliedCity}
                      <svg
                        className="w-3.5 h-3.5 text-[#8F9E4F] flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                  {appliedCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setActiveFilters(prev => ({
                          ...prev,
                          categories: prev.categories.filter(c => c !== cat)
                        }));
                        setFiltersVersion(prev => prev + 1);
                      }}
                      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition whitespace-nowrap"
                    >
                      {cat.replace(/^[^\s]+\s/, "")}
                      <svg
                        className="w-3.5 h-3.5 text-[#8F9E4F] flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  ))}
                  {(activeFilters.tags ?? []).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        setActiveFilters(prev => ({
                          ...prev,
                          tags: (prev.tags ?? []).filter(t => t !== tag)
                        }));
                        setFiltersVersion(prev => prev + 1);
                      }}
                      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-sm sm:text-base font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition whitespace-nowrap"
                    >
                      <span className="leading-none">{getTagEmoji(tag)}</span>
                      {stripTagEmoji(tag)}
                      <svg
                        className="w-3.5 h-3.5 text-[#8F9E4F] flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {loading ? (
              <PlaceCardGridSkeleton count={6} columns={2} />
            ) : filteredPlaces.length === 0 ? (
              <Empty text="No places match your filters." />
            ) : (
              <>
                {/* Desktop: 3 колонки при достаточной ширине, 2 колонки при меньшей */}
                {/* Tablet: 2 колонки, Desktop: 2-3 колонки в зависимости от ширины */}
                {/* Grid центрирован внутри колонки списка */}
                {/* Промежутки постоянные (16-24px), не увеличиваются с viewport */}
                {/* Карточки: min 260px, max 320px (жесткий предел), никогда не растягиваются */}
                <div key={`places-grid-${filtersVersion}-${categoriesKey}-${citiesKey}`} className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 place-card-grid min-w-0">
                  {/* Жесткие ограничения на размер карточек для Desktop */}
                  {/* Максимальная ширина: 320px (жесткий предел), минимум: 260px */}
                  {/* Оптимум: 280-300px для идеального баланса */}
                  {/* Фото: aspect ratio 1:1 (при 320px → фото 320×320) */}
                  {/* Высота карточки: ~420-450px (фото ~320px + текст 90-120px) */}
                  {/* Карточки НИКОГДА не растягиваются выше max-width */}
                  {/* Промежутки остаются постоянными, дополнительное пространство отдается карте */}
                  <style jsx>{`
                    /* Общие стили для всех разрешений - предотвращаем перекрытие */
                    .place-card-grid {
                      width: 100%;
                      box-sizing: border-box;
                    }
                    .place-card-grid > .place-card-wrapper {
                      width: 100%;
                      max-width: 100%;
                      box-sizing: border-box;
                      overflow: hidden;
                    }
                    @media (min-width: 768px) {
                      /* Tablet: 2 колонки - убеждаемся что карточки не перекрываются */
                      .place-card-grid > .place-card-wrapper {
                        min-width: 0;
                        max-width: 100%;
                      }
                    }
                    @media (min-width: 1024px) {
                      /* Grid центрирован, промежутки постоянные (не увеличиваются) */
                      .place-card-grid {
                        justify-content: center;
                        justify-items: start;
                      }
                      /* Карточки: жесткие ограничения размера */
                      /* min-width: 260px, max-width: 320px (жесткий предел) */
                      /* Карточки НИКОГДА не растягиваются выше max-width */
                      .place-card-grid > .place-card-wrapper {
                        min-width: 260px;
                        max-width: 320px !important;
                        width: 100%;
                      }
                      /* Фото: aspect ratio 1:1 для Desktop (при 320px → фото 320×320) */
                      /* Не растягивать выше, даже на 4K */
                      .place-card-grid .place-card-image {
                        padding-bottom: 100% !important;
                        max-width: 320px;
                      }
                    }
                  `}</style>
                  {filteredPlaces.map((p) => {
                    const isFavorite = favorites.has(p.id);
                    const isHovered = hoveredPlaceId === p.id || selectedPlaceId === p.id;
                    const hauntedGemIndex = lockedPlacesMap.get(p.id);
                    return (
                    <div
                      key={p.id}
                      onMouseEnter={() => handlePlaceHover(p.id)}
                      onMouseLeave={() => handlePlaceHover(null)}
                      onClick={() => handlePlaceClick(p)}
                      className="transition-all relative z-0 place-card-wrapper min-w-0"
                    >
                      <PlaceCard
                        place={p}
                        userAccess={access}
                        userId={userId}
                        isFavorite={isFavorite}
                        hauntedGemIndex={hauntedGemIndex}
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F] flex items-center justify-center transition-colors ${
                                isFavorite ? "bg-[#FAFAF7] border-[#8F9E4F]" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <FavoriteIcon 
                                isActive={isFavorite} 
                                size={16}
                                className={isFavorite ? "scale-110" : ""}
                              />
                            </button>
                          ) : undefined
                        }
                        onTagClick={handleTagClick}
                        onPhotoClick={() => {
                          if (isDesktop) {
                            window.open(`/id/${p.id}`, "_blank", "noopener,noreferrer");
                          } else {
                            router.push(`/id/${p.id}`);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>

          {/* Right: Sticky map - flex: 1, поглощает все дополнительное пространство */}
          {/* Карта растет динамически с размером viewport */}
          {/* Все дополнительное горизонтальное пространство отдается карте */}
          <div className="flex-1 h-full flex-shrink-0 pb-8 min-w-0">
            <div className="sticky top-20 h-[calc(100vh-96px-32px)] rounded-2xl overflow-hidden w-full max-w-full">
              <MapView
                places={filteredPlaces}
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
                userAccess={access}
                isMapView={true} // On desktop, map is always visible
              />
            </div>
          </div>
        </div>

        {/* Mobile: только список, карта по кнопке (≤768px) */}
        {/* Карта НЕ грузится по умолчанию на mobile - только после нажатия кнопки */}
        <div className="md:hidden h-full">
          {view === "list" ? (
            <div className="h-full overflow-y-auto">
              <div 
                className="w-full mx-auto px-4" 
                style={{ 
                  paddingTop: '88px',
                  paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' // Bottom Bar height (~64px) + safe-area + extra spacing
                }}
              >
                {/* Header */}
                <div className="mb-4">
                  <h2 className="text-lg lg:text-xl font-semibold font-fraunces text-[#1F2A1F] mb-2">{listTitle}</h2>
                  {listSubtitle && (
                    <div className="text-sm text-[#6F7A5A]">{listSubtitle}</div>
                  )}
                  {/* Active filter chips */}
                  {((appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) || appliedCategories.length > 0 || (activeFilters.tags ?? []).length > 0) && (
                    <div className="mt-2 flex gap-2 flex-wrap items-center">
                      <button
                        onClick={handleClearAllFilters}
                        className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#6F7A5A] bg-[#ECEEE4] border border-[#ECEEE4] hover:bg-[#E2E5DA] transition whitespace-nowrap"
                      >
                        Clear all
                      </button>
                      {appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) && (
                        <button
                          onClick={() => handleCityChange(null)}
                          className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition whitespace-nowrap"
                        >
                          {appliedCity}
                          <svg
                            className="w-3.5 h-3.5 text-[#8F9E4F] flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                      {appliedCategories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => {
                            setActiveFilters(prev => ({
                              ...prev,
                              categories: prev.categories.filter(c => c !== cat)
                            }));
                            setFiltersVersion(prev => prev + 1);
                          }}
                          className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition whitespace-nowrap"
                        >
                          {cat.replace(/^[^\s]+\s/, "")}
                          <svg
                            className="w-3.5 h-3.5 text-[#8F9E4F] flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      ))}
                      {(activeFilters.tags ?? []).map((tag) => (
                        <button
                          key={tag}
                          onClick={() => {
                            setActiveFilters(prev => ({
                              ...prev,
                              tags: (prev.tags ?? []).filter(t => t !== tag)
                            }));
                            setFiltersVersion(prev => prev + 1);
                          }}
                          className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-sm sm:text-base font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition whitespace-nowrap"
                        >
                          <span className="leading-none">{getTagEmoji(tag)}</span>
                          {stripTagEmoji(tag)}
                          <svg
                            className="w-3.5 h-3.5 text-[#8F9E4F] flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Places grid - Mobile: 1 колонка, 100% ширина */}
                {loading ? (
                  <PlaceCardGridSkeleton count={3} columns={1} />
                ) : filteredPlaces.length === 0 ? (
                  <Empty text="No places match your filters." />
                ) : (
                  <>
                    <div key={`places-grid-mobile-${filtersVersion}-${categoriesKey}-${citiesKey}`} className="grid grid-cols-1 gap-4">
                      {filteredPlaces.map((p) => {
                        const isFavorite = favorites.has(p.id);
                        const hauntedGemIndex = lockedPlacesMap.get(p.id);
                        return (
                          <div key={p.id} className="w-full">
                            <PlaceCard
                              place={p}
                              userAccess={access}
                              userId={userId}
                              isFavorite={isFavorite}
                              hauntedGemIndex={hauntedGemIndex}
                              favoriteButton={
                                userId ? (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleFavorite(p.id, e);
                                    }}
                                    className={`h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F] flex items-center justify-center transition-colors ${
                                      isFavorite ? "bg-[#FAFAF7] border-[#8F9E4F]" : ""
                                    }`}
                                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                                  >
                                    <FavoriteIcon 
                                      isActive={isFavorite} 
                                      size={16}
                                      className={isFavorite ? "scale-110" : ""}
                                    />
                                  </button>
                                ) : undefined
                              }
                              onTagClick={handleTagClick}
                              onPhotoClick={() => {
                                if (isDesktop) {
                                  window.open(`/id/${p.id}`, "_blank", "noopener,noreferrer");
                                } else {
                                  router.push(`/id/${p.id}`);
                                }
                              }}
                          />
                        </div>
                      );
                    })}
              </div>
              </>
                )}
              </div>
            </div>
          ) : (
            /* Mobile: карта открывается в fullscreen overlay под TopBar и модалками */
            <div 
              className="fixed left-0 right-0 bottom-0 z-30 bg-white" 
              style={{ 
                top: '80px', // начинается под TopBar
              }}
            >
              <div className="h-full w-full">
                <MapView
                  places={filteredPlaces}
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
                  userAccess={access}
                  isMapView={view === "map"} // Pass current view state - карта загружается только когда view === "map"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating View Toggle Button (mobile only, ≤768px) */}
      {view === "list" && (
        <button
          onClick={() => setView("map")}
          style={{ 
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          }}
          className="fixed left-1/2 transform -translate-x-1/2 z-[60] md:hidden flex items-center gap-2 bg-[#8F9E4F] text-white px-6 py-3 rounded-full shadow-lg hover:bg-[#7A8A3F] transition-all"
        >
          <Icon name="map" size={20} className="text-white" />
          <span className="text-sm font-medium">Show map</span>
        </button>
      )}
      
      {/* Back to List Button (mobile only, когда карта открыта) */}
      {view === "map" && (
        <button
          onClick={() => setView("list")}
          style={{ 
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          }}
          className="fixed left-1/2 transform -translate-x-1/2 z-[60] md:hidden flex items-center gap-2 bg-[#8F9E4F] text-white px-6 py-3 rounded-full shadow-lg hover:bg-[#7A8A3F] transition-all"
        >
          <Icon name="list" size={20} className="text-white" />
          <span className="text-sm font-medium">List</span>
        </button>
      )}
    </main>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#faf9f7] flex items-center justify-center">
        <div className="w-full max-w-md px-6">
          <div className="space-y-4">
            <div className="h-8 w-3/4 bg-[#ECEEE4] rounded mx-auto animate-pulse" />
            <div className="h-4 w-1/2 bg-[#ECEEE4] rounded mx-auto animate-pulse" />
          </div>
        </div>
      </main>
    }>
      <MapPageContent />
    </Suspense>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-[#6b7d47]/10 shadow-sm p-4 hover:shadow-md transition cursor-pointer">
      {children}
    </div>
  );
}


// getCategoryEmoji and createMarkerIcon are imported from ../lib/mapMarkers

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
  userAccess,
  isMapView = true, // Default to true for desktop (always visible)
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
  userAccess?: UserAccess;
  isMapView?: boolean; // Whether map view is currently active
}) {
  const isDesktop = useIsDesktop();
  const { openPremiumLocation, closeAuthModal, closePremiumModal, modalOpen, modalPlaceTitle, authModalOpen, authRedirectPath, authModalVariant } = usePremiumGate();
  const defaultAccess: UserAccess = userAccess ?? { role: "guest", hasPremium: false, isAdmin: false };
  const [internalSelectedPlaceId, setInternalSelectedPlaceId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [placePhotos, setPlacePhotos] = useState<Map<string, string[]>>(new Map());
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<Map<string, number>>(new Map());
  const isUpdatingFromPropsRef = useRef(false);
  const lastReportedStateRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null);
  const onMapStateChangeRef = useRef(onMapStateChange);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Ref for tracking places set changes (fitBounds)
  const prevPlacesIdsRef = useRef<string>("");

  // Refs for imperative markers and MarkerClusterer
  const markersRef = useRef<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);

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

  // Load map when map view is active (no defer)
  const shouldLoadMap = isMapView;

  // SDK loaded once at app shell level (GoogleMapsProvider in RootLayout).
  // Reading from context means navigation to /map doesn't re-trigger the
  // SDK download — it's already on the wire (or done) by the time the user
  // arrives here.
  const { isLoaded, loadError } = useGoogleMaps();

  useEffect(() => {
    if (loadError) {
      console.error("Google Maps load error:", loadError);
    }
  }, [loadError]);

  // Prevent page scroll when interacting with map on mobile
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
      }
    };

    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  const selectedPlaceId = externalSelectedPlaceId ?? internalSelectedPlaceId;

  // Filter premium places for non-premium users on map (but keep them in list)
  const defaultUserAccess: UserAccess = userAccess ?? { 
    role: "guest", 
    hasPremium: false, 
    isAdmin: false 
  };

  const placesWithCoords = useMemo(
    () => {
      const withCoords = places.filter((p) => p.lat != null && p.lng != null);
      
      // Filter out premium places for non-premium users on the map
      // They will still appear in the list view with locked content
      return withCoords.filter((p) => {
        const pIsPremium = isPlacePremium(p);
        const pCanView = canUserViewPlace(defaultUserAccess, p);
        const pIsOwner = userId && p.created_by === userId;
        
        // Show on map if:
        // 1. Not premium, OR
        // 2. Premium but user can view it, OR
        // 3. Premium but user is the owner
        return !pIsPremium || pCanView || pIsOwner;
      });
    },
    [places, defaultUserAccess, userId]
  );

  // Загружаем фото для всех мест одним запросом (batch)
  useEffect(() => {
    if (!isLoaded) return;

    const placeIds = placesWithCoords.map((p) => p.id);
    if (placeIds.length === 0) {
      setPlacePhotos(new Map());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const photosResult = (await supabase
          .from("place_photos")
          .select("place_id, url")
          .in("place_id", placeIds)
          .order("sort", { ascending: true })) as PlacePhotosBatchResult;
        const { data: photosData, error } = photosResult;
        if (cancelled) return;

        const grouped = new Map<string, string[]>();
        if (!error && photosData && photosData.length > 0) {
          for (const row of photosData) {
            if (!row.place_id || !isValidPhotoUrl(row.url)) continue;
            if (!grouped.has(row.place_id)) grouped.set(row.place_id, []);
            grouped.get(row.place_id)!.push(row.url!);
          }
        }
        for (const place of placesWithCoords) {
          if (!grouped.has(place.id) && isValidPhotoUrl(place.cover_url)) {
            grouped.set(place.id, [place.cover_url!]);
          }
        }
        if (!cancelled) setPlacePhotos(grouped);
      } catch {
        if (cancelled) return;
        const fallback = new Map<string, string[]>();
        for (const place of placesWithCoords) {
          if (isValidPhotoUrl(place.cover_url)) fallback.set(place.id, [place.cover_url!]);
        }
        setPlacePhotos(fallback);
      }
    })();
    return () => { cancelled = true; };
  }, [placesWithCoords.map((p) => p.id).join(","), isLoaded]);

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
     
  }, [externalMapCenter, externalMapZoom, mapInstance]);

  // Auto-fit карты при изменении набора мест (после фильтрации)
  useEffect(() => {
    if (!mapInstance || !isLoaded) return;
    if (isUpdatingFromPropsRef.current) return;

    const currentIds = placesWithCoords.map(p => p.id).sort().join(",");
    if (currentIds === prevPlacesIdsRef.current) return;
    prevPlacesIdsRef.current = currentIds;

    if (placesWithCoords.length === 0) return;

    if (placesWithCoords.length === 1) {
      mapInstance.panTo({ lat: placesWithCoords[0].lat!, lng: placesWithCoords[0].lng! });
      mapInstance.setZoom(15);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    placesWithCoords.forEach(p => bounds.extend({ lat: p.lat!, lng: p.lng! }));
    mapInstance.fitBounds(bounds, { top: 80, bottom: 80, left: 40, right: 40 });
  }, [mapInstance, isLoaded, placesWithCoords]);

  // --- Marker Clustering ---
  // Создаём императивные маркеры и передаём их в MarkerClusterer.
  // Кластеризация происходит client-side, перерендер — только при zoom/bounds change.
  useEffect(() => {
    if (!mapInstance || !isLoaded) return;

    // Очищаем старые маркеры и кластерер
    if (clustererRef.current) {
      clustererRef.current.setMap(null);
      clustererRef.current = null;
    }
    markersRef.current.forEach((m) => {
      google.maps.event.clearInstanceListeners(m);
      m.setMap(null);
    });
    markersRef.current = [];

    // Создаём новые маркеры для каждого места
    const newMarkers = placesWithCoords.map((place) => {
      const emoji = getCategoryEmoji(place.categories);
      const isPremium = isPlacePremium(place);

      const marker = new google.maps.Marker({
        position: { lat: place.lat!, lng: place.lng! },
        title: place.title,
        icon: createMarkerIcon(emoji, "default", isPremium),
      });

      // Привязываем place.id к маркеру для быстрого поиска
      (marker as any).__placeId = place.id;

      // Клик по индивидуальному маркеру — показать InfoWindow
      marker.addListener("click", () => {
        if (!externalSelectedPlaceId) {
          setInternalSelectedPlaceId(place.id);
          setCurrentPhotoIndex((prev) => new Map(prev).set(place.id, 0));
        }
        if (navigator.vibrate) navigator.vibrate(10);
      });

      return marker;
    });

    markersRef.current = newMarkers;

    // Создаём MarkerClusterer с кастомным рендерером
    clustererRef.current = new MarkerClusterer({
      map: mapInstance,
      markers: newMarkers,
      renderer: new MaporiaClusterRenderer(),
      // Клик по кластеру — плавный зум к его границам
      onClusterClick: (_event, cluster, map) => {
        // Закрываем InfoWindow при клике на кластер
        if (!externalSelectedPlaceId) {
          setInternalSelectedPlaceId(null);
        }

        const bounds = cluster.bounds;
        if (bounds) {
          // Плавное перемещение + зум к границам кластера
          map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
        }
      },
    });

    return () => {
      if (clustererRef.current) {
        clustererRef.current.setMap(null);
        clustererRef.current = null;
      }
      newMarkers.forEach((m) => {
        google.maps.event.clearInstanceListeners(m);
        m.setMap(null);
      });
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstance, isLoaded, placesWithCoords, externalSelectedPlaceId]);

  // Обновляем иконку выбранного маркера (увеличение) без пересоздания кластерера
  useEffect(() => {
    if (!isLoaded || markersRef.current.length === 0) return;

    for (const marker of markersRef.current) {
      const placeId = (marker as any).__placeId as string;
      const isSelected = placeId === selectedPlaceId;
      const place = placesWithCoords.find((p) => p.id === placeId);
      if (!place) continue;

      const emoji = getCategoryEmoji(place.categories);
      const isPremium = isPlacePremium(place);
      const state = isSelected ? "active" : "default";

      marker.setIcon(createMarkerIcon(emoji, state, isPremium));

      // Выбранный маркер поверх остальных
      marker.setZIndex(isSelected ? (google.maps.Marker.MAX_ZINDEX ?? 1000000) + 1 : undefined);
    }
  }, [selectedPlaceId, placesWithCoords, isLoaded]);

  if (loading) {
    return <MapSkeleton className="h-full w-full" />;
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

  // Don't render map content if lazy loading hasn't triggered yet
  if (!shouldLoadMap) {
    return <MapSkeleton className="h-full w-full" />;
  }

  if (!isLoaded) {
    return <MapSkeleton className="h-full w-full" />;
  }

  return (
    <>
    <div 
      className="relative h-full w-full transition-all duration-300 overflow-hidden" 
      data-map-container
      style={{
        touchAction: 'pan-x pan-y', // Разрешаем только панорамирование карты, блокируем скролл страницы
        overscrollBehavior: 'none', // Предотвращаем pull-to-refresh
      }}
      onTouchStart={(e) => {
        // Предотвращаем скролл страницы при начале взаимодействия с картой
        // НЕ блокируем события для маркеров и InfoWindow - они должны работать
        if (e.touches.length === 1) {
          const target = e.target as HTMLElement;
          // Проверяем, что тап не на кнопках управления, маркерах или InfoWindow
          const isMarker = target.closest('[class*="gm-"]') || 
                          target.closest('[data-marker]') ||
                          target.closest('.gm-style') ||
                          target.closest('[role="button"]');
          const isInfoWindow = target.closest('.gm-style-iw') || 
                              target.closest('[class*="infoWindow"]');
          // Блокируем только если это не интерактивный элемент
          if (!target.closest('button') && !isMarker && !isInfoWindow) {
            // Разрешаем обработку жестов картой
            e.stopPropagation();
          }
        }
      }}
      onTouchMove={(e) => {
        // Предотвращаем скролл страницы при перемещении по карте
        // НЕ блокируем события для маркеров и InfoWindow
        if (e.touches.length === 1) {
          const target = e.target as HTMLElement;
          const isMarker = target.closest('[class*="gm-"]') || 
                          target.closest('[data-marker]') ||
                          target.closest('.gm-style');
          const isInfoWindow = target.closest('.gm-style-iw') || 
                              target.closest('[class*="infoWindow"]');
          if (!target.closest('button') && !isMarker && !isInfoWindow) {
            e.stopPropagation();
          }
        }
      }}
    >
      {/* Custom Map Controls - Bottom Right Corner on Mobile, Top Right on Desktop */}
      <div 
        className="absolute lg:top-3 lg:bottom-auto right-3 z-20 flex flex-col gap-2"
        style={{
          bottom: 'calc(64px + 24px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* My Location Button */}
        <button
          onClick={handleMyLocation}
          className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-[#FAFAF7] transition-colors"
          aria-label="My Location"
          title="My Location"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" fill="#22c55e" />
            <circle cx="12" cy="12" r="8" stroke="#22c55e" strokeWidth="1.5" fill="none" opacity="0.3" />
          </svg>
        </button>

        {/* Zoom Controls */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
          <button
            onClick={handleZoomIn}
            className="w-10 h-10 flex items-center justify-center hover:bg-[#FAFAF7] transition-colors border-b border-[#ECEEE4]"
            aria-label="Zoom In"
            title="Zoom In"
          >
            <Icon name="zoom-in" size={20} className="text-[#1F2A1F]" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-10 h-10 flex items-center justify-center hover:bg-[#FAFAF7] transition-colors"
            aria-label="Zoom Out"
            title="Zoom Out"
          >
            <Icon name="zoom-out" size={20} className="text-[#1F2A1F]" />
          </button>
        </div>
      </div>

      <div 
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {!isLoaded && (
          <div className="absolute inset-0">
            {loadError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#ECEEE4] text-[#6F7A5A]">
                <div className="text-center">
                  <div className="text-sm font-medium mb-1">Error loading map</div>
                  <div className="text-xs">Check console for details</div>
                </div>
              </div>
            ) : (
              <MapSkeleton className="h-full w-full" />
            )}
          </div>
        )}
        {isLoaded && (
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
          options={getMapOptions()}
        >
          {/* InfoWindow для выбранного места (standalone, маркеры управляются императивно через MarkerClusterer) */}
          {selectedPlaceId && (() => {
            const place = placesWithCoords.find((p) => p.id === selectedPlaceId);
            if (!place || !place.lat || !place.lng) return null;
            if (typeof window === "undefined" || !(window as any).google?.maps) return null;

            const photos = placePhotos.get(place.id) || (isValidPhotoUrl(place.cover_url) ? [place.cover_url!] : []);
            const currentIndex = currentPhotoIndex.get(place.id) || 0;
            const currentPhoto = photos[currentIndex] || (isValidPhotoUrl(place.cover_url) ? place.cover_url : undefined);
            const hasMultiplePhotos = photos.length > 1;

            const handlePreviousPhoto = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentPhotoIndex((prev) => {
                const newMap = new Map(prev);
                const current = newMap.get(place.id) || 0;
                newMap.set(place.id, current > 0 ? current - 1 : photos.length - 1);
                return newMap;
              });
            };

            const handleNextPhoto = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentPhotoIndex((prev) => {
                const newMap = new Map(prev);
                const current = newMap.get(place.id) || 0;
                newMap.set(place.id, current < photos.length - 1 ? current + 1 : 0);
                return newMap;
              });
            };

            const handleDotClick = (e: React.MouseEvent, index: number) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentPhotoIndex((prev) => new Map(prev).set(place.id, index));
            };

            return (
              <InfoWindow
                position={{ lat: place.lat, lng: place.lng }}
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
                  <div className="relative w-full" style={{ paddingBottom: '100%' }}>
                    {currentPhoto ? (
                      <div className="absolute inset-0">
                        <img
                          src={currentPhoto}
                          alt={place.title}
                          className="absolute inset-0 w-full h-full object-cover rounded-t-xl"
                        />
                        
                        {/* Premium Badge - Top Left */}
                        {isPlacePremium(place) && (
                          <div className="absolute top-3 left-3 z-10">
                            <PremiumBadge />
                          </div>
                        )}
                        
                        {/* Top Right Buttons - Favorite Icon Always Visible */}
                        <div className="absolute top-3 right-3 flex gap-2 z-10">
                          {userId && onToggleFavorite && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onToggleFavorite(place.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border flex items-center justify-center transition shadow-sm ${
                                favorites?.has(place.id) 
                                  ? "border-[#8F9E4F] bg-[#FAFAF7]" 
                                  : "border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F]"
                              }`}
                              title={favorites?.has(place.id) ? "Remove from favorites" : "Add to favorites"}
                              aria-label={favorites?.has(place.id) ? "Remove from favorites" : "Add to favorites"}
                            >
                              <FavoriteIcon 
                                isActive={favorites?.has(place.id) || false} 
                                size={16}
                              />
                            </button>
                          )}
                        </div>
                        
                        {/* Navigation Arrows */}
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
                              <Icon name="forward" size={16} className="text-[#1F2A1F]" />
                            </button>
                          </>
                        )}
                        
                        {/* Pagination Dots */}
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
                        <Icon name="photo" size={48} className="text-[#A8B096]" />
                      </div>
                    )}
                  </div>
                  
                  {/* Text Content Section */}
                  {(() => {
                    const isPremium = isPlacePremium(place);
                    const canView = canUserViewPlace(defaultAccess, place);
                    const isLocked = isPremium && !canView;
                    const content = (
                      <>
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="text-base font-semibold text-[#2d2d2d] line-clamp-1 flex-1 pr-2">
                            {place.title}
                          </h3>
                        </div>
                        {place.description && (
                          <div className="text-sm text-[#6F7A5A] line-clamp-1 mb-2">
                            {place.description}
                          </div>
                        )}
                        {place.city && (
                          <div className="text-sm text-[#2d2d2d]">
                            <span>{place.city}</span>
                          </div>
                        )}
                      </>
                    );
                    if (isLocked) {
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPremiumLocation("place", place.title, place.id);
                            if (!externalSelectedPlaceId) {
                              setInternalSelectedPlaceId(null);
                            }
                          }}
                          className="block w-full text-left p-4 hover:bg-[#FAFAF7] transition-colors rounded-b-xl"
                        >
                          {content}
                        </button>
                      );
                    }
                    return (
                      <Link
                        href={`/id/${place.id}`}
                        target={isDesktop ? "_blank" : undefined}
                        rel={isDesktop ? "noopener noreferrer" : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!externalSelectedPlaceId) {
                            setInternalSelectedPlaceId(null);
                          }
                        }}
                        className="block p-4"
                      >
                        {content}
                      </Link>
                    );
                  })()}
                </div>
              </InfoWindow>
            );
          })()}
        </GoogleMap>
        )}
      </div>
    </div>
    <AuthModal
      isOpen={authModalOpen}
      onClose={closeAuthModal}
      redirectPath={authRedirectPath}
      variant={authModalVariant}
    />
    <PremiumUpsellModal
      open={modalOpen}
      onClose={closePremiumModal}
      context="place"
      placeTitle={modalPlaceTitle}
    />
    </>
  );
}
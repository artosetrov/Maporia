"use client";

export const dynamic = 'force-dynamic';

import Link from "next/link";
import { useEffect, useMemo, useState, Suspense, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
// TODO: Migrate to AdvancedMarker when ready
// As of Feb 21, 2024, google.maps.Marker is deprecated in favor of AdvancedMarkerElement
// Migration requires: mapId in GoogleMap options, marker library in GOOGLE_MAPS_LIBRARIES, and AdvancedMarker component
// See: https://developers.google.com/maps/documentation/javascript/advanced-markers/migration
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import PlaceCard from "../components/PlaceCard";
import nextDynamic from "next/dynamic";
import { ActiveFilters } from "../components/FiltersModal";

const FiltersModal = nextDynamic(() => import("../components/FiltersModal"), { ssr: false });
const SearchModal = nextDynamic(() => import("../components/SearchModal"), { ssr: false });
import FavoriteIcon from "../components/FavoriteIcon";
import PremiumBadge from "../components/PremiumBadge";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "../config/googleMaps";
import { supabase } from "../lib/supabase";
import { DEFAULT_CITY, CATEGORIES, CITIES } from "../constants";
import { useUserAccess } from "../hooks/useUserAccess";
import { isPlacePremium, canUserViewPlace, type UserAccess } from "../lib/access";
import Icon from "../components/Icon";
import { PlaceCardGridSkeleton, MapSkeleton, Empty } from "../components/Skeleton";

type Place = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  city_name_cached?: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  categories: string[] | null;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  created_by?: string | null;
  // Premium/Hidden/Vibe fields (используем только существующие поля)
  // Premium определяется через access_level === 'premium'
  // Hidden/Vibe определяются через категории
  access_level?: string | null;
};

// Тип для фильтров
type PlaceFilters = {
  premium?: boolean;
  hidden?: boolean;
  vibe?: boolean;
  cities?: string[];
  categories?: string[];
};

// Нормализация города для сравнения
function normalizeCity(city: string | null | undefined): string {
  if (!city) return "";
  return city.trim().toLowerCase();
}

// Проверка, является ли место Hidden (через категорию "🤫 Hidden & Unique")
// Поле is_hidden не существует в БД, используем только категории
function isPlaceHidden(place: Place): boolean {
  if (place.categories && place.categories.includes("🤫 Hidden & Unique")) return true;
  return false;
}

// Проверка, является ли место Vibe (через категорию "✨ Vibe & Atmosphere")
// Поле is_vibe не существует в БД, используем только категории
function isPlaceVibe(place: Place): boolean {
  if (place.categories && place.categories.includes("✨ Vibe & Atmosphere")) return true;
  return false;
}

// Централизованная функция фильтрации мест
function filterPlaces(places: Place[], filters: PlaceFilters): Place[] {
  let filtered = [...places];

  // Фильтрация по Top Pills (Premium, Hidden, Vibe) - AND между ними
  if (filters.premium) {
    filtered = filtered.filter(place => isPlacePremium(place));
  }
  if (filters.hidden) {
    filtered = filtered.filter(place => isPlaceHidden(place));
  }
  if (filters.vibe) {
    filtered = filtered.filter(place => isPlaceVibe(place));
  }

  // Фильтрация по городам - OR внутри группы (место в любом из выбранных городов)
  if (filters.cities && filters.cities.length > 0) {
    const normalizedSelectedCities = filters.cities.map(normalizeCity);
    filtered = filtered.filter(place => {
      const placeCity = normalizeCity(place.city || place.city_name_cached);
      return normalizedSelectedCities.includes(placeCity);
    });
  }

  // Фильтрация по категориям - OR внутри группы (место имеет любую из выбранных категорий)
  if (filters.categories && filters.categories.length > 0) {
    filtered = filtered.filter(place => {
      if (!place.categories || place.categories.length === 0) return false;
      return filters.categories!.some(cat => place.categories!.includes(cat));
    });
  }

  return filtered;
}

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

function MapPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // На странице /map по умолчанию показываем list view (включая мобильные)
  // Всегда начинаем с "list", независимо от устройства
  // Это гарантирует, что на мобильных устройствах по умолчанию открывается список, а не карта
  const [view, setView] = useState<"list" | "map">("list");
  
  // Убеждаемся, что view всегда начинается с "list" при первой загрузке
  useEffect(() => {
    // При первой загрузке страницы всегда показываем список
    // Это предотвращает случайное переключение на карту
    if (view !== "list" && !searchParams?.get('view')) {
      setView("list");
    }
  }, []); // Пустой массив зависимостей - выполняется только при монтировании
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true); // Start with true to show skeleton initially
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [filteredPlacesState, setFilteredPlacesState] = useState<Place[]>([]);

  // User access for premium filtering
  const { loading: accessLoading, access } = useUserAccess();
  
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
          hasCityInUrl: false,
        };
      }
      
      const cityParam = searchParams.get('city');
      const qParam = searchParams.get('q');
      const categoriesParam = searchParams.get('categories');
      
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
      
      return { initialCity, initialQ, initialCategories, hasCityInUrl };
    } catch (e) {
      console.error('[MapPage] Error in getInitialValues:', e);
      // Fallback при ошибке парсинга
        return {
          initialCity: null, // null для "Anywhere"
          initialQ: "",
          initialCategories: [] as string[],
          hasCityInUrl: false,
        };
    }
  };
  
  const { initialCity, initialQ, initialCategories, hasCityInUrl: initialHasCityInUrl } = getInitialValues();
  
  // appliedCity всегда должен быть строкой (для фильтрации), используем DEFAULT_CITY если нет города
  const [appliedCity, setAppliedCity] = useState<string | null>(initialCity || DEFAULT_CITY);
  const [appliedQ, setAppliedQ] = useState(initialQ);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    categories: initialCategories,
    sort: null,
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
      const qParam = searchParams.get('q');
      const ref = searchParams.get('ref');
      
      // Устанавливаем applied filters из URL
      if (city && city.trim()) {
        try {
          const decodedCity = decodeURIComponent(city.trim());
          // Всегда устанавливаем город из URL, если он есть
          setAppliedCity(decodedCity);
          setSelectedCity(decodedCity);
          setHasExplicitCityInUrlState(true); // Город явно указан в URL
        } catch (e) {
          const trimmedCity = city.trim();
          setAppliedCity(trimmedCity);
          setSelectedCity(trimmedCity);
          setHasExplicitCityInUrlState(true); // Город явно указан в URL
        }
      } else {
        // Если city нет в URL, используем DEFAULT_CITY только если appliedCity ещё не установлен
        // Это позволяет сохранить выбранный город при переходе на страницу без параметра city
        setHasExplicitCityInUrlState(false); // Город не указан в URL
        setAppliedCity(prev => {
          if (!prev) {
            return DEFAULT_CITY;
          }
          return prev;
        });
        // Если city нет в URL, устанавливаем selectedCity в null для "Anywhere"
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
      
      // Проверяем, пришли ли с Home
      if (categoriesParam || ref === 'home') {
        setCameFromHome(true);
      } else {
        setCameFromHome(false);
      }
    } catch (error) {
      console.error("Error parsing search params:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Обновляем URL при изменении applied filters (но только если они отличаются от текущих в URL)
  useEffect(() => {
    if (typeof window === 'undefined' || !searchParams) return;
    
    try {
      const currentCity = searchParams.get('city');
      const currentQ = searchParams.get('q');
      const currentCategories = searchParams.get('categories');
      const currentSort = searchParams.get('sort');
    
    // Сравниваем текущие значения в URL с applied filters
    // Включаем город в URL, если он явно выбран (даже если это DEFAULT_CITY)
    const expectedCity = appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) ? appliedCity : null;
    const expectedQ = appliedQ.trim() || null;
    const expectedCategories = appliedCategories.length > 0 ? appliedCategories : null;
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
    
    // Проверяем, нужно ли обновлять URL
    const cityChanged = expectedCity !== currentCityDecoded;
    const qChanged = expectedQ !== currentQDecoded;
    const categoriesChanged = JSON.stringify(expectedCategoriesSorted) !== JSON.stringify(currentCategoriesDecoded);
    const sortChanged = expectedSort !== currentSort;
    
    // Если ничего не изменилось, не обновляем URL
    if (!cityChanged && !qChanged && !categoriesChanged && !sortChanged) {
      return;
    }
    
    const params = new URLSearchParams();
    
    if (expectedCity) {
      params.set('city', encodeURIComponent(expectedCity));
    }
    
    if (expectedQ) {
      params.set('q', encodeURIComponent(expectedQ));
    }
    
    if (expectedCategories) {
      params.set('categories', expectedCategories.map(c => encodeURIComponent(c)).join(','));
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
  }, [appliedCity, appliedQ, appliedCategories, activeFilters.sort, searchParams, hasExplicitCityInUrlState]);

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

    // Загружаем профиль для получения display_name и avatar_url
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

  // Track total count separately
  const [totalPlacesCount, setTotalPlacesCount] = useState<number | null>(null);
  const [placesData, setPlacesData] = useState<Place[] | null>(null);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [placesError, setPlacesError] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
        const s = appliedQ.trim();
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
      const { data, error, count } = await query;
      
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
            const s = appliedQ.trim();
            fallbackQuery = fallbackQuery.or(`title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`);
          }
          
          if (selectedTag) {
            fallbackQuery = fallbackQuery.contains("tags", [selectedTag]);
          }
          
          fallbackQuery = fallbackQuery.order("created_at", { ascending: false });
          
          const fallbackResult = await fallbackQuery;
          if (!fallbackResult.error) {
            // Fallback успешен
            return fallbackResult.data?.map((p: any) => ({
              ...p,
              // Ensure all required fields exist (используем только существующие поля)
              id: p.id,
              title: p.title || '',
              description: p.description || null,
              city: p.city || null,
              city_name_cached: p.city_name_cached || null,
              lat: p.lat || null,
              lng: p.lng || null,
              cover_url: p.cover_url || null,
              categories: p.categories || [],
              tags: p.tags || [],
              created_at: p.created_at || new Date().toISOString(),
              created_by: p.created_by || null,
              access_level: p.access_level || null,
              country: p.country || null,
            })) || [];
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
            citiesToFilter,
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
      let filteredData = data as Place[];

      // Фильтрация по поисковому запросу (если есть) - делаем это раньше для сортировки
      if (appliedQ.trim()) {
        const searchLower = appliedQ.trim().toLowerCase();
        filteredData = filteredData.filter(place => 
          place.title?.toLowerCase().includes(searchLower) ||
          place.description?.toLowerCase().includes(searchLower) ||
          place.country?.toLowerCase().includes(searchLower)
        );
      }

      // Фильтрация по городам применяется на клиенте для скорости
      // (вместо медленного серверного запроса)
      const citiesToFilter = appliedCities.filter(city => city !== DEFAULT_CITY);
      const allCitiesSelected = citiesToFilter.length > 0 && 
                               citiesToFilter.length === CITIES.length &&
                               CITIES.every(city => citiesToFilter.includes(city));
      
      if (citiesToFilter.length > 0 && !allCitiesSelected) {
        filteredData = filteredData.filter(place => {
          const placeCity = normalizeCity(place.city || place.city_name_cached);
          return citiesToFilter.some(city => normalizeCity(city) === placeCity);
        });
      } else if (appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) && !allCitiesSelected) {
        // Fallback для обратной совместимости
        const normalizedAppliedCity = normalizeCity(appliedCity);
        filteredData = filteredData.filter(place => {
          const placeCity = normalizeCity(place.city || place.city_name_cached);
          return placeCity === normalizedAppliedCity;
        });
      }

      // Фильтрация по категориям применяется на клиенте для скорости
      // (вместо медленного серверного overlaps запроса)
      // Используем activeFilters.categories напрямую для мгновенного обновления
      if (activeFilters.categories.length > 0) {
        const allCategoriesSelected = activeFilters.categories.length === CATEGORIES.length &&
                                     CATEGORIES.every(cat => activeFilters.categories.includes(cat));
        if (!allCategoriesSelected) {
          filteredData = filteredData.filter(place => {
            if (!place.categories || place.categories.length === 0) return false;
            return activeFilters.categories.some(cat => place.categories!.includes(cat));
          });
        }
      }

      // Если выбрана сортировка по комментариям или лайкам, нужно загрузить счетчики
      let placesWithCounts = filteredData;
      if (activeFilters.sort === "most_commented" || activeFilters.sort === "most_liked") {
        const placeIds = filteredData.map((p: any) => p.id);
        
        // Оптимизация: используем count вместо загрузки всех записей
        // Разбиваем на батчи по 100 мест для избежания превышения лимита запроса
        const batchSize = 100;
        const commentsCount = new Map<string, number>();
        const likesCount = new Map<string, number>();
        
        // Загружаем счетчики батчами
        for (let i = 0; i < placeIds.length; i += batchSize) {
          const batch = placeIds.slice(i, i + batchSize);
          
          const [commentsResult, likesResult] = await Promise.all([
            supabase
              .from("comments")
              .select("place_id")
              .in("place_id", batch),
            supabase
              .from("reactions")
              .select("place_id")
              .eq("reaction", "like")
              .in("place_id", batch),
          ]);
          
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
          (commentsResult.data || []).forEach((c: any) => {
            commentsCount.set(c.place_id, (commentsCount.get(c.place_id) || 0) + 1);
          });

          (likesResult.data || []).forEach((r: any) => {
            likesCount.set(r.place_id, (likesCount.get(r.place_id) || 0) + 1);
          });
        }

        // Добавляем счетчики к местам и сортируем
        placesWithCounts = filteredData.map((p: any) => ({
          ...p,
          commentsCount: commentsCount.get(p.id) || 0,
          likesCount: likesCount.get(p.id) || 0,
        }));

        if (activeFilters.sort === "most_commented") {
          placesWithCounts.sort((a: any, b: any) => b.commentsCount - a.commentsCount);
        } else if (activeFilters.sort === "most_liked") {
          placesWithCounts.sort((a: any, b: any) => b.likesCount - a.likesCount);
        }
      }

      return placesWithCounts.map((p: any) => ({
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
        }
      } finally {
        if (!cancelled) setPlacesLoading(false);
      }
    })();
    return () => { cancelled = true; };
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

      // Apply client-side filters (Premium/Hidden/Vibe/Categories/Cities) to placesData
      // Все фильтры применяются на клиенте для мгновенной скорости
      // Используем useMemo для вычисления, но обновляем через useEffect для гарантии обновления
      const filteredPlacesMemo = useMemo(() => {
        if (!placesData || placesData.length === 0) return [];
        
        // Определяем города для фильтрации
        const citiesToFilter = appliedCities.filter(city => city !== DEFAULT_CITY);
        const allCitiesSelected = citiesToFilter.length > 0 && 
                                 citiesToFilter.length === CITIES.length &&
                                 CITIES.every(city => citiesToFilter.includes(city));
        
        let citiesForFilter: string[] | undefined;
        if (citiesToFilter.length > 0 && !allCitiesSelected) {
          citiesForFilter = citiesToFilter;
        } else if (appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) && !allCitiesSelected) {
          citiesForFilter = [appliedCity];
        }
        
        const result = filterPlaces(placesData, {
          premium: activeFilters.premium,
          premiumOnly: activeFilters.premiumOnly,
          hidden: activeFilters.hidden,
          vibe: activeFilters.vibe,
          // Используем activeFilters.categories напрямую
          categories: activeFilters.categories.length > 0 ? activeFilters.categories : undefined,
          cities: citiesForFilter,
        });
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[MapPage] filteredPlacesMemo recalculated:', {
            inputCount: placesData.length,
            outputCount: result.length,
            appliedCities,
            citiesToFilter,
            citiesForFilter,
            categories: activeFilters.categories,
            categoriesKey,
            citiesKey,
          });
        }
        
        return result;
      }, [
        placesData, 
        activeFilters.premium, 
        activeFilters.premiumOnly, 
        activeFilters.hidden, 
        activeFilters.vibe,
        // Используем строковые ключи для отслеживания изменений массивов
        categoriesKey,
        citiesKey,
        // Также добавляем appliedCities напрямую для гарантии обновления
        appliedCities,
        appliedCity, 
        hasExplicitCityInUrlState
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
              hidden: activeFilters.hidden,
              vibe: activeFilters.vibe,
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
      }, [filteredPlacesMemo, categoriesKey, citiesKey, appliedCities, activeFilters.premium, activeFilters.premiumOnly, activeFilters.hidden, activeFilters.vibe]);
      
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
          hidden: activeFilters.hidden,
          vibe: activeFilters.vibe,
        },
      });
    }
  }, [filteredPlaces.length, placesData?.length || 0, activeFilters.premium, activeFilters.premiumOnly, activeFilters.hidden, activeFilters.vibe]);

  // Handle errors
  useEffect(() => {
    if (placesError) {
      console.error("Error loading places:", placesError);
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


  useEffect(() => {
    (async () => {
      try {
        await loadUser();
      } catch (err: any) {
        // Silently ignore AbortError
        if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
          return;
        }
        console.error("[MapPage] Error loading user:", err);
      }
    })();
  }, []);

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
    supabase
      .from("reactions")
      .select("place_id")
      .eq("user_id", userId)
      .eq("reaction", "like")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) return;
        setFavorites(new Set((data || []).map((r) => r.place_id)));
      });
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
      params.set('city', encodeURIComponent(city));
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
      appliedQ.trim().length > 0 ||
      selectedTag.length > 0
    );
  }, [appliedCity, hasExplicitCityInUrlState, appliedCategories, appliedQ, selectedTag]);

  // Функция для очистки всех фильтров
  const handleClearAllFilters = () => {
    setAppliedCity(DEFAULT_CITY);
    setHasExplicitCityInUrlState(false);
    setAppliedQ("");
    setSearchDraft("");
    setSelectedTag("");
    setActiveFilters({
      categories: [],
      sort: null,
    });
    // Очищаем URL параметры
    window.history.replaceState({}, '', window.location.pathname);
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
    if (activeFilters.categories.length > 0 || appliedQ.trim() || selectedTag) {
      return countText;
    }
    
    // Нет фильтров - показываем "All places"
    return "All places";
  }, [filteredPlaces.length, appliedCity, hasExplicitCityInUrlState, activeFilters.categories, appliedQ, selectedTag]);

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
          // Update state
          setSelectedCity(city);
          if (city) {
            setAppliedCity(city);
            setHasExplicitCityInUrlState(true);
          } else {
            setAppliedCity(DEFAULT_CITY);
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
            params.set("city", encodeURIComponent(city.trim()));
          }
          if (query.trim()) {
            params.set("q", encodeURIComponent(query.trim()));
          }
          // Use tags if provided, otherwise use activeFilters.categories
          const categoriesToUse = tags || activeFilters.categories;
          if (categoriesToUse.length > 0) {
            params.set("categories", categoriesToUse.map(t => encodeURIComponent(t)).join(','));
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
        appliedFilters={activeFilters}
        appliedCity={appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) ? appliedCity : null}
        appliedCities={appliedCities.filter(city => city !== DEFAULT_CITY)}
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
            const { data: allData, error: dataError } = await supabase
              .from("places")
              .select("id,title,description,city,city_name_cached,categories,tags,access_level,country");
            
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
            const filtered = filterPlaces(dataToFilter, {
              premium: draftFilters.premium || draftFilters.premiumOnly || false,
              hidden: draftFilters.hidden || false,
              vibe: draftFilters.vibe || false,
              cities: selectedCities.length > 0 && !allCitiesSelected ? selectedCities : undefined,
              categories: draftFilters.categories.length > 0 && !allCategoriesSelected ? draftFilters.categories : undefined,
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
            query = query.or(`city_name_cached.eq.${city},city.eq.${city}`);
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
        getCategoryCount={async (category: string) => {
          try {
            const { count, error } = await supabase
              .from("places")
              .select("*", { count: 'exact', head: true })
              .overlaps("categories", [category]);
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
              {((appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) || appliedCategories.length > 0) && (
                <div className="mt-2 flex gap-2 flex-wrap">
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
                <div key={`places-grid-${filtersVersion}-${categoriesKey}-${citiesKey}`} className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 place-card-grid">
                  {/* Жесткие ограничения на размер карточек для Desktop */}
                  {/* Максимальная ширина: 320px (жесткий предел), минимум: 260px */}
                  {/* Оптимум: 280-300px для идеального баланса */}
                  {/* Фото: aspect ratio 1:1 (при 320px → фото 320×320) */}
                  {/* Высота карточки: ~420-450px (фото ~320px + текст 90-120px) */}
                  {/* Карточки НИКОГДА не растягиваются выше max-width */}
                  {/* Промежутки остаются постоянными, дополнительное пространство отдается карте */}
                  <style jsx>{`
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
                      className="transition-all relative z-0 place-card-wrapper"
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
                          router.push(`/id/${p.id}`);
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
              <div className="w-full mx-auto px-4 pb-24" style={{ paddingTop: '88px' }}>
                {/* Header */}
                <div className="mb-4">
                  <h2 className="text-lg lg:text-xl font-semibold font-fraunces text-[#1F2A1F] mb-2">{listTitle}</h2>
                  {listSubtitle && (
                    <div className="text-sm text-[#6F7A5A]">{listSubtitle}</div>
                  )}
                  {/* Active filter chips */}
                  {((appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) || appliedCategories.length > 0) && (
                    <div className="mt-2 flex gap-2 flex-wrap">
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
                                router.push(`/id/${p.id}`);
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
            /* Mobile: карта открывается в fullscreen overlay */
            <div className="h-full w-full fixed inset-0 z-50 bg-white" style={{ paddingTop: '80px' }}>
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
          )}
        </div>
      </div>

      {/* Floating View Toggle Button (mobile only, ≤768px) */}
      {/* Fixed снизу, показывается только когда список активен */}
      {view === "list" && (
        <button
          onClick={() => setView("map")}
          style={{ bottom: 'calc(64px + 24px + env(safe-area-inset-bottom, 0px))' }}
          className="fixed left-1/2 transform -translate-x-1/2 z-40 md:hidden flex items-center gap-2 bg-[#8F9E4F] text-white px-6 py-3 rounded-full shadow-lg hover:bg-[#7A8A3F] transition-colors"
        >
          <Icon name="map" size={20} className="text-white" />
          <span className="text-sm font-medium">Show map</span>
        </button>
      )}
      
      {/* Back to List Button (mobile only, когда карта открыта) */}
      {view === "map" && (
        <button
          onClick={() => setView("list")}
          className="fixed top-20 left-4 z-40 md:hidden flex items-center gap-2 bg-white text-[#1F2A1F] px-4 py-2 rounded-full shadow-lg hover:bg-[#FAFAF7] transition-colors border border-[#ECEEE4]"
        >
          <Icon name="list" size={18} className="text-[#1F2A1F]" />
          <span className="text-sm font-medium">List</span>
        </button>
      )}

      <BottomNav />
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
  const [internalSelectedPlaceId, setInternalSelectedPlaceId] = useState<string | null>(null);
  const [roundIcons, setRoundIcons] = useState<Map<string, string>>(new Map());
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [placePhotos, setPlacePhotos] = useState<Map<string, string[]>>(new Map());
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<Map<string, number>>(new Map());
  const isUpdatingFromPropsRef = useRef(false);
  const lastReportedStateRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null);
  const onMapStateChangeRef = useRef(onMapStateChange);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  
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
  
  // Always use consistent parameters for useJsApiLoader
  // The component will only render when shouldLoadMap is true
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

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

  // Загружаем фото для всех мест
  useEffect(() => {
    if (!isLoaded) return;
    
    const loadPhotos = async () => {
      for (const place of placesWithCoords) {
        if (placePhotos.has(place.id)) continue;
        
        try {
          const { data: photosData, error } = await supabase
            .from("place_photos")
            .select("url")
            .eq("place_id", place.id)
            .order("sort", { ascending: true });
          
          if (error) {
            console.error("Error loading photos for place:", place.id, error);
            if (place.cover_url) {
              setPlacePhotos(prev => new Map(prev).set(place.id, [place.cover_url!]));
            }
          } else if (photosData && photosData.length > 0) {
            const urls = photosData.map(p => p.url).filter(Boolean);
            if (urls.length > 0) {
              setPlacePhotos(prev => new Map(prev).set(place.id, urls));
            } else if (place.cover_url) {
              setPlacePhotos(prev => new Map(prev).set(place.id, [place.cover_url!]));
            }
          } else if (place.cover_url) {
            setPlacePhotos(prev => new Map(prev).set(place.id, [place.cover_url!]));
          }
        } catch (error) {
          console.error("Exception loading photos:", error);
          if (place.cover_url) {
            setPlacePhotos(prev => new Map(prev).set(place.id, [place.cover_url!]));
          }
        }
      }
    };
    
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesWithCoords.map(p => p.id).join(','), isLoaded]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMapCenter, externalMapZoom, mapInstance]);

  // Убрали автоматическое перемещение и увеличение карты при выборе места
  // Теперь карточка просто появляется без изменения масштаба и позиции карты

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
    <div 
      className="relative h-full w-full transition-all duration-300 overflow-hidden" 
      data-map-container
      style={{
        touchAction: 'pan-x pan-y', // Разрешаем только панорамирование карты, блокируем скролл страницы
        overscrollBehavior: 'none', // Предотвращаем pull-to-refresh
      }}
      onTouchStart={(e) => {
        // Предотвращаем скролл страницы при начале взаимодействия с картой
        if (e.touches.length === 1) {
          const target = e.target as HTMLElement;
          // Проверяем, что тап не на кнопках управления
          if (!target.closest('button') && !target.closest('[role="button"]')) {
            // Разрешаем обработку жестов картой
            e.stopPropagation();
          }
        }
      }}
      onTouchMove={(e) => {
        // Предотвращаем скролл страницы при перемещении по карте
        if (e.touches.length === 1) {
          const target = e.target as HTMLElement;
          if (!target.closest('button') && !target.closest('[role="button"]')) {
            e.stopPropagation();
          }
        }
      }}
    >
      {/* Custom Map Controls - Top Right Corner */}
      <div className="absolute top-[72px] lg:top-3 right-3 z-10 flex flex-col gap-2">
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
          options={{
            gestureHandling: "greedy",
            disableDefaultUI: true,
            zoomControl: false,
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
                  if (!externalSelectedPlaceId) {
                    setInternalSelectedPlaceId(place.id);
                    // Reset photo index when opening a new place
                    setCurrentPhotoIndex(prev => {
                      const newMap = new Map(prev);
                      newMap.set(place.id, 0);
                      return newMap;
                    });
                  }
                  // Haptic feedback simulation
                  if (navigator.vibrate) {
                    navigator.vibrate(10);
                  }
                }}
              >
                {selectedPlaceId === place.id && (() => {
                  const photos = placePhotos.get(place.id) || (place.cover_url ? [place.cover_url] : []);
                  const currentIndex = currentPhotoIndex.get(place.id) || 0;
                  const currentPhoto = photos[currentIndex] || place.cover_url;
                  const hasMultiplePhotos = photos.length > 1;
                  
                  const handlePreviousPhoto = (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentPhotoIndex(prev => {
                      const newMap = new Map(prev);
                      const current = newMap.get(place.id) || 0;
                      newMap.set(place.id, current > 0 ? current - 1 : photos.length - 1);
                      return newMap;
                    });
                  };
                  
                  const handleNextPhoto = (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentPhotoIndex(prev => {
                      const newMap = new Map(prev);
                      const current = newMap.get(place.id) || 0;
                      newMap.set(place.id, current < photos.length - 1 ? current + 1 : 0);
                      return newMap;
                    });
                  };
                  
                  const handleDotClick = (e: React.MouseEvent, index: number) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentPhotoIndex(prev => new Map(prev).set(place.id, index));
                  };
                  
                  return (
                    <InfoWindow
                      position={{ lat: place.lat!, lng: place.lng! }}
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
                        <div className="relative w-full" style={{ paddingBottom: '66.67%' }}>
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
                              
                              {/* Navigation Arrows - круглые как в карточках */}
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
                              
                              {/* Pagination Dots - как в карточках */}
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
                        <Link
                          href={`/id/${place.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!externalSelectedPlaceId) {
                              setInternalSelectedPlaceId(null);
                            }
                          }}
                          className="block p-4"
                        >
                          {/* Title Row */}
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="text-base font-semibold text-[#2d2d2d] line-clamp-1 flex-1 pr-2">
                              {place.title}
                            </h3>
                            {/* Rating placeholder - можно добавить когда будет рейтинг */}
                          </div>
                          
                          {/* Description */}
                          {place.description && (
                            <div className="text-sm text-[#6F7A5A] line-clamp-1 mb-2">
                              {place.description}
                            </div>
                          )}
                          
                          {/* City and Tags */}
                          <div className="flex items-center gap-1.5 text-sm text-[#2d2d2d]">
                            {place.city && (
                              <>
                                <span>{place.city}</span>
                                {place.tags && place.tags.length > 0 && (
                                  <span className="text-[#A8B096]">•</span>
                                )}
                              </>
                            )}
                            {place.tags && place.tags.length > 0 && (
                              <span className="text-[#6F7A5A]">
                                {place.tags.slice(0, 2).join(', ')}
                                {place.tags.length > 2 && ` +${place.tags.length - 2}`}
                              </span>
                            )}
                          </div>
                        </Link>
                      </div>
                    </InfoWindow>
                  );
                })()}
              </Marker>
            );
          })}
        </GoogleMap>
        )}
      </div>
    </div>
  );
}
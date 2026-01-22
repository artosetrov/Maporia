"use client";

export const dynamic = 'force-dynamic';

import Link from "next/link";
import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES } from "../constants";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import PlaceCard from "../components/PlaceCard";
import Pill from "../components/Pill";
import FiltersModal, { ActiveFilters } from "../components/FiltersModal";
import FavoriteIcon from "../components/FavoriteIcon";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "../config/googleMaps";
import { supabase } from "../lib/supabase";
import { LAYOUT_BREAKPOINTS, LAYOUT_CONFIG } from "../config/layout";
import { DEFAULT_CITY } from "../constants";
import { useUserAccess } from "../hooks/useUserAccess";
import { isPlacePremium } from "../lib/access";
import Icon from "../components/Icon";

type Place = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  categories: string[] | null;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

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
  
  // На странице /map по умолчанию показываем map view
  const [view, setView] = useState<"list" | "map">("map");
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // User access for premium filtering
  const { access } = useUserAccess();

  // Applied filters (current state, affects data)
  // Инициализируем из URL сразу, чтобы фильтры применялись при первом рендере
  // Безопасная инициализация для SSR
  const getInitialValues = () => {
    try {
      if (!searchParams) {
        console.log('[MapPage] No searchParams available, using defaults');
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
          console.log('[MapPage] Initial city from URL:', initialCity);
        } catch {
          initialCity = cityParam.trim();
          console.log('[MapPage] Initial city from URL (no decode):', initialCity);
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
  });
  
  // Инициализируем флаг наличия города в URL
  const [hasExplicitCityInUrlState, setHasExplicitCityInUrlState] = useState(initialHasCityInUrl);
  
  // Draft filters (for search input and modal)
  const [searchDraft, setSearchDraft] = useState(initialQ);
  // selectedCity может быть null для "Anywhere"
  const [selectedCity, setSelectedCity] = useState<string | null>(initialCity);
  
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [cameFromHome, setCameFromHome] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  
  // Backward compatibility: appliedCategories для существующего кода
  const appliedCategories = activeFilters.categories;

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
          console.log('[MapPage] Setting city from URL:', decodedCity);
          // Всегда устанавливаем город из URL, если он есть
          setAppliedCity(decodedCity);
          setSelectedCity(decodedCity);
          setHasExplicitCityInUrlState(true); // Город явно указан в URL
        } catch (e) {
          const trimmedCity = city.trim();
          console.log('[MapPage] Setting city from URL (no decode):', trimmedCity);
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
            console.log('[MapPage] No city in URL, using DEFAULT_CITY:', DEFAULT_CITY);
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
        } catch {
          setActiveFilters(prev => ({ ...prev, categories: [] }));
        }
      } else {
        // Если параметр categories отсутствует, очищаем категории
        setActiveFilters(prev => ({ ...prev, categories: [] }));
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
    
    // Сравниваем текущие значения в URL с applied filters
    // Включаем город в URL, если он явно выбран (даже если это DEFAULT_CITY)
    const expectedCity = appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) ? appliedCity : null;
    const expectedQ = appliedQ.trim() || null;
    const expectedCategories = appliedCategories.length > 0 ? appliedCategories : null;
    
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
    
    // Если ничего не изменилось, не обновляем URL
    if (!cityChanged && !qChanged && !categoriesChanged) {
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
    
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    
    window.history.replaceState({}, '', newUrl);
    } catch (error) {
      console.error("Error updating URL:", error);
    }
  }, [appliedCity, appliedQ, appliedCategories, searchParams]);

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

  async function loadPlaces() {
    setLoading(true);

    let query = supabase.from("places").select("*");

    // Фильтрация по городу
    // Применяем фильтр, если:
    // 1. Город явно указан в URL (hasExplicitCityInUrlState = true), ИЛИ
    // 2. Город установлен и отличается от DEFAULT_CITY
    console.log('[MapPage] loadPlaces - appliedCity:', appliedCity, 'DEFAULT_CITY:', DEFAULT_CITY, 'hasExplicitCityInUrl:', hasExplicitCityInUrlState);
    if (appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) {
      console.log('[MapPage] Filtering by city:', appliedCity);
      query = query.eq("city", appliedCity);
    } else {
      console.log('[MapPage] Not filtering by city (using all cities or default)');
    }

    // Фильтрация по категориям - если выбраны категории, проверяем что place.categories содержит хотя бы одну из них
    if (appliedCategories.length > 0) {
      // Используем overlaps для проверки пересечения массивов
      query = query.overlaps("categories", appliedCategories);
    }

    if (appliedQ.trim()) {
      const s = appliedQ.trim();
      query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`);
    }

    // Фильтрация по тегам - используем selectedTag (для обратной совместимости)
    if (selectedTag) {
      query = query.contains("tags", [selectedTag]);
    }

    // Применяем сортировку
    if (activeFilters.sort === "newest") {
      query = query.order("created_at", { ascending: false });
    } else if (activeFilters.sort === "most_liked") {
      // Для сортировки по лайкам нужно будет использовать подзапрос или RPC
      // Пока используем created_at как fallback
      query = query.order("created_at", { ascending: false });
    } else if (activeFilters.sort === "most_commented") {
      // Для сортировки по комментариям тоже нужен подзапрос
      // Пока используем created_at как fallback
      query = query.order("created_at", { ascending: false });
    } else {
      // По умолчанию - по дате создания
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;
    console.log("places data", data, error);
    
    if (error) {
      console.error("Error loading places:", error);
      setPlaces([]);
      setLoading(false);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log("No places found");
      setPlaces([]);
      setLoading(false);
      return;
    }

    // Don't filter premium places - show them as locked with pseudo names
    // Premium places will be displayed with "Secret place #234" title for non-premium users
    let filteredData = data;

    // Если выбрана сортировка по комментариям или лайкам, нужно загрузить счетчики
    let placesWithCounts = filteredData;
    if (activeFilters.sort === "most_commented" || activeFilters.sort === "most_liked") {
      const placeIds = data.map((p: any) => p.id);
      
      // Загружаем количество комментариев и лайков для всех мест
      const [commentsResult, likesResult] = await Promise.all([
        supabase
          .from("comments")
          .select("place_id")
          .in("place_id", placeIds),
        supabase
          .from("reactions")
          .select("place_id")
          .eq("reaction", "like")
          .in("place_id", placeIds),
      ]);

      // Подсчитываем количество комментариев и лайков для каждого места
      const commentsCount = new Map<string, number>();
      const likesCount = new Map<string, number>();

      (commentsResult.data || []).forEach((c: any) => {
        commentsCount.set(c.place_id, (commentsCount.get(c.place_id) || 0) + 1);
      });

      (likesResult.data || []).forEach((r: any) => {
        likesCount.set(r.place_id, (likesCount.get(r.place_id) || 0) + 1);
      });

      // Добавляем счетчики к местам и сортируем
      placesWithCounts = data.map((p: any) => ({
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

    const placesWithCoords = placesWithCounts.map((p: any) => ({
      ...p,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
    }));
    const placesWithValidCoords = placesWithCoords.filter((p: any) => p.lat !== null && p.lng !== null);
    console.log("Loaded places:", placesWithCoords.length, "places with coordinates:", placesWithValidCoords.length);
    
    // Логируем места без координат для отладки
    const placesWithoutCoords = placesWithCoords.filter((p: any) => p.lat === null || p.lng === null);
    if (placesWithoutCoords.length > 0) {
      console.warn("Places without coordinates:", placesWithoutCoords.map((p: any) => ({
        id: p.id,
        title: p.title,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
      })));
    }
    
    setPlaces(placesWithCoords as Place[]);
    setLoading(false);
  }


  useEffect(() => {
    (async () => {
      await loadUser();
    })();
  }, []);

  // Load places when filters change
  useEffect(() => {
    loadPlaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedCity, appliedQ, appliedCategories, selectedTag, hasExplicitCityInUrlState]);

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
    loadPlaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedQ, appliedCity, appliedCategories, selectedTag, activeFilters.sort]);

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

  // Handle city change from SearchBar or SearchModal
  const handleCityChange = (city: string | null) => {
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
    setActiveFilters(filters);
  };

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

  // Формируем title для header списка с учетом количества результатов
  const listTitle = useMemo(() => {
    const count = places.length;
    const countText = `${count} ${count === 1 ? "place" : "places"}`;
    
    // Если выбран город
    if (appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) {
      return `${countText} in ${appliedCity}`;
    }
    
    // Если есть другие фильтры (категории, поиск, тег), но нет города
    if (appliedCategories.length > 0 || appliedQ.trim() || selectedTag) {
      return countText;
    }
    
    // Нет фильтров - показываем "All places"
    return "All places";
  }, [places.length, appliedCity, hasExplicitCityInUrlState, appliedCategories, appliedQ, selectedTag]);

  // Subtitle для заголовка (показываем только когда нет фильтров)
  const listSubtitle = useMemo(() => {
    if (hasActiveFilters) {
      return null; // Не показываем subtitle когда есть фильтры
    }
    const count = places.length;
    return `${count} ${count === 1 ? "place" : "places"}`;
  }, [places.length, hasActiveFilters]);


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
      />

      {/* Filters Modal */}
      <FiltersModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={handleFiltersApply}
        appliedFilters={activeFilters}
        getFilteredCount={(draftFilters: ActiveFilters) => {
          // Фильтруем уже загруженные места на клиенте с учетом draftFilters
          let filtered = [...places];

          // Фильтрация по категориям
          if (draftFilters.categories.length > 0) {
            filtered = filtered.filter(place => 
              place.categories && 
              draftFilters.categories.some(cat => place.categories?.includes(cat))
            );
          }

          // Фильтрация по поисковому запросу (если есть)
          if (appliedQ.trim()) {
            const searchLower = appliedQ.toLowerCase();
            filtered = filtered.filter(place => 
              place.title?.toLowerCase().includes(searchLower) ||
              place.description?.toLowerCase().includes(searchLower) ||
              place.country?.toLowerCase().includes(searchLower)
            );
          }

          // Фильтрация по городу (уже применена при загрузке, но проверяем для точности)
          if (appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) {
            filtered = filtered.filter(place => place.city === appliedCity);
          }

          return filtered.length;
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
      {/* View Toggle - только для мобильных и планшетов (<1120px) */}
      {/* Обычный блок в flow, не sticky, чтобы не накладывался на карту */}
      {/* TopBar fixed, поэтому нужен margin-top для компенсации */}
      <div className="hidden max-[1119px]:block bg-[#FAFAF7] border-b border-[#ECEEE4] mt-[64px] min-[600px]:mt-[80px]">
        <div className="flex items-center gap-2 px-4 py-2">
          <button
            onClick={() => setView("list")}
            className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition ${
              view === "list"
                ? "bg-[#8F9E4F] text-white"
                : "bg-white text-[#8F9E4F] border border-[#ECEEE4] hover:bg-[#FAFAF7]"
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView("map")}
            className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition ${
              view === "map"
                ? "bg-[#8F9E4F] text-white"
                : "bg-white text-[#8F9E4F] border border-[#ECEEE4] hover:bg-[#FAFAF7]"
            }`}
          >
            Map
          </button>
        </div>
      </div>

      {/* Контент: на desktop учитываем только TopBar (fixed), на mobile/tablet контент идет после ToggleBar в flow */}
      <div className="flex-1 min-h-0 overflow-hidden min-[1120px]:pt-[80px]">
        {/* Desktop: Split view - список слева, карта справа (≥1120px) */}
        <div className="hidden min-[1120px]:flex h-full max-w-[1920px] min-[1920px]:max-w-none mx-auto px-6">
          {/* Left: Scrollable list - 60% on XL (>=1440px), 62.5% on Desktop (1120-1439px) */}
          <div className="w-[62.5%] min-[1440px]:w-[60%] min-[1920px]:w-[1152px] flex-shrink-0 overflow-y-auto scrollbar-hide pr-6">
            {/* Header in List Column */}
            <div className="sticky top-0 z-30 bg-[#FAFAF7] pt-20 pb-3 border-b border-[#ECEEE4] mb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-semibold font-fraunces text-[#1F2A1F] truncate">{listTitle}</h1>
                  {listSubtitle && (
                    <div className="text-sm text-[#6F7A5A] mt-0.5">
                      {listSubtitle}
                    </div>
                  )}
                </div>
              </div>
              {/* Active filter chips */}
              {((appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) || appliedCategories.length > 0) && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1 flex-nowrap">
                  {appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) && (
                    <button
                      onClick={() => handleCityChange(null)}
                      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition whitespace-nowrap"
                    >
                      {appliedCity}
                      <Icon name="close" size={12} />
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
                      {cat}
                      <Icon name="close" size={12} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {loading ? (
              <div className="grid grid-cols-2 min-[1440px]:grid-cols-3 gap-6 min-[1440px]:gap-6 min-[1440px]:gap-y-7">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="w-full">
                    <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
                      <div className="absolute inset-0 rounded-2xl bg-[#ECEEE4] animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-5 w-3/4 bg-[#ECEEE4] rounded animate-pulse" />
                      <div className="h-4 w-1/2 bg-[#ECEEE4] rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : places.length === 0 ? (
              <Empty text="No places with this vibe yet. Try fewer filters." />
            ) : (
              <div className="grid grid-cols-2 min-[1440px]:grid-cols-3 gap-6 min-[1440px]:gap-6 min-[1440px]:gap-y-7">
                {places.map((p) => {
                  const isFavorite = favorites.has(p.id);
                  const isHovered = hoveredPlaceId === p.id || selectedPlaceId === p.id;
                  return (
                    <div
                      key={p.id}
                      onMouseEnter={() => setHoveredPlaceId(p.id)}
                      onMouseLeave={() => setHoveredPlaceId(null)}
                      onClick={() => {
                        setSelectedPlaceId(p.id);
                        if (p.lat != null && p.lng != null) {
                          setMapCenter({ lat: p.lat, lng: p.lng });
                          setMapZoom(15);
                        }
                      }}
                      className="transition-all relative z-0"
                    >
                      <PlaceCard
                        place={p}
                        userAccess={access}
                        userId={userId}
                        isFavorite={isFavorite}
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
                        onTagClick={(tag) => {
                          setSelectedTag(tag);
                        }}
                        onPhotoClick={() => {
                          router.push(`/id/${p.id}`);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Sticky map - 37.5% on Desktop (1120-1439px), 40% on XL (1440-1919px), 100% of remaining on >=1920px */}
          <div className="w-[37.5%] min-[1440px]:w-[40%] min-[1920px]:flex-1 h-full flex-shrink-0 flex-grow max-w-full pb-8">
            <div className="sticky top-20 h-[calc(100vh-96px-32px)] rounded-2xl overflow-hidden w-full max-w-full">
              <MapView
                places={places}
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
              />
            </div>
          </div>
        </div>

        {/* Mobile & Tablet: переключатель между списком и картой (<1120px) */}
        <div className="min-[1120px]:hidden h-full">
          {view === "list" ? (
            <div className="h-full overflow-y-auto">
              <div className="max-w-[1920px] mx-auto px-4 min-[600px]:px-6 py-4">
                {/* Header */}
                <div className="mb-4">
                  <h1 className="text-xl font-semibold font-fraunces text-[#1F2A1F] mb-2">{listTitle}</h1>
                  {listSubtitle && (
                    <div className="text-sm text-[#6F7A5A]">{listSubtitle}</div>
                  )}
                  {/* Active filter chips */}
                  {((appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY)) || appliedCategories.length > 0) && (
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1 flex-nowrap">
                      {appliedCity && (hasExplicitCityInUrlState || appliedCity !== DEFAULT_CITY) && (
                        <button
                          onClick={() => handleCityChange(null)}
                          className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#8F9E4F] bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition whitespace-nowrap"
                        >
                          {appliedCity}
                          <Icon name="close" size={12} />
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
                          {cat}
                          <Icon name="close" size={12} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Places grid */}
                {loading ? (
                  <div className="grid grid-cols-2 min-[600px]:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
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
                  <Empty text="No places with this vibe yet. Try fewer filters." />
                ) : (
                  <div className="grid grid-cols-2 min-[600px]:grid-cols-3 gap-4">
                    {places.map((p) => {
                      const isFavorite = favorites.has(p.id);
                      return (
                        <div key={p.id} className="w-full">
                          <PlaceCard
                            place={p}
                            userAccess={access}
                            userId={userId}
                            isFavorite={isFavorite}
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
                            onTagClick={(tag) => {
                              setSelectedTag(tag);
                            }}
                            onPhotoClick={() => {
                              router.push(`/id/${p.id}`);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full w-full">
              <MapView
                places={places}
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
              />
            </div>
          )}
        </div>
      </div>

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
            <div className="h-8 w-3/4 bg-gray-200 rounded mx-auto animate-pulse" />
            <div className="h-4 w-1/2 bg-gray-200 rounded mx-auto animate-pulse" />
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

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-[#6b7d47]/60 py-10">{text}</div>;
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
}) {
  const [internalSelectedPlaceId, setInternalSelectedPlaceId] = useState<string | null>(null);
  const [roundIcons, setRoundIcons] = useState<Map<string, string>>(new Map());
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [placePhotos, setPlacePhotos] = useState<Map<string, string[]>>(new Map());
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<Map<string, number>>(new Map());
  const isUpdatingFromPropsRef = useRef(false);
  const lastReportedStateRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null);
  const onMapStateChangeRef = useRef(onMapStateChange);
  
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

  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const selectedPlaceId = externalSelectedPlaceId ?? internalSelectedPlaceId;

  const placesWithCoords = useMemo(
    () => places.filter((p) => p.lat != null && p.lng != null),
    [places]
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
    return (
      <div className="h-full w-full bg-gray-200 animate-pulse flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading map…</div>
      </div>
    );
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

  if (!isLoaded) {
    return (
      <div className="h-full w-full bg-gray-200 animate-pulse flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading map…</div>
      </div>
    );
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
      <div className="absolute top-[72px] min-[600px]:top-3 right-3 z-10 flex flex-col gap-2">
        {/* My Location Button */}
        <button
          onClick={handleMyLocation}
          className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
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

      <div className="absolute inset-0 w-full h-full">
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
                              
                              {/* Top Right Buttons */}
                              <div className="absolute top-3 right-3 flex gap-2 z-10">
                                {userId && onToggleFavorite && (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onToggleFavorite(place.id, e);
                                    }}
                                    className={`h-8 w-8 rounded-full bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] hover:border-[#6b7d47]/40 flex items-center justify-center transition shadow-sm ${
                                      favorites?.has(place.id) ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                                    }`}
                                    title={favorites?.has(place.id) ? "Remove from favorites" : "Add to favorites"}
                                    aria-label={favorites?.has(place.id) ? "Remove from favorites" : "Add to favorites"}
                                  >
                                    <FavoriteIcon 
                                      isActive={favorites?.has(place.id) || false} 
                                      size={16}
                                      className={favorites?.has(place.id) ? "scale-110" : ""}
                                    />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!externalSelectedPlaceId) {
                                      setInternalSelectedPlaceId(null);
                                    }
                                  }}
                                  className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors"
                                  aria-label="Close"
                                >
                                  <Icon name="close" size={16} className="text-[#1F2A1F]" />
                                </button>
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
                            <div className="text-sm text-gray-600 line-clamp-1 mb-2">
                              {place.description}
                            </div>
                          )}
                          
                          {/* City and Tags */}
                          <div className="flex items-center gap-1.5 text-sm text-[#2d2d2d]">
                            {place.city && (
                              <>
                                <span>{place.city}</span>
                                {place.tags && place.tags.length > 0 && (
                                  <span className="text-gray-400">•</span>
                                )}
                              </>
                            )}
                            {place.tags && place.tags.length > 0 && (
                              <span className="text-gray-600">
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
      </div>
    </div>
  );
}
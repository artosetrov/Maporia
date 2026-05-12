"use client";

 

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  CATEGORIES,
  LOCATION_CATEGORIES,
  SERVICE_CATEGORIES,
  EXPERIENCE_CATEGORIES,
  getTagEmoji,
  stripTagEmoji,
} from "../constants";
import Icon from "./Icon";
import { type UserAccess } from "../lib/access";
import { computeFilterCounts } from "../lib/filterCounts";
import type { FilterablePlace } from "../lib/filterPlaces";

export type ActiveFilters = {
  categories: string[];
  sort: string | null;
  tags?: string[];
  premium?: boolean;
  hidden?: boolean;
  vibe?: boolean;
  /**
   * Фильтр по типу карточки. Пустой массив или undefined = все типы.
   * Используется на /map: SQL .in('kind', kinds).
   * На главной фильтр по kind управляется через табы (?tab=…) — он живёт
   * отдельно от этого поля.
   */
  kinds?: ('location' | 'service' | 'experience')[];
};

type FiltersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: ActiveFilters) => void;
  
  // Applied filters (current state)
  appliedFilters: ActiveFilters;
  
  // Applied cities (for display in tags and city selection)
  appliedCity?: string | null;
  appliedCities?: string[];
  onCityChange?: (city: string | null) => void;
  onCitiesChange?: (cities: string[]) => void;
  
  // Optional: callback to get filtered places count for "Show X places" button
  // Takes draft filters and draft cities as parameters to calculate count based on current selections
  // Can be async (returns Promise<number>) or sync (returns number)
  getFilteredCount?: (filters: ActiveFilters, cities: string[]) => number | Promise<number>;
  
  // Optional: get count for each city
  getCityCount?: (city: string) => number | Promise<number>;
  
  // Optional: get count for each category. premiumOnly filters to only premium places.
  // kinds (если переданы) сужают подсчёт до выбранных типов карточек.
  getCategoryCount?: (
    category: string,
    premiumOnly?: boolean,
    kinds?: ('location' | 'service' | 'experience')[],
  ) => number | Promise<number>;

  // Optional: get count for each place kind. premiumOnly filters to only premium places.
  // Возвращает «сколько в БД мест данного типа» — НЕ зависит от других выбранных kinds,
  // чтобы пользователь видел стабильные счётчики на кнопках TYPE.
  getKindCount?: (
    kind: 'location' | 'service' | 'experience',
    premiumOnly?: boolean,
  ) => number | Promise<number>;
  
  // Optional: list of available tags filtered by selected categories
  getAvailableTags?: (categories: string[]) => string[] | Promise<string[]>;
  // Optional: get counts for all tags in one call (batched). Returns map tagName -> count.
  // premiumOnly filters to only premium places.
  getTagCounts?: (tags: string[], categories?: string[], premiumOnly?: boolean) => Record<string, number> | Promise<Record<string, number>>;

  /**
   * Преферированный механизм (Спринт 2.1, см. docs/FILTERS_IMPROVEMENT_PLAN.md):
   * выгружает один раз все места с минимальным набором полей, FiltersModal
   * сам считает все счётчики (kinds / categories / tags / total) на клиенте
   * через computeFilterCounts.
   *
   * Если этот prop передан — `getKindCount`/`getCategoryCount`/`getFilteredCount`
   * НЕ вызываются (они остаются опциональным fallback'ом для страниц, которые
   * ещё не мигрировали).
   */
  getFilterPlaces?: () => Promise<FilterablePlace[]>;
  cityCoordsMap?: Map<string, { lat: number | null; lng: number | null }>;

  // Optional: user access level - used to determine if Premium filter should be shown
  userAccess?: UserAccess;
  
  // Optional: callback to reset all filters (cities, categories, tags, search query, premium/hidden/vibe toggles)
  onResetAll?: () => void;

  /**
   * Скрыть секцию TYPE (Locations/Experiences/Services).
   * Используется страницами, где тип карточки управляется не модалом, а
   * чем-то другим (например, главная использует табы `?tab=services|experiences`).
   * Если TYPE показан, но страница игнорирует `activeFilters.kinds` —
   * это бага: юзер выбирает «Experiences», а в результатах локации.
   *
   * NB: на главной TYPE НЕ скрывают — там вместо этого `singleKindMode` +
   * страница перехватывает изменение kinds и синхронизирует с табом.
   */
  hideKindFilter?: boolean;
  /**
   * Single-select режим для TYPE: ровно один тип выбран всегда, клик по
   * другому — replace, не toggle. Пустого состояния нет. Используется на
   * страницах, где тип карточки — это первичный навигационный признак
   * (главная: ?tab=places|services|experiences). Категории при этом
   * показываются только для выбранного типа.
   */
  singleKindMode?: boolean;
};

export default function FiltersModal({
  isOpen,
  onClose,
  onApply,
  appliedFilters,
  appliedCities,
  onCitiesChange: _onCitiesChange,
  getFilteredCount,
  getCategoryCount,
  getKindCount,
  getAvailableTags,
  getTagCounts,
  getFilterPlaces,
  cityCoordsMap,
  userAccess,
  onResetAll,
  hideKindFilter,
  singleKindMode,
}: FiltersModalProps) {
  // Ensure appliedFilters is always defined
  const safeAppliedFilters: ActiveFilters = useMemo(
    () =>
      appliedFilters || {
        categories: [],
        sort: null,
        tags: [],
        premium: false,
      },
    [appliedFilters],
  );
  
  // Draft state (changes while modal is open)
  const [draftFilters, setDraftFilters] = useState<ActiveFilters>(safeAppliedFilters);
  
  // Draft cities state (changes while modal is open)
  const safeAppliedCities = useMemo(() => appliedCities || [], [appliedCities]);
  const [draftCities, setDraftCities] = useState<string[]>(safeAppliedCities);
  
  // State for filtered count (can be async)
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  
  // Category counts
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  // Kind counts (Locations / Services / Experiences)
  const [kindCounts, setKindCounts] = useState<Partial<Record<'location' | 'service' | 'experience', number>>>({});
  // Available tags and tag counts
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});

  // Спринт 2.1: один SELECT при открытии (если getFilterPlaces передан).
  // Все 4 типа счётчиков считаются локально на этом массиве через computeFilterCounts.
  const [placesForCounts, setPlacesForCounts] = useState<FilterablePlace[] | null>(null);
  // Используем клиентский reduce только если loader передан.
  const useClientReduce = !!getFilterPlaces;
  
  // Use ref to store getFilteredCount to avoid dependency issues
  const getFilteredCountRef = useRef(getFilteredCount);
  useEffect(() => {
    getFilteredCountRef.current = getFilteredCount;
  }, [getFilteredCount]);

  // Reset draft to applied only when modal opens (avoid deps that change every render)
  const appliedFiltersRef = useRef(safeAppliedFilters);
  const appliedCitiesRef = useRef(safeAppliedCities);
  useLayoutEffect(() => {
    appliedFiltersRef.current = safeAppliedFilters;
    appliedCitiesRef.current = safeAppliedCities;
  }, [safeAppliedFilters, safeAppliedCities]);
  useEffect(() => {
    if (isOpen) {
      let filtersToSet = appliedFiltersRef.current;
      filtersToSet = { ...filtersToSet, tags: filtersToSet.tags ?? [] };
      // If user doesn't have premium access, remove premium filter
      if (!userAccess?.hasPremium && !userAccess?.isAdmin) {
        filtersToSet = {
          ...filtersToSet,
          premium: false,
        };
      }
      setDraftFilters(filtersToSet);
      setDraftCities(appliedCitiesRef.current);
    }
  }, [isOpen, userAccess]);

  
  const draftPremium = !!draftFilters.premium;
  const draftKinds = draftFilters.kinds ?? [];
  // Стабильный ключ массива kinds, чтобы избежать лишних re-fetch'ей.
  const draftKindsKey = [...draftKinds].sort().join(",");

  // Спринт 2.1: один SELECT при открытии модала. Загруженные места живут до закрытия.
  // Это убирает 12+ round-trip'ов на category/kind counts.
  const getFilterPlacesRef = useRef(getFilterPlaces);
  useEffect(() => { getFilterPlacesRef.current = getFilterPlaces; }, [getFilterPlaces]);
  useEffect(() => {
    if (!isOpen) {
      setPlacesForCounts(null);
      return;
    }
    const loader = getFilterPlacesRef.current;
    if (!loader) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await loader();
        if (!cancelled) setPlacesForCounts(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setPlacesForCounts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // FALLBACK путь — если getFilterPlaces не передан, продолжаем через старые
  // отдельные RPC-вызовы (`getCategoryCount`, `getKindCount`). Это сохраняет
  // обратную совместимость для страниц, которые ещё не мигрировали.
  useEffect(() => {
    if (!isOpen) return;
    if (useClientReduce) return; // новый путь — категории посчитаются ниже
    if (!getCategoryCount) return;
    let cancelled = false;
    const loadCategoryCounts = async () => {
      const kindsParam = draftKindsKey
        ? (draftKindsKey.split(",") as ('location' | 'service' | 'experience')[])
        : undefined;
      const counts: Record<string, number> = {};
      for (const category of CATEGORIES) {
        try {
          const count = await getCategoryCount(category, draftPremium, kindsParam);
          if (cancelled) return;
          counts[category] = count;
        } catch {
          counts[category] = 0;
        }
      }
      if (!cancelled) setCategoryCounts(counts);
    };
    loadCategoryCounts();
    return () => { cancelled = true; };
  }, [isOpen, getCategoryCount, draftPremium, draftKindsKey, useClientReduce]);

  useEffect(() => {
    if (!isOpen) return;
    if (useClientReduce) return; // новый путь — kinds посчитаются ниже
    if (!getKindCount) return;
    let cancelled = false;
    const KINDS: Array<'location' | 'service' | 'experience'> = ['location', 'service', 'experience'];
    const load = async () => {
      const next: Partial<Record<'location' | 'service' | 'experience', number>> = {};
      for (const k of KINDS) {
        try {
          const c = await getKindCount(k, draftPremium);
          if (cancelled) return;
          next[k] = c;
        } catch {
          next[k] = 0;
        }
      }
      if (!cancelled) setKindCounts(next);
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, getKindCount, draftPremium, useClientReduce]);

  // Видимые секции категорий зависят от выбранного TYPE (Спринт 1.1).
  // Если kinds пустой → показываем все три таксономии с подзаголовками.
  // Если выбран один или несколько kinds → только их таксономии.
  const visibleCategorySections = useMemo<
    Array<{ key: 'location' | 'service' | 'experience'; heading: string; categories: readonly string[] }>
  >(() => {
    const all: Array<{ key: 'location' | 'service' | 'experience'; heading: string; categories: readonly string[] }> = [
      { key: 'location',   heading: 'PLACES',      categories: LOCATION_CATEGORIES },
      { key: 'service',    heading: 'SERVICES',    categories: SERVICE_CATEGORIES },
      { key: 'experience', heading: 'EXPERIENCES', categories: EXPERIENCE_CATEGORIES },
    ];
    if (draftKinds.length === 0) return all;
    return all.filter((s) => draftKinds.includes(s.key));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKindsKey]);

  // Плоский список всех видимых категорий — для computeFilterCounts.
  const visibleCategoriesFlat = useMemo<string[]>(() => {
    const out: string[] = [];
    for (const s of visibleCategorySections) out.push(...s.categories);
    return out;
  }, [visibleCategorySections]);

  // Ref for stable getAvailableTags / getTagCounts to avoid re-triggering on every render
  const getAvailableTagsRef = useRef(getAvailableTags);
  useEffect(() => { getAvailableTagsRef.current = getAvailableTags; }, [getAvailableTags]);
  const getTagCountsRef = useRef(getTagCounts);
  useEffect(() => { getTagCountsRef.current = getTagCounts; }, [getTagCounts]);

  // Спринт 2.1: клиентский compute counts (kinds + categories + tags + total).
  // Триггерится когда меняются draftFilters/places. Один проход без round-trip'ов.
  useEffect(() => {
    if (!isOpen || !useClientReduce) return;
    if (placesForCounts === null) return;
    const filtersForCount = {
      premium: draftPremium,
      categories: draftFilters.categories.length > 0 ? draftFilters.categories : undefined,
      tags: (draftFilters.tags ?? []).length > 0 ? (draftFilters.tags ?? []) : undefined,
      kinds: draftKinds.length > 0 ? draftKinds : undefined,
      // Города интегрируем здесь же, чтобы счётчики реагировали на city-фильтр.
      cities: draftCities.length > 0 ? draftCities : undefined,
      cityCoordsMap,
    };
    const counts = computeFilterCounts(placesForCounts, {
      filters: filtersForCount,
      allCategories: visibleCategoriesFlat,
      allTags: availableTags,
    });
    setCategoryCounts(counts.categories);
    setKindCounts(counts.kinds);
    // Если используем клиентский reduce, tagCounts тоже обновляем здесь —
    // обходим getTagCounts prop (синхронно с другими счётчиками).
    if (availableTags.length > 0) setTagCounts(counts.tags);
    // Синхронизируем filteredCount тоже (это перебьёт async-ветку ниже,
    // которая всё равно сделает то же самое — но синхронно дешевле).
    setFilteredCount(counts.total);
    setCountLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    useClientReduce,
    placesForCounts,
    draftPremium,
    draftFilters.categories,
    draftFilters.tags,
    draftKindsKey,
    visibleCategoriesFlat,
    availableTags,
    draftCities,
    cityCoordsMap,
  ]);

  // Load available tags when categories change (reactive to draftFilters.categories)
  const draftCategories = draftFilters.categories;
  useEffect(() => {
    if (!isOpen) return;
    const fn = getAvailableTagsRef.current;
    if (!fn) return;

    // No categories selected → hide tags
    if (draftCategories.length === 0) {
      setAvailableTags([]);
      setTagCounts({});
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const tags = await fn(draftCategories);
        if (cancelled) return;
        const tagsList = Array.isArray(tags) ? tags : [];
        setAvailableTags(tagsList);

        // Clean up orphaned selected tags that are no longer available
        setDraftFilters((prev) => {
          const currentTags = prev.tags ?? [];
          if (currentTags.length === 0) return prev;
          const tagsSet = new Set(tagsList);
          const filtered = currentTags.filter((t) => tagsSet.has(t));
          if (filtered.length === currentTags.length) return prev;
          return { ...prev, tags: filtered };
        });
      } catch {
        if (!cancelled) {
          setAvailableTags([]);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, draftCategories]);

  // Load tag counts in one batch when availableTags or premium changes
  useEffect(() => {
    if (!isOpen || availableTags.length === 0) return;
    // При useClientReduce теги уже посчитаны через computeFilterCounts —
    // не дублируем round-trip.
    if (useClientReduce) return;
    const fn = getTagCountsRef.current;
    if (!fn) return;

    let cancelled = false;
    const load = async () => {
      try {
        const result = fn(availableTags, draftCategories, draftPremium);
        const counts = result instanceof Promise ? await result : result;
        if (!cancelled) {
          setTagCounts(typeof counts === "object" && counts !== null ? counts : {});
        }
      } catch {
        if (!cancelled) setTagCounts({});
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, availableTags, draftCategories, draftPremium, useClientReduce]);
  
  // Уважаем системную настройку «уменьшить анимацию».
  // Inline-style не имеет media-query — детектим через matchMedia в JS.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  // Swipe-to-close: drag header вниз. Если ушли > 80px — закрываем.
  // Привязано к header (а не к content), чтобы не конфликтовать со скроллом
  // внутри списка категорий и тегов. Только мобайл — на десктопе модал в центре.
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartYRef = useRef<number | null>(null);
  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    if (prefersReducedMotion) return;
    dragStartYRef.current = e.touches[0]?.clientY ?? null;
  };
  const handleHeaderTouchMove = (e: React.TouchEvent) => {
    if (dragStartYRef.current === null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - dragStartYRef.current;
    if (dy > 0) setDragOffset(dy);
  };
  const handleHeaderTouchEnd = () => {
    if (dragStartYRef.current === null) return;
    const offset = dragOffset;
    dragStartYRef.current = null;
    if (offset > 80) {
      // Сразу сбрасываем offset, иначе при следующем открытии модал «дёрнется».
      setDragOffset(0);
      handleClose();
    } else {
      setDragOffset(0);
    }
  };
  // Сбрасываем drag-state при закрытии (на случай race condition).
  useEffect(() => { if (!isOpen) setDragOffset(0); }, [isOpen]);

  // Lock body scroll when modal is open (prevents iOS Safari scroll-through)
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    
    // Save current styles
    const originalBodyOverflow = body.style.overflow;
    const originalBodyPosition = body.style.position;
    const originalBodyTop = body.style.top;
    const originalBodyWidth = body.style.width;
    const originalHtmlOverflow = html.style.overflow;
    
    // Lock scroll
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    html.style.overflow = 'hidden';
    
    return () => {
      body.style.overflow = originalBodyOverflow;
      body.style.position = originalBodyPosition;
      body.style.top = originalBodyTop;
      body.style.width = originalBodyWidth;
      html.style.overflow = originalHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Update count when draftFilters change
  useEffect(() => {
    // Всегда вызываем useEffect, но проверяем условия внутри
    if (!isOpen) {
      setFilteredCount(null);
      setCountLoading(false);
      return;
    }
    // При useClientReduce — total уже считается в client-compute useEffect выше.
    if (useClientReduce) return;

    const getCountFn = getFilteredCountRef.current;
    if (!getCountFn) {
      setFilteredCount(null);
      setCountLoading(false);
      return;
    }
    
    setCountLoading(true);
    // Передаем выбранные города для правильного подсчета
    const result = getCountFn(draftFilters, draftCities);
    
    if (result instanceof Promise) {
      result
        .then(count => {
          setFilteredCount(count);
          setCountLoading(false);
        })
        .catch((error: unknown) => {
          const err =
            error && typeof error === "object"
              ? (error as { message?: string; name?: string; code?: string })
              : { message: String(error) };
          console.error("Error getting filtered count:", {
            message: err.message,
            name: err.name,
            code: err.code,
          });
          setFilteredCount(null);
          setCountLoading(false);
        });
    } else {
      setFilteredCount(result);
      setCountLoading(false);
    }
  }, [draftFilters, draftCities, isOpen, useClientReduce]);

  if (!isOpen) return null;

  const handleToggleCategory = (category: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  // Unused - kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleSortChange = (sort: string | null) => {
    setDraftFilters((prev) => ({
      ...prev,
      sort: prev.sort === sort ? null : sort,
    }));
  };
  
  const handleTogglePremium = () => {
    setDraftFilters((prev) => ({
      ...prev,
      premium: !prev.premium,
    }));
  };


  const handleToggleTag = (tag: string) => {
    setDraftFilters((prev) => {
      const tags = prev.tags ?? [];
      const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
      return { ...prev, tags: next };
    });
  };
  
  const handleClearAll = () => {
    // If onResetAll callback is provided, use it to reset everything (cities, search, tags, filters)
    if (onResetAll) {
      onResetAll();
      onClose();
      return;
    }
    
    // Otherwise, just reset filters in modal (backward compatibility)
    const clearedFilters: ActiveFilters = {
      categories: [],
      sort: null,
      tags: [],
      premium: false,
    };
    setDraftFilters(clearedFilters);
    // Immediately apply cleared filters and close modal
    onApply(clearedFilters);
    onClose();
  };
  
  // Unused - kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleRemoveFilter = (type: "city" | "category" | "premium", value?: string) => {
    if (type === "category" && value) {
      setDraftFilters((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c !== value),
      }));
    } else if (type === "premium") {
      setDraftFilters((prev) => ({
        ...prev,
        premium: false,
      }));
    }
  };

  const handleApply = () => {
    // Применяем фильтры и обновляем родительский компонент
    onApply(draftFilters);
    
    // Обновляем города в родительском компоненте
    // Важно: вызываем это ДО onClose, чтобы состояние обновилось до закрытия модального окна
    if (_onCitiesChange) {
      if (process.env.NODE_ENV === 'development') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[FiltersModal] handleApply: calling onCitiesChange with:', draftCities);
        }
      }
      _onCitiesChange(draftCities);
    }
    
    onClose();
  };

  const handleClose = () => {
    // Reset draft to applied state
    setDraftFilters(safeAppliedFilters);
    onClose();
  };

  // Unused - kept for potential future use (e.g., disable apply button when no changes)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hasChanges =
    JSON.stringify(draftFilters) !== JSON.stringify(safeAppliedFilters);
  
  // Get applied filters for display
  const appliedFiltersList: Array<{ type: "city" | "category" | "tag" | "premium"; label: string; value?: string }> = [];
  if (draftFilters.premium) {
    appliedFiltersList.push({ type: "premium", label: "Premium" });
  }
  draftFilters.categories.forEach((cat) => {
    appliedFiltersList.push({ type: "category", label: cat, value: cat });
  });
  (draftFilters.tags ?? []).forEach((tag) => {
    appliedFiltersList.push({ type: "tag", label: tag, value: tag });
  });

  // Get category emoji
  const getCategoryEmoji = (category: string) => {
    // Match any emoji at the start (including ✨, 🤫, etc.)
    const emojiMatch = category.match(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
    return emojiMatch ? emojiMatch[0] : "📍";
  };
  

  const modalEl = (
    <div className="fixed inset-0 z-[9999] flex items-end lg:items-center justify-center" aria-modal="true" role="dialog">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm lg:bg-black/50"
        onClick={handleClose}
        onTouchMove={(e) => e.preventDefault()}
        style={{ touchAction: 'none' }}
      />

      {/* Modal - Desktop: centered, Mobile: bottom sheet */}
      <div className="relative w-full lg:w-[600px] lg:max-w-[600px] lg:max-h-[85vh] lg:mx-4 lg:rounded-2xl bg-white flex flex-col border-t lg:border border-[#ECEEE4] lg:animate-none shadow-sm"
           style={{
             maxHeight: '90vh',
             height: 'auto',
             minHeight: '50vh',
             borderTopLeftRadius: '1rem',
             borderTopRightRadius: '1rem',
             // На десктопе translateY всегда 0 (window.matchMedia(min-width:1024px)
             // не нужен — touch events на десктопе не стреляют, dragOffset = 0).
             transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
             // Анимация slide-up при появлении; во время swipe — мгновенный transform,
             // после отпускания — плавный возврат за 0.2s. Блокируем при reduced-motion.
             transition: prefersReducedMotion
               ? undefined
               : (dragStartYRef.current === null && dragOffset === 0 ? 'transform 0.2s ease-out' : undefined),
             animation: prefersReducedMotion ? undefined : 'slide-up 0.3s ease-out',
           }}>
        {/* Header — drag-handle для swipe-to-close на мобайле */}
        <div
          className="px-6 pt-5 pb-4 border-b border-[#ECEEE4] flex-shrink-0"
          onTouchStart={handleHeaderTouchStart}
          onTouchMove={handleHeaderTouchMove}
          onTouchEnd={handleHeaderTouchEnd}
          onTouchCancel={handleHeaderTouchEnd}
        >
          {/* Mobile: Drag handle */}
          <div className="lg:hidden flex justify-center mb-3">
            <div className="w-12 h-1.5 bg-[#ECEEE4] rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-[#1F2A1F] font-fraunces">Filters</h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full hover:bg-[#FAFAF7] transition-colors flex items-center justify-center text-[#1F2A1F]"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 pt-1.5 pb-6 space-y-6 min-h-0" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {/* Premium Toggle - Only visible for admin and premium users */}
          {(userAccess?.hasPremium || userAccess?.isAdmin) && (
            <div>
              <button
                onClick={handleTogglePremium}
                className="w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 border-[#ECEEE4] bg-white transition-all hover:bg-[#FAFAF7]"
                role="switch"
                aria-checked={!!draftFilters.premium}
                aria-label="Only Premium places"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">⭐</span>
                  <span className="text-sm font-medium text-[#1F2A1F]">Only Premium places</span>
                </div>
                <div
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                    draftFilters.premium ? "bg-[#8F9E4F]" : "bg-[#D1D5C4]"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      draftFilters.premium ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </div>
              </button>
            </div>
          )}

          {/* Kind Section — три типа карточек: Locations / Services / Experiences.
              Скрыта на страницах, которые управляют kind не модалом, а табами (например, главная). */}
          {!hideKindFilter && (
          <div>
            <h3 className="text-xs font-semibold text-[#6F7A5A] uppercase tracking-wide mb-4">TYPE</h3>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: "location",   emoji: "📍", label: "Locations" },
                { value: "experience", emoji: "✨", label: "Experiences" },
                { value: "service",    emoji: "🛠", label: "Services" },
              ] as const).map((opt) => {
                const isSelected = (draftFilters.kinds ?? []).includes(opt.value);
                const count = kindCounts[opt.value];
                const isDisabled = !isSelected && count === 0;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={isSelected}
                    aria-disabled={isDisabled || undefined}
                    onClick={() => {
                      if (isDisabled) return;
                      setDraftFilters((prev) => {
                        const current = prev.kinds ?? [];
                        // singleKindMode: ровно один тип всегда выбран → клик
                        // по другому всегда replace, deselect невозможен.
                        if (singleKindMode) {
                          if (current.length === 1 && current[0] === opt.value) return prev;
                          return { ...prev, kinds: [opt.value] };
                        }
                        // Обычный режим — multi-toggle.
                        return {
                          ...prev,
                          kinds: current.includes(opt.value)
                            ? current.filter((k) => k !== opt.value)
                            : [...current, opt.value],
                        };
                      });
                    }}
                    className={`relative flex flex-col items-center justify-center px-2 py-4 rounded-xl border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-2 ${
                      isSelected
                        ? "border-[#8F9E4F] bg-[#F4F6EF]"
                        : isDisabled
                          ? "border-[#ECEEE4] bg-white opacity-40 cursor-not-allowed"
                          : "border-[#ECEEE4] bg-white hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
                    }`}
                  >
                    {count !== undefined && (
                      <span className="absolute top-1.5 right-2 text-xs font-medium text-[#6F7A5A]">
                        {count}
                      </span>
                    )}
                    <span className="text-2xl mb-1.5" aria-hidden="true">{opt.emoji}</span>
                    <span className="text-sm font-medium text-[#1F2A1F] text-center leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {/* В singleKindMode ровно один выбран — хинт неуместен. */}
            {!singleKindMode && (
              <p className="mt-3 text-xs text-[#6F7A5A]">
                Leave empty to show all types.
              </p>
            )}
          </div>
          )}

          {/* Category Section — секции по выбранному TYPE (Спринт 1.1).
              Если kinds пустой → все три таксономии с подзаголовками PLACES / SERVICES / EXPERIENCES. */}
          {visibleCategorySections.map((section) => (
            <div key={section.key}>
              <h3 className="text-xs font-semibold text-[#6F7A5A] uppercase tracking-wide mb-4">
                {visibleCategorySections.length > 1 ? `${section.heading} · CATEGORY` : 'CATEGORY'}
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {section.categories.map((category) => {
                  const isSelected = draftFilters.categories.includes(category);
                  const count = categoryCounts[category];
                  const isDisabled = !isSelected && count === 0;
                  const emoji = getCategoryEmoji(category);
                  const label = category.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+\s*/u, "").trim();
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={isSelected}
                      aria-disabled={isDisabled || undefined}
                      onClick={() => {
                        if (isDisabled) return;
                        handleToggleCategory(category);
                      }}
                      className={`relative flex flex-col items-center justify-center px-2 py-4 rounded-xl border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-2 ${
                        isSelected
                          ? "border-[#8F9E4F] bg-[#F4F6EF]"
                          : isDisabled
                            ? "border-[#ECEEE4] bg-white opacity-40 cursor-not-allowed"
                            : "border-[#ECEEE4] bg-white hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
                      }`}
                    >
                      {count !== undefined && (
                        <span className="absolute top-1.5 right-2 text-xs font-medium text-[#6F7A5A]">
                          {count}
                        </span>
                      )}
                      <span className="text-2xl mb-1.5" aria-hidden="true">{emoji}</span>
                      <span className="text-sm font-medium text-[#1F2A1F] text-center leading-tight">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Tags Section — visible only when categories are selected */}
          {draftFilters.categories.length > 0 && availableTags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#6F7A5A] uppercase tracking-wide mb-4">TAGS</h3>
              {/* На очень узких экранах (<360px, например iPhone SE 1) — 3 колонки,
                  чтобы touch target ≥ ~85px. Иначе 4 колонки как раньше. */}
              <div className="grid grid-cols-3 min-[360px]:grid-cols-4 gap-2">
                {availableTags.map((tag) => {
                  const isSelected = (draftFilters.tags ?? []).includes(tag);
                  const count = tagCounts[tag];
                  const isDisabled = !isSelected && count === 0;
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={isSelected}
                      aria-disabled={isDisabled || undefined}
                      onClick={() => {
                        if (isDisabled) return;
                        handleToggleTag(tag);
                      }}
                      className={`relative flex flex-col items-center justify-center px-1 py-3 rounded-xl border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-2 ${
                        isSelected
                          ? "border-[#8F9E4F] bg-[#F4F6EF]"
                          : isDisabled
                            ? "border-[#ECEEE4] bg-white opacity-40 cursor-not-allowed"
                            : "border-[#ECEEE4] bg-white hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
                      }`}
                    >
                      {count !== undefined && (
                        <span className="absolute top-1 right-1.5 text-xs font-medium text-[#6F7A5A]">
                          {count}
                        </span>
                      )}
                      <span className="text-lg mb-1" aria-hidden="true">{getTagEmoji(tag)}</span>
                      <span className="text-sm font-medium text-[#1F2A1F] text-center leading-tight line-clamp-2">{stripTagEmoji(tag)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer (sticky) */}
        <div className="px-6 py-4 border-t border-[#ECEEE4] bg-white lg:rounded-b-2xl flex-shrink-0"
             style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {/* Сообщение, когда комбинация фильтров даёт 0 — даём юзеру явный путь к Reset. */}
          {!countLoading && filteredCount === 0 && (
            <p className="mb-3 text-xs text-[#8B6F00] bg-[#FFF7E0] border border-[#F0E0A0] rounded-lg px-3 py-2 text-center">
              No places match these filters. Try removing one.
            </p>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={handleClearAll}
              className="text-sm font-medium text-[#6F7A5A] hover:text-[#1F2A1F] underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-2 rounded"
            >
              Reset all
            </button>
            {/* Когда счётчик = 0 — кнопка Apply превращается в активный Reset filters,
                чтобы юзер не упирался в disabled-стейт без выхода. */}
            {!countLoading && filteredCount === 0 ? (
              <button
                onClick={handleClearAll}
                type="button"
                className="px-5 h-11 rounded-xl font-medium text-sm transition-all flex items-center gap-2 bg-[#8F9E4F] text-white hover:bg-[#7A8A42] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-2"
              >
                Reset filters
              </button>
            ) : (
              <button
                onClick={handleApply}
                disabled={countLoading || filteredCount === null}
                type="button"
                className={`px-5 h-11 rounded-xl font-medium text-sm transition-all flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-2 ${
                  !countLoading && filteredCount !== null && filteredCount > 0
                    ? "bg-[#8F9E4F] text-white hover:bg-[#7A8A42] shadow-sm"
                    : "bg-[#DADDD0] text-white cursor-not-allowed"
                }`}
              >
                {draftFilters.premium && (
                  <svg className="w-4 h-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                )}
                {countLoading
                  ? "Loading..."
                  : filteredCount !== null
                  ? `Show ${filteredCount} ${filteredCount === 1 ? "place" : "places"}`
                  : "Apply"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(modalEl, document.body) : null;
}

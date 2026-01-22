"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import PlaceCard from "./PlaceCard";
import FavoriteIcon from "./FavoriteIcon";
import { supabase } from "../lib/supabase";
import { HomeSectionFilter } from "../constants/homeSections";
import { type UserAccess, isPlacePremium, canUserViewPlace } from "../lib/access";
import Icon from "./Icon";

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
  created_by?: string | null;
  access_level?: string | null;
  is_premium?: boolean | null;
  premium_only?: boolean | null;
  visibility?: string | null;
};

type HomeSectionProps = {
  section: HomeSectionFilter;
  userId?: string | null;
  favorites?: Set<string>;
  userAccess?: UserAccess;
  onToggleFavorite?: (placeId: string, e: React.MouseEvent) => void;
  onTagClick?: (tag: string) => void;
};

import { getRecentlyViewedPlaceIds } from "../utils";

export default function HomeSection({ section, userId, favorites, userAccess, onToggleFavorite, onTagClick }: HomeSectionProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Create stable request key for deduplication
  const requestKey = useMemo(() => {
    return JSON.stringify({
      title: section.title,
      city: section.city || '',
      tag: section.tag || '',
      categories: section.categories ? section.categories.join(',') : '',
      daysAgo: section.daysAgo || 0,
      sort: section.sort || '',
      recentlyViewed: section.recentlyViewed || false,
    });
  }, [section.title, section.city, section.tag, section.categories?.join(','), section.daysAgo, section.sort, section.recentlyViewed]);

  useEffect(() => {
    let alive = true;
    let currentRequestId = Date.now();

    async function loadPlaces() {
      if (!alive) {
        return;
      }

      const requestId = currentRequestId;
      setLoading(true);
      
      try {
        // Special handling for "Recently viewed" section
        if (section.recentlyViewed) {
          const recentlyViewedIds = getRecentlyViewedPlaceIds();
          
          if (recentlyViewedIds.length === 0) {
            if (alive && currentRequestId === requestId) {
              setPlaces([]);
              setLoading(false);
            }
            return;
          }

          // Load places by IDs, preserving the order from localStorage
          // Only select fields needed for PlaceCard display
          try {
            const { data, error } = await supabase
              .from("places")
              .select("id,title,description,city,country,address,cover_url,categories,tags,created_by,created_at,lat,lng,access_level,visibility")
              .in("id", recentlyViewedIds)
              .limit(10);

            // Check if this request is still current
            if (!alive || currentRequestId !== requestId) {
              return;
            }

            if (error) {
              // Silently ignore AbortError
              if (error.message?.includes('abort') || error.name === 'AbortError' || (error as any).code === 'ECONNABORTED') {
                return;
              }

              // Completely skip logging if error is empty
              // First check if error object is empty by stringifying
              let isEmpty = false;
              try {
                const errorStr = JSON.stringify(error);
                isEmpty = errorStr === '{}';
              } catch {
                // If stringify fails, check fields
                const msg = error.message ? String(error.message).trim() : '';
                const code = error.code ? String(error.code).trim() : '';
                const details = error.details ? String(error.details).trim() : '';
                const hint = error.hint ? String(error.hint).trim() : '';
                isEmpty = !(msg.length > 0 || code.length > 0 || details.length > 0 || hint.length > 0);
              }
              
              if (!isEmpty) {
                // Check individual fields
                const msg = error.message ? String(error.message).trim() : '';
                const code = error.code ? String(error.code).trim() : '';
                const details = error.details ? String(error.details).trim() : '';
                const hint = error.hint ? String(error.hint).trim() : '';
                
                const hasContent = msg.length > 0 || code.length > 0 || details.length > 0 || hint.length > 0;
                
                if (hasContent) {
                  const errorObj: Record<string, any> = {};
                  if (msg) errorObj.message = msg;
                  if (code) errorObj.code = code;
                  if (details) errorObj.details = details;
                  if (hint) errorObj.hint = hint;
                  console.error("Error loading recently viewed places:", errorObj);
                }
              }
              // Silently handle empty errors - don't log at all
              if (alive && currentRequestId === requestId) {
                setPlaces([]);
              }
            } else {
              if (alive && currentRequestId === requestId) {
                // Sort by the order in recentlyViewedIds (most recent first)
                const placesMap = new Map((data || []).map((p: any) => [p.id, p]));
                const orderedPlaces = recentlyViewedIds
                  .map(id => placesMap.get(id))
                  .filter((p): p is Place => p !== undefined)
                  .slice(0, 10);
                setPlaces(orderedPlaces);
              }
            }
          } catch (err: any) {
            // Silently ignore AbortError
            if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
              return;
            }
            // Handle unexpected errors
            console.error("Unexpected error loading recently viewed places:", err instanceof Error ? err.message : String(err));
            if (alive && currentRequestId === requestId) {
              setPlaces([]);
            }
          }
          
          if (alive && currentRequestId === requestId) {
            setLoading(false);
          }
          return;
        }
      
      // Only select fields needed for PlaceCard display
      let query = supabase.from("places").select("id,title,description,city,country,address,cover_url,categories,tags,created_by,created_at,lat,lng,access_level,visibility");

      // Фильтр по городу (use city_name_cached if available, fallback to city)
      if (section.city) {
        query = query.or(`city_name_cached.eq.${section.city},city.eq.${section.city}`);
      }

      // Фильтр по категориям
      if (section.categories && section.categories.length > 0) {
        query = query.overlaps("categories", section.categories);
      }

      // Фильтр по тегу
      if (section.tag) {
        query = query.contains("tags", [section.tag]);
      }

      // Фильтр по дате (для "New this week")
      if (section.daysAgo) {
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - section.daysAgo);
        query = query.gte("created_at", dateThreshold.toISOString());
      }

      // Сортировка
      if (section.sort === "popular") {
        // Для популярных - сортируем по количеству реакций
        // Пока используем created_at как fallback, можно улучшить позже
        query = query.order("created_at", { ascending: false });
      } else if (section.sort === "newest" || section.daysAgo) {
        query = query.order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      // Лимит для секции
      query = query.limit(10);

      try {
        const { data, error } = await query;

        // Check if this request is still current
        if (!alive || currentRequestId !== requestId) {
          return;
        }

        if (error) {
          // Silently ignore AbortError
          if (error.message?.includes('abort') || error.name === 'AbortError' || (error as any).code === 'ECONNABORTED') {
            return;
          }

          // Completely skip logging if error is empty
          // First check if error object is empty by stringifying
          let isEmpty = false;
          try {
            const errorStr = JSON.stringify(error);
            isEmpty = errorStr === '{}';
          } catch {
            // If stringify fails, check fields
            const msg = error.message ? String(error.message).trim() : '';
            const code = error.code ? String(error.code).trim() : '';
            const details = error.details ? String(error.details).trim() : '';
            const hint = error.hint ? String(error.hint).trim() : '';
            isEmpty = !(msg.length > 0 || code.length > 0 || details.length > 0 || hint.length > 0);
          }
          
          if (!isEmpty) {
            // Check individual fields
            const msg = error.message ? String(error.message).trim() : '';
            const code = error.code ? String(error.code).trim() : '';
            const details = error.details ? String(error.details).trim() : '';
            const hint = error.hint ? String(error.hint).trim() : '';
            
            const hasContent = msg.length > 0 || code.length > 0 || details.length > 0 || hint.length > 0;
            
            if (hasContent) {
              const errorObj: Record<string, any> = {};
              if (msg) errorObj.message = msg;
              if (code) errorObj.code = code;
              if (details) errorObj.details = details;
              if (hint) errorObj.hint = hint;
              console.error("Error loading places for section:", section.title, errorObj);
            }
          }
          // Silently handle empty errors - don't log at all
          if (alive && currentRequestId === requestId) {
            setPlaces([]);
          }
        } else {
          if (alive && currentRequestId === requestId) {
            setPlaces((data || []) as Place[]);
          }
        }
      } catch (err: any) {
        // Silently ignore AbortError
        if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
          return;
        }
        // Handle unexpected errors
        console.error("Unexpected error loading places for section:", section.title, err instanceof Error ? err.message : String(err));
        if (alive && currentRequestId === requestId) {
          setPlaces([]);
        }
      }
      
      if (alive && currentRequestId === requestId) {
        setLoading(false);
      }
      } catch (err: any) {
        // Silently ignore AbortError
        if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
          return;
        }
        // Top-level error handler - ensure loading state is always reset
        console.error("Critical error in loadPlaces:", err instanceof Error ? err.message : String(err));
        if (alive && currentRequestId === requestId) {
          setPlaces([]);
          setLoading(false);
        }
      }
    }

    loadPlaces();

    return () => {
      alive = false;
      currentRequestId = Date.now(); // Invalidate current request
    };
  }, [requestKey]); // Use stable request key instead of individual dependencies

  // For "Recently viewed" section, reload when page becomes visible (user returns from viewing a place)
  useEffect(() => {
    if (!section.recentlyViewed) return;

    let alive = true;
    let currentRequestId = Date.now();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && alive) {
        // Reload places when page becomes visible
        async function reloadPlaces() {
          if (!alive) return;
          
          const requestId = Date.now();
          currentRequestId = requestId;
          
          try {
            const recentlyViewedIds = getRecentlyViewedPlaceIds();
            
            if (recentlyViewedIds.length === 0) {
              if (alive && currentRequestId === requestId) {
                setPlaces([]);
              }
              return;
            }

            const { data, error } = await supabase
              .from("places")
              .select("id,title,description,city,country,address,cover_url,categories,tags,created_by,created_at,lat,lng,access_level,visibility")
              .in("id", recentlyViewedIds)
              .limit(10);

            if (!alive || currentRequestId !== requestId) {
              return;
            }

            if (error) {
              // Silently ignore AbortError
              if (error.message?.includes('abort') || error.name === 'AbortError' || (error as any).code === 'ECONNABORTED') {
                return;
              }

              // Completely skip logging if error is empty
              // First check if error object is empty by stringifying
              let isEmpty = false;
              try {
                const errorStr = JSON.stringify(error);
                isEmpty = errorStr === '{}';
              } catch {
                // If stringify fails, check fields
                const msg = error.message ? String(error.message).trim() : '';
                const code = error.code ? String(error.code).trim() : '';
                const details = error.details ? String(error.details).trim() : '';
                const hint = error.hint ? String(error.hint).trim() : '';
                isEmpty = !(msg.length > 0 || code.length > 0 || details.length > 0 || hint.length > 0);
              }
              
              if (!isEmpty) {
                // Check individual fields
                const msg = error.message ? String(error.message).trim() : '';
                const code = error.code ? String(error.code).trim() : '';
                const details = error.details ? String(error.details).trim() : '';
                const hint = error.hint ? String(error.hint).trim() : '';
                
                const hasContent = msg.length > 0 || code.length > 0 || details.length > 0 || hint.length > 0;
                
                if (hasContent) {
                  const errorObj: Record<string, any> = {};
                  if (msg) errorObj.message = msg;
                  if (code) errorObj.code = code;
                  if (details) errorObj.details = details;
                  if (hint) errorObj.hint = hint;
                  console.error("Error reloading recently viewed places:", errorObj);
                }
              }
              // Silently handle empty errors - don't log at all
              // Don't clear places on error, keep existing state
              return;
            }

            if (alive && currentRequestId === requestId && data) {
              const placesMap = new Map((data || []).map((p: any) => [p.id, p]));
              const orderedPlaces = recentlyViewedIds
                .map(id => placesMap.get(id))
                .filter((p): p is Place => p !== undefined)
                .slice(0, 10);
              setPlaces(orderedPlaces);
            }
          } catch (err: any) {
            // Silently ignore AbortError
            if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
              return;
            }
            // Handle unexpected errors
            console.error("Unexpected error reloading recently viewed places:", err instanceof Error ? err.message : String(err));
          }
        }
        reloadPlaces();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      alive = false;
      currentRequestId = Date.now(); // Invalidate current request
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [section.recentlyViewed]);

  // Calculate locked premium places for Haunted Gem indexing
  const defaultUserAccess: UserAccess = userAccess ?? { 
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

  // Формируем URL для "See all"
  const getSeeAllUrl = () => {
    // For "Recently viewed", just go to map page
    if (section.recentlyViewed) {
      return "/map";
    }
    
    const params = new URLSearchParams();
    if (section.city) {
      params.set("city", section.city);
    }
    if (section.categories && section.categories.length > 0) {
      // Используем categories (CSV) для поддержки нескольких категорий
      params.set("categories", section.categories.map(c => encodeURIComponent(c)).join(','));
      params.set("ref", "home");
    }
    return `/map?${params.toString()}`;
  };

  // Функции для горизонтальной прокрутки
  // Прокручиваем на 2 карточки + 2 gap
  const scrollLeft = () => {
    if (scrollContainerRef.current && typeof window !== 'undefined') {
      const container = scrollContainerRef.current;
      const cardWidth = container.querySelector('[data-card]')?.clientWidth || 280;
      const gapValue = getComputedStyle(document.documentElement).getPropertyValue('--home-carousel-gap').trim();
      const gap = gapValue ? parseInt(gapValue) : 16;
      const scrollAmount = cardWidth * 2 + gap * 2;
      container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current && typeof window !== 'undefined') {
      const container = scrollContainerRef.current;
      const cardWidth = container.querySelector('[data-card]')?.clientWidth || 280;
      const gapValue = getComputedStyle(document.documentElement).getPropertyValue('--home-carousel-gap').trim();
      const gap = gapValue ? parseInt(gapValue) : 16;
      const scrollAmount = cardWidth * 2 + gap * 2;
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="mb-6 min-[600px]:mb-8 min-[900px]:mb-9">
        <div className="flex items-center justify-between mb-3 min-[600px]:mb-4 h-10 min-[600px]:h-12">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
        </div>
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 pb-2" style={{ width: "max-content" }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex-shrink-0" style={{ width: 'var(--home-card-width, 220px)' }}>
                <div className="w-full">
                  <div className="relative w-full mb-2" style={{ paddingBottom: '75%' }}>
                    <div className="absolute inset-0 rounded-2xl bg-gray-200 animate-pulse" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Don't hide section if places are empty - let it show empty state or just return null silently
  // Only hide if it's not a critical section (like "Recently viewed" can be empty)
  if (places.length === 0 && !section.recentlyViewed) {
    return null;
  }
  
  // For "Recently viewed", show empty state if no places
  if (places.length === 0 && section.recentlyViewed) {
    return null; // Hide "Recently viewed" if empty
  }

  return (
    <div className="mb-6 min-[600px]:mb-8 min-[900px]:mb-9">
      {/* Header: Title + See all arrow + Scroll arrows (desktop only) */}
      <div className="flex items-center justify-between mb-3 min-[600px]:mb-4 h-10 min-[600px]:h-12">
        {/* Left: Title + See all arrow (desktop) or just Title (mobile) */}
        <div className="flex items-center gap-2">
          <h2 className="font-fraunces text-lg min-[600px]:text-xl font-semibold text-[#1F2A1F]">{section.title}</h2>
          {/* See all arrow - only on desktop, next to title */}
          <Link
            href={getSeeAllUrl()}
            className="hidden min-[900px]:flex w-8 h-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] items-center justify-center transition-colors"
            aria-label="See all"
          >
            <Icon name="forward" size={16} className="text-[#1F2A1F]" />
          </Link>
        </div>
        {/* Right: See all arrow (mobile) or Scroll arrows (desktop) */}
        <div className="flex items-center gap-2">
          {/* Стрелки прокрутки только на desktop >= 900px и если карточек >= 7 */}
          {places.length >= 7 && (
            <div className="hidden min-[900px]:flex items-center gap-2">
              <button
                onClick={scrollLeft}
                className="w-8 h-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] flex items-center justify-center transition-colors"
                aria-label="Scroll left"
              >
                <svg className="w-4 h-4 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={scrollRight}
                className="w-8 h-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] flex items-center justify-center transition-colors"
                aria-label="Scroll right"
              >
                <svg className="w-4 h-4 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
          {/* See all arrow - only on mobile, on the right */}
          <Link
            href={getSeeAllUrl()}
            className="min-[900px]:hidden w-8 h-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] flex items-center justify-center transition-colors"
            aria-label="See all"
          >
            <Icon name="forward" size={16} className="text-[#1F2A1F]" />
          </Link>
        </div>
      </div>
      
      {/* Carousel container */}
      <div className="relative">
        <div 
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-hide max-[599px]:-mr-6 min-[600px]:mr-0"
          style={{ 
            scrollPaddingLeft: 'var(--home-page-padding, 16px)',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            // Для "Recently viewed": ограничиваем ширину контейнера для 5 карточек на десктопе
            // Для остальных: 7 карточек + 6 gaps
            maxWidth: section.recentlyViewed 
              ? 'calc(5 * var(--recently-viewed-card-width, var(--home-card-width)) + 4 * var(--home-carousel-gap))'
              : 'calc(7 * var(--home-card-width) + 6 * var(--home-carousel-gap))'
          }}
        >
          <div 
            className="flex pb-2"
            style={{ 
              width: "max-content",
              gap: 'var(--home-carousel-gap, 12px)'
            }}
          >
            {places.map((place, index) => {
              const isFavorite = favorites?.has(place.id);
              
              // Get Haunted Gem index for locked premium places
              const hauntedGemIndex = lockedPlacesMap.get(place.id);
              
              // Вычисляем ширину карточки для "Recently viewed"
              const cardWidth = section.recentlyViewed 
                ? 'var(--recently-viewed-card-width, var(--home-card-width))'
                : 'var(--home-card-width, 220px)';
              
              return (
                <div 
                  key={place.id} 
                  data-card
                  className="flex-shrink-0"
                  style={{
                    width: cardWidth,
                    scrollSnapAlign: 'start'
                  }}
                >
                  <div className="[&_.place-card-image]:!pb-[100%]">
                    <PlaceCard
                      place={place}
                      userAccess={userAccess}
                      userId={userId}
                      isFavorite={isFavorite}
                      hauntedGemIndex={hauntedGemIndex}
                      favoriteButton={
                      userId && onToggleFavorite ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onToggleFavorite(place.id, e);
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
                      onTagClick={onTagClick}
                    />
                  </div>
                </div>
              );
            })}
            {/* "See all" карточка в конце - показываем только если карточек >= 7 */}
            {places.length >= 7 && (
              <Link href={getSeeAllUrl()}>
                <div 
                  data-card
                  className="flex-shrink-0 h-full"
                  style={{
                    width: 'var(--home-card-width, 220px)',
                    scrollSnapAlign: 'start'
                  }}
                >
                <div className="flex flex-col h-full rounded-2xl bg-white border border-[#ECEEE4] overflow-hidden transition-all duration-200 relative z-0 hover:scale-[1.02] cursor-pointer"
                     style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                  {/* Image collage section - aspect 1:1 */}
                  <div className="relative w-full aspect-square">
                    <div className="absolute inset-0 bg-gray-100 p-2 flex flex-wrap gap-1">
                      {places.slice(0, 3).map((place, idx) => (
                        place.cover_url ? (
                          <div 
                            key={place.id}
                            className={`${idx === 0 ? 'w-full h-1/2' : 'w-[calc(50%-4px)] h-1/2'} rounded-lg overflow-hidden`}
                          >
                            <img
                              src={place.cover_url}
                              alt={place.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : null
                      ))}
                      {places.length < 3 && (
                        <div className="w-full h-1/2 rounded-lg bg-gray-200 flex items-center justify-center">
                          <Icon name="photo" size={24} className="text-[#A8B096]" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Text section - фиксированная высота ~52px */}
                  <div className="p-3 min-[600px]:p-4 flex items-center justify-center" style={{ minHeight: '52px' }}>
                    <div className="text-center">
                      <div className="text-base min-[600px]:text-lg font-semibold text-[#1F2A1F]">See all</div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

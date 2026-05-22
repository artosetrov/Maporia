"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import PlaceCard from "./PlaceCard";
import FavoriteIcon from "./FavoriteIcon";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/supabase";
import { HomeSectionFilter } from "../constants/homeSections";
import { type UserAccess, isPlacePremium, canUserViewPlace } from "../lib/access";
import Icon from "./Icon";
import { HomeSectionSkeleton } from "./Skeleton";
import { getRecentlyViewedPlaceIds, sanitizePostgrestValue } from "../utils";
import type { PlaceListItem as Place } from "../types";
import { buildCityRadiusFilter, getCityCoords } from "../lib/cityRadius";
import { isHomeOfferReady } from "../lib/homeOfferReadiness";
import { useBatchPlaceData } from "../hooks/useBatchPlaceData";

function HomeSectionCollageImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={className}>
        <div className="w-full h-full rounded-lg bg-[#ECEEE4] flex items-center justify-center">
          <Icon name="photo" size={24} className="text-[#A8B096]" />
        </div>
      </div>
    );
  }
  // Using next/image instead of a raw <img>: server resizes the source
  // to the rendered width (collage thumbnails are ~110px wide), serves
  // WebP/AVIF, and lazy-loads off-screen tiles. Cuts cover image weight
  // for the home page from ~MBs to ~tens of KBs in typical cases.
  return (
    <div className={`relative ${className ?? ""}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 50vw, 220px"
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

type ProfileInterests = Pick<Database["public"]["Tables"]["profiles"]["Row"], "favorite_categories" | "favorite_tags">;

const EMPTY_CATEGORIES: string[] = [];
const HOME_SECTION_STALE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function normalizeMatchText(value: unknown): string {
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "string") return value;
  return "";
}

function sectionMatchesText(place: Place, section: HomeSectionFilter): boolean {
  const terms = section.matchText?.map((term) => term.trim().toLowerCase()).filter(Boolean) ?? [];
  if (terms.length === 0) return true;

  const haystack = [
    place.title,
    place.description,
    place.city,
    place.country,
    normalizeMatchText(place.categories),
    normalizeMatchText(place.tags),
  ]
    .join(" ")
    .toLowerCase();

  return section.matchMode === "all"
    ? terms.every((term) => haystack.includes(term))
    : terms.some((term) => haystack.includes(term));
}

type HomeSectionProps = {
  section: HomeSectionFilter;
  userId?: string | null;
  favorites?: Set<string>;
  userAccess?: UserAccess;
  onToggleFavorite?: (placeId: string, e: React.MouseEvent) => void;
  onTagClick?: (tag: string) => void;
  isFirst?: boolean;
  /**
   * Опциональный фильтр по типу карточки.
   * Используется на главной при переключении табов Locations/Services/Experiences.
   * Если не передан — секция показывает все типы (legacy behavior).
   */
  kindFilter?: "location" | "service" | "experience";
};

export default function HomeSection({ section, userId, favorites, userAccess, onToggleFavorite, onTagClick, isFirst = false, kindFilter }: HomeSectionProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const creatorIds = useMemo(
    () =>
      Array.from(
        new Set(
          places
            .map((place) => place.created_by)
            .filter((id): id is string => Boolean(id))
        )
      ),
    [places]
  );
  const noPhotoIds = useMemo<string[]>(() => [], []);
  // Home cards intentionally keep `showPhotoSlider={false}` and use cover_url,
  // so we batch creator profiles only and avoid fetching off-screen photos.
  const batchData = useBatchPlaceData(noPhotoIds, creatorIds);

  const sectionCategories = section.categories ?? EMPTY_CATEGORIES;
  const categoriesKey = sectionCategories.join(",");
  const [refreshKey, setRefreshKey] = useState(0);
  const defaultUserAccess = useMemo<UserAccess>(
    () =>
      userAccess ?? {
        role: "guest",
        plan: "free",
        hasPremium: false,
        isAdmin: false,
      },
    [userAccess],
  );

  // Fetch places when section or refresh key changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        if (section.recentlyViewed) {
          const recentlyViewedIds = getRecentlyViewedPlaceIds();
          if (recentlyViewedIds.length === 0) {
            if (!cancelled) {
              setPlaces([]);
              setLoading(false);
            }
            return;
          }
          let recentlyViewedQuery = supabase
            .from("places")
            .select("id,title,description,city,country,address,cover_url,categories,tags,created_by,created_at,lat,lng,access_level,visibility,kind,schedule,service_mode")
            .in("id", recentlyViewedIds)
            .eq("is_hidden", false);
          if (kindFilter) recentlyViewedQuery = recentlyViewedQuery.eq("kind", kindFilter);
          const { data, error } = await recentlyViewedQuery.limit(10);
          if (error) throw error;
          const offerReadyPlaces = ((data ?? []) as Place[]).filter(isHomeOfferReady);
          const placesMap = new Map(offerReadyPlaces.map((p) => [p.id, p]));
          const result = recentlyViewedIds
            .map(id => placesMap.get(id))
            .filter((p): p is Place => p !== undefined)
            .slice(0, 10);
          if (!cancelled) {
            setPlaces(result);
            setLoading(false);
          }
          return;
        }

        if (section.allListings) {
          let allQuery = supabase
            .from("places")
            .select("id,title,description,city,country,address,cover_url,categories,tags,created_by,created_at,lat,lng,access_level,visibility,kind,schedule,service_mode")
            .eq("is_hidden", false);
          if (section.city) {
            const coords = await getCityCoords(section.city);
            allQuery = allQuery.or(buildCityRadiusFilter(section.city, coords.lat, coords.lng));
          }
          if (kindFilter) {
            allQuery = allQuery.eq("kind", kindFilter);
          }
          allQuery = allQuery.order("created_at", { ascending: false }).limit(kindFilter === "location" ? 10 : 40);

          const { data, error } = await allQuery;
          if (error) throw error;
          if (!cancelled) {
            setPlaces(((data || []) as Place[]).filter(isHomeOfferReady).slice(0, 10));
            setLoading(false);
          }
          return;
        }

        // Recommended section - based on user interests
        if (section.recommended && userId) {
          // Load user profile with interests
          const { data: profileRaw } = await supabase
            .from("profiles")
            .select("favorite_categories, favorite_tags")
            .eq("id", userId)
            .maybeSingle();

          const profileData = profileRaw as ProfileInterests | null;
          if (!profileData) {
            if (!cancelled) {
              setPlaces([]);
              setLoading(false);
            }
            return;
          }

          const favoriteCategories = (profileData.favorite_categories || []) as string[];
          const favoriteTags = (profileData.favorite_tags || []) as string[];

          // If user has no interests, don't show recommended section
          if (favoriteCategories.length === 0 && favoriteTags.length === 0) {
            if (!cancelled) {
              setPlaces([]);
              setLoading(false);
            }
            return;
          }

          // Server-side prefilter: only fetch places that overlap with the
          // user's interests. Previously we fetched 100 rows blind and filtered
          // on the client — fine for a tiny dataset, painful as soon as the
          // catalog grows. We over-fetch a bit (40) so the relevance/recency
          // sort below still has room to choose from.
          const orParts: string[] = [];
          if (favoriteCategories.length > 0) {
            const cats = favoriteCategories.map((c) => `"${sanitizePostgrestValue(c)}"`).join(",");
            orParts.push(`categories.ov.{${cats}}`);
          }
          if (favoriteTags.length > 0) {
            const tags = favoriteTags.map((t) => `"${sanitizePostgrestValue(t)}"`).join(",");
            orParts.push(`tags.ov.{${tags}}`);
          }
          let recQuery = supabase
            .from("places")
            .select("id,title,description,city,country,address,cover_url,categories,tags,created_by,created_at,lat,lng,access_level,visibility,kind,schedule,service_mode")
            .eq("is_hidden", false);
          if (orParts.length > 0) {
            recQuery = recQuery.or(orParts.join(","));
          }
          if (kindFilter) recQuery = recQuery.eq("kind", kindFilter);
          recQuery = recQuery.limit(40);
          const { data: allPlaces, error } = await recQuery;
          if (error) throw error;

          if (!allPlaces) {
            if (!cancelled) {
              setPlaces([]);
              setLoading(false);
            }
            return;
          }

          // Filter places based on interests
          const recommendedPlaces = (allPlaces as Place[]).filter((place) => {
            if (!isHomeOfferReady(place)) return false;

            // Check if place matches user interests
            const matchesCategory = favoriteCategories.length > 0 &&
              place.categories &&
              place.categories.some((cat) => favoriteCategories.includes(cat));

            const matchesTag = favoriteTags.length > 0 &&
              place.tags &&
              place.tags.some((tag) => favoriteTags.includes(tag));

            if (!matchesCategory && !matchesTag) return false;

            // Exclude hidden places (if not allowed)
            const isHidden = place.categories?.includes("🤫 Hidden & Unique");
            if (isHidden && !userAccess?.hasPremium) return false;

            // Exclude premium places (if user is not premium)
            const placeIsPremium = isPlacePremium(place);
            if (placeIsPremium && !canUserViewPlace(userAccess || defaultUserAccess, place)) {
              // Allow if user is owner
              if (userId && place.created_by === userId) return true;
              return false;
            }

            return true;
          });

          // Sort by relevance → newest → random
          recommendedPlaces.sort((a, b) => {
            // Calculate relevance score
            const scoreA = calculateRelevanceScore(a, favoriteCategories, favoriteTags);
            const scoreB = calculateRelevanceScore(b, favoriteCategories, favoriteTags);
            
            if (scoreA !== scoreB) {
              return scoreB - scoreA; // Higher score first
            }

            // If same relevance, sort by newest
            if (a.created_at && b.created_at) {
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }

            // Random tie-breaker (consistent based on place id)
            return a.id.localeCompare(b.id);
          });

          // Limit to 8 places
          const result = recommendedPlaces.slice(0, 8);

          if (!cancelled) {
            setPlaces(result);
            setLoading(false);
          }
          return;
        }

        let query = supabase
          .from("places")
          .select("id,title,description,city,country,address,cover_url,categories,tags,created_by,created_at,lat,lng,access_level,visibility,kind,schedule,service_mode")
          .eq("is_hidden", false);
        if (section.city) {
          const coords = await getCityCoords(section.city);
          query = query.or(buildCityRadiusFilter(section.city, coords.lat, coords.lng));
        }
        if (sectionCategories.length > 0) {
          query = query.overlaps("categories", sectionCategories);
        }
        if (section.tag) {
          query = query.contains("tags", [section.tag]);
        }
        if (kindFilter) {
          query = query.eq("kind", kindFilter);
        }
        if (section.daysAgo) {
          const dateThreshold = new Date();
          dateThreshold.setDate(dateThreshold.getDate() - section.daysAgo);
          query = query.gte("created_at", dateThreshold.toISOString());
        }
        query = query.order("created_at", { ascending: false }).limit(section.matchText?.length ? 80 : 10);

        const { data, error } = await query;
        if (error) throw error;
        if (!cancelled) {
          setPlaces(
            ((data || []) as Place[])
              .filter(isHomeOfferReady)
              .filter((place) => sectionMatchesText(place, section))
              .slice(0, 10)
          );
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading places for section:", section.title, err);
          setPlaces([]);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [section, section.title, section.city, section.tag, sectionCategories, categoriesKey, section.daysAgo, section.sort, section.recentlyViewed, section.recommended, section.allListings, userId, userAccess, defaultUserAccess, refreshKey, kindFilter]);

  // Helper function to calculate relevance score
  function calculateRelevanceScore(place: Place, favoriteCategories: string[], favoriteTags: string[]): number {
    let score = 0;
    
    // Count matching categories (weight: 2 points each)
    if (place.categories && favoriteCategories.length > 0) {
      const matchingCategories = place.categories.filter(cat => favoriteCategories.includes(cat));
      score += matchingCategories.length * 2;
    }
    
    // Count matching tags (weight: 1 point each)
    if (place.tags && favoriteTags.length > 0) {
      const matchingTags = place.tags.filter(tag => favoriteTags.includes(tag));
      score += matchingTags.length;
    }
    
    return score;
  }

  // Reload when page becomes visible, but only if data is stale (5 min TTL)
  const lastFetchTimeRef = useRef<number>(Date.now());
  // Update lastFetchTime when data is loaded
  useEffect(() => {
    if (!loading) {
      lastFetchTimeRef.current = Date.now();
    }
  }, [loading]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const isStale = Date.now() - lastFetchTimeRef.current > HOME_SECTION_STALE_TTL_MS;
        if (isStale) {
          setRefreshKey((k) => k + 1);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Calculate locked premium places for Haunted Gem indexing
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
    if (section.allListings) {
      const params = new URLSearchParams();
      if (section.city) params.set("city", section.city);
      if (kindFilter) params.set("kinds", kindFilter);
      const query = params.toString();
      return query ? `/map?${query}` : "/map";
    }

    // For "Recently viewed", just go to map page
    if (section.recentlyViewed) {
      return kindFilter ? `/map?kinds=${kindFilter}` : "/map";
    }
    
    const params = new URLSearchParams();
    if (section.city) {
      params.set("city", section.city);
    }
    if (sectionCategories.length > 0) {
      // Используем categories (CSV) для поддержки нескольких категорий
      params.set("categories", sectionCategories.join(','));
      params.set("ref", "home");
    }
    if (section.searchQuery) {
      params.set("q", section.searchQuery);
      params.set("ref", "home");
    }
    if (kindFilter) {
      params.set("kinds", kindFilter);
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
    return <HomeSectionSkeleton isFirst={isFirst} />;
  }

  // Don't hide section if places are empty - let it show empty state or just return null silently
  // Only hide if it's not a critical section (like "Recently viewed" or "Recommended" can be empty)
  if (places.length === 0 && !section.recentlyViewed && !section.recommended) {
    return null;
  }
  
  // For "Recently viewed" or "Recommended", hide if empty
  if (places.length === 0 && (section.recentlyViewed || section.recommended)) {
    return null;
  }

  return (
    <div className={`mb-6 lg:mb-8 lg:mb-9 ${isFirst ? 'pt-6 lg:pt-8' : ''}`}>
      {/* Header: Title + See all arrow + Scroll arrows (desktop only) */}
      <div className="flex items-center justify-between mb-3 lg:mb-4 h-10 lg:h-12">
        {/* Left: Title + See all arrow (desktop) or just Title (mobile) */}
        <div className="flex items-center gap-2">
          <Link
            href={getSeeAllUrl()}
            className="font-fraunces text-lg lg:text-xl font-semibold text-[#1F2A1F] hover:text-[#8F9E4F] transition-colors cursor-pointer"
          >
            <h2>{section.title}</h2>
          </Link>
          {/* See all arrow - only on desktop, next to title */}
          <Link
            href={getSeeAllUrl()}
            className="hidden lg:flex w-8 h-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] items-center justify-center transition-colors"
            aria-label="See all"
          >
            <Icon name="forward" size={16} className="text-[#1F2A1F]" />
          </Link>
        </div>
        {/* Right: See all arrow (mobile) or Scroll arrows (desktop) */}
        <div className="flex items-center gap-2">
          {/* Стрелки прокрутки только на desktop >= 900px и если карточек >= 7 */}
          {places.length >= 7 && (
            <div className="hidden lg:flex items-center gap-2">
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
            className="lg:hidden w-8 h-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] flex items-center justify-center transition-colors"
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
          className="overflow-x-auto scrollbar-hide -mr-4 sm:max-lg:-mr-6 lg:mr-0"
          style={{ 
            scrollPaddingLeft: 'var(--home-page-padding, 16px)',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            // Для "Recently viewed": ограничиваем ширину контейнера для 5 карточек на десктопе
            // Для остальных: 8 карточек + 7 gaps (раньше было 7, оставалось пустое место под стрелками справа)
            maxWidth: section.recentlyViewed
              ? 'calc(5 * var(--recently-viewed-card-width, var(--home-card-width)) + 4 * var(--home-carousel-gap))'
              : 'calc(8 * var(--home-card-width) + 7 * var(--home-carousel-gap))'
          }}
        >
          <div 
            className="flex pb-2"
            style={{ 
              width: "max-content",
              gap: 'var(--home-carousel-gap, 12px)'
            }}
          >
            {places.map((place, placeIndex) => {
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
                      batchProfile={place.created_by ? batchData.profiles.get(place.created_by) : undefined}
                      hauntedGemIndex={hauntedGemIndex}
                      showPhotoSlider={false}
                      priority={isFirst && placeIndex < 4}
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
                <div className="flex flex-col h-full rounded-2xl bg-white border border-[#ECEEE4] overflow-hidden transition-all duration-200 relative z-0 cursor-pointer"
                     style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                  {/* Image collage section - aspect 1:1 */}
                  <div className="relative w-full aspect-square">
                    <div className="absolute inset-0 bg-[#ECEEE4] p-2 flex flex-wrap gap-1">
                      {places.slice(0, 3).map((place, idx) => (
                        place.cover_url ? (
                          <HomeSectionCollageImage
                            key={place.id}
                            src={place.cover_url}
                            alt={place.title}
                            className={`${idx === 0 ? 'w-full h-1/2' : 'w-[calc(50%-4px)] h-1/2'} rounded-lg overflow-hidden`}
                          />
                        ) : null
                      ))}
                      {places.length < 3 && (
                        <div className="w-full h-1/2 rounded-lg bg-[#ECEEE4] flex items-center justify-center">
                          <Icon name="photo" size={24} className="text-[#A8B096]" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Text section - фиксированная высота ~52px */}
                  <div className="p-3 lg:p-4 flex items-center justify-center" style={{ minHeight: '52px' }}>
                    <div className="text-center">
                      <div className="text-base lg:text-lg font-semibold text-[#1F2A1F]">See all</div>
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

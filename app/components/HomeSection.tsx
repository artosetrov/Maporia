"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import PlaceCard from "./PlaceCard";
import { supabase } from "../lib/supabase";
import { HomeSectionFilter } from "../constants/homeSections";

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

type HomeSectionProps = {
  section: HomeSectionFilter;
  userId?: string | null;
  favorites?: Set<string>;
  onToggleFavorite?: (placeId: string, e: React.MouseEvent) => void;
  onTagClick?: (tag: string) => void;
};

export default function HomeSection({ section, userId, favorites, onToggleFavorite, onTagClick }: HomeSectionProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadPlaces() {
      setLoading(true);
      
      let query = supabase.from("places").select("*");

      // Фильтр по городу
      if (section.city) {
        query = query.eq("city", section.city);
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

      const { data, error } = await query;

      if (error) {
        console.error("Error loading places for section:", section.title, error);
        setPlaces([]);
      } else {
        setPlaces((data || []) as Place[]);
      }

      setLoading(false);
    }

    loadPlaces();
  }, [
    section.title,
    section.city || '',
    section.tag || '',
    section.daysAgo || 0,
    section.sort || '',
    section.categories ? section.categories.join(',') : ''
  ]);


  // Формируем URL для "See all"
  const getSeeAllUrl = () => {
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
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[#2d2d2d]">{section.title}</h2>
        </div>
        <div className="text-sm text-[#6b7d47]/60">Loading...</div>
      </div>
    );
  }

  if (places.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 min-[600px]:mb-8 min-[900px]:mb-9">
      {/* Header: Title + See all arrow + Scroll arrows (desktop only) */}
      <div className="flex items-center justify-between mb-3 min-[600px]:mb-4 h-10 min-[600px]:h-12">
        <div className="flex items-center gap-2">
          <h2 className="text-lg min-[600px]:text-xl font-semibold text-[#2d2d2d]">{section.title}</h2>
          <Link
            href={getSeeAllUrl()}
            className="w-8 h-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition shadow-sm"
            aria-label="See all"
          >
            <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
        {/* Стрелки прокрутки только на desktop >= 900px и если карточек >= 7 */}
        {places.length >= 7 && (
          <div className="hidden min-[900px]:flex items-center gap-2">
            <button
              onClick={scrollLeft}
              className="w-8 h-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition shadow-sm"
              aria-label="Scroll left"
            >
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={scrollRight}
              className="w-8 h-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition shadow-sm"
              aria-label="Scroll right"
            >
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
      
      {/* Carousel container - ограничиваем ширину чтобы помещалось ровно 7 карточек */}
      <div className="relative">
        <div 
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-hide"
          style={{ 
            scrollPaddingLeft: 'var(--home-page-padding, 16px)',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            // Ограничиваем ширину контейнера: 7 карточек + 6 gaps
            maxWidth: 'calc(7 * var(--home-card-width) + 6 * var(--home-carousel-gap))'
          }}
        >
          <div 
            className="flex pb-2"
            style={{ 
              width: "max-content",
              gap: 'var(--home-carousel-gap, 12px)'
            }}
          >
            {places.map((place) => {
              const isFavorite = favorites?.has(place.id);
              return (
                <div 
                  key={place.id} 
                  data-card
                  className="flex-shrink-0"
                  style={{
                    width: 'var(--home-card-width, 220px)',
                    scrollSnapAlign: 'start'
                  }}
                >
                  <div className="[&_.place-card-image]:!pb-[100%]">
                    <PlaceCard
                      place={place}
                      favoriteButton={
                      userId && onToggleFavorite ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onToggleFavorite(place.id, e);
                          }}
                          className={`h-8 w-8 rounded-full bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] hover:border-[#6b7d47]/40 flex items-center justify-center transition shadow-sm ${
                            isFavorite ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                          }`}
                          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                        >
                          <svg
                            className={`w-4 h-4 transition-transform ${
                              isFavorite 
                                ? "text-[#6b7d47] scale-110" 
                                : "text-[#6b7d47]/60"
                            }`}
                            fill={isFavorite ? "currentColor" : "none"}
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                            />
                          </svg>
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
                <div className="flex flex-col h-full rounded-[18px] min-[600px]:rounded-[20px] min-[900px]:rounded-[22px] bg-white border border-gray-200 overflow-hidden transition-all duration-200 relative z-0 shadow-sm hover:shadow-md cursor-pointer">
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
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Text section - фиксированная высота ~52px */}
                  <div className="p-3 min-[600px]:p-4 flex items-center justify-center" style={{ minHeight: '52px' }}>
                    <div className="text-center">
                      <div className="text-base min-[600px]:text-lg font-semibold text-[#2d2d2d]">See all</div>
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

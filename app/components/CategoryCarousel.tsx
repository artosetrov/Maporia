"use client";

/**
 * CategoryCarousel — горизонтальная лента категорий для Services / Experiences табов
 * на главной странице. Каждая карточка показывает image + label + count активных
 * карточек этой категории в выбранном городе.
 *
 * Клик ведёт на /map?kinds=…&categories=…  — там уже работает kind+category фильтр.
 *
 * Counts грузятся одной выборкой по kind/city, потом aggregate на клиенте.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { buildCityRadiusFilter, getCityCoords } from "../lib/cityRadius";
import { isHomeOfferReady } from "../lib/homeOfferReadiness";
import { SERVICE_CATEGORIES, EXPERIENCE_CATEGORIES, stripTagEmoji } from "../constants";
import Icon from "./Icon";

type CategoryCarouselProps = {
  kind: "service" | "experience";
  city?: string | null;
};

type CategoryPreview = {
  count: number;
  coverUrl: string | null;
};

export default function CategoryCarousel({ kind, city }: CategoryCarouselProps) {
  const router = useRouter();
  const allCategories = useMemo<readonly string[]>(
    () => (kind === "service" ? SERVICE_CATEGORIES : EXPERIENCE_CATEGORIES),
    [kind]
  );
  const [previews, setPreviews] = useState<Map<string, CategoryPreview>>(new Map());
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const title = `${kind === "service" ? "Services" : "Experiences"} in ${city || "Florida"}`;

  // Прокрутка стрелками — синхронно с HomeSection: 2 карточки + 2 gap.
  // Карточки замеряются через [data-card], gap — из CSS-переменной
  // `--home-carousel-gap`, чтобы lg/мобайл совпадали с остальными лентами.
  const scrollByCards = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container || typeof window === "undefined") return;
    const cardEl = container.querySelector<HTMLElement>("[data-card]");
    const cardWidth = cardEl?.clientWidth ?? 180;
    const gapValue = getComputedStyle(document.documentElement)
      .getPropertyValue("--home-carousel-gap")
      .trim();
    const gap = gapValue ? parseInt(gapValue, 10) : 12;
    const amount = cardWidth * 2 + gap * 2;
    container.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let query = supabase
          .from("places")
          .select("categories,cover_url,kind,schedule,service_mode")
          .eq("kind", kind)
          .eq("is_hidden", false);

        if (city) {
          const coords = await getCityCoords(city);
          // buildCityRadiusFilter calls sanitizePostgrestValue before composing the .or() filter.
          query = query.or(buildCityRadiusFilter(city, coords.lat, coords.lng));
        }

        const { data, error } = await query;
        if (cancelled || error) {
          setLoading(false);
          return;
        }
        const map = new Map<string, CategoryPreview>();
        for (const row of (data ?? []) as {
          categories: string[] | null;
          cover_url: string | null;
          kind: "service" | "experience" | "location" | null;
          schedule: unknown | null;
          service_mode: string | null;
        }[]) {
          if (!isHomeOfferReady(row)) continue;
          for (const cat of row.categories ?? []) {
            const preview = map.get(cat) ?? { count: 0, coverUrl: null };
            preview.count += 1;
            if (!preview.coverUrl && row.cover_url) {
              preview.coverUrl = row.cover_url;
            }
            map.set(cat, preview);
          }
        }
        if (!cancelled) {
          setPreviews(map);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, city]);

  function openCategory(cat: string) {
    const tab = kind === "service" ? "services" : "experiences";
    const params = new URLSearchParams();
    params.set("kinds", kind);
    params.set("categories", cat);
    params.set("tab", tab);
    if (city) params.set("city", city);
    router.push(`/map?${params.toString()}`);
  }

  // Стрелки показываем только если карточек хватает на переполнение по
  // ширине — чтобы не плодить «декоративные» стрелки в углу. На мобилке
  // стрелок нет вообще: там работает обычный свайп.
  const showArrows = allCategories.length >= 7;

  return (
    <section aria-label={title} className="mb-6 lg:mb-8">
      {/* Header: заголовок + стрелки прокрутки (desktop only) — повторяет
          паттерн из HomeSection, чтобы все ленты главной выглядели одинаково. */}
      <div className="flex items-center justify-between mb-3 lg:mb-4 h-10 lg:h-12">
        <h2 className="font-fraunces text-lg lg:text-xl font-semibold text-[#1F2A1F]">
          {title}
        </h2>
        {showArrows && (
          <div className="hidden lg:flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollByCards("left")}
              className="w-8 h-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] flex items-center justify-center transition-colors"
              aria-label="Scroll left"
            >
              <svg className="w-4 h-4 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollByCards("right")}
              className="w-8 h-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] flex items-center justify-center transition-colors"
              aria-label="Scroll right"
            >
              <svg className="w-4 h-4 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Прячем нативный скроллбар (.scrollbar-hide определён в globals.css)
          и используем тот же паттерн отрицательных margin'ов на мобилке,
          что и HomeSection, чтобы карточки уезжали под край экрана. */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto scrollbar-hide -mr-4 sm:max-lg:-mr-6 lg:mr-0"
        style={{
          scrollPaddingLeft: "var(--home-page-padding, 16px)",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          className="flex pb-2"
          style={{
            width: "max-content",
            gap: "var(--home-carousel-gap, 12px)",
          }}
        >
          {allCategories.map((cat) => {
            const label = stripTagEmoji(cat);
            const preview = previews.get(cat);
            const count = preview?.count ?? 0;
            const empty = !loading && count === 0;
            return (
              <button
                key={cat}
                type="button"
                data-card
                onClick={() => openCategory(cat)}
                style={{ scrollSnapAlign: "start" }}
                className={
                  "group shrink-0 w-[160px] sm:w-[180px] text-left transition " +
                  (empty
                    ? "opacity-60 hover:opacity-90"
                    : "hover:-translate-y-0.5")
                }
                aria-label={`${label} (${count} listings)`}
              >
                <div className="relative mb-2 aspect-[1.33] overflow-hidden rounded-2xl bg-[#ECEEE4]">
                  {preview?.coverUrl ? (
                    <Image
                      src={preview.coverUrl}
                      alt=""
                      fill
                      sizes="180px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon name={kind === "service" ? "wrench" : "sparkles"} size={24} className="text-[#A8B096]" />
                    </div>
                  )}
                </div>
                <div className="text-sm font-semibold text-[#1F2A1F] mb-0.5 line-clamp-2 leading-tight">
                  {label}
                </div>
                <div className="text-xs text-[#6F7A5A]">
                  {loading ? "Loading" : count === 0 ? "Coming soon" : `${count} available`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

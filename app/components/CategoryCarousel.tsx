"use client";

/**
 * CategoryCarousel — горизонтальная лента категорий для Services / Experiences табов
 * на главной странице. Каждая карточка показывает emoji + label + count активных
 * карточек этой категории.
 *
 * Клик ведёт на /map?kind=…&categories=…  — там уже работает kind+category фильтр.
 *
 * Counts грузятся одной выборкой `select categories from places where kind=$1`,
 * потом aggregate на клиенте. Для < 1000 records быстрее одного запроса
 * с N RPC-вызовами.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { SERVICE_CATEGORIES, EXPERIENCE_CATEGORIES } from "../constants";

type CategoryCarouselProps = {
  kind: "service" | "experience";
};

function splitCategoryString(category: string): { emoji: string; label: string } {
  const parts = category.split(" ");
  const emoji = parts[0] || "📍";
  const label = parts.slice(1).join(" ") || category;
  return { emoji, label };
}

export default function CategoryCarousel({ kind }: CategoryCarouselProps) {
  const router = useRouter();
  const allCategories = useMemo<readonly string[]>(
    () => (kind === "service" ? SERVICE_CATEGORIES : EXPERIENCE_CATEGORIES),
    [kind]
  );
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
        const { data, error } = await supabase
          .from("places")
          .select("categories")
          .eq("kind", kind)
          .eq("is_hidden", false);
        if (cancelled || error) {
          setLoading(false);
          return;
        }
        const map = new Map<string, number>();
        for (const row of (data ?? []) as { categories: string[] | null }[]) {
          for (const cat of row.categories ?? []) {
            map.set(cat, (map.get(cat) ?? 0) + 1);
          }
        }
        if (!cancelled) {
          setCounts(map);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  function openCategory(cat: string) {
    const tab = kind === "service" ? "services" : "experiences";
    router.push(
      `/map?kind=${kind}&categories=${encodeURIComponent(cat)}&tab=${tab}`
    );
  }

  // Стрелки показываем только если карточек хватает на переполнение по
  // ширине — чтобы не плодить «декоративные» стрелки в углу. На мобилке
  // стрелок нет вообще: там работает обычный свайп.
  const showArrows = allCategories.length >= 7;

  return (
    <section aria-label="Browse by category" className="mb-6 lg:mb-8">
      {/* Header: заголовок + стрелки прокрутки (desktop only) — повторяет
          паттерн из HomeSection, чтобы все ленты главной выглядели одинаково. */}
      <div className="flex items-center justify-between mb-3 lg:mb-4 h-10 lg:h-12">
        <h2 className="font-fraunces text-lg lg:text-xl font-semibold text-[#1F2A1F]">
          Browse by category
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
        className="overflow-x-auto scrollbar-hide max-lg:-mr-6 lg:mr-0"
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
            const { emoji, label } = splitCategoryString(cat);
            const count = counts.get(cat) ?? 0;
            const empty = !loading && count === 0;
            return (
              <button
                key={cat}
                type="button"
                data-card
                onClick={() => openCategory(cat)}
                style={{ scrollSnapAlign: "start" }}
                className={
                  "shrink-0 w-[160px] sm:w-[180px] rounded-2xl border bg-white p-4 text-left transition " +
                  (empty
                    ? "border-[#ECEEE4] opacity-60 hover:opacity-90"
                    : "border-[#ECEEE4] hover:border-[#8F9E4F] hover:shadow-sm")
                }
                aria-label={`${label} (${count} listings)`}
              >
                <div className="text-3xl mb-2" aria-hidden>
                  {emoji}
                </div>
                <div className="text-sm font-medium text-[#1F2A1F] mb-1 line-clamp-2 leading-tight">
                  {label}
                </div>
                <div className="text-xs text-[#6F7A5A]">
                  {loading ? "—" : count === 0 ? "Coming soon" : `${count} ${count === 1 ? "listing" : "listings"}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

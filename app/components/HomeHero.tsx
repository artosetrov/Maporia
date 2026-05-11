"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CITIES, DEFAULT_CITY } from "../constants";
import { fetchTopCities, topCityNames } from "../lib/topCities";
import type { HomeKind } from "../types/home";
import { useHomeKindCounts } from "../hooks/useHomeKindCounts";
import HomeTabsSegmented from "./HomeTabsSegmented";
import HomeSearchHero from "./HomeSearchHero";
import HomePopularTags from "./HomePopularTags";
import HomeVisualPanel from "./HomeVisualPanel";

/**
 * HomeHero (v2) — composite hero for the home page (Dribbble-style).
 *
 * Layout (responsive grid via Tailwind):
 *   • H1 — левая колонка грида; sm–lg та же max ширина что lede (520px),
 *     с lg — на всю ширину колонки + display clamp (глобальные h1-стили
 *     в globals.css не трогают #home-hero-title).
 *   • >= lg → split: left column (lede + tabs + search + popular tags) and
 *                    right column (HomeVisualPanel).
 *   • <  lg → single column, left-aligned, no visual panel
 *
 * The hero is a COMPOSER: it owns layout, the city picker dropdown, and
 * passes callbacks through to the building blocks. Page.tsx wires it
 * once, doesn't need to know about the inner grid.
 *
 * Counts: this component owns the `useHomeKindCounts` call. StatsTicker
 * рендерится в page.tsx под TopBar; тот же хук там — React кеширует fetch.
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase C).
 */

type Props = {
  // City selection
  selectedCity: string | null;
  onCityChange: (city: string | null) => void;

  // Tabs
  activeKind: HomeKind;
  onChangeKind: (kind: HomeKind) => void;

  // Search — pill is a trigger that opens SearchModal (where the actual
  // city + tag + query inputs live).
  searchValue: string;
  onSearchBarClick: () => void;

  // Filters
  onFiltersClick: () => void;
  activeFiltersCount: number;

  /** Popular category chips — рендер только с lg в разметке. */
  onCategoryClick: (category: string) => void;
};

export default function HomeHero({
  selectedCity,
  onCityChange,
  activeKind,
  onChangeKind,
  searchValue,
  onSearchBarClick,
  onFiltersClick,
  activeFiltersCount,
  onCategoryClick,
}: Props) {
  // Заголовок по умолчанию говорит "Florida" (бренд Maporia = весь штат),
  // а не подставляет DEFAULT_CITY. Если юзер вручную выбрал город из
  // дропдауна — отображаем выбранный город.
  const cityLabel = selectedCity ?? "Florida";
  const { counts } = useHomeKindCounts();

  // City picker — local dropdown state. Closes on outside-click and on Esc.
  // 2026-05-11: listbox рендерится через portal в document.body, чтобы
  // вывести его из контекста <h1>. Внутри h1 наследуются font-size 80px,
  // leading-[0.98] и tracking-[-0.02em] — даже text-[14px]+leading-tight
  // на кнопках не пересиливали line-height-inherit от preflight (Tailwind
  // v4 ordering). Portal в body даёт чистый body-typography (15px/1.5).
  const [cityOpen, setCityOpen] = useState(false);
  const cityRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Replan popover position whenever it opens, on resize, or on scroll.
  useLayoutEffect(() => {
    if (!cityOpen) return;
    function reposition() {
      const trigger = cityRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      // 8px gap under the trigger, anchored to its left edge.
      setPopoverPos({
        top: r.bottom + 8,
        left: r.left,
        minWidth: Math.max(r.width, 220),
      });
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [cityOpen]);

  // Cities shown in the dropdown. Init = static `CITIES` snapshot from
  // constants (so SSR/first-paint renders a sane list with no flash).
  // On mount we replace it with the live top-N from Supabase RPC
  // `get_top_cities`. If the fetch fails, the static fallback stays put.
  // See `app/lib/topCities.ts`.
  const [cities, setCities] = useState<readonly string[]>(CITIES);
  useEffect(() => {
    let cancelled = false;
    fetchTopCities(5).then((rows) => {
      if (cancelled) return;
      const names = topCityNames(rows);
      if (names.length > 0) setCities(names);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cityOpen) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = cityRef.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inTrigger && !inPopover) setCityOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCityOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [cityOpen]);

  return (
    <section
      aria-labelledby="home-hero-title"
      className="pt-6 sm:pt-10 lg:pt-6"
    >
      <div className="px-4 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
          {/* ── LEFT column ─────────────────────────────────────────── */}
          {/* 2026-05-09: min-w-0 обязателен — grid item по умолчанию имеет
              min-width:auto = intrinsic content size, поэтому если внутри
              есть широкий ряд табов (~520 px), grid-item раздувается
              шире viewport и тащит за собой весь body horizontal scroll.
              min-w-0 ломает intrinsic-min, и overflow-x-auto на обёртке
              табов начинает работать как задумано. */}
          <div className="min-w-0 text-left">
            <h1
              id="home-hero-title"
              className={[
                "font-extrabold w-full min-w-0 max-w-full sm:max-w-[520px] lg:max-w-none text-balance",
                "leading-[0.98] tracking-[-0.02em] text-[#16190f]",
                "text-[clamp(1.625rem,3.8vw+0.5rem,2.75rem)]",
                "lg:text-[clamp(2.5rem,4.5vw+0.75rem,5rem)]",
                "break-words",
              ].join(" ")}
            >
              Discover{" "}
              <em className="not-italic font-fraunces italic font-semibold text-[#8F9E4F]">
                local gems
              </em>{" "}
              of{" "}
              <span ref={cityRef} className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setCityOpen((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={cityOpen}
                  className="font-extrabold border-b-[3px] border-[#8F9E4F] pb-0.5 text-[#16190f] hover:text-[#8F9E4F] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1 rounded-sm"
                >
                  {cityLabel}.
                </button>
                {mounted && cityOpen && popoverPos &&
                  createPortal(
                    <div
                      ref={popoverRef}
                      role="listbox"
                      aria-label="Choose a city"
                      style={{
                        position: "fixed",
                        top: popoverPos.top,
                        left: popoverPos.left,
                        minWidth: popoverPos.minWidth,
                        fontFamily:
                          "var(--font-inter), -apple-system, BlinkMacSystemFont, 'SF Pro Text', Roboto, Arial, sans-serif",
                        fontSize: 14,
                        lineHeight: 1.25,
                        letterSpacing: "normal",
                        fontWeight: 500,
                      }}
                      className="z-[60] bg-white border border-[#ebe7d8] rounded-2xl py-1 shadow-[0_8px_24px_rgba(31,36,23,0.10)]"
                    >
                      {cities.map((c) => {
                        const isSelected =
                          (selectedCity ?? DEFAULT_CITY) === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              onCityChange(c);
                              setCityOpen(false);
                            }}
                            style={{ fontSize: 14, lineHeight: 1.25 }}
                            className={[
                              "w-full text-left px-4 py-2 font-semibold",
                              isSelected
                                ? "text-[#4d5b27] bg-[#eef0e0]"
                                : "text-[#16190f] hover:bg-[#faf8f1]",
                            ].join(" ")}
                          >
                            {c}
                          </button>
                        );
                      })}
                      <div className="border-t border-[#ebe7d8] mt-0.5 pt-0.5">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedCity === null}
                          onClick={() => {
                            onCityChange(null);
                            setCityOpen(false);
                          }}
                          style={{ fontSize: 14, lineHeight: 1.25 }}
                          className={[
                            "w-full text-left px-4 py-2 font-semibold",
                            selectedCity === null
                              ? "text-[#4d5b27] bg-[#eef0e0]"
                              : "text-[#16190f] hover:bg-[#faf8f1]",
                          ].join(" ")}
                        >
                          Anywhere
                        </button>
                      </div>
                    </div>,
                    document.body,
                  )}
              </span>
            </h1>

            {/* 2026-05-08: max-w-[520px] на mobile превышал ширину
                viewport (~343px на iPhone Pro), и текст обрезался за
                правым краем. На <sm используем max-w-full — текст
                ложится в общий padding hero. На sm+ возвращаем 520px,
                чтобы линия не вытягивалась под весь широкий экран. */}
            <p className="mt-4 text-[15px] sm:text-[17px] leading-[1.5] text-[#4a4f3d] max-w-full sm:max-w-[520px]">
              Places, experiences, and services — handpicked by locals
              across South Florida. No ads, no endless filter walls.
            </p>

            <div className="mt-6 flex flex-col items-start gap-3.5 min-w-0 w-full">
              <HomeTabsSegmented
                active={activeKind}
                onChange={onChangeKind}
                counts={counts}
              />
              <HomeSearchHero
                selectedCity={selectedCity}
                searchValue={searchValue}
                onSearchBarClick={onSearchBarClick}
                onFiltersClick={onFiltersClick}
                activeFiltersCount={activeFiltersCount}
              />
              <div className="hidden min-w-0 w-full lg:block">
                <HomePopularTags
                  activeKind={activeKind}
                  onCategoryClick={onCategoryClick}
                />
              </div>
            </div>
          </div>

          {/* ── RIGHT column (desktop only) ─────────────────────────── */}
          <HomeVisualPanel city={cityLabel} counts={counts} />
          </div>
        </div>
      </div>
    </section>
  );
}

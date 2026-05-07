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

import { useEffect, useMemo, useState } from "react";
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

  return (
    <section aria-label="Browse by category" className="mb-6 sm:mb-8">
      <h2 className="font-fraunces text-lg sm:text-xl font-semibold text-[#1F2A1F] mb-3">
        Browse by category
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {allCategories.map((cat) => {
          const { emoji, label } = splitCategoryString(cat);
          const count = counts.get(cat) ?? 0;
          const empty = !loading && count === 0;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => openCategory(cat)}
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
    </section>
  );
}

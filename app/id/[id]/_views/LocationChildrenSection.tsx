"use client";

/**
 * LocationChildrenSection — host-page блок «Experiences & services here».
 *
 * Рендерится на странице location-карточки (kind='location'). Если есть прицепленные
 * через `place_links` (status='active') experience/service — показывает их горизонтальным
 * скроллом. Если нет — компонент скрыт.
 *
 * См. docs/PLACE_LINKS_PLAN.md § 4.1.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getChildrenOfLocation } from "../../../lib/placeLinks";
import type { PlaceListItem } from "../../../types";

type Props = {
  parentId: string;
};

export default function LocationChildrenSection({ parentId }: Props) {
  const [children, setChildren] = useState<PlaceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getChildrenOfLocation(parentId).then((items) => {
      if (cancelled) return;
      setChildren(items);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  // Скрываем секцию полностью пока загружается ИЛИ если нет children.
  if (loading) return null;
  if (children.length === 0) return null;

  return (
    <section className="mt-10 mb-6">
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="font-fraunces text-xl sm:text-2xl font-semibold text-[#1F2A1F]">
          Experiences & services here
        </h2>
        <span className="text-sm text-[#6F7A5A]">
          {children.length} {children.length === 1 ? "offering" : "offerings"}
        </span>
      </header>

      {/* Горизонтальный скролл — карточка ~280px */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 sm:-mx-0 px-4 sm:px-0 snap-x snap-mandatory scroll-smooth">
        {children.map((child) => (
          <Link
            key={child.id}
            href={`/id/${child.id}`}
            className="snap-start flex-shrink-0 w-[260px] sm:w-[280px] rounded-2xl overflow-hidden bg-white border border-[#ECEEE4] shadow-sm hover:shadow-md transition-shadow"
          >
            {child.cover_url ? (
              <div className="relative w-full aspect-[4/3] bg-[#FAFAF7]">
                <Image
                  src={child.cover_url}
                  alt={child.title}
                  fill
                  sizes="280px"
                  className="object-cover"
                />
                <span className="absolute top-2 left-2 inline-flex items-center rounded-full bg-white/95 backdrop-blur-sm text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 text-[#3F4A35]">
                  {child.kind === "experience" ? "✨ Experience" : "🛠 Service"}
                </span>
              </div>
            ) : (
              <div className="relative w-full aspect-[4/3] bg-[#ECEEE4] flex items-center justify-center text-3xl">
                {child.kind === "experience" ? "✨" : "🛠"}
              </div>
            )}
            <div className="p-3">
              <div className="font-fraunces font-semibold text-[15px] text-[#1F2A1F] line-clamp-2 leading-snug">
                {child.title}
              </div>
              {child.description && (
                <div className="text-[12px] text-[#6F7A5A] line-clamp-2 mt-1 leading-snug">
                  {child.description}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

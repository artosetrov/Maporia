"use client";

/**
 * ParentLocationCard — backlink на странице experience/service.
 *
 * Если карточка прицеплена через `place_links` (status='active') к одной или
 * нескольким locations, рендерится блок «📍 At <Vrijhof Farm>» со ссылкой и
 * базовой информацией. Если parents нет — компонент скрыт.
 *
 * См. docs/PLACE_LINKS_PLAN.md § 4.2.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getParentsOfChild } from "../../../lib/placeLinks";
import type { PlaceListItem } from "../../../types";

type Props = {
  childId: string;
};

export default function ParentLocationCard({ childId }: Props) {
  const [parents, setParents] = useState<PlaceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getParentsOfChild(childId).then((items) => {
      if (cancelled) return;
      setParents(items);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (loading) return null;
  if (parents.length === 0) return null;

  // Single-parent: большая карточка
  if (parents.length === 1) {
    const p = parents[0];
    return (
      <section className="my-6">
        <Link
          href={`/id/${p.id}`}
          className="block rounded-2xl border border-[#ECEEE4] bg-white p-4 sm:p-5 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0" aria-hidden>
              📍
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-[#6F7A5A] font-semibold mb-1">
                At
              </div>
              <div className="font-fraunces font-semibold text-[17px] sm:text-[19px] text-[#1F2A1F] truncate">
                {p.title}
              </div>
              {p.city && (
                <div className="text-sm text-[#6F7A5A] mt-0.5">
                  {p.city}
                  {p.country ? `, ${p.country}` : ""}
                </div>
              )}
            </div>
            <span className="text-[#8F9E4F] text-sm font-medium shrink-0 self-center">
              View →
            </span>
          </div>
        </Link>
      </section>
    );
  }

  // Multi-parent (тур по нескольким локациям): горизонтальный список
  return (
    <section className="my-6">
      <div className="text-[11px] uppercase tracking-wide text-[#6F7A5A] font-semibold mb-2">
        Stops on this {parents.length === 2 ? "route" : "tour"}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {parents.map((p) => (
          <Link
            key={p.id}
            href={`/id/${p.id}`}
            className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[#ECEEE4] bg-white px-3 py-2 hover:border-[#8F9E4F] transition-colors"
          >
            <span aria-hidden>📍</span>
            <span className="text-sm font-medium text-[#1F2A1F] truncate max-w-[180px]">
              {p.title}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

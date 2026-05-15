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
import Image from "next/image";
import Icon from "../../../components/Icon";
import { getParentsOfChild } from "../../../lib/placeLinks";
import type { PlaceListItem } from "../../../types";

type Props = {
  childId: string;
  /** Owner или admin страницы — показываем CTA «Link this to a location» / «Manage». */
  canEdit?: boolean;
};

export default function ParentLocationCard({ childId, canEdit }: Props) {
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

  // Если parents нет — для owner'а показываем CTA, для остальных скрываемся.
  if (parents.length === 0) {
    if (!canEdit) return null;
    return (
      <section className="my-6">
        <Link
          href={`/places/${childId}/edit/links`}
          className="block rounded-2xl border border-dashed border-[#ECEEE4] bg-[#FAFAF7] p-4 sm:p-5 text-center hover:border-[#8F9E4F] hover:bg-white transition-colors"
        >
          <div className="text-xl mb-1.5">📍</div>
          <div className="font-fraunces font-semibold text-[#1F2A1F] text-[15px] mb-0.5">
            Link this to a location
          </div>
          <div className="text-xs text-[#6F7A5A]">
            Pin where this happens — it appears on the host location&apos;s page and on the map.
          </div>
        </Link>
      </section>
    );
  }

  // Single-parent: большая карточка
  if (parents.length === 1) {
    const p = parents[0];
    return (
      <section className="my-6">
        <Link
          href={`/id/${p.id}`}
          className="group block overflow-hidden rounded-lg border border-[#ECEEE4] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="grid sm:grid-cols-[180px_minmax(0,1fr)]">
            <div className="relative min-h-[156px] overflow-hidden bg-[#FAFAF7] sm:min-h-full">
              {p.cover_url ? (
                <Image
                  src={p.cover_url}
                  alt={p.title}
                  fill
                  sizes="(min-width: 640px) 180px, 100vw"
                  className="object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full min-h-[156px] items-center justify-center text-[#8F9E4F]">
                  <Icon name="location" size={32} />
                </div>
              )}
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#556036] shadow-sm">
                <Icon name="location" size={12} />
                At
              </span>
            </div>

            <div className="flex min-w-0 flex-col justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                  Host location
                </div>
                <div className="font-fraunces text-xl font-semibold leading-tight text-[#1F2A1F]">
                  {p.title}
                </div>
                {(p.city || p.country || p.address) && (
                  <div className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-[#6F7A5A]">
                    <Icon name="location" size={14} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      {p.address || [p.city, p.country].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
              </div>

              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#8F9E4F] transition group-hover:text-[#556036]">
                View location
                <Icon name="forward" size={14} />
              </span>
            </div>
          </div>
        </Link>
        {canEdit && (
          <div className="mt-2 text-right">
            <Link
              href={`/places/${childId}/edit/links`}
              className="text-xs text-[#8F9E4F] hover:text-[#556036] underline"
            >
              Manage location link
            </Link>
          </div>
        )}
      </section>
    );
  }

  // Multi-parent (тур по нескольким локациям): горизонтальный список
  return (
    <section className="my-6">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-[11px] uppercase tracking-wide text-[#6F7A5A] font-semibold">
          Stops on this {parents.length === 2 ? "route" : "tour"}
        </div>
        {canEdit && (
          <Link
            href={`/places/${childId}/edit/links`}
            className="text-xs text-[#8F9E4F] hover:text-[#556036] underline shrink-0"
          >
            Manage
          </Link>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {parents.map((p) => (
          <Link
            key={p.id}
            href={`/id/${p.id}`}
            className="group w-[220px] shrink-0 overflow-hidden rounded-lg border border-[#ECEEE4] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="relative h-28 bg-[#FAFAF7]">
              {p.cover_url ? (
                <Image
                  src={p.cover_url}
                  alt={p.title}
                  fill
                  sizes="220px"
                  className="object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[#8F9E4F]">
                  <Icon name="location" size={24} />
                </div>
              )}
            </div>
            <div className="p-3">
              <span className="block truncate font-fraunces text-base font-semibold text-[#1F2A1F]">
                {p.title}
              </span>
              {(p.city || p.country) && (
                <span className="mt-0.5 block truncate text-xs text-[#6F7A5A]">
                  {[p.city, p.country].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

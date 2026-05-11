"use client";

/**
 * LinkedPlacesEditorBlock — встраиваемая секция «Linked places» для редактора
 * карточки (`/places/[id]/edit`).
 *
 * Что показывает:
 *  - Заголовок: «Experiences & services here» (для kind=location) или
 *    «Hosted at» (для service/experience).
 *  - <AddPlaceLinkPanel> — тот же компонент, что и на /edit/links: автокомплит
 *    + «Create new …» CTA.
 *  - Мини-список active-линков (cap 5) с кнопкой «Manage all →» на /edit/links,
 *    где доступны approval inbox, remove и rejected log.
 *  - Badge с pending-счётчиком, если есть incoming/outgoing pending.
 *
 * Зачем секция и на /edit, и на /edit/links: /edit — главная точка
 * редактирования всех полей карточки; пользователь ожидает «всё в одном
 * месте». /edit/links остаётся как полноценный manager (approve/reject,
 * история отказанных), а ссылка на него — «Manage all →».
 *
 * См. docs/PLACE_LINKS_PHASE6_PLAN.md § 1 (точки входа).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  getChildrenOfLocation,
  getParentsOfChild,
  type PlaceKindLite,
} from "../lib/placeLinks";
import { supabase } from "../lib/supabase";
import type { PlaceListItem } from "../types";
import AddPlaceLinkPanel from "./AddPlaceLinkPanel";

type Props = {
  placeId: string;
  kind: PlaceKindLite;
};

export default function LinkedPlacesEditorBlock({ placeId, kind }: Props) {
  const isLocationParent = kind === "location";

  const [activeLinks, setActiveLinks] = useState<PlaceListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [excludeIds, setExcludeIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);

    // 1) active-карточки в нужном направлении: location → children, child → parents.
    const items = isLocationParent
      ? await getChildrenOfLocation(placeId)
      : await getParentsOfChild(placeId);
    setActiveLinks(items);

    // 2) pending-счётчик + полный список already-linked ID (active + pending),
    //    чтобы AddPlaceLinkPanel мог исключить их из выдачи поиска.
    const linksQuery = supabase
      .from("place_links")
      .select("id, status, parent_place_id, child_place_id");
    const scoped = isLocationParent
      ? linksQuery.eq("parent_place_id", placeId)
      : linksQuery.eq("child_place_id", placeId);
    const { data: rows } = await scoped;
    const allLinks = (rows ?? []) as Array<{
      id: string;
      status: "active" | "pending" | "rejected";
      parent_place_id: string;
      child_place_id: string;
    }>;
    const otherIds = allLinks
      .filter((r) => r.status === "active" || r.status === "pending")
      .map((r) =>
        isLocationParent ? r.child_place_id : r.parent_place_id,
      );
    setExcludeIds(otherIds);
    setPendingCount(allLinks.filter((r) => r.status === "pending").length);

    setLoading(false);
  }, [placeId, isLocationParent]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const title = isLocationParent ? "Linked places" : "Hosted at";
  const subtitle = isLocationParent
    ? "Experiences & services hosted here"
    : "Locations where this offering happens";

  return (
    <section className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-fraunces font-semibold text-[#1F2A1F] text-lg">
            {title}
          </h3>
          <p className="text-sm text-[#6F7A5A] mt-0.5">{subtitle}</p>
        </div>
        <Link
          href={`/places/${placeId}/edit/links`}
          className="shrink-0 text-sm text-[#8F9E4F] hover:text-[#556036] underline"
        >
          Manage all
          {pendingCount > 0 && (
            <span className="ml-1 inline-flex items-center rounded-full bg-[#E2B36F]/20 text-[#8A6926] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {pendingCount} pending
            </span>
          )}
        </Link>
      </header>

      {/* Active links mini-list */}
      {!loading && activeLinks.length > 0 && (
        <ul className="mb-4 space-y-2">
          {activeLinks.slice(0, 5).map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-2"
            >
              <div className="w-10 h-10 rounded-lg bg-white overflow-hidden flex items-center justify-center text-lg shrink-0">
                {p.cover_url ? (
                  <Image
                    src={p.cover_url}
                    alt={p.title}
                    width={40}
                    height={40}
                    sizes="40px"
                    className="h-full w-full object-cover"
                  />
                ) : p.kind === "location" ? (
                  "📍"
                ) : p.kind === "experience" ? (
                  "✨"
                ) : (
                  "🛠"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/id/${p.id}`}
                  className="font-medium text-[#1F2A1F] text-sm truncate block hover:underline"
                >
                  {p.title || "Untitled"}
                </Link>
                <div className="text-[11px] text-[#6F7A5A] uppercase tracking-wide">
                  {p.kind ?? "place"}
                  {p.city && (
                    <>
                      <span className="mx-1 normal-case">·</span>
                      <span className="normal-case truncate">{p.city}</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
          {activeLinks.length > 5 && (
            <li className="text-xs text-[#6F7A5A] px-1">
              + {activeLinks.length - 5} more — see{" "}
              <Link
                href={`/places/${placeId}/edit/links`}
                className="text-[#8F9E4F] underline"
              >
                Manage all
              </Link>
            </li>
          )}
        </ul>
      )}

      {/* Add panel — берёт excludeIds из state, чтобы не предлагать уже линкованные */}
      <AddPlaceLinkPanel
        placeId={placeId}
        kind={kind}
        excludeIds={excludeIds}
        onLinked={() => {
          void refresh();
        }}
      />
    </section>
  );
}

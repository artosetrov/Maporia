"use client";

/**
 * AddPlaceLinkPanel — добавление link'а через автокомплит + "Create new".
 *
 * Используется на /places/[id]/edit/links. Знает, кто здесь parent, кто child:
 *   - если текущая карточка kind='location'  → она parent, ищем service/experience.
 *   - если service/experience              → она child,  ищем location.
 *
 * Создание нового → /add?kind=…&linkTo=<placeId> — на странице /add после
 * успешного insert вызывается createLink, статус (active|pending) определяется
 * автоматически по ownership.
 *
 * См. docs/PLACE_LINKS_PHASE6_PLAN.md § 1.1, § 4.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  searchLinkCandidates,
  createLink,
  type PlaceKindLite,
} from "../lib/placeLinks";
import type { PlaceListItem } from "../types";
import Icon, { type IconName } from "./Icon";

type Props = {
  /** ID карточки, к которой добавляем link (parent если kind=location, иначе child). */
  placeId: string;
  /** kind текущей карточки — определяет направление поиска. */
  kind: PlaceKindLite;
  /** Already-linked IDs (active+pending) — исключаем из результатов поиска. */
  excludeIds: string[];
  /** Колбэк после успешного создания link'а — родитель рефетчит список. */
  onLinked: () => void;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

/**
 * Куда направлен поиск, исходя из kind текущей карточки.
 * Локация ищет experience/service. Experience/service ищет локацию.
 */
function searchTargetKinds(currentKind: PlaceKindLite): PlaceKindLite[] {
  if (currentKind === "location") return ["experience", "service"];
  return ["location"];
}

function iconFor(k: PlaceKindLite | null | undefined): IconName {
  if (k === "location") return "location";
  if (k === "experience") return "sparkles";
  return "wrench";
}

export default function AddPlaceLinkPanel({
  placeId,
  kind,
  excludeIds,
  onLinked,
}: Props) {
  const router = useRouter();
  const isLocationParent = kind === "location";
  const targetKinds = useMemo(() => searchTargetKinds(kind), [kind]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      let cancelled = false;
      searchLinkCandidates({
        query: q,
        kinds: targetKinds,
        excludePlaceId: placeId,
        excludeIds,
      })
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
      return () => {
        cancelled = true;
      };
    }, 250);
    return () => clearTimeout(handle);
  }, [query, targetKinds, placeId, excludeIds]);

  async function handleLink(candidate: PlaceListItem) {
    setLinkingId(candidate.id);
    setError(null);
    setInfo(null);
    try {
      // Определяем parent/child по kind'ам.
      // isLocationParent → текущая = parent, candidate = child.
      // иначе              → candidate = parent (location), текущая = child.
      const parentId = isLocationParent ? placeId : candidate.id;
      const childId = isLocationParent ? candidate.id : placeId;

      const link = await createLink({ parentId, childId });

      if (link.status === "pending") {
        setInfo(
          isLocationParent
            ? "Request sent — the owner of that listing will approve or decline."
            : "Request sent — the location owner will approve or decline.",
        );
      } else {
        setInfo("Linked.");
      }
      setQuery("");
      setResults([]);
      onLinked();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Link failed";
      // Уникальный констрейнт = дубль.
      if (/duplicate|unique/i.test(msg)) {
        setError("Already linked or request pending.");
      } else {
        setError(msg);
      }
    } finally {
      setLinkingId(null);
    }
  }

  // "Create new" options. Для location parent — две: experience и service.
  // Для child (service/experience) — одна: location.
  const createNewOptions: Array<{ kind: PlaceKindLite; label: string; icon: IconName }> =
    isLocationParent
      ? [
          { kind: "experience", label: "Create new experience", icon: "sparkles" },
          { kind: "service", label: "Create new service", icon: "wrench" },
        ]
      : [{ kind: "location", label: "Create new location", icon: "location" }];

  return (
    <section className="rounded-2xl border border-[#ECEEE4] bg-white p-4 sm:p-5 mb-4">
      <header className="mb-3">
        <h2 className="font-fraunces font-semibold text-[#1F2A1F] text-base">
          {isLocationParent
            ? "Add experience or service here"
            : "Link this to a location"}
        </h2>
        <div className="text-xs text-[#6F7A5A] mt-0.5">
          {isLocationParent
            ? "Search your own or others' listings, or create a new one. Cross-owner requests need approval."
            : "Pick a location where this happens. If you own both, the link is active right away."}
        </div>
      </header>

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            isLocationParent
              ? "Search experiences or services…"
              : "Search locations…"
          }
          className="w-full h-11 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 text-sm text-[#1F2A1F] placeholder-[#A8B096] focus:outline-none focus:border-[#8F9E4F] focus:bg-white"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A8B096]">
            …
          </div>
        )}
      </div>

      {/* Results */}
      {query.trim().length >= 2 && (
        <div className="mt-3 space-y-2">
          {results.length === 0 && !searching && (
            <div className="text-xs text-[#A8B096] italic px-1 py-2">
              No matches. Try a different name, or create a new one below.
            </div>
          )}
          {results.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-[#ECEEE4] bg-white p-2 sm:p-3"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#FAFAF7] flex items-center justify-center text-lg shrink-0 overflow-hidden">
                {r.cover_url ? (
                  <Image
                    src={r.cover_url}
                    alt={r.title}
                    width={48}
                    height={48}
                    sizes="48px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Icon name={iconFor(r.kind)} size={18} className="text-[#8F9E4F]" strokeWidth={1.8} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/id/${r.id}`}
                  className="font-medium text-[#1F2A1F] text-sm truncate block hover:underline"
                >
                  {r.title || "Untitled"}
                </Link>
                <div className="text-[11px] text-[#6F7A5A]">
                  <span className="uppercase tracking-wide">{r.kind}</span>
                  {r.city && (
                    <>
                      <span className="mx-1">·</span>
                      <span className="truncate">{r.city}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={linkingId === r.id}
                onClick={() => handleLink(r)}
                className="h-8 px-3 rounded-lg text-xs font-medium bg-[#8F9E4F] text-white hover:bg-[#556036] disabled:opacity-60 shrink-0"
              >
                {linkingId === r.id ? "…" : "Link"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Status messages */}
      {error && (
        <div className="mt-3 text-xs text-[#C96A5B]">{error}</div>
      )}
      {info && (
        <div className="mt-3 text-xs text-[#556036]">{info}</div>
      )}

      {/* Create new */}
      <div className="mt-4 pt-4 border-t border-[#ECEEE4]">
        <div className="text-[11px] uppercase tracking-wide text-[#6F7A5A] font-semibold mb-2">
          Or create new
        </div>
        <div className="flex flex-wrap gap-2">
          {createNewOptions.map((opt) => (
            <button
              key={opt.kind}
              type="button"
              onClick={() => {
                const url = `/add?kind=${opt.kind}&linkTo=${encodeURIComponent(placeId)}`;
                router.push(url);
              }}
              className={cx(
                "h-9 px-3 rounded-lg text-sm font-medium",
                "border border-[#ECEEE4] bg-white text-[#1F2A1F]",
                "hover:border-[#8F9E4F] hover:bg-[#FAFAF7] transition-colors",
              )}
            >
              <Icon name={opt.icon} size={16} className="mr-1.5 inline-block text-[#8F9E4F]" strokeWidth={1.8} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

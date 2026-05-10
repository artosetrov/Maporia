"use client";

/**
 * /places/[id]/edit/links — manage links для карточки.
 *
 * Для location-карточки:
 *   - Approval inbox: pending requests от чужих creator'ов («[Photographer X] wants to host here»)
 *     с кнопками [Approve] / [Reject].
 *   - Active children: own + approved cross — с remove-кнопкой.
 *
 * Для experience/service-карточки:
 *   - Active parents: locations где этот experience hosted.
 *   - Pending requests от меня: «Awaiting approval from <farm owner>».
 *   - Remove на active.
 *
 * Add-flow (autocomplete + create new) — в Φ6 (отдельная задача), здесь только просмотр + approval/remove.
 *
 * См. docs/PLACE_LINKS_PLAN.md § 4.4.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../../../../lib/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import {
  approveLink,
  rejectLink,
  removeLink,
  type PlaceLink,
  type PlaceLinkStatus,
} from "../../../../../lib/placeLinks";
import { ErrorBoundary } from "../../../../../components/ErrorBoundary";
import { PageSkeleton } from "../../../../../components/Skeleton";

type PlaceMini = {
  id: string;
  title: string;
  kind: "location" | "service" | "experience";
  cover_url: string | null;
  created_by: string | null;
};

type LinkWithJoin = PlaceLink & {
  child: PlaceMini | null;
  parent: PlaceMini | null;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function EditLinksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: placeId } = use(params);
  const router = useRouter();
  const { user, access } = useUserAccessContext();

  const [place, setPlace] = useState<PlaceMini | null>(null);
  const [links, setLinks] = useState<LinkWithJoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = access?.isAdmin === true;
  const isOwner = !!user && place?.created_by === user.id;
  const canManage = isOwner || isAdmin;

  // Load place + linked rows
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: placeData, error: placeErr } = await supabase
        .from("places")
        .select("id, title, kind, cover_url, created_by")
        .eq("id", placeId)
        .single();

      if (placeErr || !placeData) {
        if (!cancelled) {
          setError("Place not found");
          setLoading(false);
        }
        return;
      }

      const p = placeData as PlaceMini;
      if (cancelled) return;
      setPlace(p);

      // RLS вернёт нам только то что мы можем видеть (active + наши pending/rejected).
      const linksQuery = supabase
        .from("place_links")
        .select(
          `
          *,
          child:places!place_links_child_place_id_fkey(id, title, kind, cover_url, created_by),
          parent:places!place_links_parent_place_id_fkey(id, title, kind, cover_url, created_by)
        `,
        );
      const scopedLinksQuery =
        p.kind === "location"
          ? linksQuery.eq("parent_place_id", placeId)
          : linksQuery.eq("child_place_id", placeId);

      const { data: linksData, error: linksErr } = await scopedLinksQuery.order(
        "created_at",
        { ascending: false },
      );

      if (cancelled) return;
      if (linksErr) {
        setError(linksErr.message);
      } else {
        // Supabase возвращает joined как объект или массив. Нормализуем.
        const rows = (linksData ?? []) as Array<
          PlaceLink & {
            child: PlaceMini | PlaceMini[] | null;
            parent: PlaceMini | PlaceMini[] | null;
          }
        >;
        const normalized: LinkWithJoin[] = rows.map((row) => ({
          ...row,
          child: Array.isArray(row.child) ? row.child[0] ?? null : row.child,
          parent: Array.isArray(row.parent) ? row.parent[0] ?? null : row.parent,
        }));
        setLinks(normalized);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [placeId]);

  async function handleApprove(linkId: string) {
    setActingId(linkId);
    setError(null);
    try {
      const updated = await approveLink(linkId);
      setLinks((cur) =>
        cur.map((l) => (l.id === linkId ? { ...l, ...updated } : l)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(linkId: string) {
    setActingId(linkId);
    setError(null);
    try {
      const updated = await rejectLink(linkId);
      setLinks((cur) =>
        cur.map((l) => (l.id === linkId ? { ...l, ...updated } : l)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActingId(null);
    }
  }

  async function handleRemove(linkId: string) {
    if (!confirm("Remove this link?")) return;
    setActingId(linkId);
    setError(null);
    try {
      await removeLink(linkId);
      setLinks((cur) => cur.filter((l) => l.id !== linkId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setActingId(null);
    }
  }

  if (loading) {
    return <PageSkeleton />;
  }

  if (!place) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-[#1F2A1F] font-semibold mb-2">Place not found</div>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-[#8F9E4F] underline text-sm"
          >
            Go back
          </button>
        </div>
      </main>
    );
  }

  if (!canManage) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-[#1F2A1F] font-semibold mb-2">
            Only the owner can manage links
          </div>
          <Link href={`/id/${placeId}`} className="text-[#8F9E4F] underline text-sm">
            View place
          </Link>
        </div>
      </main>
    );
  }

  // Группируем links
  const isLocation = place.kind === "location";
  const pendingIncoming = isLocation
    ? links.filter((l) => l.status === "pending")
    : [];
  const pendingOutgoing = !isLocation
    ? links.filter((l) => l.status === "pending")
    : [];
  const active = links.filter((l) => l.status === "active");
  const rejected = links.filter((l) => l.status === "rejected");

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7] pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
          <header className="mb-6">
            <Link
              href={`/places/${placeId}/edit`}
              className="text-sm text-[#6F7A5A] hover:text-[#1F2A1F] inline-flex items-center gap-1"
            >
              ← Back to edit
            </Link>
            <h1 className="font-fraunces text-2xl sm:text-3xl font-semibold text-[#1F2A1F] mt-3">
              Linked places
            </h1>
            <p className="text-sm text-[#6F7A5A] mt-1">
              {isLocation
                ? "Experiences & services hosted at this location."
                : "Locations where this offering happens."}
            </p>
          </header>

          {error && (
            <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-3 text-sm text-[#C96A5B]">
              {error}
            </div>
          )}

          {/* Approval inbox — только для location owner'а */}
          {isLocation && pendingIncoming.length > 0 && (
            <SectionCard
              title="Approval requests"
              subtitle={`${pendingIncoming.length} ${
                pendingIncoming.length === 1 ? "request" : "requests"
              } awaiting your approval`}
              tone="amber"
            >
              <div className="space-y-2">
                {pendingIncoming.map((l) => (
                  <LinkRow
                    key={l.id}
                    other={l.child}
                    statusBadge={null}
                    actions={
                      <>
                        <button
                          type="button"
                          disabled={actingId === l.id}
                          onClick={() => handleApprove(l.id)}
                          className="h-8 px-3 rounded-lg text-xs font-medium bg-[#8F9E4F] text-white hover:bg-[#556036] disabled:opacity-60"
                        >
                          {actingId === l.id ? "…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={actingId === l.id}
                          onClick={() => handleReject(l.id)}
                          className="h-8 px-3 rounded-lg text-xs font-medium border border-[#ECEEE4] text-[#6F7A5A] hover:bg-white disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </>
                    }
                  />
                ))}
              </div>
            </SectionCard>
          )}

          {/* Outgoing pending — для child owner */}
          {!isLocation && pendingOutgoing.length > 0 && (
            <SectionCard
              title="Pending"
              subtitle="Awaiting approval from location owners"
              tone="amber"
            >
              <div className="space-y-2">
                {pendingOutgoing.map((l) => (
                  <LinkRow
                    key={l.id}
                    other={l.parent}
                    statusBadge={<Badge status="pending" />}
                    actions={
                      <button
                        type="button"
                        disabled={actingId === l.id}
                        onClick={() => handleRemove(l.id)}
                        className="h-8 px-3 rounded-lg text-xs font-medium border border-[#ECEEE4] text-[#6F7A5A] hover:bg-white disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    }
                  />
                ))}
              </div>
            </SectionCard>
          )}

          {/* Active links */}
          <SectionCard
            title={isLocation ? "Hosted here" : "Hosted at"}
            subtitle={
              active.length === 0
                ? "Nothing linked yet."
                : `${active.length} ${active.length === 1 ? "link" : "links"}`
            }
            tone="default"
          >
            {active.length === 0 ? (
              <div className="text-sm text-[#A8B096]">
                {isLocation
                  ? "Add experiences or services and link them here."
                  : "Link this offering to a location to show it on the map."}
              </div>
            ) : (
              <div className="space-y-2">
                {active.map((l) => {
                  const other = isLocation ? l.child : l.parent;
                  return (
                    <LinkRow
                      key={l.id}
                      other={other}
                      statusBadge={<Badge status="active" />}
                      actions={
                        <button
                          type="button"
                          disabled={actingId === l.id}
                          onClick={() => handleRemove(l.id)}
                          className="h-8 px-3 rounded-lg text-xs font-medium border border-[#ECEEE4] text-[#6F7A5A] hover:bg-white disabled:opacity-60"
                        >
                          Remove
                        </button>
                      }
                    />
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Rejected — collapsed by default, для аудита */}
          {rejected.length > 0 && (
            <SectionCard
              title="Rejected"
              subtitle={`${rejected.length} archived`}
              tone="muted"
            >
              <div className="space-y-2 opacity-70">
                {rejected.map((l) => {
                  const other = isLocation ? l.child : l.parent;
                  return (
                    <LinkRow
                      key={l.id}
                      other={other}
                      statusBadge={<Badge status="rejected" />}
                      actions={
                        <button
                          type="button"
                          onClick={() => handleRemove(l.id)}
                          className="h-8 px-3 rounded-lg text-xs font-medium text-[#A8B096] hover:text-[#6F7A5A]"
                        >
                          Delete
                        </button>
                      }
                    />
                  );
                })}
              </div>
            </SectionCard>
          )}

          <div className="mt-8 rounded-xl bg-[#FAFAF7] border border-[#ECEEE4] p-4 text-xs text-[#6F7A5A] leading-relaxed">
            💡 To <strong>add</strong> a link, go to the offering&apos;s edit page or
            create a new one and pick a location during setup. (Add-from-here UI
            coming in next update.)
          </div>
        </div>
      </main>
    </ErrorBoundary>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle?: string;
  tone: "default" | "amber" | "muted";
  children: React.ReactNode;
}) {
  const toneClasses =
    tone === "amber"
      ? "border-[#E2B36F]/40 bg-[#FFF8EC]"
      : tone === "muted"
        ? "border-[#ECEEE4] bg-white/60"
        : "border-[#ECEEE4] bg-white";
  return (
    <section
      className={cx(
        "rounded-2xl border p-4 sm:p-5 mb-4",
        toneClasses,
      )}
    >
      <header className="mb-3">
        <h2 className="font-fraunces font-semibold text-[#1F2A1F] text-base">
          {title}
        </h2>
        {subtitle && (
          <div className="text-xs text-[#6F7A5A] mt-0.5">{subtitle}</div>
        )}
      </header>
      {children}
    </section>
  );
}

function LinkRow({
  other,
  statusBadge,
  actions,
}: {
  other: PlaceMini | null;
  statusBadge: React.ReactNode;
  actions: React.ReactNode;
}) {
  if (!other) {
    return (
      <div className="text-xs text-[#A8B096] italic px-2 py-3">
        (place was deleted)
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#ECEEE4] bg-white p-2 sm:p-3">
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#FAFAF7] flex items-center justify-center text-lg shrink-0 overflow-hidden">
        {other.cover_url ? (
          <Image
            src={other.cover_url}
            alt={other.title}
            width={48}
            height={48}
            sizes="48px"
            className="h-full w-full object-cover"
          />
        ) : other.kind === "location" ? (
          "📍"
        ) : other.kind === "experience" ? (
          "✨"
        ) : (
          "🛠"
        )}
      </div>
      <div className="flex-1 min-w-0">
        <Link
          href={`/id/${other.id}`}
          className="font-medium text-[#1F2A1F] text-sm truncate block hover:underline"
        >
          {other.title}
        </Link>
        <div className="text-[11px] text-[#6F7A5A] uppercase tracking-wide">
          {other.kind}
          {statusBadge && <span className="ml-2">{statusBadge}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </div>
  );
}

function Badge({ status }: { status: PlaceLinkStatus }) {
  const map = {
    active: "bg-[#A4B968]/20 text-[#556036]",
    pending: "bg-[#E2B36F]/20 text-[#8A6926]",
    rejected: "bg-[#C96A5B]/15 text-[#8B3D2E]",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide normal-case",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

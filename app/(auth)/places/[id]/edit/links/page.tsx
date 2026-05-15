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

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../../../../lib/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../../lib/access";
import {
  approveLink,
  rejectLink,
  removeLink,
  type PlaceLink,
  type PlaceLinkStatus,
} from "../../../../../lib/placeLinks";
import { ErrorBoundary } from "../../../../../components/ErrorBoundary";
import { PageSkeleton } from "../../../../../components/Skeleton";
import AddPlaceLinkPanel from "../../../../../components/AddPlaceLinkPanel";
import Icon from "../../../../../components/Icon";
import ConfirmDialog from "../../../../../components/ConfirmDialog";

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

  // Закрытие страницы: если есть история — назад (туда, откуда юзер пришёл,
  // обычно /places/:id/edit). Если истории нет (прямой заход / refresh) —
  // фолбэком пушим Edit place. Раньше тут всегда был router.push на /edit,
  // что в комбинации с router.back() на Edit давало петлю Edit ↔ Links.
  const handleExit = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(`/places/${placeId}/edit`);
    }
  }, [router, placeId]);

  const [place, setPlace] = useState<PlaceMini | null>(null);
  const [links, setLinks] = useState<LinkWithJoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkToRemoveId, setLinkToRemoveId] = useState<string | null>(null);

  const isAdmin = isUserAdmin(access);
  const isOwner = !!user && place?.created_by === user.id;
  const canManage = isOwner || isAdmin;

  // Грузим place + linked rows. Выделено в callback, чтобы AddPlaceLinkPanel мог
  // дёрнуть `refresh()` после успешного createLink.
  const refresh = useCallback(async (): Promise<void> => {
    const { data: placeData, error: placeErr } = await supabase
      .from("places")
      .select("id, title, kind, cover_url, created_by")
      .eq("id", placeId)
      .single();

    if (placeErr || !placeData) {
      setError("Place not found");
      return;
    }

    const p = placeData as PlaceMini;
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
  }, [placeId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

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
    setActingId(linkId);
    setError(null);
    try {
      await removeLink(linkId);
      setLinks((cur) => cur.filter((l) => l.id !== linkId));
      setLinkToRemoveId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
      setLinkToRemoveId(null);
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
      <main className="min-h-screen bg-[#FAFAF7] pb-24">
        <ConfirmDialog
          open={linkToRemoveId !== null}
          title="Remove link?"
          description="This disconnects the linked place from this listing. You can request or add the link again later."
          confirmLabel="Remove"
          loading={linkToRemoveId !== null && actingId === linkToRemoveId}
          onClose={() => {
            if (!actingId) setLinkToRemoveId(null);
          }}
          onConfirm={() => {
            if (linkToRemoveId) void handleRemove(linkToRemoveId);
          }}
        />
        {/* Top App Bar — sticky, как в /places/[id]/edit */}
        <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-16 gap-2">
              <div
                className="font-semibold font-fraunces text-[#1F2A1F] min-w-0 flex-1 truncate"
                style={{ fontSize: "24px" }}
              >
                Linked places
              </div>
              <button
                type="button"
                onClick={handleExit}
                className="p-2 -mr-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition flex-shrink-0"
                aria-label="Close"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
          <p className="text-sm text-[#6F7A5A] mb-6">
            {isLocation
              ? "Experiences & services hosted at this location."
              : "Locations where this offering happens."}
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-3 text-sm text-[#C96A5B]">
              {error}
            </div>
          )}

          {/* Add new link — autocomplete + Create new */}
          <AddPlaceLinkPanel
            placeId={placeId}
            kind={place.kind}
            excludeIds={links
              .filter((l) => l.status === "active" || l.status === "pending")
              .map((l) =>
                place.kind === "location" ? l.child_place_id : l.parent_place_id,
              )}
            onLinked={() => {
              void refresh();
            }}
          />

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
	                        onClick={() => setLinkToRemoveId(l.id)}
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
	                          onClick={() => setLinkToRemoveId(l.id)}
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
	                          onClick={() => setLinkToRemoveId(l.id)}
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

        </div>

        {/* Bottom Action Bar — fixed, как в /places/[id]/edit */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#ECEEE4] pb-safe-bottom">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleExit}
                className="flex-1 h-11 rounded-xl border border-[#ECEEE4] bg-white px-5 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExit}
                className="flex-1 h-11 rounded-xl bg-[#8F9E4F] px-5 text-sm font-medium text-white hover:bg-[#556036] transition"
              >
                Done
              </button>
            </div>
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

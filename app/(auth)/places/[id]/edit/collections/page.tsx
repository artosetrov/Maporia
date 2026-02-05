"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../../lib/supabase";
import type { Database } from "../../../../../types/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../../lib/access";
import Icon from "../../../../../components/Icon";
import type { Collection } from "../../../../../types";

type PlaceCollectionInsert = Database["public"]["Tables"]["place_collections"]["Insert"];

type PlaceRow = Pick<{ created_by: string | null }, "created_by">;
type PlaceCollectionRow = { id: string; collection_id: string; place_id: string; sort_order?: number };

type PageProps = { params: Promise<{ id: string }> };

export default function PlaceCollectionsEditorPage(props: PageProps) {
  const router = useRouter();
  const { id: placeId } = use(props.params);

  const { loading: accessLoading, user, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!placeId || !user || accessLoading) return;
    if (!isAdmin) {
      router.replace(`/places/${placeId}/edit`);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);

      const { data: placeData, error: placeError } = await supabase
        .from("places")
        .select("created_by")
        .eq("id", placeId)
        .single();

      const place = placeData as PlaceRow | null;
      if (placeError || !place) {
        router.push(`/places/${placeId}/edit`);
        setLoading(false);
        return;
      }

      const collectionsRes = await supabase
        .from("collections")
        .select("id, title, description, cover_image, access_type, is_active")
        .order("title", { ascending: true });

      let placeCollectionsData: PlaceCollectionRow[] | null = null;
      const pcRes = await supabase
        .from("place_collections")
        .select("id, collection_id, place_id, sort_order")
        .eq("place_id", placeId);

      if (pcRes.error && pcRes.error.message?.includes("sort_order")) {
        const legacy = await supabase
          .from("place_collections")
          .select("id, collection_id, place_id")
          .eq("place_id", placeId);
        placeCollectionsData = (legacy.data ?? []) as PlaceCollectionRow[];
      } else {
        placeCollectionsData = (pcRes.data ?? []) as PlaceCollectionRow[];
      }

      const collectionsList = (collectionsRes.data as Collection[]) ?? [];
      setCollections(collectionsList);

      const rows = placeCollectionsData ?? [];
      const ids = new Set(rows.map((r) => r.collection_id));
      setSelectedIds(ids);
      setOriginalIds(ids);

      setLoading(false);
    })();
  }, [placeId, user, accessLoading, isAdmin, router]);

  const hasChanges =
    selectedIds.size !== originalIds.size ||
    [...selectedIds].some((id) => !originalIds.has(id)) ||
    [...originalIds].some((id) => !selectedIds.has(id));
  const canSave = hasChanges && !saving;

  async function handleSave() {
    if (!canSave || !placeId) return;

    setSaving(true);
    setError(null);

    const toAdd = [...selectedIds].filter((id) => !originalIds.has(id));
    const toRemove = [...originalIds].filter((id) => !selectedIds.has(id));

    try {
      if (toRemove.length > 0) {
        const { data: existingRows } = await supabase
          .from("place_collections")
          .select("id")
          .eq("place_id", placeId)
          .in("collection_id", toRemove);

        const idsToDelete = (existingRows ?? []).map((r: { id: string }) => r.id);
        if (idsToDelete.length > 0) {
          const { error: delError } = await supabase
            .from("place_collections")
            .delete()
            .in("id", idsToDelete);
          if (delError) throw delError;
        }
      }

      if (toAdd.length > 0) {
        for (let i = 0; i < toAdd.length; i++) {
          const collectionId = toAdd[i];
          let nextOrder = -1;
          const maxRes = await supabase
            .from("place_collections")
            .select("sort_order")
            .eq("collection_id", collectionId)
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!maxRes.error) {
            nextOrder = (maxRes.data as { sort_order?: number } | null)?.sort_order ?? -1;
          }

          const sortOrder = nextOrder + 1;

          const insertPayload: PlaceCollectionInsert = {
            place_id: placeId,
            collection_id: collectionId,
            sort_order: sortOrder,
          };
          let insertError = (
            await supabase.from("place_collections").insert(insertPayload as never)
          ).error;

          if (insertError?.message?.includes("sort_order")) {
            insertError = (
              await supabase.from("place_collections").insert({
                ...insertPayload,
                sort_order: sortOrder,
              } as never)
            ).error;
          }
          if (insertError) throw insertError;
        }
      }

      setOriginalIds(new Set(selectedIds));
      if (navigator.vibrate) navigator.vibrate(10);
      router.push(`/places/${placeId}/edit`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function toggleCollection(collectionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  }

  if (accessLoading || !isAdmin) {
    return (
      <main className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="h-8 w-48 bg-border-light rounded animate-pulse" />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-warm-white">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
          <div className="h-8 w-48 bg-border-light rounded animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-border-light rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-warm-white pb-24">
      <div className="sticky top-0 z-30 bg-white border-b border-border-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link
              href={`/places/${placeId}/edit`}
              className="p-2 -ml-2 text-content-primary hover:bg-warm-white rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </Link>
            <h1 className="font-semibold font-fraunces text-content-primary text-lg">
              Collections
            </h1>
            <span className="w-9" />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
            {error}
          </div>
        )}

        <p className="text-sm text-content-secondary mb-4">
          Assign this place to one or more collections. Only admins can edit collections. Default: none.
        </p>

        {collections.length === 0 ? (
          <div className="rounded-2xl border border-border-light bg-white p-6 text-center text-content-secondary text-sm">
            No collections yet. Create collections in Profile → Elements → Collections.
          </div>
        ) : (
          <ul className="space-y-2">
            {collections.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 rounded-xl border border-border-light bg-white p-4 cursor-pointer hover:bg-warm-white transition">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleCollection(c.id)}
                    className="mt-0.5"
                    aria-label={`Select ${c.title}`}
                  />
                  <div className="w-12 h-12 rounded-lg bg-border-light overflow-hidden flex-shrink-0">
                    {c.cover_image ? (
                      <img src={c.cover_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-content-muted">
                        <Icon name="photo" size={20} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-content-primary">{c.title}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      c.access_type === "premium" ? "bg-olive-primary/20 text-olive-dark" : "bg-border-light text-content-secondary"
                    }`}>
                      {c.access_type}
                    </span>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 mt-8">
          <Link
            href={`/places/${placeId}/edit`}
            className="flex-1 h-11 rounded-xl border border-border-light bg-white px-5 text-sm font-medium text-content-primary hover:bg-warm-white transition flex items-center justify-center"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 h-11 rounded-xl bg-olive-primary text-white text-sm font-medium hover:bg-olive-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </main>
  );
}

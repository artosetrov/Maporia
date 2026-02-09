"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { useUserAccessContext } from "../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../lib/access";
import Icon from "../../../components/Icon";
import type { Collection } from "../../../types";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

export default function AdminCollectionsPage() {
  const router = useRouter();
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [placesCount, setPlacesCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessLoading) return;
    if (!isAdmin) {
      router.replace("/profile");
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("collections")
        .select("id, title, description, cover_image, access_type, is_active, created_at")
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        setPlacesCount({});
        setLoading(false);
        return;
      }
      const list = (data as Collection[]) ?? [];
      setCollections(list);
      if (list.length === 0) {
        setPlacesCount({});
        setLoading(false);
        return;
      }
      const collectionIds = list.map((c) => c.id);
      const { data: pcData } = await supabase
        .from("place_collections")
        .select("collection_id")
        .in("collection_id", collectionIds);
      const rows = (pcData as { collection_id: string }[] | null) ?? [];
      const countByCollection: Record<string, number> = {};
      for (const r of rows) {
        countByCollection[r.collection_id] = (countByCollection[r.collection_id] ?? 0) + 1;
      }
      setPlacesCount(countByCollection);
      setLoading(false);
    })();
  }, [accessLoading, isAdmin, router]);

  if (accessLoading || !isAdmin) {
    return (
      <main className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="h-8 w-48 bg-border-light rounded animate-pulse" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-warm-white pb-24">
      <div className="sticky top-0 z-30 bg-white border-b border-border-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push("/profile")}
              className="p-2 -ml-2 text-content-primary hover:bg-warm-white rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <h1 className="font-semibold font-fraunces text-content-primary text-lg">
              Collections (Admin)
            </h1>
            <Link
              href="/admin/collections/new"
              className="p-2 rounded-lg bg-olive-primary text-white hover:bg-olive-dark transition"
              aria-label="New collection"
            >
              <Icon name="add" size={20} />
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border-light bg-white p-5 animate-pulse">
                <div className="h-6 w-48 bg-border-light rounded mb-2" />
                <div className="h-4 w-full bg-border-light rounded" />
              </div>
            ))}
          </div>
        ) : collections.length === 0 ? (
          <div className="rounded-2xl border border-border-light bg-white p-8 text-center">
            <p className="text-content-secondary mb-4">No collections yet.</p>
            <Link
              href="/admin/collections/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-olive-primary text-white text-sm font-medium hover:bg-olive-dark transition"
            >
              <Icon name="add" size={18} />
              Create collection
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {collections.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/collections/${c.id}/edit`}
                  className="block rounded-2xl border border-border-light bg-white p-5 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex gap-4">
                    <div className="w-20 h-20 rounded-xl bg-border-light overflow-hidden flex-shrink-0">
                      {c.cover_image ? (
                        <img
                          src={c.cover_image}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-content-muted">
                          <Icon name="photo" size={24} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-fraunces font-semibold text-content-primary truncate">
                          {c.title}
                        </h2>
                        {!c.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-disabled-bg text-content-secondary">
                            Inactive
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            c.access_type === "premium"
                              ? "bg-olive-primary/20 text-olive-dark"
                              : "bg-border-light text-content-secondary"
                          }`}
                        >
                          {c.access_type}
                        </span>
                      </div>
                      {c.description && (
                        <p className="text-sm text-content-secondary line-clamp-2 mt-1">
                          {c.description}
                        </p>
                      )}
                      <p className="text-sm text-content-muted mt-1">
                        {placesCount[c.id] ?? 0} {placesCount[c.id] === 1 ? "place" : "places"}
                      </p>
                    </div>
                    <Icon name="forward" size={20} className="text-content-secondary flex-shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

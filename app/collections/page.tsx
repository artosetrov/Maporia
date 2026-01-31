"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import Icon from "../components/Icon";
import { usePremiumGate } from "../hooks/usePremiumGate";
import AuthModal from "../components/AuthModal";
import PremiumUpsellModal from "../components/PremiumUpsellModal";
import type { Collection } from "../types";

export default function CollectionsPage() {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [placesCount, setPlacesCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    isPremium,
    loading: gateLoading,
    openPremiumCollection,
    closePremiumModal,
    closeAuthModal,
    modalOpen,
    modalContext,
    modalCollectionTitle,
    authModalOpen,
    authRedirectPath,
  } = usePremiumGate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const { data: colData, error: fetchError } = await supabase
        .from("collections")
        .select("id, title, description, cover_image, access_type, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const allCollections = (colData as Collection[]) ?? [];
      if (allCollections.length === 0) {
        setCollections([]);
        setLoading(false);
        return;
      }

      const collectionIds = allCollections.map((c) => c.id);
      const { data: pcData } = await supabase
        .from("place_collections")
        .select("collection_id")
        .in("collection_id", collectionIds);

      const rows = (pcData as { collection_id: string }[] | null) ?? [];
      const idsWithPlaces = new Set(rows.map((r) => r.collection_id));
      const countByCollection: Record<string, number> = {};
      for (const r of rows) {
        countByCollection[r.collection_id] = (countByCollection[r.collection_id] ?? 0) + 1;
      }
      setPlacesCount(countByCollection);
      const withPlaces = allCollections.filter((c) => idsWithPlaces.has(c.id));
      setCollections(withPlaces);
      setLoading(false);
    })();
  }, []);

  function handleViewCollection(c: Collection) {
    if (c.access_type === "free") {
      router.push(`/collections/${c.id}`);
      return;
    }
    if (gateLoading) return;
    if (isPremium) {
      router.push(`/collections/${c.id}`);
      return;
    }
    openPremiumCollection(c.id, c.title);
  }

  return (
    <>
      <TopBar />
      <main className="min-h-screen bg-warm-white pt-safe-top pb-safe-bottom">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-12">
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-semibold font-fraunces text-content-primary mb-2">
              Collections
            </h1>
            <p className="text-lg text-content-secondary">
              Curated lists of places to explore
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border-light bg-white overflow-hidden animate-pulse"
                >
                  <div className="aspect-[21/9] bg-border-light" />
                  <div className="p-5">
                    <div className="h-6 w-48 bg-border-light rounded mb-2" />
                    <div className="h-4 w-full bg-border-light rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : collections.length === 0 ? (
            <div className="rounded-2xl border border-border-light bg-white p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-border-light flex items-center justify-center mx-auto mb-4">
                <Icon name="grid" size={32} className="text-content-muted" />
              </div>
              <p className="text-content-secondary">No collections yet. Check back later.</p>
            </div>
          ) : (
            <ul className="space-y-6">
              {collections.map((c) => (
                <li key={c.id} className="rounded-2xl border border-border-light bg-white overflow-hidden shadow-sm hover:shadow-md transition">
                  <div className="aspect-[21/9] bg-border-light relative overflow-hidden">
                    {c.cover_image ? (
                      <img
                        src={c.cover_image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-content-muted">
                        <Icon name="photo" size={48} />
                      </div>
                    )}
                    <div className="absolute top-3 right-3">
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          c.access_type === "premium"
                            ? "bg-olive-primary text-white"
                            : "bg-white/90 text-content-secondary"
                        }`}
                      >
                        {c.access_type === "premium" ? "Premium" : "Free"}
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <h2 className="font-fraunces font-semibold text-content-primary text-xl mb-1">
                      {c.title}
                    </h2>
                    {c.description && (
                      <p className="text-sm text-content-secondary line-clamp-2 mb-2">
                        {c.description}
                      </p>
                    )}
                    <p className="text-sm text-content-muted mb-4">
                      {placesCount[c.id] ?? 0} {placesCount[c.id] === 1 ? "place" : "places"}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleViewCollection(c)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-olive-primary text-white text-sm font-medium hover:bg-olive-dark transition"
                    >
                      View collection
                      <Icon name="forward" size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomNav />

      <AuthModal
        isOpen={authModalOpen}
        onClose={closeAuthModal}
        redirectPath={authRedirectPath}
      />
      <PremiumUpsellModal
        open={modalOpen}
        onClose={closePremiumModal}
        context={modalContext}
        placeTitle={modalContext === "collection" ? modalCollectionTitle : undefined}
      />
    </>
  );
}

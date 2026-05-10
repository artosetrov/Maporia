"use client";

import { use, useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import PlaceCard from "../../components/PlaceCard";
import Icon from "../../components/Icon";
import { usePremiumGate } from "../../hooks/usePremiumGate";
import { useUserAccessContext } from "../../contexts/UserAccessContext";
import type { Collection } from "../../types";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
import { useBatchPlaceData } from "../../hooks/useBatchPlaceData";

type PlaceRow = {
  id: string;
  title: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  cover_url: string | null;
  categories: string[] | null;
  tags: string[] | null;
  created_by: string | null;
  access_level: string | null;
  visibility: string | null;
};

type PageProps = { params: Promise<{ id: string }> };

export default function CollectionDetailPage(props: PageProps) {
  const router = useRouter();
  const { id: collectionId } = use(props.params);
  const { user, access } = useUserAccessContext();
  const premiumGateOpenedRef = useRef(false);
  const {
    isPremium,
    loading: gateLoading,
    openPremiumCollection,
  } = usePremiumGate();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const collectionPlaceIds = useMemo(() => places.map((place) => place.id), [places]);
  const collectionCreatorIds = useMemo(
    () =>
      Array.from(
        new Set(
          places
            .map((place) => place.created_by)
            .filter((id): id is string => Boolean(id))
        )
      ),
    [places]
  );
  const batchData = useBatchPlaceData(collectionPlaceIds, collectionCreatorIds);

  useEffect(() => {
    if (!collectionId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setNotFound(false);

      try {
        const res = await fetch(`/api/collections/${collectionId}/places`);
        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json()) as { collection: Collection; places: PlaceRow[] };
          if (data?.collection) {
            setCollection(data.collection);
            setPlaces(Array.isArray(data.places) ? data.places : []);
          } else {
            setNotFound(true);
          }
          setLoading(false);
          return;
        }

        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const body = await res.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : res.statusText);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      }

      setLoading(false);

      // Fallback: load from client (RLS applies — only visible places)
      try {
        const { data: colData, error: colError } = await supabase
          .from("collections")
          .select("id, title, description, cover_image, access_type, is_active")
          .eq("id", collectionId)
          .eq("is_active", true)
          .single();

        if (cancelled) return;
        if (colError || !colData) {
          setNotFound(true);
          return;
        }

        setCollection(colData as Collection);
        setError(null);

        type PcRow = { place_id: string; sort_order?: number };
        let pcData: PcRow[] | null = null;
        const pcRes = await supabase
          .from("place_collections")
          .select("place_id, sort_order")
          .eq("collection_id", collectionId)
          .order("sort_order", { ascending: true });

        if (cancelled) return;
        pcData = (pcRes.data ?? null) as PcRow[] | null;

        if (pcRes.error && pcRes.error.message?.includes("sort_order")) {
          const legacyRes = await supabase
            .from("place_collections")
            .select("place_id")
            .eq("collection_id", collectionId);
          if (cancelled) return;
          const legacyRows = (legacyRes.data ?? []) as { place_id: string }[];
          pcData = legacyRows.map((r, i) => ({ place_id: r.place_id, sort_order: i }));
        } else if (pcRes.error) {
          return;
        }

        const rows: PcRow[] = pcData ?? [];
        if (rows.length === 0) {
          setPlaces([]);
          return;
        }

        const placeIds = rows.map((r) => r.place_id).filter(Boolean);
        if (placeIds.length === 0) {
          setPlaces([]);
          return;
        }

        const orderMap: Record<string, number> = {};
        rows.forEach((r, i) => {
          orderMap[r.place_id] = i;
        });

        const { data: placesData } = await supabase
          .from("places")
          .select("id,title,description,city,country,cover_url,categories,tags,created_by,access_level,visibility,address,lat,lng")
          .in("id", placeIds);

        if (cancelled) return;
        const rawList = (placesData ?? []) as Record<string, unknown>[];
        const list = rawList.map((p) => ({
          id: p.id as string,
          title: p.title as string,
          description: (p.description as string | null) ?? null,
          address: (p.address as string | null) ?? null,
          city: (p.city as string | null) ?? null,
          country: (p.country as string | null) ?? null,
          cover_url: (p.cover_url as string | null) ?? null,
          categories: (p.categories as string[] | null) ?? null,
          tags: (p.tags as string[] | null) ?? null,
          created_by: (p.created_by as string | null) ?? null,
          access_level: (p.access_level as string | null) ?? null,
          visibility: (p.visibility as string | null) ?? null,
        })) as PlaceRow[];
        list.sort((a, b) => (orderMap[a.id] ?? 0) - (orderMap[b.id] ?? 0));
        setPlaces(list);
      } catch {
        // ignore fallback errors
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  const isPremiumCollection = collection?.access_type === "premium";
  const canAccess =
    !isPremiumCollection || isPremium || gateLoading;
  const shouldShowGate =
    isPremiumCollection && !gateLoading && !isPremium;
  const collectionIdForGate = collection?.id ?? null;
  const collectionTitleForGate = collection?.title ?? "";

  useEffect(() => {
    if (!collectionIdForGate || !shouldShowGate || premiumGateOpenedRef.current) return;
    premiumGateOpenedRef.current = true;
    openPremiumCollection(collectionIdForGate, collectionTitleForGate);
  }, [collectionIdForGate, collectionTitleForGate, shouldShowGate, openPremiumCollection]);

  if (!collectionId) {
    return null;
  }

  if (notFound) {
    return (
      <>
        <main className="min-h-screen bg-warm-white pb-safe-bottom">
          <div className="sticky top-0 z-30 bg-white border-b border-border-light">
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
              <div className="flex items-center justify-between h-14">
                <button
                  onClick={() => router.back()}
                  className="p-2 -ml-2 text-content-primary hover:bg-warm-white rounded-lg transition"
                  aria-label="Back"
                >
                  <Icon name="back" size={20} />
                </button>
                <h1 className="font-fraunces text-lg font-semibold text-content-primary">Collection</h1>
                <div className="w-9" />
              </div>
            </div>
          </div>
          <div className="min-h-[60vh] flex items-center justify-center px-4">
            <div className="text-center">
              <p className="text-xl font-semibold font-fraunces text-content-primary mb-2">Collection not found</p>
              <Link href="/collections" className="text-olive-primary hover:underline">
                Back to Collections
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const pageTitle = collection?.title ?? "Collection";

  return (
    <SectionErrorBoundary>
      <>
      <main className="min-h-screen bg-warm-white pb-safe-bottom">
        <div className="sticky top-0 z-30 bg-white border-b border-border-light">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-14">
              <button
                onClick={() => router.back()}
                className="p-2 -ml-2 text-content-primary hover:bg-warm-white rounded-lg transition"
                aria-label="Back"
              >
                <Icon name="back" size={20} />
              </button>
              <h1 className="font-fraunces text-lg font-semibold text-content-primary truncate max-w-[60%]">
                {pageTitle}
              </h1>
              <div className="w-9" />
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {loading ? (
            <div className="space-y-6">
              <div className="aspect-[21/9] rounded-2xl bg-border-light animate-pulse" />
              <div className="h-8 w-64 bg-border-light rounded animate-pulse" />
              <div className="h-4 w-full bg-border-light rounded animate-pulse" />
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-64 rounded-2xl bg-border-light animate-pulse" />
                ))}
              </div>
            </div>
          ) : collection ? (
            <>
              <header className="rounded-2xl border border-border-light bg-white overflow-hidden shadow-sm mb-8">
                <div className="aspect-[21/9] bg-border-light relative">
                  {collection.cover_image ? (
                    <Image
                      src={collection.cover_image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 896px"
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
                        collection.access_type === "premium"
                          ? "bg-olive-primary text-white"
                          : "bg-white/90 text-content-secondary"
                      }`}
                    >
                      {collection.access_type === "premium" ? "Premium" : "Free"}
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <h1 className="font-fraunces font-semibold text-content-primary text-2xl mb-2">
                    {collection.title}
                  </h1>
                  {collection.description && (
                    <p className="text-content-secondary leading-relaxed">
                      {collection.description}
                    </p>
                  )}
                </div>
              </header>

              {error && (
                <div className="mb-4 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
                  {error}
                </div>
              )}

              {!canAccess ? (
                <div className="rounded-2xl border border-border-light bg-white p-8 text-center">
                  <p className="text-content-secondary mb-4">
                    Sign in or upgrade to view this premium collection.
                  </p>
                  <p className="text-sm text-content-muted">
                    Use the modal to sign in or upgrade.
                  </p>
                </div>
              ) : places.length === 0 ? (
                <div className="rounded-2xl border border-border-light bg-white p-12 text-center">
                  <p className="text-content-secondary">No places in this collection yet.</p>
                </div>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {places.map((place) => (
                    <li key={place.id}>
                      <PlaceCard
                        place={{
                          id: place.id,
                          title: place.title,
                          description: place.description,
                          address: place.address,
                          city: place.city,
                          country: place.country,
                          cover_url: place.cover_url,
                          categories: place.categories,
                          tags: place.tags,
                          created_by: place.created_by,
                          access_level: place.access_level,
                          visibility: place.visibility,
                        }}
                        userAccess={access}
                        userId={user?.id ?? null}
                        showPhotoSlider={true}
                        batchPhotos={batchData.photos.get(place.id)}
                        batchProfile={place.created_by ? batchData.profiles.get(place.created_by) : undefined}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </main>

      </>
    </SectionErrorBoundary>
  );
}

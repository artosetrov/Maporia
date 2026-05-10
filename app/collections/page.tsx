"use client";

import { Suspense, useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import TopBar from "../components/TopBar";
import PlaceCard from "../components/PlaceCard";
import Icon from "../components/Icon";
import { usePremiumGate } from "../hooks/usePremiumGate";
import { useUserAccessContext } from "../contexts/UserAccessContext";
import { PlaceCardGridSkeleton } from "../components/Skeleton";
import type { Collection } from "../types";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
import { useBatchPlaceData } from "../hooks/useBatchPlaceData";

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

function CollectionsPageSkeleton() {
  return (
    <>
      <TopBar
        showSearchBar={true}
        searchValue=""
        onSearchChange={() => {}}
        selectedCity={null}
        onCityChange={() => {}}
        onFiltersClick={() => {}}
        activeFiltersCount={0}
        userAvatar={null}
        userDisplayName={null}
        userEmail={null}
        onSearchBarClick={() => {}}
      />
      <main className="min-h-screen bg-warm-white pt-safe-top pb-safe-bottom">
        <div className="border-b border-border-light bg-warm-white pt-16 sm:pt-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-4">
            <h1 className="text-xl sm:text-2xl font-semibold font-fraunces text-content-primary mb-3">
              Collections
            </h1>
            <div className="flex gap-4 overflow-hidden">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-[calc((100%-2rem)/3)] lg:w-[calc((100%-5rem)/6)] aspect-square rounded-lg bg-border-light animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-6">
          <PlaceCardGridSkeleton count={6} columns={2} />
        </div>
      </main>
    </>
  );
}

function CollectionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [placesCount, setPlacesCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const urlCollectionId = searchParams.get("collection");
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(urlCollectionId);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
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

  const { access, user, profile } = useUserAccessContext();
  const userAvatar = profile?.avatar_url ?? null;
  const userDisplayName = profile?.display_name ?? (user?.email ? user.email.split("@")[0] : null);
  const userEmail = user?.email ?? null;

  const {
    isPremium,
    loading: gateLoading,
    openPremiumCollection,
  } = usePremiumGate();

  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId) ?? null,
    [collections, activeCollectionId]
  );
  const activeCount = activeCollectionId ? (placesCount[activeCollectionId] ?? 0) : 0;
  const isPremiumCollection = activeCollection?.access_type === "premium";
  const canAccessActive = !isPremiumCollection || isPremium || gateLoading;

  useEffect(() => {
    if (urlCollectionId != null) setActiveCollectionId(urlCollectionId);
  }, [urlCollectionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: colData, error: fetchError } = await supabase
        .from("collections")
        .select("id, title, description, cover_image, access_type, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (fetchError) {
        if (cancelled) return;
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const allCollections = (colData as Collection[]) ?? [];
      if (allCollections.length === 0) {
        if (cancelled) return;
        setCollections([]);
        setActiveCollectionId(null);
        setLoading(false);
        return;
      }

      const collectionIds = allCollections.map((c) => c.id);
      const { data: pcData } = await supabase
        .from("place_collections")
        .select("collection_id")
        .in("collection_id", collectionIds);
      if (cancelled) return;

      const rows = (pcData as { collection_id: string }[] | null) ?? [];
      const idsWithPlaces = new Set(rows.map((r) => r.collection_id));
      const countByCollection: Record<string, number> = {};
      for (const r of rows) {
        countByCollection[r.collection_id] = (countByCollection[r.collection_id] ?? 0) + 1;
      }
      setPlacesCount(countByCollection);
      const withPlaces = allCollections.filter((c) => idsWithPlaces.has(c.id));
      setCollections(withPlaces);
      const initialId =
        urlCollectionId && idsWithPlaces.has(urlCollectionId)
          ? urlCollectionId
          : withPlaces[0]?.id ?? null;
      setActiveCollectionId(initialId);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [urlCollectionId]);

  useEffect(() => {
    if (!activeCollectionId || !canAccessActive) {
      setPlaces([]);
      return;
    }
    let cancelled = false;
    setPlacesLoading(true);
    (async () => {
      type PcRow = { place_id: string; sort_order?: number };
      const pcRes = await supabase
        .from("place_collections")
        .select("place_id, sort_order")
        .eq("collection_id", activeCollectionId)
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      let pcData = (pcRes.data ?? null) as PcRow[] | null;
      if (pcRes.error && (pcRes.error as { message?: string }).message?.includes("sort_order")) {
        const legacyRes = await supabase
          .from("place_collections")
          .select("place_id")
          .eq("collection_id", activeCollectionId);
        if (cancelled) return;
        const legacyRows = (legacyRes.data ?? []) as { place_id: string }[];
        pcData = legacyRows.map((r, i) => ({ place_id: r.place_id, sort_order: i }));
      }
      const rows = pcData ?? [];
      if (rows.length === 0) {
        setPlaces([]);
        setPlacesLoading(false);
        return;
      }
      const placeIds = rows.map((r) => r.place_id).filter(Boolean);
      const orderMap: Record<string, number> = {};
      rows.forEach((r, i) => {
        orderMap[r.place_id] = i;
      });
      const { data: placesData } = await supabase
        .from("places")
        .select("id,title,description,city,country,cover_url,categories,tags,created_by,access_level,visibility,address")
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
      setPlacesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCollectionId, canAccessActive]);

  function handleCollectionClick(c: Collection) {
    if (c.access_type === "premium" && !gateLoading && !isPremium) {
      openPremiumCollection(c.id, c.title);
      return;
    }
    setActiveCollectionId(c.id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("collection", c.id);
    router.replace(`/collections?${params.toString()}`, { scroll: false });
  }

  return (
    <SectionErrorBoundary>
      <>
      <TopBar
        showSearchBar={true}
        searchValue=""
        onSearchChange={(value) => {
          const params = new URLSearchParams();
          if (value.trim()) params.set("q", value.trim());
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={null}
        onCityChange={() => {}}
        onFiltersClick={() => router.push("/map")}
        activeFiltersCount={0}
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
        onSearchBarClick={() => router.push("/map")}
      />

      <main className="min-h-screen bg-warm-white pt-safe-top pb-safe-bottom">
        {/* Блок Collections — скроллится вместе со всем контентом под TopBar */}
        <div className="border-b border-border-light bg-warm-white pt-16 sm:pt-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-4">
            <h1 className="text-xl sm:text-2xl font-semibold font-fraunces text-content-primary mb-3">
              Collections
            </h1>
              {loading ? (
                <div className="flex gap-4 overflow-hidden">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 w-[calc((100%-2rem)/3)] lg:w-[calc((100%-5rem)/6)] aspect-square rounded-lg bg-border-light animate-pulse"
                    />
                  ))}
                </div>
              ) : collections.length === 0 ? (
                <p className="text-content-secondary text-sm">No collections yet.</p>
              ) : (
                <div
                  ref={tabsScrollRef}
                  className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:-mx-6 sm:px-6 pb-0"
                  style={{ scrollSnapType: "x proximity" }}
                >
                  {collections.map((c) => {
                    const isActive = c.id === activeCollectionId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleCollectionClick(c)}
                        className={`
                          flex-shrink-0 w-[calc((100%-2rem)/3)] min-w-[calc((100%-2rem)/3)] lg:w-[calc((100%-5rem)/6)] lg:min-w-[calc((100%-5rem)/6)] text-left cursor-pointer
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-content-primary/20 focus-visible:ring-offset-2 focus-visible:rounded-lg
                          ${isActive ? "pb-3 border-b-2 border-content-primary" : "pb-3 border-b-2 border-transparent"}
                        `}
                        style={{ scrollSnapAlign: "start" }}
                      >
                        <div className="aspect-square w-full rounded-lg overflow-hidden bg-border-light">
                          {c.cover_image ? (
                            <Image
                              src={c.cover_image}
                              alt=""
                              width={160}
                              height={160}
                              sizes="(max-width: 1024px) 33vw, 160px"
                              className={`w-full h-full object-cover transition-[filter] duration-200 ${isActive ? "brightness-[1.02] contrast-[1.02]" : ""}`}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-content-muted">
                              <Icon name="photo" size={24} />
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-sm font-medium text-content-primary truncate">
                          {c.title}
                        </p>
                        <p className="text-xs text-content-secondary mt-0.5">
                          {placesCount[c.id] ?? 0} places
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-6">
              {error && (
                <div className="mb-4 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
                  {error}
                </div>
              )}

              {!activeCollectionId ? (
                !loading && collections.length === 0 ? (
                  <div className="rounded-2xl border border-border-light bg-white p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-border-light flex items-center justify-center mx-auto mb-4">
                      <Icon name="grid" size={32} className="text-content-muted" />
                    </div>
                    <p className="text-content-secondary">No collections yet. Check back later.</p>
                  </div>
                ) : null
              ) : !canAccessActive ? (
                <div className="rounded-2xl border border-border-light bg-white p-8 text-center">
                  <p className="text-content-secondary mb-2">
                    This is a premium collection.
                  </p>
                  <p className="text-sm text-content-muted">
                    Sign in or upgrade to view places.
                  </p>
                </div>
              ) : (
                <>
                  <header className="mb-6">
                    <h2 className="text-2xl sm:text-3xl font-fraunces font-semibold text-content-primary mb-2">
                      {activeCollection?.title}
                    </h2>
                    {activeCollection?.description && (
                      <p className="text-content-secondary leading-relaxed">
                        {activeCollection.description}
                      </p>
                    )}
                    <p className="mt-2 text-sm text-content-muted">
                      {activeCount} {activeCount === 1 ? "place" : "places"}
                    </p>
                  </header>

                  {placesLoading ? (
                    <PlaceCardGridSkeleton count={6} columns={2} />
                  ) : places.length === 0 ? (
                    <div className="rounded-2xl border border-border-light bg-white p-12 text-center">
                      <p className="text-content-secondary">No places in this collection yet.</p>
                      <Link
                        href="/explore"
                        className="mt-3 inline-block text-sm font-medium text-olive-primary hover:underline"
                      >
                        Explore all places
                      </Link>
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
              )}
        </div>
      </main>

      </>
    </SectionErrorBoundary>
  );
}

export default function CollectionsPage() {
  return (
    <SectionErrorBoundary>
      <Suspense fallback={<CollectionsPageSkeleton />}>
        <CollectionsPageContent />
      </Suspense>
    </SectionErrorBoundary>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase, hasValidSupabaseConfig } from "../lib/supabase";

/**
 * useFeaturedPlaces — pulls a small pool of public places from Supabase
 * to feature in the HomeVisualPanel rotating card carousel (v2 hero).
 *
 * What we fetch:
 *   - Up to `limit` non-hidden places (kind union: location/service/experience).
 *   - Ordered by `created_at desc` so newer cards bubble up; consumer
 *     shuffles client-side every refresh, giving the visual panel a
 *     fresh feel without an extra random RPC.
 *
 * Why one tiny query, not RPC `get_top_places`:
 *   - We want this on every home-page load. RPC adds a code surface
 *     that has to be migrated. A 6-row SELECT with a few text columns
 *     is < 10 KB and pleasantly fast.
 *   - Sorting by reactions/save count would require a join — defer to
 *     v3 when the analytics need is real.
 *
 * Photo handling: prefer `cover_url` then first of `photo_urls`, then
 * null (the panel falls back to a sunset gradient mock).
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase E.2).
 */

export type FeaturedPlace = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  /** First photo (cover_url ?? photo_urls[0]); null if both were empty. */
  photoUrl: string | null;
  /** Full photo list (cover_url first, then photo_urls). For PlaceCard.batchPhotos. */
  photoUrls: string[];
  categories: string[] | null;
  /** First category (with leading emoji) — null if the row had none. */
  categoryLabel: string | null;
  /** access_level — needed by PlaceCard premium gating. */
  accessLevel: string | null;
  kind: "location" | "service" | "experience";
};

const PHOTOS_LIMIT_DEFAULT = 8;

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function useFeaturedPlaces(limit: number = PHOTOS_LIMIT_DEFAULT): {
  places: FeaturedPlace[];
  loading: boolean;
} {
  const [places, setPlaces] = useState<FeaturedPlace[]>([]);
  const [loading, setLoading] = useState<boolean>(hasValidSupabaseConfig);

  useEffect(() => {
    if (!hasValidSupabaseConfig) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        // Cast the select payload — the codegen'd Supabase client widens
        // free-form selects to `never[]` in this project; same workaround
        // is used elsewhere in app/page.tsx and feed/saved pages.
        type Row = {
          id: string;
          title: string;
          city: string | null;
          country: string | null;
          cover_url: string | null;
          photo_urls: string[] | null;
          categories: string[] | null;
          access_level: string | null;
          kind: FeaturedPlace["kind"];
        };
        const res = (await supabase
          .from("places")
          .select("id, title, city, country, cover_url, photo_urls, categories, access_level, kind")
          .eq("is_hidden", false)
          .order("created_at", { ascending: false })
          .limit(Math.max(limit * 3, 18))) as unknown as {
          data: Row[] | null;
          error: { message?: string } | null;
        };
        const { data, error } = res;

        if (cancelled) return;
        if (error || !data) {
          setPlaces([]);
          return;
        }

        const mapped: FeaturedPlace[] = data.map((row) => {
          const photoUrls: string[] = [];
          if (row.cover_url) photoUrls.push(row.cover_url);
          if (Array.isArray(row.photo_urls)) {
            for (const u of row.photo_urls) {
              if (u && !photoUrls.includes(u)) photoUrls.push(u);
            }
          }
          const cats =
            Array.isArray(row.categories) && row.categories.length > 0
              ? row.categories
              : null;
          return {
            id: row.id,
            title: row.title,
            city: row.city,
            country: row.country,
            photoUrl: photoUrls[0] ?? null,
            photoUrls,
            categories: cats,
            categoryLabel: cats ? cats[0] : null,
            accessLevel: row.access_level,
            kind: row.kind,
          };
        });

        // Prefer rows with photos so the panel always has at least one
        // image-rich card to lead with. Then shuffle to keep it fresh.
        const withPhotos = mapped.filter((p) => p.photoUrl);
        const withoutPhotos = mapped.filter((p) => !p.photoUrl);
        const ordered = [...shuffle(withPhotos), ...shuffle(withoutPhotos)].slice(
          0,
          limit
        );
        setPlaces(ordered);
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError" || e?.message?.includes("abort")) return;
        if (e?.name === "TypeError" && e?.message?.includes("fetch")) return;
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useFeaturedPlaces] failed:", e?.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { places, loading };
}

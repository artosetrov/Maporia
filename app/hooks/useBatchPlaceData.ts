"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { isValidPhotoUrl } from "../utils";
import type { CreatorProfile } from "../types";

type PhotoMap = Map<string, string[]>;
type ProfileMap = Map<string, CreatorProfile>;

type BatchPlaceData = {
  photos: PhotoMap;
  profiles: ProfileMap;
  loading: boolean;
};

/**
 * Batch-loads photos and creator profiles for a list of places.
 * Replaces the N+1 pattern where each PlaceCard independently fetches its own data.
 *
 * @param placeIds - Array of place IDs to load photos for
 * @param creatorIds - Array of unique creator user IDs to load profiles for
 */
export function useBatchPlaceData(
  placeIds: string[],
  creatorIds: string[]
): BatchPlaceData {
  const [photos, setPhotos] = useState<PhotoMap>(new Map());
  const [profiles, setProfiles] = useState<ProfileMap>(new Map());
  const [loading, setLoading] = useState(false);

  // Serialize keys for stable dependency tracking
  const placeIdsKey = placeIds.join(",");
  const creatorIdsKey = creatorIds.join(",");

  // Track previous keys to avoid redundant fetches
  const prevKeysRef = useRef<string>("");

  useEffect(() => {
    const currentKey = `${placeIdsKey}|${creatorIdsKey}`;
    if (currentKey === prevKeysRef.current) return;
    if (placeIds.length === 0 && creatorIds.length === 0) return;

    prevKeysRef.current = currentKey;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const results = await Promise.allSettled([
          // Batch load photos for all places
          placeIds.length > 0
            ? supabase
                .from("place_photos")
                .select("place_id, url, sort")
                .in("place_id", placeIds)
                .order("sort", { ascending: true })
            : Promise.resolve({ data: [], error: null }),

          // Batch load profiles for all creators
          creatorIds.length > 0
            ? supabase
                .from("profiles")
                .select("id, display_name, username, avatar_url")
                .in("id", creatorIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (cancelled) return;

        // Process photos
        const photosResult = results[0];
        if (photosResult.status === "fulfilled") {
          const { data: photosData } = photosResult.value as {
            data: { place_id: string; url: string | null; sort: number }[] | null;
            error: unknown;
          };
          const photoMap = new Map<string, string[]>();
          (photosData ?? []).forEach((p) => {
            if (!isValidPhotoUrl(p.url)) return;
            const existing = photoMap.get(p.place_id) ?? [];
            existing.push(p.url!);
            photoMap.set(p.place_id, existing);
          });
          setPhotos(photoMap);
        }

        // Process profiles
        const profilesResult = results[1];
        if (profilesResult.status === "fulfilled") {
          const { data: profilesData } = profilesResult.value as {
            data: { id: string; display_name: string | null; username: string | null; avatar_url: string | null }[] | null;
            error: unknown;
          };
          const profileMap = new Map<string, CreatorProfile>();
          (profilesData ?? []).forEach((p) => {
            profileMap.set(p.id, {
              display_name: p.display_name,
              username: p.username,
              avatar_url: p.avatar_url,
            });
          });
          setProfiles(profileMap);
        }
      } catch {
        // Silently handle errors — PlaceCard has its own fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [placeIdsKey, creatorIdsKey, placeIds, creatorIds]);

  return { photos, profiles, loading };
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/app/types/supabase";
import { getPublicStoragePath, PLACE_PHOTOS_BUCKET } from "@/app/lib/storagePaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PLACE_PHOTOS = 12;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status });

type PlacePhotoInput = {
  url?: unknown;
  sort?: unknown;
  is_cover?: unknown;
};

type PhotosPatchBody = {
  photos?: unknown;
  video_url?: unknown;
};

type PlaceAccessRow = {
  id: string;
  created_by: string | null;
};

type ProfileAccessRow = {
  is_admin: boolean | null;
  role: string | null;
};

type ExistingPhotoRow = {
  url: string | null;
};

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  return token || null;
}

function normalizeVideoUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizePhotos(value: unknown): {
  photos: Array<{ url: string; sort: number; is_cover: boolean }> | null;
  error?: string;
} {
  if (!Array.isArray(value)) {
    return { photos: null, error: "photos must be an array" };
  }
  if (value.length === 0) {
    return { photos: null, error: "At least one photo is required" };
  }
  if (value.length > MAX_PLACE_PHOTOS) {
    return { photos: null, error: `You can upload up to ${MAX_PLACE_PHOTOS} photos.` };
  }

  const byUrl = new Map<string, { url: string; sort: number; is_cover: boolean }>();
  for (const rawPhoto of value) {
    if (!rawPhoto || typeof rawPhoto !== "object") {
      return { photos: null, error: "Each photo must be an object" };
    }

    const photo = rawPhoto as PlacePhotoInput;
    if (typeof photo.url !== "string" || !photo.url.trim()) {
      return { photos: null, error: "Each photo needs a valid url" };
    }

    const url = photo.url.trim();
    const sort = typeof photo.sort === "number" && Number.isFinite(photo.sort) ? photo.sort : byUrl.size;
    const isCover = photo.is_cover === true;
    const existing = byUrl.get(url);

    if (!existing) {
      byUrl.set(url, { url, sort, is_cover: isCover });
      continue;
    }

    existing.sort = Math.min(existing.sort, sort);
    existing.is_cover = existing.is_cover || isCover;
  }

  const photos = Array.from(byUrl.values()).sort((a, b) => a.sort - b.sort);
  if (photos.length === 0) {
    return { photos: null, error: "At least one photo is required" };
  }

  const firstCoverIndex = photos.findIndex((photo) => photo.is_cover);
  photos.forEach((photo, index) => {
    photo.sort = index;
    photo.is_cover = index === (firstCoverIndex >= 0 ? firstCoverIndex : 0);
  });

  photos.sort((a, b) => {
    if (a.is_cover && !b.is_cover) return -1;
    if (!a.is_cover && b.is_cover) return 1;
    return a.sort - b.sort;
  });
  photos.forEach((photo, index) => {
    photo.sort = index;
  });

  return { photos };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "MISSING_CONFIG",
    );
  }

  const token = getBearerToken(request);
  if (!token) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const caller = authData?.user;
  if (authError || !caller) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { id: placeId } = await context.params;
  if (!placeId) return jsonError("Missing place id", 400, "BAD_REQUEST");

  const { data: place, error: placeError } = await supabaseAdmin
    .from("places")
    .select("id, created_by")
    .eq("id", placeId)
    .single<PlaceAccessRow>();
  if (placeError || !place) return jsonError("Place not found", 404, "PLACE_NOT_FOUND");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", caller.id)
    .single<ProfileAccessRow>();
  if (profileError || !profile) return jsonError("Profile not found", 404, "PROFILE_NOT_FOUND");

  const canEdit = place.created_by === caller.id || profile.is_admin === true || profile.role === "admin";
  if (!canEdit) return jsonError("Forbidden", 403, "FORBIDDEN");

  const body = (await request.json().catch(() => null)) as PhotosPatchBody | null;
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body", 400, "BAD_REQUEST");

  const { photos, error: photosError } = normalizePhotos(body.photos);
  if (!photos) return jsonError(photosError || "Invalid photos", 400, "BAD_PHOTOS");

  const videoUrl = normalizeVideoUrl(body.video_url);
  if (videoUrl === undefined) return jsonError("video_url must be a string or null", 400, "BAD_VIDEO_URL");
  if (videoUrl && !videoUrl.includes("instagram.com/reel")) {
    return jsonError("Please enter a valid Instagram Reel URL (must contain instagram.com/reel)", 400, "BAD_VIDEO_URL");
  }

  const { data: existingPhotoRows, error: existingPhotosError } = await supabaseAdmin
    .from("place_photos")
    .select("url")
    .eq("place_id", placeId);
  if (existingPhotosError) {
    return jsonError(
      existingPhotosError.message || "Failed to load existing photos",
      500,
      "PHOTOS_LOAD_FAILED",
    );
  }

  const coverUrl = photos.find((photo) => photo.is_cover)?.url ?? photos[0]?.url ?? null;
  const { error: updatePlaceError } = await supabaseAdmin
    .from("places")
    // @ts-expect-error Supabase generated types infer update payload as never
    .update({ cover_url: coverUrl, video_url: videoUrl })
    .eq("id", placeId);

  if (updatePlaceError) {
    return jsonError(updatePlaceError.message || "Failed to update place photos", 500, "PLACE_UPDATE_FAILED");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("place_photos")
    .delete()
    .eq("place_id", placeId);
  if (deleteError) {
    return jsonError(deleteError.message || "Failed to delete old photos", 500, "PHOTOS_DELETE_FAILED");
  }

  const rows = photos.map((photo) => ({
    place_id: placeId,
    user_id: place.created_by ?? caller.id,
    url: photo.url,
    sort: photo.sort,
    is_cover: photo.is_cover,
  }));

  const { data: insertedPhotos, error: insertError } = await supabaseAdmin
    .from("place_photos")
    // @ts-expect-error Supabase generated types infer insert payload as never
    .insert(rows)
    .select("id, url, sort, is_cover");

  if (insertError) {
    return jsonError(insertError.message || "Failed to save photos", 500, "PHOTOS_INSERT_FAILED");
  }

  const nextUrls = new Set(photos.map((photo) => photo.url));
  const removedStoragePaths = Array.from(
    new Set(
      ((existingPhotoRows as ExistingPhotoRow[] | null) ?? [])
        .map((photo) => photo.url)
        .filter((url): url is string => Boolean(url && !nextUrls.has(url)))
        .map((url) => getPublicStoragePath(url, PLACE_PHOTOS_BUCKET))
        .filter((path): path is string => Boolean(path)),
    ),
  );
  if (removedStoragePaths.length > 0) {
    await supabaseAdmin.storage.from(PLACE_PHOTOS_BUCKET).remove(removedStoragePaths);
  }

  return NextResponse.json({
    ok: true,
    cover_url: coverUrl,
    video_url: videoUrl,
    photos: insertedPhotos ?? [],
  });
}

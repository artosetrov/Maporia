import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/app/lib/logger";
import {
  buildAiPrompt,
  callOpenAiForDescription,
  fetchGooglePlaceAiContext,
} from "../../../lib/ai/placeDescription";
import type { Profile } from "@/app/types";

type ImportProfileRow = Pick<Profile, "role" | "subscription_status" | "is_admin">;
type ImportPhotoInput = { url: string };
type SelectedFieldsInput = {
  title?: boolean;
  titleData?: string | null;
  address?: boolean;
  addressData?: string | null;
  description?: boolean;
  descriptionData?: string | null;
  lat?: number | null;
  lng?: number | null;
  google_maps_url?: string | null;
  city?: string | null;
  city_state?: string | null;
  city_country?: string | null;
  photos?: ImportPhotoInput[];
};
type CityResolverClient = {
  rpc: (
    fn: "get_or_create_city",
    args: {
      p_name: string;
      p_state: string | null;
      p_country: string | null;
      p_lat: number | null;
      p_lng: number | null;
    }
  ) => Promise<{ data: string | null; error: { message?: string } | null }>;
  from: (table: "cities") => {
    select: (columns: string) => {
      eq: (
        column: "id",
        value: string
      ) => {
        single: () => Promise<{ data: { id?: string; name?: string } | null }>;
      };
    };
  };
};

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Service role key is required for import operations (needs to bypass RLS for place creation)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 10_000;
const MAX_URL_LENGTH = 2048;
const MAX_IMPORTED_PHOTOS = 12;

function jsonError(error: string, status: number, code?: string, details?: string) {
  return NextResponse.json({ error, code, details }, { status });
}

function hasPremiumAccessFromProfile(profile: ImportProfileRow | null): boolean {
  if (!profile) return false;
  if (profile.is_admin) return true;
  if (profile.role === "admin" || profile.role === "premium") return true;
  if (profile.subscription_status === "active") return true;
  return false;
}

function isNonEmptyString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function optionalString(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function optionalHttpUrl(value: unknown, maxLength = MAX_URL_LENGTH): string | null {
  const url = optionalString(value, maxLength);
  if (!url) return null;
  if (url.startsWith("/api/google/photo?")) return url;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function parseCoordinate(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function sanitizeImportedPhotos(value: unknown): ImportPhotoInput[] {
  if (!Array.isArray(value)) return [];
  const out: ImportPhotoInput[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const url = optionalHttpUrl((item as { url?: unknown }).url, MAX_URL_LENGTH);
    if (!url) continue;
    out.push({ url });
    if (out.length >= MAX_IMPORTED_PHOTOS) break;
  }

  return out;
}

function sanitizeSelectedFields(input: unknown): SelectedFieldsInput | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as SelectedFieldsInput;
  const lat = parseCoordinate(raw.lat, -90, 90);
  const lng = parseCoordinate(raw.lng, -180, 180);

  return {
    title: raw.title === true,
    titleData: optionalString(raw.titleData, 200),
    address: raw.address === true,
    addressData: optionalString(raw.addressData, 500),
    description: raw.description === true,
    descriptionData: optionalString(raw.descriptionData, 5000),
    lat,
    lng,
    google_maps_url: optionalHttpUrl(raw.google_maps_url, MAX_URL_LENGTH),
    city: optionalString(raw.city, 120),
    city_state: optionalString(raw.city_state, 120),
    city_country: optionalString(raw.city_country, 120),
    photos: sanitizeImportedPhotos(raw.photos),
  };
}

async function resolveCityId(
  supabase: CityResolverClient,
  args: {
    name: string;
    state?: string | null;
    country?: string | null;
    lat?: number | null;
    lng?: number | null;
  }
): Promise<{ city_id: string; name: string } | null> {
  const name = args.name?.trim();
  if (!name) return null;

  const { data: cityId, error: rpcError } = await supabase.rpc("get_or_create_city", {
    p_name: name,
    p_state: args.state || null,
    p_country: args.country || null,
    p_lat: args.lat ?? null,
    p_lng: args.lng ?? null,
  });

  if (rpcError || !cityId) {
    logger.error("Failed to resolve city via get_or_create_city:", rpcError);
    return null;
  }

  // Best-effort fetch for canonical city name
  const { data: cityRow } = await supabase
    .from("cities")
    .select("id, name")
    .eq("id", cityId)
    .single();

  const row = cityRow as { id?: string; name?: string } | null;
  return { city_id: row?.id || cityId, name: row?.name || name };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError("Invalid JSON body", 400, "INVALID_JSON");
    }
    const { 
      google_place_id,
      target_place_id,
      access_token 
    } = body as {
      google_place_id?: unknown;
      target_place_id?: unknown;
      selectedFields?: unknown;
      access_token?: unknown;
    };
    const selectedFields = sanitizeSelectedFields((body as { selectedFields?: unknown }).selectedFields);

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonError(
        "Server misconfiguration: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
        500,
        "MISSING_SUPABASE_CONFIG"
      );
    }

    if (!isNonEmptyString(google_place_id, MAX_ID_LENGTH)) {
      return jsonError("Invalid request: google_place_id is required", 400, "INVALID_GOOGLE_PLACE_ID");
    }

    if (!selectedFields) {
      return jsonError("Invalid request: selectedFields is required", 400, "INVALID_SELECTED_FIELDS");
    }

    // Authenticate user first
    let user = null;
    if (!isNonEmptyString(access_token, 20_000)) {
      return jsonError("Unauthorized", 401, "UNAUTHORIZED");
    }

    // Create Supabase client with service role key for all operations
    // Service role key bypasses RLS — we verify auth and permissions below
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verify user authentication
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(access_token);
    if (authError || !authUser) {
      logger.warn("Authentication error:", authError);
      return jsonError("Unauthorized", 401, "UNAUTHORIZED");
    }
    user = authUser;

    // Server-side access check (defense-in-depth)
    let isAdmin = false;
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, subscription_status, is_admin")
        .eq("id", user.id)
        .single();

      if (profileError) {
        logger.error("Failed to load profile for access check:", profileError);
        return jsonError("Could not verify access.", 500, "ACCESS_CHECK_FAILED");
      } else {
        isAdmin = !!profile?.is_admin || profile?.role === "admin";
        const ok = hasPremiumAccessFromProfile(profile as ImportProfileRow | null);
        if (!ok) {
          return jsonError("Premium required to create places.", 403, "PREMIUM_REQUIRED");
        }
      }
    } catch (e) {
      logger.error("Access check exception:", e);
      return jsonError("Could not verify access.", 500, "ACCESS_CHECK_FAILED");
    }

    // If we're importing into an existing place, update it instead of creating a new one
    if (target_place_id !== undefined && target_place_id !== null && !isNonEmptyString(target_place_id, MAX_ID_LENGTH)) {
      return jsonError("Invalid target_place_id", 400, "INVALID_TARGET_PLACE_ID");
    }

    if (target_place_id && typeof target_place_id === "string") {
      const targetPlaceId = target_place_id;

      // Load target place to verify ownership (unless admin)
      const { data: targetPlace, error: targetPlaceError } = await supabase
        .from("places")
        .select("id, created_by, description")
        .eq("id", targetPlaceId)
        .single();

      if (targetPlaceError || !targetPlace) {
        return NextResponse.json(
          { error: "Target place not found", code: "TARGET_PLACE_NOT_FOUND" },
          { status: 404 }
        );
      }

      const isOwner = targetPlace.created_by === user.id;
      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { error: "Forbidden", code: "FORBIDDEN" },
          { status: 403 }
        );
      }

      // If google_place_id already exists for another place, return duplicate
      const { data: existingByGoogleId, error: existingByGoogleIdError } = await supabase
        .from("places")
        .select("id, title")
        .eq("google_place_id", google_place_id)
        .neq("id", targetPlaceId)
        .single();

      if (existingByGoogleIdError && existingByGoogleIdError.code !== "PGRST116") {
        logger.error("Error checking google_place_id duplicate:", existingByGoogleIdError);
        return NextResponse.json(
          { error: "Failed to check for duplicate place", code: "DUPLICATE_CHECK_ERROR" },
          { status: 500 }
        );
      }

      if (existingByGoogleId) {
        return NextResponse.json(
          {
            error: "Place already exists",
            code: "DUPLICATE_PLACE",
            existing_place_id: existingByGoogleId.id,
            existing_title: existingByGoogleId.title,
          },
          { status: 409 }
        );
      }

      // Build update payload (only selected fields + always-included ones)
      const updates: Record<string, unknown> = {
        google_place_id,
      };

      // Selected fields
      if (selectedFields?.title && selectedFields?.titleData) updates.title = selectedFields.titleData;
      if (selectedFields?.address && selectedFields?.addressData) updates.address = selectedFields.addressData;
      if (selectedFields?.description && selectedFields?.descriptionData) updates.description = selectedFields.descriptionData;

      // Always include coordinates and google_maps_url
      if (selectedFields?.lat !== null && selectedFields?.lat !== undefined) updates.lat = Number(selectedFields.lat);
      if (selectedFields?.lng !== null && selectedFields?.lng !== undefined) updates.lng = Number(selectedFields.lng);
      if (selectedFields?.google_maps_url) updates.link = selectedFields.google_maps_url;

      // City auto-fill for Location page (if available from Google response)
      if (selectedFields?.city && typeof selectedFields.city === "string" && selectedFields.city.trim().length > 0) {
        const updateLat = typeof updates.lat === "number" ? updates.lat : selectedFields.lat ?? null;
        const updateLng = typeof updates.lng === "number" ? updates.lng : selectedFields.lng ?? null;
        const resolved = await resolveCityId(supabase as unknown as CityResolverClient, {
          name: selectedFields.city,
          state: selectedFields.city_state || null,
          country: selectedFields.city_country || null,
          lat: updateLat,
          lng: updateLng,
        });
        if (resolved) {
          updates.city = resolved.name; // legacy
          updates.city_name_cached = resolved.name;
          updates.city_id = resolved.city_id;
        } else {
          // fallback: at least save city string
          updates.city = selectedFields.city.trim();
          updates.city_name_cached = selectedFields.city.trim();
        }
      }

      // If user didn't select title but it's empty, still set a safe placeholder to satisfy NOT NULL if needed
      if (!updates.title) {
        // no-op: do not overwrite existing title unless needed
      }

      // Apply updates (do not use .single() — with RLS, 0 rows can be returned and .single() would throw "Cannot coerce the result to a single JSON object")
      const { data: updatedRows, error: updateError } = await supabase
        .from("places")
        .update(updates)
        .eq("id", targetPlaceId)
        .select("id");

      if (updateError || !updatedRows?.length) {
        logger.error("Error updating place from import:", updateError);
        return NextResponse.json(
          { error: "Failed to update place", details: updateError?.message || "No rows updated (check RLS).", code: "UPDATE_ERROR" },
          { status: 500 }
        );
      }

      // Replace photos if provided
      if (Array.isArray(selectedFields.photos)) {
        const photos = selectedFields.photos.map((p) => p.url);

        // If user selected photos, replace Photo tour
        if (photos.length > 0) {
          const { data: existingPhotos, error: existingPhotosError } = await supabase
            .from("place_photos")
            .select("id")
            .eq("place_id", targetPlaceId);

          if (existingPhotosError) {
            logger.error("Failed to load existing place photos:", existingPhotosError);
            return jsonError(
              "Failed to replace imported photos",
              500,
              "PHOTO_REPLACE_ERROR",
              existingPhotosError.message
            );
          }

          const photoInserts = photos.map((url: string, index: number) => ({
            place_id: targetPlaceId,
            user_id: user.id,
            url,
            sort: index,
            is_cover: index === 0,
          }));

          const { error: insertPhotosError } = await supabase
            .from("place_photos")
            .insert(photoInserts)
            .select("id");

          if (insertPhotosError) {
            logger.error("Failed to insert imported photos:", insertPhotosError);
            return jsonError(
              "Failed to insert imported photos",
              500,
              "PHOTO_INSERT_ERROR",
              insertPhotosError.message
            );
          }

          const oldPhotoIds = (existingPhotos ?? [])
            .map((photo) => (photo as { id?: unknown }).id)
            .filter((id): id is string => typeof id === "string" && id.length > 0);
          if (oldPhotoIds.length > 0) {
            const { error: deletePhotosError } = await supabase
              .from("place_photos")
              .delete()
              .in("id", oldPhotoIds);

            if (deletePhotosError) {
              logger.error("Failed to clear existing place photos:", deletePhotosError);
              return jsonError(
                "Failed to replace imported photos",
                500,
                "PHOTO_REPLACE_ERROR",
                deletePhotosError.message
              );
            }
          }

          // Keep legacy cover_url in sync for older parts of the app
          const { error: coverUpdateError } = await supabase
            .from("places")
            .update({ cover_url: photos[0] })
            .eq("id", targetPlaceId);
          if (coverUpdateError) {
            logger.warn("Failed to sync imported cover_url:", coverUpdateError.message);
          }
        }
      }

      // Auto-generate AI description after import (best-effort, don't overwrite existing)
      const importedDescription =
        !!(selectedFields?.description && selectedFields?.descriptionData && String(selectedFields.descriptionData).trim().length > 0);
      const hasExistingDescription =
        !!(targetPlace as { description?: string | null })?.description && String((targetPlace as { description?: string | null }).description).trim().length > 0;

      if (!importedDescription && !hasExistingDescription) {
        try {
          const openAiApiKey = process.env.OPENAI_API_KEY;
          const googleApiKey =
            process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

          if (openAiApiKey && googleApiKey) {
            const ctx = await fetchGooglePlaceAiContext({ googleApiKey, googlePlaceId: google_place_id });
            const prompt = buildAiPrompt(ctx);
            const model = process.env.OPENAI_MODEL || "gpt-4.1";
            const aiText = await callOpenAiForDescription({ openAiApiKey, model, prompt });
            await supabase.from("places").update({ description: aiText }).eq("id", targetPlaceId);
          }
        } catch (e) {
          logger.warn("AI description generation failed (non-fatal):", e);
        }
      }

      return NextResponse.json({ place_id: targetPlaceId, success: true, updated: true });
    }

    // Check for duplicate place by google_place_id
    const { data: existingPlace, error: checkError } = await supabase
      .from("places")
      .select("id, title")
      .eq("google_place_id", google_place_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      logger.error("Error checking for duplicate:", checkError);
      return NextResponse.json(
        { error: "Failed to check for duplicate place" },
        { status: 500 }
      );
    }

    if (existingPlace) {
      return NextResponse.json(
        { 
          error: "Place already exists",
          code: "DUPLICATE_PLACE",
          existing_place_id: existingPlace.id,
          existing_title: existingPlace.title,
        },
        { status: 409 }
      );
    }

    // Build place data from selected fields
    const placeData: Record<string, unknown> = {
      created_by: user.id,
      google_place_id: google_place_id,
      // Match Add Gem defaults so the editor shows imported data but keeps it hidden until completed
      access_level: "public",
      is_hidden: true,
    };

    // Add status field only if it exists in the database
    // Check if status column exists by trying to set it (will fail gracefully if column doesn't exist)
    // For now, we'll try to add it, but handle the error if column doesn't exist
    try {
      // Try to add status field - if column doesn't exist, this will be ignored
      placeData.status = "draft";
    } catch {
      // Status column doesn't exist, continue without it
    }

    // Add selected fields
    if (selectedFields.title && selectedFields.titleData) {
      placeData.title = selectedFields.titleData;
    }

    if (selectedFields.address && selectedFields.addressData) {
      placeData.address = selectedFields.addressData;
    }

    if (selectedFields.description && selectedFields.descriptionData) {
      placeData.description = selectedFields.descriptionData;
    }

    // Always include coordinates and google_maps_url
    if (selectedFields.lat !== null && selectedFields.lat !== undefined) {
      placeData.lat = Number(selectedFields.lat);
    }

    if (selectedFields.lng !== null && selectedFields.lng !== undefined) {
      placeData.lng = Number(selectedFields.lng);
    }

    if (selectedFields.google_maps_url) {
      placeData.link = selectedFields.google_maps_url; // Using link field for google_maps_url
    }

    // City auto-fill for Location page (if provided)
    if (selectedFields.city && typeof selectedFields.city === "string" && selectedFields.city.trim().length > 0) {
      const resolved = await resolveCityId(supabase as unknown as CityResolverClient, {
        name: selectedFields.city,
        state: selectedFields.city_state || null,
        country: selectedFields.city_country || null,
        lat: (placeData.lat as number | null) ?? null,
        lng: (placeData.lng as number | null) ?? null,
      });
      if (resolved) {
        placeData.city = resolved.name; // legacy
        placeData.city_name_cached = resolved.name;
        placeData.city_id = resolved.city_id;
      } else {
        placeData.city = selectedFields.city.trim();
        placeData.city_name_cached = selectedFields.city.trim();
      }
    }

    // Ensure title exists (required field)
    if (!placeData.title) {
      placeData.title = "Untitled Place";
    }

    // Insert place
    logger.debug("Inserting place with data:", {
      hasTitle: !!placeData.title,
      hasAddress: !!placeData.address,
      hasCoords: !!(placeData.lat && placeData.lng),
      hasGooglePlaceId: !!placeData.google_place_id,
      hasStatus: !!placeData.status,
      userId: user.id,
    });

    const { data: newPlace, error: insertError } = await supabase
      .from("places")
      .insert(placeData)
      .select("id")
      .single();

    if (insertError) {
      logger.error("Error inserting place:", {
        error: insertError,
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        placeData: {
          ...placeData,
          created_by: "[REDACTED]",
        },
      });

      // Handle RLS policy violation
      if (insertError.code === "42501" || insertError.message?.includes("row-level security")) {
        return NextResponse.json(
          { 
            error: "Failed to create place due to security policy violation.",
            details: insertError.message,
            code: "RLS_POLICY_VIOLATION"
          },
          { status: 500 }
        );
      }

      // Handle specific database errors
      if (insertError.code === "42703") {
        // Column doesn't exist (e.g., status column)
        // Try again without status field
        delete placeData.status;
        const { data: retryPlace, error: retryError } = await supabase
          .from("places")
          .insert(placeData)
          .select("id")
          .single();

        if (retryError) {
          return NextResponse.json(
            { 
              error: "Failed to create place", 
              details: retryError.message,
              code: "INSERT_ERROR"
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          place_id: retryPlace.id,
          success: true,
        });
      }

      return NextResponse.json(
        { 
          error: "Failed to create place", 
          details: insertError.message,
          code: insertError.code || "INSERT_ERROR"
        },
        { status: 500 }
      );
    }

    // Handle photos if selected
    if (selectedFields.photos && selectedFields.photos.length > 0) {
      logger.debug("Inserting photos:", {
        photoCount: selectedFields.photos.length,
        placeId: newPlace.id,
      });

      // Filter out invalid photos and map to insert format
      const photoInserts = selectedFields.photos
        .map((photo, index: number) => ({
          place_id: newPlace.id,
          user_id: user.id,
          url: photo.url,
          sort: index,
          is_cover: index === 0, // First photo is cover
        }));

      logger.debug("Photo inserts prepared:", {
        count: photoInserts.length,
        urls: photoInserts.map((p: { url: string }) => p.url.substring(0, 50)),
      });

      if (photoInserts.length > 0) {
        const { data: insertedPhotos, error: photosError } = await supabase
          .from("place_photos")
          .insert(photoInserts)
          .select("id, url");

        if (photosError) {
          logger.error("Error inserting photos:", photosError);
          await supabase.from("places").delete().eq("id", newPlace.id);
          return jsonError(
            "Failed to insert imported photos",
            500,
            "PHOTO_INSERT_ERROR",
            photosError.message
          );
        } else {
          logger.debug("Successfully inserted photos:", {
            count: insertedPhotos?.length || 0,
            photoIds: insertedPhotos?.map(p => p.id),
          });
        }
      }
    } else {
      logger.debug("No photos to insert");
    }

    logger.debug("Import completed successfully:", {
      placeId: newPlace.id,
      hasTitle: !!placeData.title,
      hasAddress: !!placeData.address,
      hasDescription: !!placeData.description,
      hasCoords: !!(placeData.lat && placeData.lng),
      photoCount: selectedFields.photos?.length || 0,
    });

    // Auto-generate AI description after import (best-effort, only if user didn't import description)
    const importedDescription =
      !!(selectedFields?.description && selectedFields?.descriptionData && String(selectedFields.descriptionData).trim().length > 0);

    if (!importedDescription) {
      try {
        const openAiApiKey = process.env.OPENAI_API_KEY;
        const googleApiKey =
          process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

        if (openAiApiKey && googleApiKey) {
          const ctx = await fetchGooglePlaceAiContext({ googleApiKey, googlePlaceId: google_place_id });
          const prompt = buildAiPrompt(ctx);
          const model = process.env.OPENAI_MODEL || "gpt-4.1";
          const aiText = await callOpenAiForDescription({ openAiApiKey, model, prompt });
          await supabase.from("places").update({ description: aiText }).eq("id", newPlace.id);
        }
      } catch (e) {
        logger.warn("AI description generation failed (non-fatal):", e);
      }
    }

    return NextResponse.json({
      place_id: newPlace.id,
      success: true,
    });
  } catch (error: unknown) {
    logger.error("Import error:", error);
    const message = error instanceof Error ? error.message : "Failed to import place";
    return NextResponse.json(
      { error: message, code: "IMPORT_ERROR" },
      { status: 500 }
    );
  }
}

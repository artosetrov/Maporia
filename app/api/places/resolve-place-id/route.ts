import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canUserViewPlace, getUserAccess } from "@/app/lib/access";
import { logger } from "@/app/lib/logger";
import type { Place, Profile } from "@/app/types";

type ResolvePlaceRow = Pick<
  Place,
  | "id"
  | "lat"
  | "lng"
  | "google_place_id"
  | "title"
  | "address"
  | "city"
  | "city_name_cached"
  | "country"
  | "created_by"
  | "access_level"
  | "visibility"
>;
type ResolveProfileRow = Pick<
  Profile,
  "id" | "username" | "display_name" | "bio" | "avatar_url" | "role" | "subscription_status" | "is_admin" | "plan"
>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MAX_PLACE_ID_LENGTH = 128;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(userId);

  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) return false;

  limit.count++;
  return true;
}

/**
 * Resolve google_place_id for an existing place.
 * If already stored — returns it immediately.
 * Otherwise calls Google Places API (Find Place) to resolve, saves, and returns.
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    // Auth check
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body", code: "INVALID_JSON" },
        { status: 400 },
      );
    }
    const { placeId } = body;

    if (!placeId || typeof placeId !== "string" || placeId.length > MAX_PLACE_ID_LENGTH) {
      return NextResponse.json(
        { error: "placeId is required" },
        { status: 400 },
      );
    }

    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Too many resolve requests. Please wait a minute and try again.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    // Load place
    const { data: place, error: placeError } = await supabaseAdmin
      .from("places")
      .select("id, lat, lng, google_place_id, title, address, city, city_name_cached, country, created_by, access_level, visibility")
      .eq("id", placeId)
      .single();

    if (placeError || !place) {
      return NextResponse.json({ error: "Place not found" }, { status: 404 });
    }
    const resolvedPlace = place as ResolvePlaceRow;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, role, subscription_status, is_admin, plan")
      .eq("id", user.id)
      .maybeSingle();
    const userAccess = getUserAccess(profile as ResolveProfileRow | null);
    const ownsPlace = resolvedPlace.created_by === user.id;

    if (!ownsPlace && !canUserViewPlace(userAccess, resolvedPlace)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Already resolved — return immediately
    if (resolvedPlace.google_place_id) {
      return NextResponse.json({ google_place_id: resolvedPlace.google_place_id });
    }

    // Need coordinates to resolve
    if (!resolvedPlace.lat || !resolvedPlace.lng) {
      return NextResponse.json({ google_place_id: null });
    }

    // Resolve via Google Places API
    const googleApiKey =
      process.env.GOOGLE_MAPS_API_KEY ??
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!googleApiKey) {
      logger.error("[resolve-place-id] Google Maps API key is missing");
      return NextResponse.json({ google_place_id: null });
    }

    const resolvedPlaceId = await findGooglePlaceId(
      resolvedPlace.lat,
      resolvedPlace.lng,
      resolvedPlace.title,
      resolvedPlace.address,
      resolvedPlace.city_name_cached ?? resolvedPlace.city,
      resolvedPlace.country,
      googleApiKey,
    );

    if (!resolvedPlaceId) {
      return NextResponse.json({ google_place_id: null });
    }

    // Save to database (never overwrite existing)
    if (ownsPlace || userAccess.isAdmin) {
      const { error: updateError } = await supabaseAdmin
        .from("places")
        .update({ google_place_id: resolvedPlaceId })
        .eq("id", placeId)
        .is("google_place_id", null);

      if (updateError) {
        logger.error("[resolve-place-id] Failed to save:", updateError.message);
        // Still return the resolved id — user gets the link even if save fails
      }
    }

    return NextResponse.json({ google_place_id: resolvedPlaceId });
  } catch (error: unknown) {
    logger.error("[resolve-place-id] Error:", error);
    return NextResponse.json({ google_place_id: null });
  }
}

/**
 * Try to find a Google Place ID using Find Place from Text,
 * falling back to Nearby Search if needed.
 */
async function findGooglePlaceId(
  lat: number,
  lng: number,
  title: string,
  address: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
  apiKey: string,
): Promise<string | null> {
  // Strategy 1: Find Place from Text (most accurate when we have the name)
  try {
    const input = encodeURIComponent(
      [title, address, city, country]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(", "),
    );
    const locationBias = `point:${lat},${lng}`;
    const findPlaceUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${input}&inputtype=textquery&locationbias=${locationBias}` +
      `&fields=place_id&key=${apiKey}`;

    const res = await fetch(findPlaceUrl);
    const data = await res.json();

    if (
      data.status === "OK" &&
      data.candidates?.length > 0 &&
      data.candidates[0].place_id
    ) {
      return data.candidates[0].place_id;
    }
  } catch (err) {
    logger.error("[resolve-place-id] Find Place error:", err);
  }

  // Strategy 2: Nearby Search (fallback for vague names)
  try {
    const nearbyUrl =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lng}&radius=50&key=${apiKey}`;

    const res = await fetch(nearbyUrl);
    const data = await res.json();

    if (
      data.status === "OK" &&
      data.results?.length > 0 &&
      data.results[0].place_id
    ) {
      return data.results[0].place_id;
    }
  } catch (err) {
    logger.error("[resolve-place-id] Nearby Search error:", err);
  }

  return null;
}

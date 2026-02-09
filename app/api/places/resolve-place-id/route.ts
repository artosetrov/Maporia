import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const body = await request.json();
    const { placeId } = body;

    if (!placeId || typeof placeId !== "string") {
      return NextResponse.json(
        { error: "placeId is required" },
        { status: 400 },
      );
    }

    // Load place
    const { data: place, error: placeError } = await supabaseAdmin
      .from("places")
      .select("id, lat, lng, google_place_id, title")
      .eq("id", placeId)
      .single();

    if (placeError || !place) {
      return NextResponse.json({ error: "Place not found" }, { status: 404 });
    }

    // Already resolved — return immediately
    if (place.google_place_id) {
      return NextResponse.json({ google_place_id: place.google_place_id });
    }

    // Need coordinates to resolve
    if (!place.lat || !place.lng) {
      return NextResponse.json({ google_place_id: null });
    }

    // Resolve via Google Places API
    const googleApiKey =
      process.env.GOOGLE_MAPS_API_KEY ??
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!googleApiKey) {
      console.error("[resolve-place-id] Google Maps API key is missing");
      return NextResponse.json({ google_place_id: null });
    }

    const resolvedPlaceId = await findGooglePlaceId(
      place.lat,
      place.lng,
      place.title,
      googleApiKey,
    );

    if (!resolvedPlaceId) {
      return NextResponse.json({ google_place_id: null });
    }

    // Save to database (never overwrite existing)
    const { error: updateError } = await supabaseAdmin
      .from("places")
      .update({ google_place_id: resolvedPlaceId })
      .eq("id", placeId)
      .is("google_place_id", null);

    if (updateError) {
      console.error("[resolve-place-id] Failed to save:", updateError.message);
      // Still return the resolved id — user gets the link even if save fails
    }

    return NextResponse.json({ google_place_id: resolvedPlaceId });
  } catch (error: unknown) {
    console.error("[resolve-place-id] Error:", error);
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
  apiKey: string,
): Promise<string | null> {
  // Strategy 1: Find Place from Text (most accurate when we have the name)
  try {
    const input = encodeURIComponent(title);
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
    console.error("[resolve-place-id] Find Place error:", err);
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
    console.error("[resolve-place-id] Nearby Search error:", err);
  }

  return null;
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/app/lib/logger";

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// RPC function get_or_create_city uses SECURITY DEFINER, so anon key is acceptable here
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const MAX_CITY_FIELD_LENGTH = 120;

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

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CITY_FIELD_LENGTH);
}

function normalizeCoordinate(value: unknown, min: number, max: number): number | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

/**
 * Resolve city name to city_id
 * Creates city if it doesn't exist
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error", hint: "NEXT_PUBLIC_SUPABASE_URL and a Supabase key are required" },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body", code: "INVALID_JSON" },
        { status: 400 }
      );
    }
    const { name, state, country, lat, lng } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "City name is required" },
        { status: 400 }
      );
    }

    const normalizedName = name.trim().slice(0, MAX_CITY_FIELD_LENGTH);
    const normalizedState = normalizeOptionalText(state);
    const normalizedCountry = normalizeOptionalText(country);
    const normalizedLat = normalizeCoordinate(lat, -90, 90);
    const normalizedLng = normalizeCoordinate(lng, -180, 180);

    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Too many city resolve requests. Please wait a minute and try again.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // Call RPC function to get or create city
    const { data: cityId, error: rpcError } = await supabaseAdmin.rpc(
      "get_or_create_city",
      {
        p_name: normalizedName,
        p_state: normalizedState,
        p_country: normalizedCountry,
        p_lat: normalizedLat,
        p_lng: normalizedLng,
      }
    );

    if (rpcError) {
      logger.error("Error calling get_or_create_city:", rpcError);
      return NextResponse.json(
        { error: "Failed to resolve city", details: rpcError.message },
        { status: 500 }
      );
    }

    if (!cityId) {
      return NextResponse.json(
        { error: "Failed to create or find city" },
        { status: 500 }
      );
    }

    // Get city details for response
    const { data: cityData, error: cityError } = await supabaseAdmin
      .from("cities")
      .select("id, name, slug, state, country, lat, lng")
      .eq("id", cityId)
      .single();

    if (cityError || !cityData) {
      logger.error("Error fetching city:", cityError);
      // Still return city_id even if fetch fails
      return NextResponse.json({
        city_id: cityId,
        name: normalizedName,
      });
    }

    return NextResponse.json({
      city_id: cityData.id,
      name: cityData.name,
      slug: cityData.slug,
      state: cityData.state,
      country: cityData.country,
      lat: cityData.lat,
      lng: cityData.lng,
    });
  } catch (error: unknown) {
    logger.error("City resolve error:", error);
    const message = error instanceof Error ? error.message : "Failed to resolve city";
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: message,
        details: process.env.NODE_ENV === "development" ? stack : undefined,
      },
      { status: 500 }
    );
  }
}

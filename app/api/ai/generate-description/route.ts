import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildAiPrompt,
  callOpenAiForDescription,
  fetchGooglePlaceAiContext,
  OpenAiApiError,
} from "../../../lib/ai/placeDescription";
import type { Place, Profile } from "@/app/types";

type AiProfileRow = Pick<Profile, "role" | "subscription_status" | "is_admin">;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 8;
const MAX_ID_LENGTH = 256;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("[ai/generate-description] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

function hasPremiumAccessFromProfile(profile: AiProfileRow | null): boolean {
  if (!profile) return false;
  if (profile.is_admin) return true;
  if (profile.role === "admin" || profile.role === "premium") return true;
  if (profile.subscription_status === "active") return true;
  return false;
}

function jsonResponse(body: { error: string; code?: string; details?: string }, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

export async function POST(request: NextRequest) {
  // Check OPENAI_API_KEY first so we always return JSON 503 when missing (no other code runs)
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    return jsonResponse(
      { error: "AI description is not available.", code: "MISSING_OPENAI_KEY" },
      503
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "Invalid JSON body", code: "INVALID_JSON" }, 400);
    }
    const { place_id, google_place_id, access_token, save } = body as {
      place_id?: string;
      google_place_id?: string;
      access_token?: string;
      save?: boolean;
    };

    const hasPlaceId = typeof place_id === "string" && place_id.length > 0;
    const hasGooglePlaceId = typeof google_place_id === "string" && google_place_id.length > 0;

    if (!hasPlaceId && !hasGooglePlaceId) {
      return NextResponse.json(
        { error: "place_id or google_place_id is required", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    if (
      (hasPlaceId && place_id!.length > MAX_ID_LENGTH) ||
      (hasGooglePlaceId && google_place_id!.length > MAX_ID_LENGTH)
    ) {
      return jsonResponse({ error: "Invalid place identifier", code: "INVALID_REQUEST" }, 400);
    }

    if (!access_token) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is required", code: "SERVER_ERROR" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(access_token);
    const user = authData?.user;
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        {
          error: "Too many AI description requests. Please wait a minute and try again.",
          code: "RATE_LIMITED",
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const supabaseForProfile = supabase;

    // Premium check (defense-in-depth)
    const { data: profile } = await supabaseForProfile
      .from("profiles")
      .select("role, subscription_status, is_admin")
      .eq("id", user.id)
      .single();

    if (!hasPremiumAccessFromProfile(profile as AiProfileRow | null)) {
      return NextResponse.json(
        { error: "Premium required to generate descriptions.", code: "PREMIUM_REQUIRED" },
        { status: 403 }
      );
    }

    // If place_id provided — enforce ownership/admin & fetch google_place_id and optional fields from DB
    let effectiveGooglePlaceId: string | null = hasGooglePlaceId ? google_place_id! : null;
    const effectivePlaceId: string | null = hasPlaceId ? place_id! : null;
    let placeRowForContext: Pick<Place, "title" | "address" | "city_name_cached"> | null = null;

    if (hasPlaceId) {
      const { data: placeRow, error: placeError } = await supabase
        .from("places")
        .select("id, created_by, google_place_id, title, address, city_name_cached")
        .eq("id", place_id!)
        .single();

      if (placeError || !placeRow) {
        return NextResponse.json(
          { error: "Place not found", code: "PLACE_NOT_FOUND" },
          { status: 404 }
        );
      }

      const isAdmin = !!profile?.is_admin || profile?.role === "admin";
      if (placeRow.created_by !== user.id && !isAdmin) {
        return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
      }

      effectiveGooglePlaceId = effectiveGooglePlaceId || placeRow.google_place_id || null;
      placeRowForContext = placeRow;
    }

    if (!effectiveGooglePlaceId && !placeRowForContext) {
      return NextResponse.json(
        { error: "google_place_id is required", code: "MISSING_GOOGLE_PLACE_ID" },
        { status: 400 }
      );
    }

    // When using Google Place we need Google API key
    if (effectiveGooglePlaceId && !googleApiKey) {
      return NextResponse.json(
        { error: "AI description is not available.", code: "MISSING_GOOGLE_KEY" },
        { status: 503 }
      );
    }

    let ctx: { name?: string | null; types?: string[] | null; formatted_address?: string | null; rating?: number | null; user_ratings_total?: number | null; editorial_summary?: string | null; reviews?: string[] | null };
    if (effectiveGooglePlaceId) {
      try {
        ctx = await fetchGooglePlaceAiContext({
          googleApiKey: googleApiKey!,
          googlePlaceId: effectiveGooglePlaceId,
        });
      } catch (googleErr) {
        const msg = googleErr instanceof Error ? googleErr.message : "Google Places error";
        return NextResponse.json(
          { error: "Could not load place data for AI.", details: msg, code: "GOOGLE_PLACES_ERROR" },
          { status: 502 }
        );
      }
    } else {
      // No google_place_id — build context from place fields (title, address, city)
      const name = placeRowForContext?.title?.trim() || null;
      const addr = [placeRowForContext?.address?.trim(), placeRowForContext?.city_name_cached?.trim()]
        .filter(Boolean)
        .join(", ") || null;
      ctx = { name: name || "this place", formatted_address: addr || undefined, types: null, rating: null, user_ratings_total: null, editorial_summary: null, reviews: null };
    }

    const prompt = buildAiPrompt(ctx);
    const model = process.env.OPENAI_MODEL || "gpt-4.1";
    const description = await callOpenAiForDescription({
      openAiApiKey,
      model,
      prompt,
    });

    const shouldSave = save !== false;
    if (shouldSave) {
      if (!effectivePlaceId) {
        return NextResponse.json(
          { error: "place_id is required to save", code: "INVALID_REQUEST" },
          { status: 400 }
        );
      }
      const { error: updateError } = await supabase
        .from("places")
        .update({ description })
        .eq("id", effectivePlaceId);

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to save description", details: updateError.message, code: "DB_ERROR" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      place_id: effectivePlaceId,
      google_place_id: effectiveGooglePlaceId,
      description,
      success: true,
      saved: shouldSave,
    });
  } catch (error: unknown) {
    // Friendly mapping for OpenAI quota / rate limit / auth errors
    if (error instanceof OpenAiApiError) {
      const openAiCode = (error.openAiCode || "").toLowerCase();

      if (openAiCode === "insufficient_quota") {
        return NextResponse.json(
          {
            error:
              "OpenAI quota/billing is not available for this API key. Please check OpenAI Billing for the project that issued this key.",
            code: "OPENAI_INSUFFICIENT_QUOTA",
            hint: "OpenAI Platform → Billing/Usage: add payment method or top up credits, then retry.",
          },
          { status: 402 }
        );
      }

      if (openAiCode === "rate_limit_exceeded" || error.status === 429) {
        return NextResponse.json(
          {
            error: "OpenAI rate limit exceeded. Please wait a bit and try again.",
            code: "OPENAI_RATE_LIMIT",
          },
          { status: 429 }
        );
      }

      if (openAiCode === "invalid_api_key") {
        return NextResponse.json(
          {
            error: "OpenAI API key is invalid. Please update OPENAI_API_KEY.",
            code: "OPENAI_INVALID_KEY",
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          error: `OpenAI error: ${error.message}`,
          code: "OPENAI_ERROR",
        },
        { status: 502 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to generate description";
    return NextResponse.json({ error: message, code: "AI_ERROR" }, { status: 500 });
  }
}

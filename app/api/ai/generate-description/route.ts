import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildAiPrompt,
  callOpenAiForDescription,
  fetchGooglePlaceAiContext,
  OpenAiApiError,
} from "../../../lib/ai/placeDescription";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function hasPremiumAccessFromProfile(profile: {
  role?: string | null;
  subscription_status?: string | null;
  is_admin?: boolean | null;
} | null): boolean {
  if (!profile) return false;
  if (profile.is_admin) return true;
  if (profile.role === "admin" || profile.role === "premium") return true;
  if (profile.subscription_status === "active") return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    if (!access_token) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const openAiApiKey = process.env.OPENAI_API_KEY;
    if (!openAiApiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured", code: "MISSING_OPENAI_KEY" },
        { status: 500 }
      );
    }

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      return NextResponse.json(
        { error: "GOOGLE_MAPS_API_KEY is not configured", code: "MISSING_GOOGLE_KEY" },
        { status: 500 }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(access_token);
    const user = authData?.user;
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Premium check (defense-in-depth)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, subscription_status, is_admin")
      .eq("id", user.id)
      .single();

    if (!hasPremiumAccessFromProfile(profile as any)) {
      return NextResponse.json(
        { error: "Premium required to generate descriptions.", code: "PREMIUM_REQUIRED" },
        { status: 403 }
      );
    }

    // If place_id provided — enforce ownership/admin & fetch google_place_id from DB
    let effectiveGooglePlaceId: string | null = hasGooglePlaceId ? google_place_id! : null;
    let effectivePlaceId: string | null = hasPlaceId ? place_id! : null;

    if (hasPlaceId) {
      const { data: placeRow, error: placeError } = await supabase
        .from("places")
        .select("id, created_by, google_place_id")
        .eq("id", place_id!)
        .single();

      if (placeError || !placeRow) {
        return NextResponse.json(
          { error: "Place not found", code: "PLACE_NOT_FOUND" },
          { status: 404 }
        );
      }

      const isAdmin = !!(profile as any)?.is_admin || (profile as any)?.role === "admin";
      if (placeRow.created_by !== user.id && !isAdmin) {
        return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
      }

      effectiveGooglePlaceId = effectiveGooglePlaceId || (placeRow as any).google_place_id || null;
      if (!effectiveGooglePlaceId) {
        return NextResponse.json(
          { error: "google_place_id is missing for this place", code: "MISSING_GOOGLE_PLACE_ID" },
          { status: 400 }
        );
      }
    }

    if (!effectiveGooglePlaceId) {
      return NextResponse.json(
        { error: "google_place_id is required", code: "MISSING_GOOGLE_PLACE_ID" },
        { status: 400 }
      );
    }

    const ctx = await fetchGooglePlaceAiContext({
      googleApiKey,
      googlePlaceId: effectiveGooglePlaceId,
    });
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
      // Save to Supabase
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


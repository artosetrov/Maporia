import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const body = await request.json();
    const { name, state, country, lat, lng } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "City name is required" },
        { status: 400 }
      );
    }

    // Call RPC function to get or create city
    const { data: cityId, error: rpcError } = await supabaseAdmin.rpc(
      "get_or_create_city",
      {
        p_name: name.trim(),
        p_state: state || null,
        p_country: country || null,
        p_lat: lat || null,
        p_lng: lng || null,
      }
    );

    if (rpcError) {
      console.error("Error calling get_or_create_city:", rpcError);
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
      console.error("Error fetching city:", cityError);
      // Still return city_id even if fetch fails
      return NextResponse.json({
        city_id: cityId,
        name: name.trim(),
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
    console.error("City resolve error:", error);
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

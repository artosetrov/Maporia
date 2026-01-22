import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use service role key if available, otherwise use anon key (RPC function uses SECURITY DEFINER)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase configuration. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) are required.");
}

// Create client for admin operations
// Note: RPC function uses SECURITY DEFINER, so it can work with anon key too
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Resolve city name to city_id
 * Creates city if it doesn't exist
 */
export async function POST(request: NextRequest) {
  try {
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
  } catch (error: any) {
    console.error("City resolve error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to resolve city",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

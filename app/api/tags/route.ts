import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase configuration.");
}

// Create client for server-side operations
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
}) : null;

/**
 * GET /api/tags
 * Get all unique tags from tags table (or fallback to places.tags if table doesn't exist)
 * Public read access
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Try to get tags from tags table first
    const { data: tagsData, error: tagsError } = await supabase
      .from("tags")
      .select("name")
      .order("name", { ascending: true });

    if (!tagsError && tagsData) {
      // Tags table exists, use it
      const sortedTags = tagsData
        .map((t) => t.name)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));
      return NextResponse.json({ tags: sortedTags });
    }

    // Fallback: extract from places.tags (if tags table doesn't exist)
    const { data: places, error: placesError } = await supabase
      .from("places")
      .select("tags")
      .not("tags", "is", null);

    if (placesError) {
      console.error("Error fetching places for tags:", placesError);
      return NextResponse.json(
        { error: "Failed to fetch tags", details: placesError.message },
        { status: 500 }
      );
    }

    // Extract all unique tags
    const allTags = new Set<string>();
    if (places) {
      for (const place of places) {
        if (place.tags && Array.isArray(place.tags)) {
          for (const tag of place.tags) {
            if (typeof tag === "string" && tag.trim().length > 0) {
              allTags.add(tag.trim());
            }
          }
        }
      }
    }

    // Sort tags alphabetically
    const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ tags: sortedTags });
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

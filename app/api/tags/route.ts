import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Place } from "@/app/types";

type PlaceTagsRow = Pick<Place, "tags" | "categories">;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Public read endpoint — service role preferred but anon key is acceptable
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and a Supabase key are required.");
}

// Create client for server-side operations
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
}) : null;

/**
 * GET /api/tags
 * Get all unique tags from tags table (or fallback to places.tags if table doesn't exist)
 * Public read access
 *
 * Optional query parameter: categories (comma-separated)
 *   - If provided, returns only tags that belong to the specified categories
 *   - Example: /api/tags?categories=🍽+Food+%26+Drinks,🍸+Bars+%26+Wine
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Parse optional categories filter
    const { searchParams } = new URL(request.url);
    const categoriesParam = searchParams.get("categories");
    const categoriesFilter = categoriesParam
      ? categoriesParam.split(",").map((c) => c.trim()).filter(Boolean)
      : [];

    // Try to get tags from tags table first
    let query = supabase.from("tags").select("name").order("name", { ascending: true });

    // Apply category filter if provided
    if (categoriesFilter.length > 0) {
      query = query.overlaps("category_ids", categoriesFilter);
    }

    const { data: tagsData, error: tagsError } = await query;

    if (!tagsError && tagsData) {
      const sortedTags = tagsData
        .map((t) => t.name)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));
      return NextResponse.json({ tags: sortedTags });
    }

    // Fallback: extract from places.tags (if tags table doesn't exist)
    let placesQuery = supabase
      .from("places")
      .select("tags, categories")
      .not("tags", "is", null);

    if (categoriesFilter.length > 0) {
      placesQuery = placesQuery.overlaps("categories", categoriesFilter);
    }

    const { data: places, error: placesError } = await placesQuery;

    if (placesError) {
      console.error("Error fetching places for tags:", placesError);
      return NextResponse.json(
        { error: "Failed to fetch tags", details: placesError.message },
        { status: 500 }
      );
    }

    // Extract all unique tags
    const allTags = new Set<string>();
    const placeRows = (places ?? []) as PlaceTagsRow[];
    if (placeRows.length > 0) {
      for (const place of placeRows) {
        if (place.tags && Array.isArray(place.tags)) {
          for (const tag of place.tags) {
            if (typeof tag === "string" && tag.trim().length > 0) {
              allTags.add(tag.trim());
            }
          }
        }
      }
    }

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

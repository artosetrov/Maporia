import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint to generate Google Places photo URLs
 * This keeps the API key server-side
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference");
    const maxwidth = searchParams.get("maxwidth") || "800";

    if (!reference) {
      return NextResponse.json(
        { error: "Photo reference is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key is not configured" },
        { status: 500 }
      );
    }

    // Google Places API v1 format: places/{place_id}/photos/{photo_reference}
    let photoUrl: string;
    if (reference.startsWith("places/")) {
      photoUrl = `https://places.googleapis.com/v1/${reference}/media?maxWidthPx=${maxwidth}&key=${apiKey}`;
    } else {
      // Fallback to old API format
      photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxwidth}&photo_reference=${reference}&key=${apiKey}`;
    }

    // Return URL as JSON (better for img src)
    return NextResponse.json({ url: photoUrl });
  } catch (error) {
    console.error("Photo URL generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate photo URL" },
      { status: 500 }
    );
  }
}

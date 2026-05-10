import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/app/lib/logger";
import type { Place } from "@/app/types";

type GoogleImportSearchResponse = {
  _placeType?: Place;
  title: string | null;
  address: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  photos: Array<{ id: string; url: string; reference: string }>;
  google_maps_url: string | null;
};

// Ensure this is a server-side route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Test GET endpoint to verify route is accessible
export async function GET() {
  return NextResponse.json({ 
    message: "Google Import Search API is working",
    timestamp: new Date().toISOString(),
  });
}

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Response cache: simple in-memory cache (in production, use Redis or similar)
const responseCache = new Map<string, { data: unknown; cachedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Extract place_id from Google Maps URL
 * Supports multiple URL formats
 */
function extractPlaceIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Format: https://maps.google.com/?cid=123456789
    if (urlObj.hostname.includes("maps.google.com") && urlObj.searchParams.has("cid")) {
      return null;
    }

    // Format: https://www.google.com/maps/place/?q=place_id:ChIJ...
    const qParam = urlObj.searchParams.get("q");
    if (qParam?.startsWith("place_id:")) {
      return qParam.replace("place_id:", "");
    }

    // Try to extract from data parameter in URL path or query
    const dataInPathPatterns = [
      /data=!4m[^!]*!3m1!1s([A-Za-z0-9_-]+)/,
      /data=!3m[^!]*!1s([A-Za-z0-9_-]+)/,
      /data=![^!]*!1s([A-Za-z0-9_-]+)/,
      /\/data=!.*?!1s([A-Za-z0-9_-]+)/,
    ];
    
    for (const pattern of dataInPathPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Try to extract from data parameter in query string
    const dataParam = urlObj.searchParams.get("data");
    if (dataParam) {
      const placeIdPatterns = [
        /!1s([A-Za-z0-9_-]+)/,
        /!3m1!1s([A-Za-z0-9_-]+)/,
        /!4m[^!]*!3m1!1s([A-Za-z0-9_-]+)/,
      ];
      
      for (const pattern of placeIdPatterns) {
        const match = dataParam.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }
    }

    // Try to extract from URL path with data parameter
    const pathDataMatch = url.match(/\/place\/[^/]+@[^/]+\/data=!.*?!1s([A-Za-z0-9_-]+)/);
    if (pathDataMatch && pathDataMatch[1]) {
      return pathDataMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if input is a URL
 */
function isUrl(input: string): boolean {
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get geocode data from address
 */
type GeocodeResult = {
  formatted_address?: string;
  geometry?: { location?: { lat: number; lng: number } };
  address_components?: Array<{ types: string[]; long_name?: string; short_name?: string }>;
  types?: string[];
};

async function getGeocodeData(apiKey: string, address: string): Promise<{ geocodeData: GeocodeResult; lat: number; lng: number } | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const geocodeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`
    );

    if (!geocodeResponse.ok) {
      return null;
    }

    const geocodeData = await geocodeResponse.json();
    
    if (geocodeData.status === "OK" && geocodeData.results && geocodeData.results.length > 0) {
      const result = geocodeData.results[0];
      const location = result.geometry?.location;
      
      if (location && location.lat && location.lng) {
        return {
          geocodeData: result,
          lat: location.lat,
          lng: location.lng,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Geocoding exception:", error);
    return null;
  }
}

/**
 * Find place by coordinates using Nearby Search API
 */
async function findPlaceByCoordinates(apiKey: string, lat: number, lng: number): Promise<string | null> {
  try {
    const radiuses = [10, 50, 100, 200];

    for (const radius of radiuses) {
      const params = new URLSearchParams({
        location: `${lat},${lng}`,
        radius: String(radius),
        key: apiKey,
      });

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`
      );

      if (!response.ok) continue;

      const data = await response.json();

      if (data.status !== "OK") continue;

      if (data.results && data.results.length > 0) {
        return data.results[0].place_id;
      }
    }

    return null;
  } catch (error) {
    console.error("Nearby Search API exception:", error);
    return null;
  }
}

/**
 * Find place using Google Places API Find Place From Text
 * Uses improved logic with multiple query variations and fallbacks
 * Works for place names, addresses, and URLs
 */
async function findPlaceFromText(apiKey: string, query: string): Promise<string | null> {
  try {
    let textQuery = query;
    let useCoordinates = false;
    let lat: number | null = null;
    let lng: number | null = null;
    let isUrl = false;
    const originalUrl = query;
    
    // Check if query is a URL
    try {
      const urlObj = new URL(query);
      isUrl = true;
      
      // Extract place name from pathname
      // Format: /place/Place+Name/@lat,lng
      const pathMatch = urlObj.pathname.match(/\/place\/([^/@]+)/);
      if (pathMatch && pathMatch[1]) {
        textQuery = decodeURIComponent(pathMatch[1].replace(/\+/g, ' '));
        textQuery = textQuery.replace(/%20/g, ' ').replace(/\s+/g, ' ').trim();
      }
      
      // Extract coordinates from URL
      // Format: /place/Name/@lat,lng or /place/Name/@lat,lng,zoom
      const coordMatch = urlObj.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (coordMatch && coordMatch[1] && coordMatch[2]) {
        lat = parseFloat(coordMatch[1]);
        lng = parseFloat(coordMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          useCoordinates = true;
        }
      }
      
      // If we have coordinates but no place name, use full URL
      if (useCoordinates && !pathMatch) {
        textQuery = query;
      }
    } catch {
      // Not a URL, use query as-is (works for place names like "Cafe Central")
      textQuery = query;
    }

    // Build query variations to try
    // For place names: just use the name
    // For URLs: try extracted name, URL without protocol, etc.
    const queryVariations: string[] = [];
    
    // Always try the text query first (works for place names)
    if (textQuery.trim() && textQuery.trim().length >= 2) {
      queryVariations.push(textQuery.trim());
    }
    
    // If URL, add variations
    if (isUrl) {
      // Try URL without protocol
      const urlWithoutProtocol = originalUrl.replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (urlWithoutProtocol !== textQuery && urlWithoutProtocol.length >= 2) {
        queryVariations.push(urlWithoutProtocol);
      }
      
      // If we extracted a place name from URL, try it separately
      if (textQuery !== originalUrl && textQuery.length >= 3) {
        queryVariations.push(textQuery);
      }
    }
    
    // Ensure we have at least one variation to try
    // This is critical for place names - we must always try the original query
    if (queryVariations.length === 0) {
      if (query.trim().length >= 2) {
        queryVariations.push(query.trim());
        logger.debug("⚠️ No variations generated, using original query:", query.trim().substring(0, 100));
      } else {
        console.error("❌ Query too short:", query.trim().length);
        return null;
      }
    }
    
    logger.debug("📋 Query variations to try:", {
      count: queryVariations.length,
      variations: queryVariations.map(q => q.substring(0, 50)),
      originalQuery: query.substring(0, 100),
    });

    // Try each query variation using legacy Text Search API
    for (const variation of queryVariations) {
      if (!variation || variation.length < 2) continue;

      logger.debug("Trying Text Search API with query:", variation.substring(0, 100));

      const params = new URLSearchParams({
        query: variation,
        key: apiKey,
      });

      if (useCoordinates && lat !== null && lng !== null) {
        params.set("location", `${lat},${lng}`);
        params.set("radius", "100");
      }

      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`
        );

        if (!response.ok) {
          logger.warn("Text Search API HTTP error:", {
            status: response.status,
            query: variation.substring(0, 100),
          });
          continue;
        }

        const data = await response.json();

        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
          logger.warn("Text Search API status error:", {
            status: data.status,
            error_message: data.error_message,
            query: variation.substring(0, 100),
          });
          continue;
        }

        if (data.results && data.results.length > 0) {
          const placeId = data.results[0].place_id;
          logger.debug("Found place via Text Search API:", {
            placeId,
            name: data.results[0].name,
            query: variation.substring(0, 100),
            totalResults: data.results.length,
          });
          return placeId;
        } else {
          logger.debug("No places found for variation:", {
            query: variation.substring(0, 100),
          });
        }
      } catch (error) {
        logger.warn("Error trying query variation:", {
          error: error instanceof Error ? error.message : String(error),
          query: variation.substring(0, 100),
        });
        continue;
      }
    }

    // If we have coordinates but no results, try Nearby Search
    if (useCoordinates && lat !== null && lng !== null) {
      return await findPlaceByCoordinates(apiKey, lat, lng);
    }

    // If no coordinates and looks like an address, try Geocoding API as fallback
    // But only if it really looks like an address (has number + street indicator)
    // For place names without address indicators, Find Place API should work
    if (!useCoordinates && !isUrl) {
      const hasNumber = /\d+/.test(query);
      const hasStreetIndicator = /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|place|pl|court|ct)\b/i.test(query);
      const hasSuiteUnit = /\b(suite|ste|unit|apt|apartment|#)\b/i.test(query);
      const hasCityState = /,\s*[A-Z]{2}\s+\d{5}/i.test(query) || /,\s*[A-Z]{2}\b/i.test(query);
      
      // Only treat as address if it has both number and street indicator
      // This allows place names like "Cafe Central" to work via Find Place API
      const looksLikeAddress = hasNumber && (hasStreetIndicator || hasSuiteUnit || hasCityState);
      
      if (looksLikeAddress) {
        logger.debug("Query looks like an address, trying Geocoding API as fallback");
        const geocodeResult = await getGeocodeData(apiKey, query);
        if (geocodeResult) {
          const placeId = await findPlaceByCoordinates(apiKey, geocodeResult.lat, geocodeResult.lng);
          if (placeId) {
            return placeId;
          }
        }
      }
    }

    // If we get here, Find Place API didn't find anything for any variation
    // Log all attempted variations for debugging
    logger.warn("❌ Find Place API returned no results for all query variations:", {
      originalQuery: query.substring(0, 100),
      variations: queryVariations.map(q => q.substring(0, 50)),
      totalVariations: queryVariations.length,
      hadCoordinates: useCoordinates,
      wasUrl: isUrl,
    });
    
    return null;
  } catch (error) {
    console.error("Find Place From Text API exception:", error);
    return null;
  }
}

/**
 * Get place details from Google Places API (legacy)
 */
async function getPlaceDetails(apiKey: string, placeId: string) {
  try {
    const cleanPlaceId = placeId.replace(/^places\//, '');

    const fields = [
      "place_id", "name", "formatted_address", "website",
      "formatted_phone_number", "rating", "user_ratings_total",
      "opening_hours", "types", "photos", "geometry", "address_components",
    ].join(",");

    const params = new URLSearchParams({
      place_id: cleanPlaceId,
      fields,
      key: apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Place Details API HTTP error:", {
        status: response.status,
        placeId: cleanPlaceId.substring(0, 50),
        error: errorText.substring(0, 300),
      });
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === "REQUEST_DENIED") {
      throw new Error("Google Maps API key does not have permission to access Places API.");
    }

    if (data.status !== "OK" || !data.result) {
      console.error("Place Details API status error:", {
        status: data.status,
        placeId: cleanPlaceId.substring(0, 50),
      });
      throw new Error("Invalid response from Google Places API");
    }

    return data.result;
  } catch (error) {
    console.error("Place Details API exception:", {
      error: error instanceof Error ? error.message : String(error),
      placeId: placeId.substring(0, 50),
    });
    throw error;
  }
}

/**
 * Get cached response if available
 */
function getCachedResponse(placeId: string): unknown | null {
  const cached = responseCache.get(placeId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * Cache response by place_id
 */
function cacheResponse(placeId: string, data: unknown) {
  responseCache.set(placeId, {
    data,
    cachedAt: Date.now(),
  });
}

/**
 * Normalize Google Places data (legacy format) to preview format
 */
type PlaceDetailsData = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  types?: string[];
  photos?: Array<{ photo_reference?: string; height?: number; width?: number }>;
  geometry?: { location?: { lat: number; lng: number } };
};

function normalizePlaceData(
  placeData: PlaceDetailsData,
  originalQuery: string,
  isUrl: boolean,
  apiKey: string
): GoogleImportSearchResponse {
  const displayName = placeData.name || null;
  const formattedAddress = placeData.formatted_address || null;

  const types = placeData.types || [];
  const description = types.length > 0
    ? types.slice(0, 3).map((t: string) => t.replace(/_/g, ' ')).join(', ')
    : null;

  const lat = placeData.geometry?.location?.lat || null;
  const lng = placeData.geometry?.location?.lng || null;

  // Process photos — legacy API returns photo_reference
  const photos = (placeData.photos || []).slice(0, 9).map((photo, index: number) => {
    const ref = photo.photo_reference || "";
    return {
      id: `photo_${index}`,
      url: ref ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${apiKey}` : "",
      reference: ref,
    };
  }).filter(p => p.reference);

  const placeId = placeData.place_id || null;
  const googleMapsUrl = isUrl
    ? originalQuery
    : (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : null);

  return {
    title: displayName,
    address: formattedAddress,
    description: description,
    photos: photos,
    lat: lat ? Number(lat) : null,
    lng: lng ? Number(lng) : null,
    google_place_id: placeId,
    google_maps_url: googleMapsUrl,
  };
}

export async function POST(request: NextRequest) {
  try {
    logger.debug("📥 Received search request");
    
    const body = await request.json();
    const { query, access_token } = body;

    logger.debug("📋 Request body:", {
      hasQuery: !!query,
      queryLength: query?.length || 0,
      queryPreview: query?.substring(0, 100),
      hasAccessToken: !!access_token,
    });

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      console.error("❌ Invalid request: missing or empty query");
      return NextResponse.json(
        { error: "Invalid request: query is required (can be a Google Maps URL or address text)" },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();
    const queryIsUrl = isUrl(trimmedQuery);

    // Create Supabase client for server-side
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Authenticate user
    let user = null;
    if (access_token) {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(access_token);
      if (!authError && authUser) {
        user = authUser;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get Google API key
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      console.error("❌ Google Maps API key is missing");
      return NextResponse.json(
        { 
          error: "Google Maps API key is not configured.",
          code: "MISSING_API_KEY"
        },
        { status: 500 }
      );
    }
    
    logger.debug("🔑 Google API key found:", googleApiKey.substring(0, 10) + "...");

    // Step 1: Try to extract place_id if input is a URL
    let placeId: string | null = null;
    
    if (queryIsUrl) {
      logger.debug("🔗 Input is a URL, trying to extract place_id");
      placeId = extractPlaceIdFromUrl(trimmedQuery);
      if (placeId) {
        logger.debug("✅ Extracted place_id from URL:", placeId.substring(0, 50));
      } else {
        logger.debug("⚠️ Could not extract place_id from URL, will use Find Place API");
      }
    } else {
      logger.debug("📝 Input is text (place name or address), will use Find Place API");
    }

    // Step 2: If no place_id found, use Find Place From Text API
    // This works for:
    // - Place names: "Cafe Central", "Eiffel Tower", "Starbucks"
    // - Place names with city: "Cafe Central, Paris", "Starbucks, New York"
    // - Addresses: "2400 E Las Olas Blvd, Fort Lauderdale, FL"
    // - URLs without place_id: Google Maps URLs that don't contain place_id
    // This works for both addresses and place names (e.g., "Cafe Central", "Eiffel Tower")
    if (!placeId) {
      logger.debug("🔍 No place_id extracted, using Find Place API for:", trimmedQuery.substring(0, 100));
      placeId = await findPlaceFromText(googleApiKey, trimmedQuery);
      if (!placeId) {
        console.error("❌ Could not find place from query:", {
          query: trimmedQuery.substring(0, 100),
          isUrl: queryIsUrl,
          queryLength: trimmedQuery.length,
        });
        return NextResponse.json(
          { 
            error: queryIsUrl 
              ? "Could not find place from URL. Please make sure the Google Maps link is correct and try copying it directly from Google Maps."
              : "Could not find place. Please try:\n• Including the city name (e.g., 'Cafe Central, Paris')\n• Using a Google Maps URL instead\n• Checking the spelling",
            code: "PLACE_NOT_FOUND"
          },
          { status: 404 }
        );
      } else {
        logger.debug("✅ Successfully found place_id:", placeId.substring(0, 50));
      }
    }

    // Step 3: Check cache
    const cachedData = getCachedResponse(placeId);
    if (cachedData && typeof cachedData === "object") {
      return NextResponse.json(cachedData);
    }

    // Step 4: Get place details
    const placeData = await getPlaceDetails(googleApiKey, placeId);

    // Step 5: Normalize data
    const normalizedData = normalizePlaceData(placeData, trimmedQuery, queryIsUrl, googleApiKey);

    // Step 6: Cache the response
    if (placeId) {
      cacheResponse(placeId, normalizedData);
    }

    return NextResponse.json(normalizedData);
  } catch (error: unknown) {
    console.error("Place search error:", error);
    const message = error instanceof Error ? error.message : "Failed to search place";
    return NextResponse.json(
      { error: message, code: "SEARCH_ERROR" },
      { status: 500 }
    );
  }
}

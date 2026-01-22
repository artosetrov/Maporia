import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Rate limiting: simple in-memory store (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per user

// Response cache: simple in-memory cache (in production, use Redis or similar)
const responseCache = new Map<string, { data: any; cachedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  userLimit.count++;
  return true;
}

/**
 * Extract place_id from Google Maps URL
 * Supports formats:
 * - https://maps.google.com/?cid=...
 * - https://www.google.com/maps/place/.../@lat,lng
 * - https://www.google.com/maps/place/.../@lat,lng,zoom
 * - https://goo.gl/maps/...
 * - https://www.google.com/maps/place/Name/@lat,lng/data=!4m2!3m1!1sPLACE_ID
 */
function extractPlaceIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Format: https://maps.google.com/?cid=123456789
    if (urlObj.hostname.includes("maps.google.com") && urlObj.searchParams.has("cid")) {
      // CID format - we'll need to use Find Place API
      return null;
    }

    // Format: https://www.google.com/maps/place/?q=place_id:ChIJ...
    const qParam = urlObj.searchParams.get("q");
    if (qParam?.startsWith("place_id:")) {
      return qParam.replace("place_id:", "");
    }

    // Try to extract from data parameter in URL path or query
    // Format: /place/Name/@lat,lng/data=!4m2!3m1!1sPLACE_ID
    const dataInPath = url.match(/data=!4m[^!]*!3m1!1s([A-Za-z0-9_-]+)/);
    if (dataInPath && dataInPath[1]) {
      return dataInPath[1];
    }

    // Try to extract from data parameter in query string
    const dataParam = urlObj.searchParams.get("data");
    if (dataParam) {
      // Format: !4m2!3m1!1sPLACE_ID
      const placeIdMatch = dataParam.match(/!1s([A-Za-z0-9_-]+)/);
      if (placeIdMatch && placeIdMatch[1]) {
        return placeIdMatch[1];
      }
    }

    // Try to extract from URL path with data parameter
    // Format: /place/Name/@lat,lng,zoom/data=!...
    const pathDataMatch = url.match(/\/place\/[^/]+@[^/]+\/data=!4m[^!]*!3m1!1s([A-Za-z0-9_-]+)/);
    if (pathDataMatch && pathDataMatch[1]) {
      return pathDataMatch[1];
    }

    // Format: https://www.google.com/maps/place/Name/@lat,lng
    // Extract from pathname - this is the place name, not the ID
    // We'll need to use Find Place API for this
    return null;
  } catch (e) {
    console.error("Error extracting place_id from URL:", e);
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
 * Find place using Google Places API Find Place From Text
 * This works with addresses, place names, or any text query
 */
async function findPlaceFromText(apiKey: string, query: string): Promise<string | null> {
  try {

    const response = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
        },
        body: JSON.stringify({
          textQuery: query,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Find Place From Text API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.places && data.places.length > 0) {
      // Return the first (best match) result
      return data.places[0].id;
    }

    return null;
  } catch (error) {
    console.error("Find Place From Text API exception:", error);
    return null;
  }
}

/**
 * Find place using Google Places API Find Place endpoint
 * Uses the URL or extracted place name to search for the place
 * @deprecated Use findPlaceFromText instead for better results
 */
async function findPlaceByUrl(apiKey: string, url: string): Promise<string | null> {
  try {
    // Try to extract place name from URL for search
    const urlObj = new URL(url);
    let searchText = url;

    // Extract place name from pathname if available
    // Format: /place/Name/@lat,lng
    const placeMatch = url.match(/\/place\/([^\/@]+)/);
    if (placeMatch && placeMatch[1]) {
      // Decode URL-encoded place name
      searchText = decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
      // Remove common URL encoding artifacts
      searchText = searchText.trim();
    }

    // If we still have the full URL, try to use it as-is
    if (searchText === url && searchText.length > 100) {
      // URL is too long, try to extract just the domain and place name
      const shortMatch = url.match(/google\.com\/maps\/place\/([^\/@]+)/);
      if (shortMatch && shortMatch[1]) {
        searchText = decodeURIComponent(shortMatch[1].replace(/\+/g, " "));
      }
    }


    const response = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName",
        },
        body: JSON.stringify({
          textQuery: searchText,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Find Place API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.places && data.places.length > 0) {
      return data.places[0].id;
    }

    return null;
  } catch (error) {
    console.error("Find Place API exception:", error);
    return null;
  }
}

/**
 * Get place details from Google Places API
 */
async function getPlaceDetails(apiKey: string, placeId: string) {
  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,websiteUri,nationalPhoneNumber,rating,userRatingCount,regularOpeningHours,types,photos,location,addressComponents,priceLevel",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Place Details API error:", response.status, errorText);
      throw new Error(`Google Places API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Place Details API exception:", error);
    throw error;
  }
}

/**
 * Get cached response if available
 */
function getCachedResponse(placeId: string): any | null {
  const cached = responseCache.get(placeId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * Cache response by place_id
 */
function cacheResponse(placeId: string, data: any) {
  responseCache.set(placeId, {
    data,
    cachedAt: Date.now(),
  });
}

/**
 * Normalize Google Places data to profile/place format
 */
function normalizePlaceData(placeData: any, originalQuery: string, isUrl: boolean = false) {
  const openingHours = placeData.regularOpeningHours
    ? {
        weekdayText: placeData.regularOpeningHours.weekdayDescriptions || [],
        periods: placeData.regularOpeningHours.periods || [],
      }
    : null;

  // Extract display name (could be text or string)
  const displayName = placeData.displayName?.text || placeData.displayName || null;

  // Extract coordinates
  const lat = placeData.location?.latitude || null;
  const lng = placeData.location?.longitude || null;

  // Extract city, state, country from address components
  // Prefer locality, fallback to postal_town, then sublocality
  let city = null;
  let state = null;
  let country = null;
  
  if (placeData.addressComponents) {
    for (const comp of placeData.addressComponents) {
      const types = comp.types || [];
      
      // City: prefer locality, fallback to postal_town, then sublocality
      if (!city) {
        if (types.includes("locality")) {
          city = comp.longText || comp.shortText || null;
        } else if (types.includes("postal_town")) {
          city = comp.longText || comp.shortText || null;
        } else if (types.includes("sublocality") || types.includes("sublocality_level_1")) {
          city = comp.longText || comp.shortText || null;
        }
      }
      
      // State/province
      if (!state) {
        if (types.includes("administrative_area_level_1")) {
          state = comp.shortText || comp.longText || null;
        } else if (types.includes("administrative_area_level_2")) {
          state = comp.shortText || comp.longText || null;
        }
      }
      
      // Country
      if (!country) {
        if (types.includes("country")) {
          country = comp.longText || comp.shortText || null;
        }
      }
    }
  }

  return {
    name: displayName,
    business_name: displayName, // Alias for backward compatibility
    formatted_address: placeData.formattedAddress || null,
    address: placeData.formattedAddress || null, // Alias
    website: placeData.websiteUri || null,
    phone: placeData.nationalPhoneNumber || null,
    rating: placeData.rating ? Number(placeData.rating) : null,
    reviews_count: placeData.userRatingCount ? Number(placeData.userRatingCount) : null,
    user_ratings_total: placeData.userRatingCount ? Number(placeData.userRatingCount) : null, // Alias
    opening_hours: openingHours,
    price_level: placeData.priceLevel || null,
    category: placeData.types?.[0] || null,
    types: placeData.types || [],
    categories: placeData.types || [], // Alias
    place_id: placeData.id || null,
    google_place_id: placeData.id || null, // Alias
    google_maps_url: isUrl ? originalQuery : (placeData.id ? `https://www.google.com/maps/place/?q=place_id:${placeData.id}` : null),
    lat: lat ? Number(lat) : null,
    lng: lng ? Number(lng) : null,
    latitude: lat ? Number(lat) : null, // Alias
    longitude: lng ? Number(lng) : null, // Alias
    city: city,
    city_state: state,
    city_country: country,
    // Photo references (URLs need to be generated client-side with API key)
    photos: placeData.photos?.map((photo: any) => ({
      reference: photo.name || photo,
      // Note: Photo URLs should be generated client-side or via a server endpoint
      // to avoid exposing API key. For now, we return the reference.
      url: null,
    })) || [],
    photo_urls: placeData.photos?.map((photo: any) => photo.name || photo) || [], // Alias for backward compatibility
  };
}

export async function POST(request: NextRequest) {
  try {
    // Get request body
    const body = await request.json();
    const { query, access_token } = body;

    // Support both 'query' and 'google_url' for backward compatibility
    const inputQuery = query || body.google_url;

    if (!inputQuery || typeof inputQuery !== "string" || inputQuery.trim().length === 0) {
      return NextResponse.json(
        { error: "Invalid request: query is required (can be a Google Maps URL or address text)" },
        { status: 400 }
      );
    }

    const trimmedQuery = inputQuery.trim();
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

    // Fallback: try authorization header
    if (!user) {
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
        if (!authError && authUser) {
          user = authUser;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check rate limit
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }


    // Get Google API key from server-side env (not NEXT_PUBLIC)
    // Fallback to NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for development convenience
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      console.error("GOOGLE_MAPS_API_KEY is not set in environment variables");
      return NextResponse.json(
        { 
          error: "Google Maps API key is not configured. Please add GOOGLE_MAPS_API_KEY to your .env.local file.",
          code: "MISSING_API_KEY"
        },
        { status: 500 }
      );
    }

    // Step 1: Try to extract place_id if input is a URL
    let placeId: string | null = null;
    
    if (queryIsUrl) {
      placeId = extractPlaceIdFromUrl(trimmedQuery);
    }

    // Step 2: If no place_id found, use Find Place From Text API
    if (!placeId) {
      placeId = await findPlaceFromText(googleApiKey, trimmedQuery);
      if (!placeId) {
        console.error("Could not find place from query:", trimmedQuery.substring(0, 100));
        return NextResponse.json(
          { 
            error: queryIsUrl 
              ? "Could not find place from URL. Please make sure the Google Maps link is correct and try again."
              : "Could not find place. Please check the address or place name and try again.",
            code: "PLACE_NOT_FOUND"
          },
          { status: 404 }
        );
      }
    }

    // Step 3: Check cache
    const cachedData = getCachedResponse(placeId);
    if (cachedData) {
      // Update google_maps_url if query was a URL
      if (queryIsUrl) {
        cachedData.google_maps_url = trimmedQuery;
      }
      return NextResponse.json(cachedData);
    }

    // Step 4: Get place details
    const placeData = await getPlaceDetails(googleApiKey, placeId);

    // Step 5: Normalize data
    const normalizedData = normalizePlaceData(placeData, trimmedQuery, queryIsUrl);

    // Step 6: Cache the response
    if (placeId) {
      cacheResponse(placeId, normalizedData);
    }

    return NextResponse.json(normalizedData);
  } catch (error: any) {
    console.error("Place import error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to import place data",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

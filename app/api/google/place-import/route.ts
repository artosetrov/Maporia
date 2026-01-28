import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Rate limiting: simple in-memory store (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per user

// Response cache: simple in-memory cache (in production, use Redis or similar)
const responseCache = new Map<string, { data: unknown; cachedAt: number }>();
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
 * Extract coordinates from Google Maps URL
 * Returns { lat, lng } or null
 */
function extractCoordinatesFromUrl(url: string): { lat: number; lng: number } | null {
  try {
    const urlObj = new URL(url);
    
    // Format: /place/Name/@lat,lng or /place/@lat,lng or /@lat,lng
    const coordMatch = urlObj.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coordMatch && coordMatch[1] && coordMatch[2]) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
    
    // Format: ?q=lat,lng or ?ll=lat,lng
    const qParam = urlObj.searchParams.get("q");
    if (qParam) {
      const qCoordMatch = qParam.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
      if (qCoordMatch) {
        const lat = parseFloat(qCoordMatch[1]);
        const lng = parseFloat(qCoordMatch[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
    }
    
    const llParam = urlObj.searchParams.get("ll");
    if (llParam) {
      const llMatch = llParam.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
      if (llMatch) {
        const lat = parseFloat(llMatch[1]);
        const lng = parseFloat(llMatch[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Extract place_id from Google Maps URL
 * Supports formats:
 * - https://maps.google.com/?cid=...
 * - https://www.google.com/maps/place/.../@lat,lng
 * - https://www.google.com/maps/place/.../@lat,lng,zoom
 * - https://goo.gl/maps/...
 * - https://www.google.com/maps/place/Name/@lat,lng/data=!4m2!3m1!1sPLACE_ID
 * - https://www.google.com/maps/place/Name/@lat,lng,zoom/data=!3m1!4b1!4m6!3m5!1sPLACE_ID
 * - https://maps.app.goo.gl/... (short links)
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
    // Also try more flexible pattern: data=!...!1sPLACE_ID or data=!...!3m1!1sPLACE_ID
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
      // Format: !4m2!3m1!1sPLACE_ID or !3m1!1sPLACE_ID
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
    // Format: /place/Name/@lat,lng,zoom/data=!...
    const pathDataMatch = url.match(/\/place\/[^/]+@[^/]+\/data=!.*?!1s([A-Za-z0-9_-]+)/);
    if (pathDataMatch && pathDataMatch[1]) {
      return pathDataMatch[1];
    }

    // Try to extract place_id from short links (maps.app.goo.gl)
    // These usually redirect, but we can try to extract from the path
    if (urlObj.hostname.includes("goo.gl") || urlObj.hostname.includes("maps.app.goo.gl")) {
      // Short links need to be resolved or use Find Place API
      return null;
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
 * @param skipNearbySearch - If true, skip Nearby Search fallback to avoid recursion
 */
async function findPlaceFromText(apiKey: string, query: string, skipNearbySearch: boolean = false): Promise<string | null> {
  try {
    // If query is a URL, try to extract useful information from it
    let textQuery = query;
    let useCoordinates = false;
    let lat: number | null = null;
    let lng: number | null = null;
    let isUrl = false;
    let originalUrl = query;
    
    try {
      const urlObj = new URL(query);
      isUrl = true;
      
      // Extract place name from pathname if available
      // Format: /place/Place+Name/@lat,lng
      const pathMatch = urlObj.pathname.match(/\/place\/([^/@]+)/);
      if (pathMatch && pathMatch[1]) {
        // Decode URL-encoded place name
        textQuery = decodeURIComponent(pathMatch[1].replace(/\+/g, ' '));
        // Clean up the place name - remove common URL encoding artifacts
        textQuery = textQuery.replace(/%20/g, ' ').replace(/\s+/g, ' ').trim();
      }
      
      // Try to extract coordinates from URL
      // Format: /place/Name/@lat,lng or /place/Name/@lat,lng,zoom
      const coordMatch = urlObj.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (coordMatch && coordMatch[1] && coordMatch[2]) {
        lat = parseFloat(coordMatch[1]);
        lng = parseFloat(coordMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          useCoordinates = true;
        }
      }
      
      // If we have coordinates but no place name, try using the full URL
      if (useCoordinates && !pathMatch) {
        textQuery = query;
      }
    } catch {
      // Not a URL, use as-is
      textQuery = query;
    }

    // Try multiple query variations to improve success rate
    const queryVariations: string[] = [];
    
    // Original query
    if (textQuery.trim()) {
      queryVariations.push(textQuery.trim());
    }
    
    // If URL, try variations
    if (isUrl) {
      // Try without URL protocol and domain
      const urlWithoutProtocol = originalUrl.replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (urlWithoutProtocol !== textQuery) {
        queryVariations.push(urlWithoutProtocol);
      }
      
      // If we extracted a place name, try it
      if (textQuery !== originalUrl && textQuery.length > 3) {
        queryVariations.push(textQuery);
      }
    }

    // Try each query variation
    for (const variation of queryVariations) {
      if (!variation || variation.length < 2) continue;
      
      // Build request body
      const requestBody: any = {
        textQuery: variation,
        maxResultCount: 5, // Get up to 5 results to find best match
      };
      
      // If we have coordinates, add location bias to improve accuracy
      if (useCoordinates && lat !== null && lng !== null) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: lat,
              longitude: lng,
            },
            radius: 100.0, // 100 meters radius - increased for better results
          },
        };
      }

      console.log("Trying Find Place API with query:", {
        query: variation.substring(0, 100),
        hasCoordinates: useCoordinates,
        lat,
        lng,
      });

      try {
        const response = await fetch(
          `https://places.googleapis.com/v1/places:searchText`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }
          console.warn("Find Place From Text API error for variation:", {
            status: response.status,
            statusText: response.statusText,
            error: errorData,
            query: variation.substring(0, 100),
          });
          // Continue to next variation
          continue;
        }

        const data = await response.json();
        
        if (data.places && data.places.length > 0) {
          // Return the first (best match) result
          // Place ID from Find Place API may have "places/" prefix, remove it if present
          let placeId = data.places[0].id;
          if (placeId && typeof placeId === 'string') {
            placeId = placeId.replace(/^places\//, '');
          }
          console.log("Found place via Find Place API:", {
            placeId,
            displayName: data.places[0].displayName?.text || data.places[0].displayName,
            formattedAddress: data.places[0].formattedAddress,
            query: variation.substring(0, 100),
            totalResults: data.places.length,
          });
          return placeId;
        }
      } catch (variationError) {
        console.warn("Error trying query variation:", {
          error: variationError instanceof Error ? variationError.message : String(variationError),
          query: variation.substring(0, 100),
        });
        // Continue to next variation
        continue;
      }
    }

    // If we have coordinates but no results from text search, try Nearby Search as fallback
    if (!skipNearbySearch && useCoordinates && lat !== null && lng !== null) {
      console.log("All Find Place API variations failed, trying Nearby Search with coordinates:", { lat, lng });
      return await findPlaceByCoordinates(apiKey, lat, lng);
    }

    // If no coordinates and looks like an address, try Geocoding API as fallback
    if (!skipNearbySearch && !useCoordinates && !isUrl) {
      // Check if query looks like an address
      // Contains numbers and (street indicators OR suite/unit OR city/state/country)
      const hasNumber = /\d+/.test(query);
      const hasStreetIndicator = /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|place|pl|court|ct|circle|cir|highway|hwy|parkway|pkwy)\b/i.test(query);
      const hasSuiteUnit = /\b(suite|ste|unit|apt|apartment|#|number|no\.?)\b/i.test(query);
      const hasCityState = /,\s*[A-Z]{2}\s+\d{5}/i.test(query) || // US format: City, ST 12345
                           /,\s*[A-Z]{2}\b/i.test(query) || // City, ST
                           /\b(florida|fl|california|ca|texas|tx|new york|ny|illinois|il)\b/i.test(query); // Common states
      
      const looksLikeAddress = hasNumber && (hasStreetIndicator || hasSuiteUnit || hasCityState);
      
      if (looksLikeAddress) {
        console.log("Query looks like an address, trying Geocoding API:", query.substring(0, 100));
        return await findPlaceByGeocoding(apiKey, query);
      }
    }

    console.warn("Find Place API returned no results for all query variations:", queryVariations.map(q => q.substring(0, 50)));
    return null;
  } catch (error) {
    console.error("Find Place From Text API exception:", {
      error: error instanceof Error ? error.message : String(error),
      query: query.substring(0, 100),
    });
    return null;
  }
}

// Coordinate-to-placeId cache (in production, use Redis or similar)
const coordinateCache = new Map<string, { placeId: string | null; cachedAt: number }>();
const COORDINATE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cached place_id for coordinates
 */
function getCachedPlaceIdForCoordinates(lat: number, lng: number): string | null | undefined {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const cached = coordinateCache.get(key);
  if (cached && Date.now() - cached.cachedAt < COORDINATE_CACHE_TTL) {
    return cached.placeId;
  }
  return undefined;
}

/**
 * Cache place_id for coordinates
 */
function cachePlaceIdForCoordinates(lat: number, lng: number, placeId: string | null) {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  coordinateCache.set(key, {
    placeId,
    cachedAt: Date.now(),
  });
}

/**
 * Find place by coordinates using Nearby Search API
 * Prioritizes small radius (20-50m) for accuracy, then expands if needed
 * This is a fallback when Find Place From Text doesn't work
 */
async function findPlaceByCoordinates(apiKey: string, lat: number, lng: number): Promise<string | null> {
  try {
    // Check cache first
    const cached = getCachedPlaceIdForCoordinates(lat, lng);
    if (cached !== undefined) {
      console.log("Using cached place_id for coordinates:", { lat, lng, placeId: cached });
      return cached;
    }
    
    // Try with different radius values, prioritizing small radius (20-50m) first
    // Small radius = more accurate, finds closest place
    // Larger radius = fallback for areas with sparse places
    const radiuses = [20.0, 50.0, 100.0, 200.0];
    
    for (const radius of radiuses) {
      console.log("Trying Nearby Search API with radius:", radius, "meters");
      
      const response = await fetch(
        `https://places.googleapis.com/v1/places:searchNearby`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
          },
          body: JSON.stringify({
            // Don't restrict by type - search for any place at this location
            maxResultCount: 5, // Get multiple results to find best match
            locationRestriction: {
              circle: {
                center: {
                  latitude: lat,
                  longitude: lng,
                },
                radius: radius,
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.warn("Nearby Search API error:", {
          status: response.status,
          error: errorText,
          radius,
        });
        // Try next radius
        continue;
      }

      const data = await response.json();
      
      if (data.places && data.places.length > 0) {
        // Find the closest place to the coordinates
        let closestPlace = data.places[0];
        let minDistance = Infinity;
        
        for (const place of data.places) {
          if (place.location) {
            const placeLat = place.location.latitude;
            const placeLng = place.location.longitude;
            // Calculate distance (simple Euclidean distance)
            const distance = Math.sqrt(
              Math.pow(placeLat - lat, 2) + Math.pow(placeLng - lng, 2)
            ) * 111000; // Convert to meters (rough approximation)
            
            if (distance < minDistance) {
              minDistance = distance;
              closestPlace = place;
            }
          }
        }
        
        let placeId = closestPlace.id;
        if (placeId && typeof placeId === 'string') {
          placeId = placeId.replace(/^places\//, '');
        }
        console.log("Found place via Nearby Search API:", {
          placeId,
          displayName: closestPlace.displayName?.text || closestPlace.displayName,
          distance: minDistance.toFixed(0) + "m",
          lat,
          lng,
          radius,
        });
        
        // Cache the result
        cachePlaceIdForCoordinates(lat, lng, placeId);
        return placeId;
      }
    }

    // If Nearby Search fails, try reverse geocoding as last resort
    console.log("Nearby Search failed, trying reverse geocoding");
    const reverseGeocodePlaceId = await findPlaceByReverseGeocoding(apiKey, lat, lng);
    
    // Cache the result (even if null, to avoid repeated API calls)
    cachePlaceIdForCoordinates(lat, lng, reverseGeocodePlaceId);
    return reverseGeocodePlaceId;
  } catch (error) {
    console.error("Nearby Search API exception:", {
      error: error instanceof Error ? error.message : String(error),
      lat,
      lng,
    });
    return null;
  }
}

/**
 * Get geocode data from address
 * Returns geocode data and coordinates
 */
async function getGeocodeData(apiKey: string, address: string): Promise<{ geocodeData: any; lat: number; lng: number } | null> {
  try {
    console.log("Geocoding address:", address.substring(0, 100));
    
    // Use Geocoding API to get coordinates from address
    const encodedAddress = encodeURIComponent(address);
    const geocodeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`
    );

    if (!geocodeResponse.ok) {
      console.warn("Geocoding API failed:", geocodeResponse.status);
      return null;
    }

    const geocodeData = await geocodeResponse.json();
    
    if (geocodeData.status === "OK" && geocodeData.results && geocodeData.results.length > 0) {
      const result = geocodeData.results[0];
      const location = result.geometry?.location;
      
      if (location && location.lat && location.lng) {
        const lat = location.lat;
        const lng = location.lng;
        
        console.log("Got coordinates from geocoding:", { lat, lng, formatted_address: result.formatted_address });
        
        return {
          geocodeData: result,
          lat,
          lng,
        };
      }
    } else {
      console.warn("Geocoding API returned no results:", {
        status: geocodeData.status,
        error_message: geocodeData.error_message,
        address: address.substring(0, 100),
      });
    }

    return null;
  } catch (error) {
    console.error("Geocoding exception:", {
      error: error instanceof Error ? error.message : String(error),
      address: address.substring(0, 100),
    });
    return null;
  }
}

/**
 * Find place by geocoding an address
 * Uses Geocoding API to get coordinates, then Nearby Search to find place_id
 */
async function findPlaceByGeocoding(apiKey: string, address: string): Promise<string | null> {
  try {
    console.log("Geocoding address:", address.substring(0, 100));
    
    // Use Geocoding API to get coordinates from address
    const encodedAddress = encodeURIComponent(address);
    const geocodeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`
    );

    if (!geocodeResponse.ok) {
      console.warn("Geocoding API failed:", geocodeResponse.status);
      return null;
    }

    const geocodeData = await geocodeResponse.json();
    
    if (geocodeData.status === "OK" && geocodeData.results && geocodeData.results.length > 0) {
      const result = geocodeData.results[0];
      const location = result.geometry?.location;
      
      if (location && location.lat && location.lng) {
        const lat = location.lat;
        const lng = location.lng;
        
        console.log("Got coordinates from geocoding:", { lat, lng, formatted_address: result.formatted_address });
        
        // Try to find place using Nearby Search with these coordinates
        const placeId = await findPlaceByCoordinates(apiKey, lat, lng);
        return placeId;
      }
    } else {
      console.warn("Geocoding API returned no results:", {
        status: geocodeData.status,
        error_message: geocodeData.error_message,
        address: address.substring(0, 100),
      });
    }

    return null;
  } catch (error) {
    console.error("Geocoding exception:", {
      error: error instanceof Error ? error.message : String(error),
      address: address.substring(0, 100),
    });
    return null;
  }
}

/**
 * Find place by reverse geocoding coordinates
 * This is a last resort fallback
 */
async function findPlaceByReverseGeocoding(apiKey: string, lat: number, lng: number): Promise<string | null> {
  try {
    // Use Geocoding API to get address from coordinates
    const geocodeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
    );

    if (!geocodeResponse.ok) {
      console.warn("Reverse geocoding failed:", geocodeResponse.status);
      return null;
    }

    const geocodeData = await geocodeResponse.json();
    
    if (geocodeData.results && geocodeData.results.length > 0) {
      // Get formatted address and try to find place using it
      const formattedAddress = geocodeData.results[0].formatted_address;
      console.log("Got address from reverse geocoding:", formattedAddress);
      
      // Try to find place using the formatted address (skip Nearby Search to avoid recursion)
      return await findPlaceFromText(apiKey, formattedAddress, true);
    }

    return null;
  } catch (error) {
    console.error("Reverse geocoding exception:", {
      error: error instanceof Error ? error.message : String(error),
      lat,
      lng,
    });
    return null;
  }
}

/**
 * Get place details from Google Places API
 */
async function getPlaceDetails(apiKey: string, placeId: string) {
  try {
    // Remove "places/" prefix if present (some APIs return IDs with prefix)
    const cleanPlaceId = placeId.replace(/^places\//, '');
    
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${cleanPlaceId}`,
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
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error("Place Details API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        placeId: cleanPlaceId,
      });
      
      if (response.status === 404) {
        throw new Error(`Place not found: ${cleanPlaceId}`);
      } else if (response.status === 403) {
        throw new Error("Google Maps API key does not have permission to access Places API. Please check API key permissions.");
      } else if (response.status === 400) {
        throw new Error(`Invalid place ID format: ${cleanPlaceId}`);
      }
      
      throw new Error(`Google Places API error: ${response.status} - ${errorData.message || errorText}`);
    }

    const data = await response.json();
    
    if (!data || !data.id) {
      console.error("Place Details API returned invalid data:", { placeId: cleanPlaceId, data });
      throw new Error("Invalid response from Google Places API");
    }

    return data;
  } catch (error) {
    console.error("Place Details API exception:", {
      error: error instanceof Error ? error.message : String(error),
      placeId: placeId.replace(/^places\//, ''),
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
 * Normalize Geocoding API data to profile/place format
 * Used when Places API doesn't find a place_id
 */
function normalizeGeocodeData(geocodeResult: any, originalQuery: string) {
  const location = geocodeResult.geometry?.location;
  const lat = location?.lat || null;
  const lng = location?.lng || null;
  const formattedAddress = geocodeResult.formatted_address || null;

  // Extract city, state, country from address components
  let city = null;
  let state = null;
  let country = null;
  
  if (geocodeResult.address_components) {
    for (const comp of geocodeResult.address_components) {
      const types = comp.types || [];
      
      // City: prefer locality, fallback to postal_town, then sublocality
      if (!city) {
        if (types.includes("locality")) {
          city = comp.long_name || comp.short_name || null;
        } else if (types.includes("postal_town")) {
          city = comp.long_name || comp.short_name || null;
        } else if (types.includes("sublocality") || types.includes("sublocality_level_1")) {
          city = comp.long_name || comp.short_name || null;
        }
      }
      
      // State/province
      if (!state) {
        if (types.includes("administrative_area_level_1")) {
          state = comp.short_name || comp.long_name || null;
        } else if (types.includes("administrative_area_level_2")) {
          state = comp.short_name || comp.long_name || null;
        }
      }
      
      // Country
      if (!country) {
        if (types.includes("country")) {
          country = comp.long_name || comp.short_name || null;
        }
      }
    }
  }

  // Try to extract a name from the address (first part before comma)
  const name = formattedAddress ? formattedAddress.split(',')[0].trim() : originalQuery;

  return {
    name: name,
    business_name: name, // Alias for backward compatibility
    formatted_address: formattedAddress,
    address: formattedAddress, // Alias
    website: null,
    phone: null,
    rating: null,
    reviews_count: null,
    user_ratings_total: null,
    opening_hours: null,
    price_level: null,
    category: null,
    types: geocodeResult.types || [],
    categories: geocodeResult.types || [], // Alias
    place_id: null, // No place_id from Geocoding API
    google_place_id: null,
    google_maps_url: lat && lng ? `https://www.google.com/maps/place/?q=${lat},${lng}` : null,
    lat: lat ? Number(lat) : null,
    lng: lng ? Number(lng) : null,
    latitude: lat ? Number(lat) : null, // Alias
    longitude: lng ? Number(lng) : null, // Alias
    city: city,
    city_state: state,
    city_country: country,
    photos: [],
    photo_urls: [],
    is_coordinate_only: true, // Mark as coordinate-only location
  };
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
    is_coordinate_only: false, // Has a place_id, so not coordinate-only
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
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

    // Step 1: Try to extract place_id if input is a URL or place_id format
    let placeId: string | null = null;
    let coordinates: { lat: number; lng: number } | null = null;
    
    // Check if query is in format "place_id:ChIJ..." (from Google Maps autocomplete)
    if (trimmedQuery.startsWith("place_id:")) {
      placeId = trimmedQuery.replace("place_id:", "").trim();
      console.log("Extracted place_id from query format:", placeId.substring(0, 50));
    } else if (queryIsUrl) {
      // First try to extract place_id
      placeId = extractPlaceIdFromUrl(trimmedQuery);
      
      // If no place_id, try to extract coordinates for later resolution
      if (!placeId) {
        coordinates = extractCoordinatesFromUrl(trimmedQuery);
        if (coordinates) {
          console.log("Extracted coordinates from URL:", coordinates);
          // Try to resolve coordinates to place_id immediately
          placeId = await findPlaceByCoordinates(googleApiKey, coordinates.lat, coordinates.lng);
          if (placeId) {
            console.log("Resolved coordinates to place_id:", placeId.substring(0, 50));
          }
        }
      }
    }

    // Step 2: If no place_id found, use Find Place From Text API
    let geocodeData: any = null;
    if (!placeId) {
      console.log("No place_id extracted from URL, using Find Place API for:", trimmedQuery.substring(0, 100));
      
      // Check if query looks like an address BEFORE trying Find Place API
      // This allows us to use Geocoding API more aggressively for addresses
      let looksLikeAddress = false;
      if (!queryIsUrl) {
        const hasNumber = /\d+/.test(trimmedQuery);
        const hasStreetIndicator = /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|place|pl|court|ct|circle|cir|highway|hwy|parkway|pkwy)\b/i.test(trimmedQuery);
        const hasSuiteUnit = /\b(suite|ste|unit|apt|apartment|#|number|no\.?)\b/i.test(trimmedQuery);
        const hasCityState = /,\s*[A-Z]{2}\s+\d{5}/i.test(trimmedQuery) || // US format: City, ST 12345
                             /,\s*[A-Z]{2}\b/i.test(trimmedQuery) || // City, ST
                             /\b(florida|fl|california|ca|texas|tx|new york|ny|illinois|il|massachusetts|ma|pennsylvania|pa|ohio|oh|georgia|ga|north carolina|nc|michigan|mi)\b/i.test(trimmedQuery); // Common states
        const hasComma = trimmedQuery.includes(','); // Simple check for comma-separated address
        
        looksLikeAddress = hasNumber && (hasStreetIndicator || hasSuiteUnit || hasCityState || hasComma);
        
        if (looksLikeAddress) {
          console.log("Query looks like an address, trying Geocoding API first:", trimmedQuery.substring(0, 100));
          const geocodeResult = await getGeocodeData(googleApiKey, trimmedQuery);
          if (geocodeResult) {
            geocodeData = geocodeResult.geocodeData;
            // Try to find place_id using coordinates from geocoding
            if (geocodeResult.lat && geocodeResult.lng) {
              console.log("Trying to find place_id using coordinates from Geocoding API");
              placeId = await findPlaceByCoordinates(googleApiKey, geocodeResult.lat, geocodeResult.lng);
            }
          }
        }
      }
      
      // If Geocoding API didn't find place_id, try Find Place API
      if (!placeId) {
        placeId = await findPlaceFromText(googleApiKey, trimmedQuery);
      }
      
      // If still no place_id but we have geocode data, we'll use it
      if (!placeId && !geocodeData && !queryIsUrl) {
        console.error("Could not find place from query:", {
          query: trimmedQuery.substring(0, 100),
          isUrl: queryIsUrl,
          extractedPlaceId: null,
          looksLikeAddress,
        });
        return NextResponse.json(
          { 
            error: queryIsUrl 
              ? "Could not find place from URL. Please make sure the Google Maps link is correct and try again. You can also try copying the full address from Google Maps."
              : "Could not find place. Please check the address or place name and try again. Make sure to include the full address with city name.",
            code: "PLACE_NOT_FOUND"
          },
          { status: 404 }
        );
      }
    }

    // Step 3: If we have coordinates but no place_id, try to resolve them
    if (coordinates && !placeId) {
      console.log("Trying to resolve coordinates to place_id:", coordinates);
      placeId = await findPlaceByCoordinates(googleApiKey, coordinates.lat, coordinates.lng);
      if (placeId) {
        console.log("Successfully resolved coordinates to place_id:", placeId.substring(0, 50));
      } else {
        console.log("Could not resolve coordinates to place_id - will return coordinate-only location");
      }
    }
    
    // Step 4: If we have geocode data but no place_id, use geocode data directly
    if (geocodeData && !placeId) {
      console.log("Using Geocoding API data directly (no place_id found)");
      const normalizedData = normalizeGeocodeData(geocodeData, trimmedQuery);
      console.log("Successfully imported place from Geocoding API:", {
        name: normalizedData.name,
        address: normalizedData.formatted_address,
        lat: normalizedData.lat,
        lng: normalizedData.lng,
        is_coordinate_only: normalizedData.is_coordinate_only,
      });
      return NextResponse.json(normalizedData);
    }
    
    // Step 5: If we have coordinates but no place_id and no geocode data, return coordinate-only
    if (coordinates && !placeId && !geocodeData) {
      console.log("Returning coordinate-only location (no place found)");
      const normalizedData = normalizeGeocodeData(
        {
          formatted_address: `${coordinates.lat}, ${coordinates.lng}`,
          geometry: { location: { lat: coordinates.lat, lng: coordinates.lng } },
          address_components: [],
          types: [],
        },
        trimmedQuery
      );
      return NextResponse.json(normalizedData);
    }

    // Step 6: Check cache (only if we have place_id)
    if (placeId) {
      const cachedData = getCachedResponse(placeId);
      if (cachedData && typeof cachedData === "object") {
        // Update google_maps_url if query was a URL
        if (queryIsUrl) {
          (cachedData as any).google_maps_url = trimmedQuery;
        }
        return NextResponse.json(cachedData);
      }
    }

    // Step 7: Get place details
    if (!placeId) {
      return NextResponse.json(
        { 
          error: "Could not find place. Please check the address or place name and try again.",
          code: "PLACE_NOT_FOUND"
        },
        { status: 404 }
      );
    }

    console.log("Getting place details for place_id:", placeId);
    let placeData;
    try {
      placeData = await getPlaceDetails(googleApiKey, placeId);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error("Error getting place details:", errorMessage);
      
      // Check for API permission errors
      if (errorMessage.includes("permission") || errorMessage.includes("Places API") || errorMessage.includes("API key")) {
        return NextResponse.json(
          { 
            error: "Google Maps API key does not have permission to access Places API. Please check API key permissions in Google Cloud Console.",
            code: "API_PERMISSION_ERROR"
          },
          { status: 500 }
        );
      }
      
      // Re-throw other errors to be caught by outer catch
      throw error;
    }
    
    if (!placeData || !placeData.id) {
      console.error("Place details API returned invalid data:", { placeId, placeData });
      return NextResponse.json(
        { 
          error: "Invalid place data received from Google Maps API.",
          code: "INVALID_PLACE_DATA"
        },
        { status: 500 }
      );
    }

    // Step 8: Normalize data
    const normalizedData = normalizePlaceData(placeData, trimmedQuery, queryIsUrl);
    normalizedData.is_coordinate_only = false; // Explicitly mark as having a place_id
    console.log("Successfully imported place:", {
      placeId: normalizedData.place_id,
      name: normalizedData.name,
      address: normalizedData.formatted_address,
      is_coordinate_only: normalizedData.is_coordinate_only,
    });

    // Step 9: Cache the response
    if (placeId) {
      cacheResponse(placeId, normalizedData);
    }

    return NextResponse.json(normalizedData);
  } catch (error: unknown) {
    console.error("Place import error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check for API permission errors
    if (errorMessage.includes("permission") || errorMessage.includes("Places API") || errorMessage.includes("API key")) {
      return NextResponse.json(
        {
          error: "Google Maps API key does not have permission to access Places API. Please check API key permissions in Google Cloud Console.",
          code: "API_PERMISSION_ERROR"
        },
        { status: 500 }
      );
    }
    
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: errorMessage || "Failed to import place data",
        code: "IMPORT_ERROR",
        details: process.env.NODE_ENV === "development" ? stack : undefined,
      },
      { status: 500 }
    );
  }
}

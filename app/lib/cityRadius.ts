/**
 * City radius search configuration and utilities.
 * Expands city-based searches to include nearby places within a configurable radius.
 */

import { supabase } from "./supabase";
import { sanitizePostgrestValue } from "../utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Configurable radius in miles for city search */
export const CITY_RADIUS_MILES = 10;

/** Radius in kilometers (1 mile ≈ 1.60934 km) */
export const CITY_RADIUS_KM = CITY_RADIUS_MILES * 1.60934;

/** Approximate km per degree of latitude */
const KM_PER_DEG_LAT = 111.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CityCoords = { lat: number | null; lng: number | null };

// ---------------------------------------------------------------------------
// City coordinates cache
// ---------------------------------------------------------------------------

const cityCoordsCacheMap = new Map<string, CityCoords>();

/**
 * Pre-populate the city coords cache from an array of city objects.
 * Call this when cities are already loaded (e.g. in SearchModal) to avoid
 * extra DB queries.
 */
export const populateCityCoordsCache = (
  cities: Array<{ name: string; lat: number | null; lng: number | null }>,
): void => {
  for (const city of cities) {
    const key = city.name.toLowerCase().trim();
    cityCoordsCacheMap.set(key, { lat: city.lat, lng: city.lng });
  }
};

/**
 * Get city center coordinates by city name.
 * Results are cached in memory so subsequent calls are instant.
 */
export const getCityCoords = async (cityName: string): Promise<CityCoords> => {
  const key = cityName.toLowerCase().trim();

  const cached = cityCoordsCacheMap.get(key);
  if (cached !== undefined) return cached;

  try {
    const { data, error } = await supabase
      .from("cities")
      .select("lat, lng")
      .ilike("name", cityName.trim())
      .limit(1)
      .maybeSingle();

    const row = data as { lat: number | null; lng: number | null } | null;
    const result: CityCoords =
      !error && row
        ? { lat: row.lat ?? null, lng: row.lng ?? null }
        : { lat: null, lng: null };

    cityCoordsCacheMap.set(key, result);
    return result;
  } catch {
    const fallback: CityCoords = { lat: null, lng: null };
    cityCoordsCacheMap.set(key, fallback);
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// PostgREST filter builders
// ---------------------------------------------------------------------------

/**
 * Build a PostgREST OR filter string that includes:
 *   1. Exact city name match (city_name_cached or city)
 *   2. Bounding-box within CITY_RADIUS_KM of city center
 *
 * Falls back to strict city name match if coordinates are missing.
 */
export const buildCityRadiusFilter = (
  cityName: string,
  cityLat: number | null,
  cityLng: number | null,
): string => {
  const safeCity = sanitizePostgrestValue(cityName);
  const baseFilter = `city_name_cached.eq.${safeCity},city.eq.${safeCity}`;

  if (cityLat == null || cityLng == null) return baseFilter;

  const deltaLat = CITY_RADIUS_KM / KM_PER_DEG_LAT;
  const deltaLng =
    CITY_RADIUS_KM / (KM_PER_DEG_LAT * Math.cos((cityLat * Math.PI) / 180));

  const minLat = (cityLat - deltaLat).toFixed(6);
  const maxLat = (cityLat + deltaLat).toFixed(6);
  const minLng = (cityLng - deltaLng).toFixed(6);
  const maxLng = (cityLng + deltaLng).toFixed(6);

  return `${baseFilter},and(lat.gte.${minLat},lat.lte.${maxLat},lng.gte.${minLng},lng.lte.${maxLng})`;
};

/**
 * Build a combined PostgREST OR filter for multiple cities with radius.
 * Resolves coordinates via cache / DB for each city.
 */
export const buildMultiCityRadiusFilter = async (
  cityNames: string[],
): Promise<string> => {
  const parts = await Promise.all(
    cityNames.map(async (name) => {
      const coords = await getCityCoords(name);
      return buildCityRadiusFilter(name, coords.lat, coords.lng);
    }),
  );
  return parts.join(",");
};

// ---------------------------------------------------------------------------
// Client-side distance helpers
// ---------------------------------------------------------------------------

/**
 * Haversine distance between two points in km.
 */
export const haversineDistanceKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Check if a place is within the city radius (client-side).
 * Returns true if:
 *   - City name matches exactly, OR
 *   - Haversine distance ≤ CITY_RADIUS_KM
 */
export const isPlaceWithinCityRadius = (
  place: {
    lat?: number | null;
    lng?: number | null;
    city?: string | null;
    city_name_cached?: string | null;
  },
  cityName: string,
  cityLat: number | null,
  cityLng: number | null,
): boolean => {
  const lower = cityName.toLowerCase();

  // Exact city name match
  if (
    place.city_name_cached?.toLowerCase() === lower ||
    place.city?.toLowerCase() === lower
  ) {
    return true;
  }

  // Distance check
  if (
    cityLat != null &&
    cityLng != null &&
    place.lat != null &&
    place.lng != null
  ) {
    return haversineDistanceKm(cityLat, cityLng, place.lat, place.lng) <= CITY_RADIUS_KM;
  }

  return false;
};

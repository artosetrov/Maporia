/**
 * Cities utility functions
 */

import { supabase } from "./supabase";

export type City = {
  id: string;
  name: string;
  slug: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Get all cities from database
 * Used for filters and autocomplete
 */
export async function getAllCities(): Promise<City[]> {
  try {
    const { data, error } = await supabase
      .from("cities")
      .select("id, name, slug, state, country, lat, lng")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error loading cities:", error);
      return [];
    }

    return (data || []) as City[];
  } catch (error) {
    console.error("Exception loading cities:", error);
    return [];
  }
}

/**
 * Get cities that have places
 * More efficient for filters - only show cities that actually have places
 */
export async function getCitiesWithPlaces(): Promise<City[]> {
  try {
    // Get distinct city_ids from places that have city_id
    const { data: placesData, error: placesError } = await supabase
      .from("places")
      .select("city_id")
      .not("city_id", "is", null);

    if (placesError) {
      // Check if error is AbortError
      if (placesError.message?.includes('abort') || placesError.name === 'AbortError' || (placesError as any).code === 'ECONNABORTED') {
        console.log("[getCitiesWithPlaces] Places request aborted (expected on unmount)");
        return [];
      }
      console.error("Error loading places for cities:", placesError);
      return [];
    }

    const cityIds = Array.from(
      new Set((placesData || []).map((p: any) => p.city_id).filter(Boolean))
    );

    if (cityIds.length === 0) {
      return [];
    }

    // Get city details
    const { data: citiesData, error: citiesError } = await supabase
      .from("cities")
      .select("id, name, slug, state, country, lat, lng")
      .in("id", cityIds)
      .order("name", { ascending: true });

    if (citiesError) {
      // Check if error is AbortError
      if (citiesError.message?.includes('abort') || citiesError.name === 'AbortError' || (citiesError as any).code === 'ECONNABORTED') {
        console.log("[getCitiesWithPlaces] Cities request aborted (expected on unmount)");
        return [];
      }
      console.error("Error loading cities:", citiesError);
      return [];
    }

    return (citiesData || []) as City[];
  } catch (error: any) {
    // Handle AbortError gracefully
    if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
      console.log("[getCitiesWithPlaces] Request aborted (expected on unmount)");
      return [];
    }
    console.error("Exception loading cities with places:", error);
    return [];
  }
}

/**
 * Get city name by city_id
 */
export async function getCityName(cityId: string | null): Promise<string | null> {
  if (!cityId) return null;

  try {
    const { data, error } = await supabase
      .from("cities")
      .select("name")
      .eq("id", cityId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.name;
  } catch (error) {
    console.error("Exception getting city name:", error);
    return null;
  }
}

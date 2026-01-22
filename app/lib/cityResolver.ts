/**
 * City resolver utility
 * Resolves city name to city_id by calling the API
 */

export type CityData = {
  city_id: string;
  name: string;
  slug?: string | null;
  state?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
};

/**
 * Resolve city name to city_id
 * Creates city in database if it doesn't exist
 */
export async function resolveCity(
  cityName: string | null | undefined,
  state?: string | null,
  country?: string | null,
  lat?: number | null,
  lng?: number | null
): Promise<CityData | null> {
  if (!cityName || typeof cityName !== "string" || cityName.trim().length === 0) {
    return null;
  }

  try {
    const response = await fetch("/api/cities/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: cityName.trim(),
        state: state || null,
        country: country || null,
        lat: lat || null,
        lng: lng || null,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Error resolving city:", error);
      // Don't fail completely - return null but log the error
      return null;
    }

    const data = await response.json();
    return data as CityData;
  } catch (error) {
    console.error("Exception resolving city:", error);
    // Don't fail completely - return null but log the error
    return null;
  }
}

/**
 * Extract city from Google Places address components
 */
export function extractCityFromAddressComponents(addressComponents: any[]): {
  city: string | null;
  state: string | null;
  country: string | null;
} {
  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  for (const component of addressComponents) {
    const types = component.types || [];
    
    // Prefer locality, fallback to postal_town, then sublocality
    if (!city) {
      if (types.includes("locality")) {
        city = component.long_name || component.short_name;
      } else if (types.includes("postal_town")) {
        city = component.long_name || component.short_name;
      } else if (types.includes("sublocality") || types.includes("sublocality_level_1")) {
        city = component.long_name || component.short_name;
      }
    }
    
    // State/province
    if (!state) {
      if (types.includes("administrative_area_level_1")) {
        state = component.short_name || component.long_name;
      } else if (types.includes("administrative_area_level_2")) {
        state = component.short_name || component.long_name;
      }
    }
    
    // Country
    if (!country) {
      if (types.includes("country")) {
        country = component.long_name || component.short_name;
      }
    }
  }

  return { city, state, country };
}

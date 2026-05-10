/**
 * Google Maps API configuration
 * Libraries array is defined outside components to prevent script reloading on every render
 *
 * "marker" library is required for AdvancedMarkerElement and Map ID based styling
 */
export const GOOGLE_MAPS_LIBRARIES: ("places" | "marker" | "drawing" | "geometry" | "visualization")[] = [
  "places",
  "marker",
];

/**
 * Memoized Google Maps API key to ensure consistency across all components
 * This prevents the "Loader must not be called again with different options" error
 */
let cachedApiKey: string | null = null;

/**
 * Get Google Maps API key from environment variables
 * Returns a cached value to ensure consistency across all useJsApiLoader calls
 */
export const getGoogleMapsApiKey = (): string => {
  if (cachedApiKey) {
    return cachedApiKey;
  }
  
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not defined. Please set it in your .env.local file.");
  }
  
  cachedApiKey = apiKey;
  return apiKey;
};

/**
 * Get Google Maps Map ID for cloud-based map styling.
 * Map styles are configured in Google Cloud Console → Maps → Map Styles.
 * Returns undefined if not configured (map falls back to default styling).
 */
export const getGoogleMapId = (): string | undefined => {
  return process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || undefined;
};

/**
 * Shared map options applied to all GoogleMap instances.
 * Uses Map ID for cloud-based styling (no hardcoded JSON styles).
 */
export const getMapOptions = (
  overrides?: Partial<google.maps.MapOptions>
): google.maps.MapOptions => {
  const mapId = getGoogleMapId();

  return {
    gestureHandling: "greedy",
    disableDefaultUI: true,
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    ...(mapId ? { mapId } : {}),
    ...overrides,
  };
};

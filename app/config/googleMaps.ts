/**
 * Google Maps API configuration
 * Libraries array is defined outside components to prevent script reloading on every render
 */
export const GOOGLE_MAPS_LIBRARIES: ("places" | "drawing" | "geometry" | "visualization")[] = ["places"];

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
  
  if (process.env.NODE_ENV === "development") {
    console.log("Google Maps API Key:", !!apiKey);
    if (!apiKey) {
      console.warn("⚠️ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not defined in environment variables");
    }
  }
  
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not defined. Please set it in your .env.local file.");
  }
  
  cachedApiKey = apiKey;
  return apiKey;
};

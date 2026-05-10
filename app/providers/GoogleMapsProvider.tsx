"use client";

import { ReactNode, createContext, useContext } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import {
  GOOGLE_MAPS_LIBRARIES,
  getGoogleMapsApiKey,
} from "../config/googleMaps";

type GoogleMapsContextValue = {
  isLoaded: boolean;
  loadError: Error | undefined;
};

const GoogleMapsContext = createContext<GoogleMapsContextValue>({
  isLoaded: false,
  loadError: undefined,
});

/**
 * Single global loader for the Google Maps JS SDK.
 *
 * Why this exists:
 * - Previously each page that needed maps called useJsApiLoader() locally,
 *   which re-mounted loader state on every navigation to /map.
 * - @react-google-maps/api uses a module-level singleton internally, but
 *   centralising it here gives us:
 *     1. one consistent (apiKey, libraries) tuple — avoids the
 *        "Loader must not be called again with different options" error;
 *     2. SDK script begins downloading on first paint instead of when the
 *        user opens /map, so the first map render is noticeably faster.
 *
 * Consumers read isLoaded / loadError via useGoogleMaps().
 */
export default function GoogleMapsProvider({ children }: { children: ReactNode }) {
  // Defensive: getGoogleMapsApiKey() throws if the env var is missing.
  // We don't want a missing key to crash the entire app shell — only the map.
  let apiKey: string;
  try {
    apiKey = getGoogleMapsApiKey();
  } catch (e) {
    const loadError =
      e instanceof Error ? e : new Error("Google Maps API key is missing");
    return (
      <GoogleMapsContext.Provider value={{ isLoaded: false, loadError }}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return <GoogleMapsLoader apiKey={apiKey}>{children}</GoogleMapsLoader>;
}

function GoogleMapsLoader({
  apiKey,
  children,
}: {
  apiKey: string;
  children: ReactNode;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function useGoogleMaps(): GoogleMapsContextValue {
  return useContext(GoogleMapsContext);
}

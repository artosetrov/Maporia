"use client";

import { useEffect } from "react";
import { useGoogleMap } from "@react-google-maps/api";
import { createStaticPinSvg } from "../lib/mapMarkers";

type AdvancedPinMarkerProps = {
  position: { lat: number; lng: number };
  title?: string;
  size?: number;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
};

/**
 * Single-marker drop-in replacement for the deprecated <Marker icon={...}/>.
 *
 * google.maps.Marker is deprecated as of Feb 2024 and produces a console
 * warning on every page using it. The new AdvancedMarkerElement isn't yet
 * wrapped by @react-google-maps/api@2.20.8, so we instantiate it directly
 * via the JS Maps API. Renders nothing in React's tree — it pushes a DOM
 * element onto the map imperatively and cleans up on unmount.
 *
 * Must be a child of <GoogleMap> so useGoogleMap() can find the parent map.
 * Requires the parent map to have a `mapId` configured (it does — see
 * config/googleMaps.getMapOptions). The "marker" library is already loaded
 * via GOOGLE_MAPS_LIBRARIES.
 *
 * For map screens with N markers + clustering (e.g. /map, /explore),
 * keep using @googlemaps/markerclusterer — that path is migrated
 * separately because it touches a custom cluster renderer.
 */
export default function AdvancedPinMarker({
  position,
  title,
  size = 32,
  draggable = false,
  onDragEnd,
}: AdvancedPinMarkerProps) {
  const map = useGoogleMap();

  useEffect(() => {
    if (!map) return;
    if (typeof window === "undefined" || !window.google?.maps?.marker?.AdvancedMarkerElement) {
      return;
    }
    const content = document.createElement("div");
    content.style.width = `${size}px`;
    content.style.height = `${size}px`;
    content.style.backgroundImage = `url("${createStaticPinSvg(size)}")`;
    content.style.backgroundSize = "contain";
    content.style.backgroundRepeat = "no-repeat";

    const marker = new window.google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      title,
      content,
      gmpDraggable: draggable,
    });

    let dragListener: google.maps.MapsEventListener | null = null;
    if (draggable && onDragEnd) {
      dragListener = marker.addListener("dragend", () => {
        const pos = marker.position;
        if (pos) {
          // position may be LatLng | LatLngLiteral; normalise to literal.
          const lat = typeof (pos as google.maps.LatLng).lat === "function"
            ? (pos as google.maps.LatLng).lat()
            : (pos as google.maps.LatLngLiteral).lat;
          const lng = typeof (pos as google.maps.LatLng).lng === "function"
            ? (pos as google.maps.LatLng).lng()
            : (pos as google.maps.LatLngLiteral).lng;
          onDragEnd(lat, lng);
        }
      });
    }

    return () => {
      if (dragListener) dragListener.remove();
      marker.map = null;
    };
  }, [map, position.lat, position.lng, title, size, draggable, onDragEnd]);

  return null;
}

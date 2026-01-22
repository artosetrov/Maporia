"use client";

import { useRef, useEffect } from "react";
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "../config/googleMaps";

type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: {
    address: string;
    googlePlaceId: string | null;
    lat: number | null;
    lng: number | null;
    city?: string;
  }) => void;
  onAutocompleteRef: (ref: any) => void;
};

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  onAutocompleteRef,
}: AddressAutocompleteProps) {
  const autocompleteRef = useRef<any>(null);

  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  useEffect(() => {
    onAutocompleteRef(autocompleteRef.current);
  }, [onAutocompleteRef]);

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (!place) {
      console.warn("AddressAutocomplete: No place selected");
      return;
    }

    console.log("AddressAutocomplete: Place selected", {
      formatted_address: place.formatted_address,
      place_id: place.place_id,
      geometry: place.geometry,
    });

    // Извлекаем координаты - location может быть LatLng объектом или объектом с lat/lng
    let lat: number | null = null;
    let lng: number | null = null;
    
    if (place.geometry?.location) {
      const location = place.geometry.location;
      console.log("AddressAutocomplete: Location object", {
        location,
        latType: typeof location.lat,
        hasLatFunction: typeof location.lat === 'function',
        hasLatNumber: typeof location.lat === 'number',
      });
      
      // Проверяем, является ли location объектом LatLng с методами
      if (typeof location.lat === 'function') {
        lat = location.lat();
        lng = location.lng();
        console.log("AddressAutocomplete: Extracted coordinates (function):", { lat, lng });
      } else if (typeof location.lat === 'number') {
        // Если это объект с полями lat и lng
        lat = location.lat;
        lng = location.lng;
        console.log("AddressAutocomplete: Extracted coordinates (number):", { lat, lng });
      } else {
        console.warn("AddressAutocomplete: Unknown location format", location);
      }
    } else {
      console.warn("AddressAutocomplete: No geometry.location in place");
    }

    const placeData = {
      address: place.formatted_address ?? "",
      googlePlaceId: place.place_id ?? null,
      lat,
      lng,
      city: place.address_components?.find(
        (comp: any) =>
          comp.types.includes("locality") || comp.types.includes("administrative_area_level_1")
      )?.long_name,
    };
    
    console.log("AddressAutocomplete: Calling onPlaceSelect with:", placeData);
    onPlaceSelect(placeData);
  };

  if (!isLoaded) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start typing address…"
        className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:bg-white focus:border-[#8F9E4F] transition"
      />
    );
  }

  return (
    <Autocomplete
      onLoad={(a) => {
        autocompleteRef.current = a;
        onAutocompleteRef(a);
      }}
      onPlaceChanged={handlePlaceChanged}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start typing address…"
        className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:bg-white focus:border-[#8F9E4F] transition"
      />
    </Autocomplete>
  );
}

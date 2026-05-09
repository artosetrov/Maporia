"use client";

import { useRef, useEffect } from "react";
import { Autocomplete } from "@react-google-maps/api";
import { useGoogleMaps } from "../providers/GoogleMapsProvider";
import { extractCityFromAddressComponents } from "../lib/cityResolver";

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
  onAutocompleteRef: (ref: google.maps.places.Autocomplete | null) => void;
};

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  onAutocompleteRef,
}: AddressAutocompleteProps) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // SDK loaded once at app shell (GoogleMapsProvider in RootLayout).
  const { isLoaded } = useGoogleMaps();

  useEffect(() => {
    onAutocompleteRef(autocompleteRef.current);
  }, [onAutocompleteRef]);

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace() as google.maps.places.PlaceResult | undefined;
    if (!place) {
      console.warn("AddressAutocomplete: No place selected");
      return;
    }

    // Извлекаем координаты - location может быть LatLng объектом или объектом с lat/lng
    let lat: number | null = null;
    let lng: number | null = null;
    
    if (place.geometry?.location) {
      const location = place.geometry.location;
      
      const maybeLatLng = location as google.maps.LatLng;
      const maybeLiteral = location as unknown as { lat: number; lng: number };
      const latValue = (location as { lat?: unknown }).lat;
      // Проверяем, является ли location объектом LatLng с методами
      if (typeof latValue === 'function') {
        lat = maybeLatLng.lat();
        lng = maybeLatLng.lng();
      } else if (typeof latValue === 'number') {
        // Если это объект с полями lat и lng
        lat = maybeLiteral.lat;
        lng = maybeLiteral.lng;
      }
    }

    // Extract city, state, country from address components
    let city: string | null = null;
    if (place.address_components) {
      const cityData = extractCityFromAddressComponents(place.address_components);
      city = cityData.city;
    }

    const placeData = {
      address: place.formatted_address ?? "",
      googlePlaceId: place.place_id ?? null,
      lat,
      lng,
      city: city ?? undefined,
    };
    
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
      onLoad={(a: google.maps.places.Autocomplete) => {
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

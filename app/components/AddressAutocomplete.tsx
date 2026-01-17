"use client";

import { useRef, useEffect } from "react";
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";

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
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    libraries: ["places"],
  });

  useEffect(() => {
    onAutocompleteRef(autocompleteRef.current);
  }, [onAutocompleteRef]);

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (!place) return;

    onPlaceSelect({
      address: place.formatted_address ?? "",
      googlePlaceId: place.place_id ?? null,
      lat: place.geometry?.location?.lat() ?? null,
      lng: place.geometry?.location?.lng() ?? null,
      city: place.address_components?.find(
        (comp: any) =>
          comp.types.includes("locality") || comp.types.includes("administrative_area_level_1")
      )?.long_name,
    });
  };

  if (!isLoaded) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start typing address…"
        className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none focus:bg-white focus:border-[#6b7d47]/40 transition"
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
        className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none focus:bg-white focus:border-[#6b7d47]/40 transition"
      />
    </Autocomplete>
  );
}

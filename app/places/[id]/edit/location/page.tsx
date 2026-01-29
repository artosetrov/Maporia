"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { supabase } from "../../../../lib/supabase";
import { useUserAccess } from "../../../../hooks/useUserAccess";
import { isUserAdmin } from "../../../../lib/access";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "../../../../config/googleMaps";
import dynamicImport from "next/dynamic";
import Icon from "../../../../components/Icon";
import { resolveCity, extractCityFromAddressComponents } from "../../../../lib/cityResolver";
import { getCitiesWithPlaces, type City } from "../../../../lib/cities";
import Pill from "../../../../components/Pill";
import UnifiedGoogleImportField from "../../../../components/UnifiedGoogleImportField";

const AddressAutocomplete = dynamicImport(
  () => import("../../../../components/AddressAutocomplete"),
  { ssr: false }
);

const CityAutocomplete = dynamicImport(
  () => import("../../../../components/CityAutocomplete"),
  { ssr: false }
);

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function LocationEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const { loading: accessLoading, user, access } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [availableCities, setAvailableCities] = useState<City[]>([]);
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [originalAddress, setOriginalAddress] = useState("");
  const [originalCity, setOriginalCity] = useState("");
  const [originalGooglePlaceId, setOriginalGooglePlaceId] = useState<string | null>(null);
  const [originalLat, setOriginalLat] = useState<number | null>(null);
  const [originalLng, setOriginalLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [googlePlaceData, setGooglePlaceData] = useState<any>(null);
  const [loadingGoogleData, setLoadingGoogleData] = useState(false);
  const autocompleteRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Load available cities
  useEffect(() => {
    (async () => {
      const cities = await getCitiesWithPlaces();
      setAvailableCities(cities);
    })();
  }, []);

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data, error: placeError } = await supabase
        .from("places")
        .select("address, city, city_id, city_name_cached, google_place_id, lat, lng, created_by")
        .eq("id", placeId)
        .single();

      if (placeError || !data) {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      const currentIsAdmin = isUserAdmin(access);
      const isOwner = data.created_by === user.id;
      if (!isOwner && !currentIsAdmin) {
        router.push(`/id/${placeId}`);
        return;
      }

      setAddress(data.address || "");
      // Use city_name_cached if available, fallback to city
      const cityName = data.city_name_cached || data.city || "";
      setCity(cityName);
      
      setGooglePlaceId(data.google_place_id);
      setLat(data.lat);
      setLng(data.lng);

      setOriginalAddress(data.address || "");
      setOriginalCity(cityName);
      setOriginalGooglePlaceId(data.google_place_id);
      setOriginalLat(data.lat);
      setOriginalLng(data.lng);

      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  // Prevent page scroll when interacting with map on mobile
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
      }
    };

    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // Set selected city when place data and available cities are loaded
  useEffect(() => {
    if (!placeId || availableCities.length === 0) return;

    (async () => {
      const { data } = await supabase
        .from("places")
        .select("city_id, city_name_cached, city")
        .eq("id", placeId)
        .single();

      if (data?.city_id) {
        const foundCity = availableCities.find(c => c.id === data.city_id);
        if (foundCity) {
          setSelectedCity(foundCity);
        }
      } else if (data?.city_name_cached || data?.city) {
        // Try to find by name
        const cityName = data.city_name_cached || data.city;
        const foundCity = availableCities.find(c => c.name === cityName);
        if (foundCity) {
          setSelectedCity(foundCity);
        }
      }
    })();
  }, [placeId, availableCities]);

  const hasChanges =
    address.trim() !== originalAddress.trim() ||
    city.trim() !== originalCity.trim() ||
    googlePlaceId !== originalGooglePlaceId ||
    lat !== originalLat ||
    lng !== originalLng;

  const canSave = hasChanges && !saving && lat !== null && lng !== null;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    let finalCity = city.trim();
    let cityState: string | null = null;
    let cityCountry: string | null = null;

    // Try to extract city from Google Autocomplete if city is empty
    if (!finalCity && address && autocompleteRef.current) {
      try {
        const place = autocompleteRef.current.getPlace();
        if (place?.address_components) {
          const cityData = extractCityFromAddressComponents(place.address_components);
          if (cityData.city) {
            finalCity = cityData.city;
            cityState = cityData.state;
            cityCountry = cityData.country;
          }
        }
      } catch {
        // Ignore
      }
    }

    // Resolve city to city_id
    let cityId: string | null = null;
    if (finalCity) {
      const cityData = await resolveCity(finalCity, cityState, cityCountry, lat, lng);
      if (cityData) {
        cityId = cityData.city_id;
        // Update city name if it was normalized
        if (cityData.name && cityData.name !== finalCity) {
          finalCity = cityData.name;
        }
      }
    }

    // Admin can update any place, owner can update their own
    const currentIsAdmin = isUserAdmin(access);
    const updateQuery = supabase
      .from("places")
      .update({
        address: address.trim() || null,
        city: finalCity || null, // Keep for backward compatibility
        city_id: cityId,
        city_name_cached: finalCity || null,
        google_place_id: googlePlaceId,
        lat: lat !== null && lat !== undefined ? Number(lat) : null,
        lng: lng !== null && lng !== undefined ? Number(lng) : null,
      })
      .eq("id", placeId);
    
    // If not admin, add ownership check
    if (!currentIsAdmin) {
      updateQuery.eq("created_by", user.id);
    }
    
    const { data, error: updateError } = await updateQuery.select();


    setSaving(false);

    if (updateError) {
      console.error("Update error:", updateError);
      setError(updateError.message || "Failed to save location");
      return;
    }

    // If no data returned but no error, the update likely succeeded
    if (!data || data.length === 0) {
      console.warn("No data returned from update, but no error occurred. Update likely succeeded.");
      // Don't show error - just proceed with navigation
    }

    if (navigator.vibrate) navigator.vibrate(10);
    // Force reload by using window.location to ensure fresh data
    window.location.href = `/places/${placeId}/edit`;
  }

  function handleCancel() {
    router.push(`/places/${placeId}/edit`);
  }

  const mapCenter = lat && lng ? { lat, lng } : { lat: 26.1224, lng: -80.1373 }; // Default to Fort Lauderdale
  const mapZoom = lat && lng ? 15 : 10;

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-10 w-full bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-64 w-full bg-[#ECEEE4] rounded animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleCancel}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <h1 className="font-semibold font-fraunces text-[#1F2A1F] flex-1 text-center" style={{ fontSize: '24px' }}>Location</h1>
            <div className="w-10" /> {/* Spacer для центрирования */}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 max-w-4xl mx-auto w-full">
        {error && (
          <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        {/* Map */}
        <div 
          ref={mapContainerRef}
          className="h-[40vh] min-h-[300px] bg-[#ECEEE4] relative"
          style={{
            touchAction: 'none',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {isLoaded && (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={mapCenter}
              zoom={mapZoom}
              options={{
                gestureHandling: "greedy",
                disableDefaultUI: false,
                zoomControl: true,
                zoomControlOptions: {
                  position: google.maps.ControlPosition.LEFT_CENTER,
                },
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
              }}
              onClick={(e) => {
                if (isDragging && e.latLng) {
                  setLat(e.latLng.lat());
                  setLng(e.latLng.lng());
                }
              }}
            >
              {lat && lng && (
                <Marker
                  position={{ lat, lng }}
                  draggable={isDragging}
                  onDragEnd={(e) => {
                    if (e.latLng) {
                      setLat(e.latLng.lat());
                      setLng(e.latLng.lng());
                    }
                  }}
                />
              )}
            </GoogleMap>
          )}
        </div>

        {/* Address Fields */}
        <div className="px-4 sm:px-6 py-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Address</label>
            {isLoaded ? (
              <AddressAutocomplete
                value={address}
                onChange={(value) => {
                  setAddress(value);
                  setGooglePlaceId(null);
                  setLat(null);
                  setLng(null);
                }}
                onPlaceSelect={async (place) => {
                  setAddress(place.address);
                  setGooglePlaceId(place.googlePlaceId);
                  setLat(place.lat);
                  setLng(place.lng);
                  setGooglePlaceData(null); // Reset previous data
                  
                  // Auto-fill city from address
                  if (place.city) {
                    setCity(place.city);
                    // Try to resolve city to get full city data
                    const cityData = await resolveCity(
                      place.city,
                      null,
                      null,
                      place.lat,
                      place.lng
                    );
                    if (cityData) {
                      // Find matching city from database
                      const { data: cityRecord } = await supabase
                        .from("cities")
                        .select("*")
                        .eq("id", cityData.city_id)
                        .single();
                      if (cityRecord) {
                        setSelectedCity(cityRecord as City);
                      }
                    }
                  }

                  // Fetch Google Places data if we have a place_id
                  if (place.googlePlaceId && user) {
                    setLoadingGoogleData(true);
                    setGooglePlaceData(null); // Clear previous data
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (session?.access_token) {
                        // Use place_id format that API recognizes
                        const response = await fetch("/api/google/place-import", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            query: `place_id:${place.googlePlaceId}`,
                            access_token: session.access_token,
                          }),
                        });

                        if (response.ok) {
                          const data = await response.json();
                          setGooglePlaceData(data);
                        } else {
                          let errorMessage = "Failed to load Google Places data";
                          let errorCode = null;
                          try {
                            const errorText = await response.text();
                            let errorData;
                            try {
                              errorData = JSON.parse(errorText);
                            } catch {
                              errorData = { error: errorText };
                            }
                            
                            errorCode = errorData.code;
                            
                            if (errorCode === "API_PERMISSION_ERROR" || 
                                errorData.error?.includes("permission") || 
                                errorData.error?.includes("Places API") ||
                                response.status === 403) {
                              errorMessage = "Google Maps API key doesn't have Places API access. Please configure API key permissions in Google Cloud Console.";
                            } else if (errorData.error) {
                              errorMessage = errorData.error;
                            }
                            
                            console.error("Failed to fetch Google Places data:", {
                              status: response.status,
                              code: errorCode,
                              error: errorData,
                            });
                          } catch (parseErr) {
                            console.error("Failed to parse error response:", parseErr);
                          }
                          
                          // Show error message in UI
                          if (errorCode === "API_PERMISSION_ERROR" || response.status === 403) {
                            setError("Google Places API access is not configured. Additional place data will not be available.");
                          } else {
                            // For other errors, just log - don't show to user as this is optional
                            console.warn("Google Places data unavailable:", errorMessage);
                          }
                        }
                      }
                    } catch (err) {
                      console.error("Failed to fetch Google Places data:", err);
                      // Don't show error to user - this is optional data
                    } finally {
                      setLoadingGoogleData(false);
                    }
                  }
                }}
                onAutocompleteRef={(ref) => {
                  autocompleteRef.current = ref;
                }}
              />
            ) : (
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Start typing address…"
                className="w-full rounded-xl border border-[#ECEEE4] bg-white px-4 py-3 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] transition"
              />
            )}
          </div>

          {/* Import from Google */}
          {user && (
            <div className="rounded-xl border border-[#ECEEE4] bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#1F2A1F]">Import from Google</h3>
              </div>
              <p className="text-xs text-[#6F7A5A]">
                Search for a place using a Google Maps URL or address to automatically fill address, coordinates, and city.
              </p>
              <UnifiedGoogleImportField
                userId={user.id}
                context="place"
                compact={true}
                onImportSuccess={async (data) => {
                  // Update address
                  if (data.formatted_address || data.address) {
                    setAddress(data.formatted_address || data.address || "");
                  }

                  // Update coordinates
                  if (data.lat || data.latitude) {
                    setLat(data.lat || data.latitude || null);
                  }
                  if (data.lng || data.longitude) {
                    setLng(data.lng || data.longitude || null);
                  }

                  // Update Google Place ID
                  if (data.google_place_id || data.place_id) {
                    setGooglePlaceId(data.google_place_id || data.place_id || null);
                  }

                  // Update city
                  if (data.city) {
                    setCity(data.city);
                    // Resolve city to city_id
                    const cityData = await resolveCity(
                      data.city,
                      data.city_state || null,
                      data.city_country || null,
                      data.lat || data.latitude || null,
                      data.lng || data.longitude || null
                    );
                    if (cityData) {
                      // Find matching city from database
                      const { data: cityRecord } = await supabase
                        .from("cities")
                        .select("*")
                        .eq("id", cityData.city_id)
                        .single();
                      if (cityRecord) {
                        setSelectedCity(cityRecord as City);
                      }
                    }
                  }
                }}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              City
              <span className="ml-2 text-xs font-normal text-[#6F7A5A]">
                (select from list or type new)
              </span>
            </label>
            <CityAutocomplete
              value={city}
              onChange={(newCity) => {
                setCity(newCity);
                // Clear selected city if user types something different
                if (selectedCity && newCity !== selectedCity.name) {
                  setSelectedCity(null);
                }
              }}
              onCitySelect={(city) => {
                setSelectedCity(city);
                if (city) {
                  setCity(city.name);
                }
              }}
              placeholder="Select city or type new"
            />
            
            {/* City tags for quick selection */}
            {availableCities.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-[#6F7A5A] mb-2">Quick select:</div>
                <div className="flex flex-wrap gap-2">
                  {availableCities.slice(0, 10).map((cityOption) => (
                    <Pill
                      key={cityOption.id}
                      active={selectedCity?.id === cityOption.id || city === cityOption.name}
                      onClick={async () => {
                        setCity(cityOption.name);
                        setSelectedCity(cityOption);
                        // Optionally resolve city to ensure it's linked
                        const cityData = await resolveCity(
                          cityOption.name,
                          cityOption.state,
                          cityOption.country,
                          cityOption.lat,
                          cityOption.lng
                        );
                        if (cityData) {
                          const { data: cityRecord } = await supabase
                            .from("cities")
                            .select("*")
                            .eq("id", cityData.city_id)
                            .single();
                          if (cityRecord) {
                            setSelectedCity(cityRecord as City);
                          }
                        }
                      }}
                      variant="filter"
                    >
                      {cityOption.name}
                      {cityOption.state && (
                        <span className="ml-1 text-[#A8B096]">({cityOption.state})</span>
                      )}
                    </Pill>
                  ))}
                  {availableCities.length > 10 && (
                    <span className="text-xs text-[#6F7A5A] self-center">
                      +{availableCities.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {lat && lng && (
            <div className="text-xs text-[#6F7A5A]">
              Coordinates: {lat.toFixed(6)}, {lng.toFixed(6)}
            </div>
          )}

          {/* Available Google Places Data */}
          {googlePlaceId && (
            <div className="rounded-xl border border-[#ECEEE4] bg-white p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[#1F2A1F]">
                Available data from Google Places
              </h3>
              
              {loadingGoogleData ? (
                <div className="text-xs text-[#6F7A5A]">Loading available data...</div>
              ) : googlePlaceData ? (
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-1 gap-2">
                    {googlePlaceData.name && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Name:</span>
                        <span className="text-[#1F2A1F] font-medium">{googlePlaceData.name}</span>
                      </div>
                    )}
                    {googlePlaceData.formatted_address && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Address:</span>
                        <span className="text-[#1F2A1F]">{googlePlaceData.formatted_address}</span>
                      </div>
                    )}
                    {googlePlaceData.phone && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Phone:</span>
                        <a href={`tel:${googlePlaceData.phone}`} className="text-[#8F9E4F] hover:underline">
                          {googlePlaceData.phone}
                        </a>
                      </div>
                    )}
                    {googlePlaceData.website && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Website:</span>
                        <a 
                          href={googlePlaceData.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[#8F9E4F] hover:underline break-all"
                        >
                          {googlePlaceData.website}
                        </a>
                      </div>
                    )}
                    {googlePlaceData.rating && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Rating:</span>
                        <span className="text-[#1F2A1F]">
                          {googlePlaceData.rating.toFixed(1)} ⭐
                          {googlePlaceData.reviews_count && (
                            <span className="text-[#6F7A5A] ml-1">
                              ({googlePlaceData.reviews_count} reviews)
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {googlePlaceData.category && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Category:</span>
                        <span className="text-[#1F2A1F]">{googlePlaceData.category}</span>
                      </div>
                    )}
                    {googlePlaceData.types && googlePlaceData.types.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Types:</span>
                        <span className="text-[#1F2A1F]">
                          {googlePlaceData.types.slice(0, 5).map((t: string) => t.replace(/_/g, ' ')).join(', ')}
                        </span>
                      </div>
                    )}
                    {googlePlaceData.photos && googlePlaceData.photos.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Photos:</span>
                        <span className="text-[#1F2A1F]">{googlePlaceData.photos.length} available</span>
                      </div>
                    )}
                    {googlePlaceData.opening_hours && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Hours:</span>
                        <span className="text-[#1F2A1F]">Available</span>
                      </div>
                    )}
                    {googlePlaceData.price_level !== null && googlePlaceData.price_level !== undefined && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#6F7A5A] min-w-[80px]">Price:</span>
                        <span className="text-[#1F2A1F]">
                          {googlePlaceData.price_level === 0 ? 'Free' : '$'.repeat(googlePlaceData.price_level)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#ECEEE4]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 rounded-xl border border-[#ECEEE4] bg-white px-4 py-3 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={cx(
                "flex-1 rounded-xl px-4 py-3 text-sm font-medium transition",
                canSave
                  ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                  : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
              )}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

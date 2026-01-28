"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import Icon from "./Icon";
import { SkeletonBase } from "./Skeleton";
import ImportPreviewCard from "./ImportPreviewCard";
import { getGoogleMapsApiKey } from "../config/googleMaps";

type SearchResult = {
  title: string | null;
  address: string | null;
  description: string | null;
  photos: Array<{ id: string; url: string; reference: string }>;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  // Extra fields from /api/google/place-import used for Location auto-fill
  city?: string | null;
  city_state?: string | null;
  city_country?: string | null;
  is_coordinate_only?: boolean; // True if this is a coordinate-only location (no Place ID)
};

// Helper to generate photo URL from photo reference
// Returns a URL that can be used directly in img src
function getPhotoUrl(photoReference: string, maxWidth: number = 800): string {
  try {
    // Google Places API v1 format: places/{place_id}/photos/{photo_reference}
    // Use the same API key getter as the rest of the app
    const apiKey = getGoogleMapsApiKey();
    
    if (photoReference.startsWith("places/")) {
      return `https://places.googleapis.com/v1/${photoReference}/media?maxWidthPx=${maxWidth}&key=${apiKey}`;
    }
    
    // Fallback to old API format if it's just a reference
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${apiKey}`;
  } catch (error) {
    console.error("Failed to get API key for photo URL:", error);
    // Fallback: use server proxy endpoint (but this requires additional fetch)
    return `/api/google/photo?reference=${encodeURIComponent(photoReference)}&maxwidth=${maxWidth}`;
  }
}

type GoogleImportFieldProps = {
  userId: string;
  // If provided, import will update this existing place instead of creating a new one
  targetPlaceId?: string;
};

export default function GoogleImportField({ userId, targetPlaceId }: GoogleImportFieldProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [descriptionHint, setDescriptionHint] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim() || !userId) return;

    setSearching(true);
    setError(null);
    setSearchResult(null);
    setGeneratingDescription(false);
    setDescriptionHint(null);

    try {
      // Get access token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const trimmedQuery = query.trim();
      console.log("🔍 Starting search:", {
        query: trimmedQuery.substring(0, 100),
        isUrl: trimmedQuery.startsWith("http"),
        userId,
      });

      // Call search API (using the same endpoint as location section)
      const response = await fetch("/api/google/place-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: trimmedQuery,
          access_token: session.access_token,
        }),
      });

      console.log("📡 API response:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url,
      });

      let data;
      try {
        const responseText = await response.text();
        console.log("📄 Response text length:", responseText.length);
        if (!responseText) {
          throw new Error("Empty response from server");
        }
        data = JSON.parse(responseText);
        console.log("✅ Parsed data:", {
          hasName: !!data?.name,
          hasAddress: !!data?.formatted_address,
          hasPhotos: !!(data?.photos && data.photos.length > 0),
          photoCount: data?.photos?.length || 0,
          photoUrlsCount: data?.photo_urls?.length || 0,
          hasPlaceId: !!data?.place_id,
          keys: data ? Object.keys(data).slice(0, 20) : [],
        });
      } catch (parseError) {
        console.error("❌ Failed to parse API response:", parseError);
        throw new Error("Invalid response from server. Please try again.");
      }

      if (!response.ok) {
        console.error("❌ API error:", {
          status: response.status,
          code: data?.code,
          error: data?.error,
          message: data?.message,
        });
        let errorMessage = data?.error || data?.message || "Failed to search place";
        if (data?.code === "MISSING_API_KEY") {
          errorMessage = "Google Maps API key is not configured.";
        } else if (response.status === 404 || data?.code === "PLACE_NOT_FOUND") {
          errorMessage = data?.error || data?.message || "Place not found. Please check the Google Maps link or address and try again.";
        } else if (response.status === 401) {
          errorMessage = "Authentication required. Please sign in again.";
        } else if (response.status >= 500) {
          errorMessage = "Server error. Please try again later.";
        }
        throw new Error(errorMessage);
      }

      // Transform data from /api/google/place-import format to SearchResult format
      const photosArray = data.photos || data.photo_urls || [];
      console.log("🖼️ Processing photos:", {
        photosArrayLength: photosArray.length,
        firstPhoto: photosArray[0],
        photoType: typeof photosArray[0],
      });

      const processedPhotos = photosArray.slice(0, 6).map((photo: any, index: number) => {
        // Handle both formats: {reference: "..."} or string
        const photoRef = typeof photo === 'string' 
          ? photo 
          : (photo?.reference || photo?.name || photo);
        
        if (!photoRef) {
          console.warn("⚠️ Empty photo reference at index", index);
          return null;
        }
        
        // Extract reference from full path if needed
        let photoReference = photoRef;
        if (typeof photoRef === 'string' && photoRef.includes('/photos/')) {
          photoReference = photoRef.split('/photos/')[1];
        }
        
        const photoUrl = getPhotoUrl(photoRef);
        console.log(`📸 Photo ${index}:`, {
          ref: photoRef.substring(0, 50),
          reference: photoReference?.substring(0, 30),
          url: photoUrl.substring(0, 80),
        });
        
        return {
          id: `photo_${index}`,
          url: photoUrl, // Use full path for URL generation
          reference: photoReference, // Store just the reference part
        };
      }).filter((p): p is { id: string; url: string; reference: string } => p !== null);

      const searchResult: SearchResult = {
        title: data.name || data.business_name || null,
        address: data.formatted_address || data.address || null,
        description: data.category || (data.types && data.types.length > 0 
          ? data.types.slice(0, 3).map((t: string) => t.replace(/_/g, ' ')).join(', ')
          : null) || null,
        photos: processedPhotos,
        lat: data.lat || data.latitude || null,
        lng: data.lng || data.longitude || null,
        google_place_id: data.google_place_id || data.place_id || null,
        google_maps_url: data.google_maps_url || null,
        city: data.city || null,
        city_state: data.city_state || null,
        city_country: data.city_country || null,
        is_coordinate_only: data.is_coordinate_only === true,
      };

      console.log("✅ Search result:", {
        title: searchResult.title,
        address: searchResult.address?.substring(0, 50),
        photosCount: searchResult.photos.length,
        hasCoords: !!(searchResult.lat && searchResult.lng),
        googlePlaceId: searchResult.google_place_id?.substring(0, 30),
      });

      setSearchResult(searchResult);

      // Generate AI description right in the preview (non-blocking)
      if (searchResult.google_place_id) {
        const placeIdForThisResult = searchResult.google_place_id;
        setGeneratingDescription(true);
        setDescriptionHint(null);
        try {
          const aiRes = await fetch("/api/ai/generate-description", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              google_place_id: placeIdForThisResult,
              access_token: session.access_token,
              save: false,
            }),
          });

          const aiText = await aiRes.text();
          let aiData: any;
          try {
            aiData = JSON.parse(aiText);
          } catch {
            aiData = { error: aiText };
          }

          if (!aiRes.ok) {
            // Don't fail the whole preview — just show a hint
            if (aiData?.code === "PREMIUM_REQUIRED") {
              setDescriptionHint("AI description is available for Premium users.");
            } else if (aiData?.code === "OPENAI_INSUFFICIENT_QUOTA") {
              setDescriptionHint("AI description is temporarily unavailable (OpenAI billing/quota).");
            } else {
              setDescriptionHint("Couldn't generate AI description. You can still import other fields.");
            }
          } else {
            const generated = String(aiData?.description || "").trim();
            if (generated) {
              // Only apply if we're still previewing the same place_id
              setSearchResult((prev) => {
                if (!prev || prev.google_place_id !== placeIdForThisResult) return prev;
                return { ...prev, description: generated };
              });
            } else {
              setDescriptionHint("AI returned an empty description. You can still import other fields.");
            }
          }
        } catch (aiErr) {
          console.warn("AI preview generation failed:", aiErr);
          setDescriptionHint("Couldn't generate AI description. You can still import other fields.");
        } finally {
          setGeneratingDescription(false);
        }
      }
    } catch (error: any) {
      console.error("Search error:", error);
      setError(error.message || "Failed to search place");
    } finally {
      setSearching(false);
    }
  }

  async function handleImport(selectedFields: {
    title: boolean;
    address: boolean;
    description: boolean;
    photos: string[]; // Array of photo IDs
  }) {
    if (!searchResult || !userId) return;

    setImporting(true);
    setError(null);

    try {
      // Get access token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      // Prepare selected fields data
      const isCoordinateOnly = searchResult.is_coordinate_only === true || !searchResult.google_place_id;
      const selectedFieldsData: any = {
        lat: searchResult.lat,
        lng: searchResult.lng,
        google_maps_url: searchResult.google_maps_url,
        // Used to auto-fill Location city on the editor
        city: searchResult.city || null,
        city_state: searchResult.city_state || null,
        city_country: searchResult.city_country || null,
        is_coordinate_only: isCoordinateOnly,
        title: false,
        address: false,
        description: false,
        photos: [],
      };
      
      // For coordinate-only locations, always include coordinates (they're always selected)
      // Also ensure at least address is selected if available
      if (isCoordinateOnly && searchResult.address && !selectedFields.address) {
        // Auto-select address for coordinate-only locations if available
        selectedFields.address = true;
      }

      if (selectedFields.title && searchResult.title) {
        selectedFieldsData.title = true;
        selectedFieldsData.titleData = searchResult.title;
      }

      if (selectedFields.address && searchResult.address) {
        selectedFieldsData.address = true;
        selectedFieldsData.addressData = searchResult.address;
      }

      if (selectedFields.description && searchResult.description) {
        selectedFieldsData.description = true;
        selectedFieldsData.descriptionData = searchResult.description;
      }

      // Filter selected photos
      const selectedPhotos = searchResult.photos.filter((photo) =>
        selectedFields.photos.includes(photo.id)
      );
      selectedFieldsData.photos = selectedPhotos;

      console.log("Preparing import data:", {
        hasTitle: selectedFieldsData.title && selectedFieldsData.titleData,
        hasAddress: selectedFieldsData.address && selectedFieldsData.addressData,
        hasDescription: selectedFieldsData.description && selectedFieldsData.descriptionData,
        photoCount: selectedFieldsData.photos.length,
        hasCoords: !!(selectedFieldsData.lat && selectedFieldsData.lng),
        googlePlaceId: searchResult.google_place_id?.substring(0, 30),
      });

      // Call import API
      const response = await fetch("/api/google-import/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          google_place_id: searchResult.google_place_id,
          target_place_id: targetPlaceId || null,
          selectedFields: selectedFieldsData,
          access_token: session.access_token,
        }),
      });

      let data;
      try {
        const responseText = await response.text();
        if (!responseText) {
          throw new Error("Empty response from server");
        }
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse import response:", parseError);
        throw new Error("Invalid response from server. Please try again.");
      }

      if (!response.ok) {
        console.error("Import API error:", {
          status: response.status,
          statusText: response.statusText,
          code: data?.code,
          error: data?.error,
          details: data?.details,
        });

        if (data.code === "DUPLICATE_PLACE") {
        // If updating an existing place, and place_id already exists elsewhere, redirect there
        router.push(`/places/${data.existing_place_id}/edit`);
        return;
        }

        if (response.status === 403 || data?.code === "PREMIUM_REQUIRED") {
          throw new Error("Premium required to create places. Please upgrade to Premium to import.");
        }

        // Show more detailed error message
        let errorMessage = data?.error || "Failed to import place";
        if (data?.details) {
          errorMessage += `: ${data.details}`;
        }
        throw new Error(errorMessage);
      }

      if (!data?.place_id) {
        throw new Error("Invalid response: place_id not found");
      }

      // If we imported into an existing place, just hard reload that editor so cards refresh
      if (targetPlaceId) {
        window.location.href = `/places/${targetPlaceId}/edit`;
        return;
      }

      // Otherwise we created a new place — go to its editor
      window.location.href = `/places/${data.place_id}/edit`;
    } catch (error: any) {
      console.error("Import error:", error);
      setError(error.message || "Failed to import place");
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Search Input Card */}
      <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-[#1F2A1F]">
            Google Maps URL or Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim() && !searching) {
                  handleSearch();
                }
              }}
              placeholder="Paste a Google Maps link or enter an address"
              className="flex-1 rounded-xl border border-[#ECEEE4] px-4 py-3 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] focus:bg-white bg-[#FAFAF7] transition"
              disabled={searching || importing}
            />
            <button
              onClick={handleSearch}
              disabled={!query.trim() || searching || importing}
              className={cx(
                "rounded-xl px-6 py-3 text-sm font-medium transition whitespace-nowrap",
                query.trim() && !searching && !importing
                  ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                  : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
              )}
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-4 text-sm text-[#C96A5B]">
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {searching && (
        <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            <SkeletonBase className="h-6 w-3/4 rounded" />
            <SkeletonBase className="h-4 w-1/2 rounded" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="relative" style={{ paddingBottom: "75%" }}>
                <div className="absolute inset-0 rounded-lg overflow-hidden">
                  <SkeletonBase className="h-full w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Card */}
      {searchResult && !searching && (
        <ImportPreviewCard
          result={searchResult}
          generatingDescription={generatingDescription}
          descriptionHint={descriptionHint}
          onImport={handleImport}
          importing={importing}
        />
      )}
    </div>
  );
}

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import Icon from "./Icon";
import { SkeletonBase } from "./Skeleton";
import ImportPreviewCard from "./ImportPreviewCard";
import { getGoogleMapsApiKey } from "../config/googleMaps";
import {
  GOOGLE_IMPORT_PREVIEW_STORAGE_KEY,
  type GoogleImportSearchResult,
} from "../lib/googleImport";

type SearchResult = GoogleImportSearchResult;

// Helper to generate photo URL from photo reference (legacy Places API)
// Returns a URL that can be used directly in img src
function getPhotoUrl(photoReference: string, maxWidth: number = 800): string {
  try {
    const apiKey = getGoogleMapsApiKey();
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${apiKey}`;
  } catch (error) {
    console.error("Failed to get API key for photo URL:", error);
    return `/api/google/photo?reference=${encodeURIComponent(photoReference)}&maxwidth=${maxWidth}`;
  }
}

type GoogleImportFieldProps = {
  userId: string;
  targetPlaceId?: string;
  /** When true, Search redirects to Step 2 Import Preview (separate route) */
  redirectToPreview?: boolean;
};

export default function GoogleImportField({
  userId,
  targetPlaceId,
  redirectToPreview = false,
}: GoogleImportFieldProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [descriptionHint, setDescriptionHint] = useState<string | null>(null);
  const [duplicatePlace, setDuplicatePlace] = useState<{ id: string; title?: string | null } | null>(
    null
  );

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

      const processedPhotos = photosArray.slice(0, 9).map((photo: any, index: number) => {
        // Handle both formats: {reference: "..."} or string (photo_reference)
        const photoRef = typeof photo === 'string' 
          ? photo 
          : (photo?.reference || photo?.photo_reference || photo);
        
        if (!photoRef || typeof photoRef !== 'string') {
          console.warn("⚠️ Empty photo reference at index", index);
          return null;
        }
        
        const photoUrl = getPhotoUrl(photoRef);
        
        return {
          id: `photo_${index}`,
          url: photoUrl,
          reference: photoRef,
        };
      }).filter((p: { id: string; url: string; reference: string } | null): p is { id: string; url: string; reference: string } => p !== null);

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

      // Step 2 flow: redirect to Import Preview page (no inline preview, no AI here)
      if (redirectToPreview) {
        try {
          sessionStorage.setItem(
            GOOGLE_IMPORT_PREVIEW_STORAGE_KEY,
            JSON.stringify({
              result: searchResult,
              targetPlaceId: targetPlaceId ?? null,
            })
          );
          router.push("/add/google/preview");
        } catch (e) {
          console.error("Failed to save preview to sessionStorage", e);
        }
        setSearching(false);
        return;
      }

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
            } else if (aiData?.code === "MISSING_OPENAI_KEY" || aiData?.code === "MISSING_GOOGLE_KEY") {
              setDescriptionHint("AI description is not available. You can still import other fields.");
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
    setDuplicatePlace(null);

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

      const responseText = await response.text();
      let data: any;
      try {
        if (!responseText) {
          throw new Error("Empty response from server");
        }
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse import response:", parseError);
        console.error("Raw import response:", {
          status: response.status,
          statusText: response.statusText,
          bodyPreview: responseText ? responseText.slice(0, 500) : "",
        });
        throw new Error(
          responseText
            ? `Import failed (${response.status}). Server returned non-JSON.`
            : "Invalid response from server. Please try again."
        );
      }

      if (!response.ok) {
        // Special case: duplicate place → show modal instead of error
        if (data?.code === "DUPLICATE_PLACE" && data?.existing_place_id) {
          setDuplicatePlace({ id: String(data.existing_place_id), title: data?.existing_title || null });
          setImporting(false);
          return;
        }

        console.error("Import API error:", {
          status: response.status,
          statusText: response.statusText,
          code: data?.code,
          error: data?.error,
          message: data?.message,
          details: data?.details,
          raw: typeof responseText === "string" ? responseText.slice(0, 800) : "",
        });

        if (response.status === 403 || data?.code === "PREMIUM_REQUIRED") {
          throw new Error("Premium required to create places. Please upgrade to Premium to import.");
        }

        // Show more detailed error message
        let errorMessage =
          data?.error ||
          data?.message ||
          (responseText && responseText.trim() !== "{}" ? responseText.slice(0, 160) : "") ||
          "Failed to import place";
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
      {/* Duplicate place modal */}
      {duplicatePlace && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDuplicatePlace(null)}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-[#ECEEE4] shadow-xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-fraunces font-semibold text-[#1F2A1F] text-lg">
                  Place already exists
                </h3>
                <p className="text-sm text-[#6F7A5A] mt-1">
                  This place is already in your account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDuplicatePlace(null)}
                className="p-2 -mr-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            {duplicatePlace.title ? (
              <div className="mt-4 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-3">
                <div className="text-xs text-[#6F7A5A] mb-1">Existing gem</div>
                <div className="text-sm font-medium text-[#1F2A1F] line-clamp-2">
                  {duplicatePlace.title}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  const id = duplicatePlace.id;
                  setDuplicatePlace(null);
                  window.location.href = `/places/${id}/edit`;
                }}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-medium bg-[#8F9E4F] text-white hover:bg-[#556036] transition"
              >
                Open existing
              </button>
              <button
                type="button"
                onClick={() => setDuplicatePlace(null)}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-medium border border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Input Card */}
      <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <h3 className="font-fraunces font-semibold text-[#1F2A1F]">
            Enter the name or address
          </h3>
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

      {/* Preview Card (inline only when not redirecting to Step 2) */}
      {searchResult && !searching && !redirectToPreview && (
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

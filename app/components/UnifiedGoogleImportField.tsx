"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import Icon from "./Icon";

type GoogleImportData = {
  name: string | null;
  business_name?: string | null;
  formatted_address: string | null;
  address?: string | null;
  website: string | null;
  phone: string | null;
  rating: number | null;
  reviews_count: number | null;
  user_ratings_total?: number | null;
  opening_hours: any | null;
  price_level?: number | null;
  category: string | null;
  types: string[];
  categories?: string[];
  place_id: string | null;
  google_place_id?: string | null;
  google_maps_url: string | null;
  lat: number | null;
  lng: number | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  city_state?: string | null;
  city_country?: string | null;
  photos?: Array<{ reference: string; url: string | null }>;
  photo_urls?: string[];
};

type UnifiedGoogleImportFieldProps = {
  userId: string;
  onImportSuccess: (data: GoogleImportData) => void | Promise<void>;
  compact?: boolean;
  context?: "profile" | "place";
};

export default function UnifiedGoogleImportField({
  userId,
  onImportSuccess,
  compact = false,
  context = "place",
}: UnifiedGoogleImportFieldProps) {
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleImport() {
    if (!query.trim() || !userId) return;

    setImporting(true);
    setImportError(null);
    setImportSuccess(false);

    try {
      // Get access token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const trimmedQuery = query.trim();
      console.log("Importing place:", {
        query: trimmedQuery.substring(0, 100),
        isUrl: trimmedQuery.startsWith("http"),
        userId,
      });

      // Call import API
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

      let data;
      try {
        const text = await response.text();
        if (!text) {
          throw new Error("Empty response from server");
        }
        data = JSON.parse(text);
      } catch (parseError) {
        console.error("Failed to parse API response:", {
          status: response.status,
          statusText: response.statusText,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          query: trimmedQuery.substring(0, 100),
        });
        throw new Error(`Server error (${response.status}): ${response.statusText || "Unknown error"}`);
      }

      if (!response.ok) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          code: data?.code || "UNKNOWN_ERROR",
          error: data?.error || "Unknown error",
          message: data?.message || data?.error || "Failed to import from Google",
          query: trimmedQuery.substring(0, 100),
        };
        
        console.error("Import API error:", JSON.stringify(errorDetails, null, 2));
        
        // Provide more helpful error messages
        let errorMessage = data?.error || data?.message || "Failed to import from Google";
        if (data?.code === "MISSING_API_KEY") {
          errorMessage = "Google Maps API key is not configured. Please contact the administrator.";
        } else if (response.status === 404 || data?.code === "PLACE_NOT_FOUND") {
          // Provide more specific guidance based on input type
          if (trimmedQuery.startsWith("http")) {
            errorMessage = "Place not found from this Google Maps link. Please try:\n• Copying the link directly from Google Maps (right-click → Copy link)\n• Using a different Google Maps link\n• Or enter the full address instead";
          } else {
            errorMessage = "Place not found. Please try:\n• Entering the full address with city name\n• Using a Google Maps link instead\n• Checking the spelling";
          }
        } else if (response.status === 429) {
          errorMessage = "Too many requests. Please try again later.";
        } else if (response.status === 401) {
          errorMessage = "Authentication required. Please sign in again.";
        } else if (response.status >= 500) {
          errorMessage = "Server error. Please try again later.";
        }
        throw new Error(errorMessage);
      }

      if (!data || typeof data !== 'object') {
        console.error("Invalid import data received:", data);
        throw new Error("Invalid data received from server");
      }

      console.log("Import successful:", {
        placeId: data.place_id,
        name: data.name,
        address: data.formatted_address,
      });

      const importData: GoogleImportData = data;

      // Call success callback - catch errors from callback
      try {
        await onImportSuccess(importData);
      } catch (callbackError: any) {
        // If callback throws an error, show it to the user
        console.error("Callback error:", {
          error: callbackError instanceof Error ? callbackError.message : String(callbackError),
          stack: callbackError instanceof Error ? callbackError.stack : undefined,
        });
        throw new Error(callbackError?.message || "Failed to save imported data");
      }

      setImportSuccess(true);
      setQuery("");
      setTimeout(() => {
        setImportSuccess(false);
        if (compact) {
          setShowForm(false);
        }
      }, 3000);
    } catch (error: any) {
      let errorMessage = "Failed to import from Google";
      
      if (error instanceof Error) {
        errorMessage = error.message || errorMessage;
        console.error("Import error:", {
          name: error.name,
          message: error.message,
          stack: error.stack,
          query: query.trim().substring(0, 100),
        });
      } else if (typeof error === 'string') {
        errorMessage = error;
        console.error("Import error (string):", error, {
          query: query.trim().substring(0, 100),
        });
      } else {
        // Try to extract message from error object
        try {
          const errorObj = error as Record<string, unknown>;
          errorMessage = String(errorObj?.message || errorObj?.error || errorMessage);
          console.error("Import error (object):", JSON.stringify({
            error: errorObj,
            query: query.trim().substring(0, 100),
          }, null, 2));
        } catch (stringifyError) {
          console.error("Import error (unserializable):", String(error), {
            query: query.trim().substring(0, 100),
            stringifyError: stringifyError instanceof Error ? stringifyError.message : String(stringifyError),
          });
        }
      }
      
      setImportError(errorMessage);
    } finally {
      setImporting(false);
    }
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => {
            setShowForm(!showForm);
            setImportError(null);
            setImportSuccess(false);
          }}
          className="text-sm text-[#8F9E4F] hover:text-[#556036] underline"
        >
          {showForm ? "Cancel" : "Import from Google"}
        </button>

        {showForm && (
          <div className="space-y-2">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setImportError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim() && !importing) {
                  handleImport();
                }
              }}
              placeholder="Google Maps link or address"
              className="w-full rounded-xl border border-[#ECEEE4] px-3 py-2 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] focus:bg-white bg-[#FAFAF7] transition"
              disabled={importing}
            />
            {importError && (
              <p className="text-xs text-[#C96A5B]">{importError}</p>
            )}
            {importSuccess && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Icon name="check" size={12} />
                Imported from Google
              </p>
            )}
            <button
              onClick={handleImport}
              disabled={!query.trim() || importing}
              className={cx(
                "w-full rounded-xl px-3 py-2 text-xs font-medium transition",
                query.trim() && !importing
                  ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                  : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
              )}
            >
              {importing ? "Importing..." : "Import"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">
          Import from Google
        </h3>
        <p className="text-sm text-[#6F7A5A]">
          Paste a Google Maps link or enter an address for automatic filling
        </p>
      </div>

      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-[#1F2A1F] mb-1.5">
            Google link or address
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setImportError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim() && !importing) {
                handleImport();
              }
            }}
            placeholder="Paste a Google Maps link or type an address"
            className="w-full rounded-xl border border-[#ECEEE4] px-4 py-3 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] focus:bg-white bg-white transition"
            disabled={importing}
          />
        </div>

        {importError && (
          <div className="rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {importError}
          </div>
        )}

        {importSuccess && (
          <div className="rounded-xl border border-green-200 bg-green-50/50 p-3 text-sm text-green-700 flex items-center gap-2">
            <Icon name="check" size={16} />
            <span>Imported from Google</span>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!query.trim() || importing}
          className={cx(
            "w-full rounded-xl px-4 py-3 text-sm font-medium transition",
            query.trim() && !importing
              ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
              : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
          )}
        >
          {importing ? "Importing..." : "Import"}
        </button>
      </div>
    </div>
  );
}

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

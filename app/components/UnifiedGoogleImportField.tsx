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

      // Call import API
      const response = await fetch("/api/google/place-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.trim(),
          access_token: session.access_token,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Provide more helpful error messages
        let errorMessage = data.error || "Failed to import from Google";
        if (data.code === "MISSING_API_KEY") {
          errorMessage = "Google Maps API key is not configured. Please contact the administrator.";
        } else if (response.status === 404 || data.code === "PLACE_NOT_FOUND") {
          errorMessage = "Place not found. Make sure the Google Maps link or address is correct. Try copying the link directly from Google Maps or enter the full address.";
        } else if (response.status === 429) {
          errorMessage = "Too many requests. Please try again later.";
        } else if (response.status === 401) {
          errorMessage = "Authentication required. Please sign in again.";
        }
        throw new Error(errorMessage);
      }

      const importData: GoogleImportData = data;

      // Call success callback
      await onImportSuccess(importData);

      setImportSuccess(true);
      setQuery("");
      setTimeout(() => {
        setImportSuccess(false);
        if (compact) {
          setShowForm(false);
        }
      }, 3000);
    } catch (error: any) {
      console.error("Import error:", error);
      setImportError(error.message || "Failed to import from Google");
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
        <button
          onClick={() => {
            setShowForm(!showForm);
            setImportError(null);
            setImportSuccess(false);
          }}
          className="mt-2 text-sm font-medium text-[#8F9E4F] hover:text-[#556036] underline transition"
        >
          {showForm ? "Cancel" : "Import"}
        </button>
      </div>

      {showForm && (
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
      )}
    </div>
  );
}

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

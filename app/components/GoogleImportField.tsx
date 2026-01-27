"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import Icon from "./Icon";

type GoogleImportData = {
  business_name: string | null;
  formatted_address: string | null;
  website: string | null;
  phone: string | null;
  rating: number | null;
  reviews_count: number | null;
  opening_hours: unknown | null;
  category: string | null;
  types: string[];
  place_id: string | null;
  google_maps_url: string;
  photo_urls: string[];
};

type GoogleImportFieldProps = {
  userId: string;
  onImportSuccess?: (data: GoogleImportData) => void;
  compact?: boolean;
};

export default function GoogleImportField({
  userId,
  onImportSuccess,
  compact = false,
}: GoogleImportFieldProps) {
  const [googleUrl, setGoogleUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleImport() {
    if (!googleUrl.trim() || !userId) return;

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
          google_url: googleUrl.trim(),
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
          errorMessage = "Место не найдено. Убедитесь, что ссылка Google Maps корректна. Попробуйте скопировать ссылку напрямую из Google Maps.";
        } else if (response.status === 429) {
          errorMessage = "Слишком много запросов. Попробуйте позже.";
        } else if (response.status === 401) {
          errorMessage = "Требуется авторизация. Пожалуйста, войдите снова.";
        }
        throw new Error(errorMessage);
      }

      const importData: GoogleImportData = data;

      // Call success callback if provided
      if (onImportSuccess) {
        onImportSuccess(importData);
      }

      setImportSuccess(true);
      setGoogleUrl("");
      setTimeout(() => {
        setImportSuccess(false);
        setShowForm(false);
      }, 3000);
    } catch (error: unknown) {
      console.error("Import error:", error);
      setImportError(error instanceof Error ? error.message : "Failed to import from Google");
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
              type="url"
              value={googleUrl}
              onChange={(e) => {
                setGoogleUrl(e.target.value);
                setImportError(null);
              }}
              onBlur={() => {
                if (googleUrl.trim() && googleUrl.includes("google.com/maps")) {
                  handleImport();
                }
              }}
              placeholder="Paste Google Maps URL"
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
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-[#1F2A1F] mb-1">
            Import from Google
          </h4>
          <p className="text-xs text-[#6F7A5A]">
            Paste a Google Maps link to auto-fill your profile
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setImportError(null);
            setImportSuccess(false);
          }}
          className="px-3 py-1.5 rounded-lg border border-[#ECEEE4] bg-white text-xs font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
        >
          {showForm ? "Cancel" : "Import"}
        </button>
      </div>

      {showForm && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-[#1F2A1F] mb-1.5">
              Google Maps link (optional)
            </label>
            <input
              type="url"
              value={googleUrl}
              onChange={(e) => {
                setGoogleUrl(e.target.value);
                setImportError(null);
              }}
              onBlur={() => {
                if (googleUrl.trim() && googleUrl.includes("google.com/maps")) {
                  handleImport();
                }
              }}
              placeholder="Paste a Google Maps place URL"
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
            disabled={!googleUrl.trim() || importing}
            className={cx(
              "w-full rounded-xl px-4 py-3 text-sm font-medium transition",
              googleUrl.trim() && !importing
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

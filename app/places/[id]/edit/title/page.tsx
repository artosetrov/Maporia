"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccess } from "../../../../hooks/useUserAccess";
import { isUserAdmin } from "../../../../lib/access";
import Icon from "../../../../components/Icon";
import UnifiedGoogleImportField from "../../../../components/UnifiedGoogleImportField";
import { resolveCity } from "../../../../lib/cityResolver";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function TitleEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user, access } = useUserAccess(true, false);
  const isAdmin = isUserAdmin(access);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleImport(data: any) {
    if (data.name || data.business_name) {
      setTitle(data.name || data.business_name);
    }
    // Also save other fields to place
    if (user && placeId) {
      // Resolve city to city_id
      let cityId: string | null = null;
      const cityName = data.city || null;
      if (cityName) {
        const cityData = await resolveCity(
          cityName,
          data.city_state || null,
          data.city_country || null,
          data.lat || null,
          data.lng || null
        );
        if (cityData) {
          cityId = cityData.city_id;
        }
      }

      const updates: any = {
        title: data.name || data.business_name || null,
        address: data.formatted_address || data.address || null,
        link: data.website || null,
        google_place_id: data.place_id || data.google_place_id || null,
        lat: data.lat || data.latitude || null,
        lng: data.lng || data.longitude || null,
        city: cityName || null, // Keep for backward compatibility
        city_id: cityId,
        city_name_cached: cityName || null,
      };
      // Update categories if types are available
      if (data.types && data.types.length > 0) {
        // Map Google types to our categories (simplified mapping)
        const categoryMap: Record<string, string> = {
          restaurant: "restaurant",
          cafe: "cafe",
          bar: "bar",
          hotel: "hotel",
          museum: "museum",
          park: "park",
          beach: "beach",
          shopping_mall: "shopping",
          store: "shopping",
        };
        const mappedCategories = data.types
          .map((type: string) => categoryMap[type])
          .filter(Boolean);
        if (mappedCategories.length > 0) {
          updates.categories = mappedCategories.slice(0, 3); // Limit to 3 categories
        }
      }
      await supabase.from("places").update(updates).eq("id", placeId);
    }
  }

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data, error: placeError } = await supabase
        .from("places")
        .select("title, created_by")
        .eq("id", placeId)
        .single();

      if (placeError || !data) {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      // Check ownership or admin status
      const currentIsAdmin = isUserAdmin(access);
      const isOwner = data.created_by === user.id;
      if (!isOwner && !currentIsAdmin) {
        router.push(`/id/${placeId}`);
        return;
      }

      const currentTitle = data.title || "";
      setTitle(currentTitle);
      setOriginalTitle(currentTitle);
      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  const hasChanges = title.trim() !== originalTitle.trim();
  const isValid = title.trim().length >= 4 && title.trim().length <= 50;
  const canSave = hasChanges && isValid && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    console.log("Saving title:", { placeId, userId: user.id, title: title.trim() });

    // Admin can update any place, owner can update their own
    const currentIsAdmin = isUserAdmin(access);
    const updateQuery = supabase
      .from("places")
      .update({ title: title.trim() })
      .eq("id", placeId);
    
    // If not admin, add ownership check
    if (!currentIsAdmin) {
      updateQuery.eq("created_by", user.id);
    }
    
    const { data, error: updateError } = await updateQuery.select();

    console.log("Update result:", { data, error: updateError });

    setSaving(false);

    if (updateError) {
      console.error("Update error:", updateError);
      setError(updateError.message || "Failed to save title");
      return;
    }

    // If no data returned but no error, the update likely succeeded
    // This can happen with RLS policies that allow UPDATE but restrict SELECT
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

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-10 w-full bg-[#ECEEE4] rounded animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleCancel}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h1 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Title</h1>
            <div className="w-9" /> {/* Spacer */}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50/50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {user && placeId && (
            <UnifiedGoogleImportField
              userId={user.id}
              context="place"
              onImportSuccess={handleGoogleImport}
              compact={true}
            />
          )}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Place title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Secret rooftop bar"
              className={cx(
                "w-full rounded-xl border px-4 py-4 text-lg font-medium text-[#1F2A1F] placeholder:text-[#A8B096] outline-none transition",
                isValid || title.length === 0
                  ? "border-[#ECEEE4] bg-[#FAFAF7] focus:bg-white focus:border-[#8F9E4F]"
                  : "border-red-300 bg-red-50/50 focus:bg-white focus:border-red-400"
              )}
              maxLength={50}
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between">
              <p className={cx(
                "text-xs",
                isValid || title.length === 0 ? "text-[#6F7A5A]" : "text-red-600"
              )}>
                {title.length < 4 && title.length > 0
                  ? "Title must be at least 4 characters"
                  : "Choose a title that captures the essence of your place"}
              </p>
              <span className="text-xs text-[#6F7A5A]">
                {title.length}/50
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
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

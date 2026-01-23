"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useUserAccess } from "../../../hooks/useUserAccess";
import Icon from "../../../components/Icon";
import UnifiedGoogleImportField from "../../../components/UnifiedGoogleImportField";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function BioEditorPage() {
  const router = useRouter();
  const { loading: accessLoading, user } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState("");
  const [originalBio, setOriginalBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleImport(data: any) {
    // Only update bio if it's currently empty
    if (!bio.trim() && data.types && data.types.length > 0) {
      const city = data.city || data.formatted_address?.split(",").pop()?.trim() || "";
      const category = data.category || data.types[0] || "";
      setBio(`${category}${city ? ` in ${city}` : ""}`);
    }
    // Also save other fields to profile
    if (user) {
      const updates: any = {
        display_name: data.name || data.business_name || null,
        address: data.formatted_address || data.address || null,
        website: data.website || null,
        phone: data.phone || null,
        google_place_id: data.place_id || data.google_place_id || null,
        google_maps_url: data.google_maps_url || null,
        google_rating: data.rating || null,
        google_reviews_count: data.reviews_count || data.user_ratings_total || null,
        google_opening_hours: data.opening_hours || null,
      };
      if (!bio.trim() && data.types && data.types.length > 0) {
        const city = data.city || data.formatted_address?.split(",").pop()?.trim() || "";
        const category = data.category || data.types[0] || "";
        updates.bio = `${category}${city ? ` in ${city}` : ""}`;
      }
      await supabase.from("profiles").update(updates).eq("id", user.id);
    }
  }

  // Load profile
  useEffect(() => {
    if (!user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("bio")
        .eq("id", user.id)
        .single();

      if (profileError || !data) {
        router.push(`/profile/edit`);
        return;
      }

      const currentBio = data.bio || "";
      setBio(currentBio);
      setOriginalBio(currentBio);
      setLoading(false);
    })();
  }, [user, router, accessLoading]);

  const hasChanges = bio.trim() !== originalBio.trim();
  const isValid = bio.trim().length <= 500;
  const canSave = hasChanges && isValid && !saving;

  async function handleSave() {
    if (!canSave || !user) return;

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ bio: bio.trim() || null })
      .eq("id", user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message || "Failed to save bio");
      return;
    }

    if (navigator.vibrate) navigator.vibrate(10);
    window.location.href = `/profile/edit`;
  }

  function handleCancel() {
    router.push(`/profile/edit`);
  }

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-32 w-full bg-[#ECEEE4] rounded animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Desktop Header */}
      <div className="hidden min-[900px]:block sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleCancel}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h1 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Bio</h1>
            <div className="w-9" /> {/* Spacer */}
          </div>
        </div>
      </div>

      {/* Mobile Custom Header */}
      <div className="min-[900px]:hidden fixed top-0 left-0 right-0 z-40 bg-white">
        <div className="px-4 pt-safe-top pt-4 pb-4 flex items-center justify-between h-[64px]">
          <button
            onClick={handleCancel}
            className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] active:bg-[#ECEEE4] transition-colors flex items-center justify-center flex-shrink-0"
            aria-label="Back"
          >
            <Icon name="back" size={20} className="text-[#1F2A1F]" />
          </button>
          <h1 className="font-semibold text-[#1F2A1F] leading-none" style={{ fontSize: '24px' }}>Bio</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 pt-[80px] min-[900px]:pt-8">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50/50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {user && (
            <UnifiedGoogleImportField
              userId={user.id}
              context="profile"
              onImportSuccess={handleGoogleImport}
              compact={true}
            />
          )}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              About you
            </label>
            <textarea
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                setError(null);
              }}
              placeholder="Tell us about yourself..."
              rows={8}
              className={cx(
                "w-full rounded-xl border px-4 py-4 text-base text-[#1F2A1F] placeholder:text-[#A8B096] outline-none transition resize-none",
                isValid || bio.length === 0
                  ? "border-[#ECEEE4] bg-[#FAFAF7] focus:bg-white focus:border-[#8F9E4F]"
                  : "border-red-300 bg-red-50/50 focus:bg-white focus:border-red-400"
              )}
              maxLength={500}
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between">
              <p className={cx(
                "text-xs",
                isValid || bio.length === 0 ? "text-[#6F7A5A]" : "text-red-600"
              )}>
                {bio.length > 500
                  ? "Bio must be 500 characters or less"
                  : "Share a bit about yourself with the community"}
              </p>
              <span className="text-xs text-[#6F7A5A]">
                {bio.length}/500
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

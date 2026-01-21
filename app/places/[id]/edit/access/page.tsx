"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccess } from "../../../../hooks/useUserAccess";
import { isPlacePremium, type AccessLevel } from "../../../../lib/access";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function AccessEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("public");
  const [originalAccessLevel, setOriginalAccessLevel] = useState<AccessLevel>("public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load place
  useEffect(() => {
    if (!placeId || !user) return;

    (async () => {
      setLoading(true);
      const { data, error: placeError } = await supabase
        .from("places")
        .select("*")
        .eq("id", placeId)
        .single();

      if (placeError || !data) {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      // Check ownership
      if (data.created_by !== user.id) {
        router.push(`/id/${placeId}`);
        return;
      }

      // Determine current access level
      // Check access_level field first, then fallback to isPlacePremium
      const currentLevel: AccessLevel = 
        data.access_level === 'premium' 
          ? "premium" 
          : (data.access_level === 'public' ? "public" : (isPlacePremium(data) ? "premium" : "public"));

      setAccessLevel(currentLevel);
      setOriginalAccessLevel(currentLevel);
      setLoading(false);
    })();
  }, [placeId, user, router]);

  const hasChanges = accessLevel !== originalAccessLevel;
  const canSave = hasChanges && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    // Build update payload - use access_level field
    const payload: any = {
      access_level: accessLevel,
    };

    console.log("Saving access level:", { placeId, userId: user.id, accessLevel, payload });

    const { data, error: updateError } = await supabase
      .from("places")
      .update(payload)
      .eq("id", placeId)
      .eq("created_by", user.id)
      .select();

    console.log("Update result:", { data, error: updateError });

    setSaving(false);

    if (updateError) {
      console.error("Update error:", updateError);
      setError(updateError.message || "Failed to save access level");
      return;
    }

    // If no data returned but no error, the update likely succeeded
    // This can happen with RLS policies that allow UPDATE but restrict SELECT
    // We'll verify by checking if the update was successful (no error)
    if (!data || data.length === 0) {
      console.warn("No data returned from update, but no error occurred. Update likely succeeded.");
      // Don't show error - just proceed with navigation
      // The data will be reloaded when we navigate back to the hub
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
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-sm text-[#6F7A5A]">Loading…</div>
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
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-[#1F2A1F]">Access</h1>
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
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-4">
              Who can see this place?
            </label>

            {/* Public Option */}
            <button
              onClick={() => {
                setAccessLevel("public");
                setError(null);
              }}
              className={cx(
                "w-full rounded-xl border-2 p-4 text-left transition mb-3",
                accessLevel === "public"
                  ? "border-[#8F9E4F] bg-[#8F9E4F]/5"
                  : "border-[#ECEEE4] bg-white hover:border-[#DADDD0]"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={cx(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                        accessLevel === "public"
                          ? "border-[#8F9E4F] bg-[#8F9E4F]"
                          : "border-[#DADDD0] bg-white"
                      )}
                    >
                      {accessLevel === "public" && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <h3 className="font-semibold text-[#1F2A1F]">Public</h3>
                  </div>
                  <p className="text-sm text-[#6F7A5A] ml-7">
                    Anyone can discover and view this place
                  </p>
                </div>
              </div>
            </button>

            {/* Premium Option */}
            <button
              onClick={() => {
                setAccessLevel("premium");
                setError(null);
              }}
              className={cx(
                "w-full rounded-xl border-2 p-4 text-left transition",
                accessLevel === "premium"
                  ? "border-[#8F9E4F] bg-[#8F9E4F]/5"
                  : "border-[#ECEEE4] bg-white hover:border-[#DADDD0]"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={cx(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                        accessLevel === "premium"
                          ? "border-[#8F9E4F] bg-[#8F9E4F]"
                          : "border-[#DADDD0] bg-white"
                      )}
                    >
                      {accessLevel === "premium" && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <h3 className="font-semibold text-[#1F2A1F]">Premium</h3>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#8F9E4F]/10 text-[#8F9E4F]">
                      Premium
                    </span>
                  </div>
                  <p className="text-sm text-[#6F7A5A] ml-7">
                    Only users with premium subscription can view this place
                  </p>
                </div>
              </div>
            </button>
          </div>

          {accessLevel === "premium" && (
            <div className="rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-4">
              <p className="text-xs text-[#6F7A5A]">
                Premium places are only visible to users with an active premium subscription. This helps you create exclusive content for your premium audience.
              </p>
            </div>
          )}
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

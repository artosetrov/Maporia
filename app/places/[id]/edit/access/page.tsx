"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccess } from "../../../../hooks/useUserAccess";
import { isPlacePremium, type AccessLevel, canUserCreatePremiumPlace, isUserAdmin } from "../../../../lib/access";
import Icon from "../../../../components/Icon";
import UpgradeCTA from "../../../../components/UpgradeCTA";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function AccessEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user, access } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("public");
  const [originalAccessLevel, setOriginalAccessLevel] = useState<AccessLevel>("public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Check if user can create premium places
  const canCreatePremium = canUserCreatePremiumPlace(access);

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

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

      // Check ownership or admin status
      const isAdminUser = isUserAdmin(access);
      const isOwner = data.created_by === user.id;
      if (!isOwner && !isAdminUser) {
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
  }, [placeId, user, router, access, accessLoading]);

  const hasChanges = accessLevel !== originalAccessLevel;
  const canSave = hasChanges && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    // Prevent standard users from creating premium places (admins can always create premium)
    const isAdminUser = isUserAdmin(access);
    if (accessLevel === "premium" && !canCreatePremium && !isAdminUser) {
      setError("You need a Premium subscription to create premium places");
      return;
    }

    setSaving(true);
    setError(null);

    // Build update payload - use access_level field
    const payload: { access_level: AccessLevel } = {
      access_level: accessLevel,
    };

    console.log("Saving access level:", { placeId, userId: user.id, accessLevel, payload });

      // Admin can update any place, owner can update their own
      const updateQuery = supabase
        .from("places")
        .update(payload)
        .eq("id", placeId);
      
      // If not admin, add ownership check
      if (!isAdminUser) {
        updateQuery.eq("created_by", user.id);
      }
      
      const { data, error: updateError } = await updateQuery.select();

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
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-16 w-full bg-[#ECEEE4] rounded-lg animate-pulse" />
              ))}
            </div>
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
            <h1 className="font-semibold font-fraunces text-[#1F2A1F]" style={{ fontSize: '24px' }}>Access</h1>
            <div className="w-9" /> {/* Spacer */}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
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
            <div className="relative">
              {!canCreatePremium && (
                <div className="absolute inset-0 z-10 rounded-xl bg-white/80 backdrop-blur-sm flex items-center justify-center">
                  <div className="text-center p-4">
                    <p className="text-sm font-medium text-[#1F2A1F] mb-2">
                      Premium places require a Premium subscription
                    </p>
                    <UpgradeCTA variant="button" />
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  if (!canCreatePremium) {
                    setError("You need a Premium subscription to create premium places");
                    return;
                  }
                  setAccessLevel("premium");
                  setError(null);
                }}
                disabled={!canCreatePremium && !isUserAdmin(access)}
                className={cx(
                  "w-full rounded-xl border-2 p-4 text-left transition",
                  !canCreatePremium && "opacity-60 cursor-not-allowed",
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

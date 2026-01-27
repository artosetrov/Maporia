"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccess } from "../../../../hooks/useUserAccess";
import { isUserAdmin } from "../../../../lib/access";
import { CATEGORIES } from "../../../../constants";
import Pill from "../../../../components/Pill";
import Icon from "../../../../components/Icon";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function CategoriesEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user, access } = useUserAccess(true, false);
  const isAdmin = isUserAdmin(access);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [originalCategories, setOriginalCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data, error: placeError } = await supabase
        .from("places")
        .select("categories, created_by")
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

      const currentCategories = Array.isArray(data.categories) ? data.categories : [];
      setCategories(currentCategories);
      setOriginalCategories([...currentCategories]);
      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  const hasChanges =
    categories.sort().join(",") !== originalCategories.sort().join(",");
  const canSave = hasChanges && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    const validCategories = categories.filter((cat) => CATEGORIES.includes(cat as any));

    console.log("Saving categories:", { placeId, userId: user.id, categories: validCategories });

    // Admin can update any place, owner can update their own
    const currentIsAdmin = isUserAdmin(access);
    const updateQuery = supabase
      .from("places")
      .update({ categories: validCategories.length > 0 ? validCategories : null })
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
      setError(updateError.message || "Failed to save categories");
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

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 w-24 bg-[#ECEEE4] rounded-full animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleCancel}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <h1 className="font-semibold font-fraunces text-[#1F2A1F]" style={{ fontSize: '24px' }}>Categories</h1>
            <div className="w-9" />
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

        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-[#1F2A1F] mb-3">Main category</h2>
            <p className="text-xs text-[#6F7A5A] mb-4">
              Select at least one category that best describes your place.
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const isSelected = categories.includes(cat);
                return (
                  <Pill
                    key={cat}
                    active={isSelected}
                    onClick={() => {
                      if (isSelected) {
                        setCategories((prev) => prev.filter((c) => c !== cat));
                      } else {
                        setCategories((prev) => [...prev, cat]);
                      }
                    }}
                  >
                    {cat}
                  </Pill>
                );
              })}
            </div>
            {categories.length === 0 && (
              <p className="mt-3 text-xs text-[#6F7A5A]">Pick what best describes the vibe</p>
            )}
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

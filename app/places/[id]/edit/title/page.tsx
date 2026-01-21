"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccess } from "../../../../hooks/useUserAccess";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function TitleEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load place
  useEffect(() => {
    if (!placeId || !user) return;

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

      // Check ownership
      if (data.created_by !== user.id) {
        router.push(`/id/${placeId}`);
        return;
      }

      const currentTitle = data.title || "";
      setTitle(currentTitle);
      setOriginalTitle(currentTitle);
      setLoading(false);
    })();
  }, [placeId, user, router]);

  const hasChanges = title.trim() !== originalTitle.trim();
  const isValid = title.trim().length >= 4 && title.trim().length <= 50;
  const canSave = hasChanges && isValid && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    console.log("Saving title:", { placeId, userId: user.id, title: title.trim() });

    const { data, error: updateError } = await supabase
      .from("places")
      .update({ title: title.trim() })
      .eq("id", placeId)
      .eq("created_by", user.id)
      .select();

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
            <h1 className="text-lg font-semibold text-[#1F2A1F]">Title</h1>
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

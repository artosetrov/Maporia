"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useUserAccess } from "../../../hooks/useUserAccess";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function PlaceSettingsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<{ id: string; title: string | null; created_by: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(false);

  // Load place
  useEffect(() => {
    if (!placeId || !user) return;

    (async () => {
      setLoading(true);
      const { data, error: placeError } = await supabase
        .from("places")
        .select("id, title, created_by, is_hidden, visibility")
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

      setPlace(data);
      // Check if place is hidden (try multiple possible fields)
      setIsHidden(data.is_hidden === true || data.visibility === 'hidden' || data.visibility === 'private');
      setLoading(false);
    })();
  }, [placeId, user, router]);

  async function handleDelete() {
    if (!placeId || !user || !place) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete "${place.title || 'this place'}"? This action cannot be undone.`
    );
    
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      // Delete related data first
      await supabase.from("place_photos").delete().eq("place_id", placeId);
      await supabase.from("comments").delete().eq("place_id", placeId);
      await supabase.from("reactions").delete().eq("place_id", placeId);

      // Delete the place
      const { error: deleteError } = await supabase
        .from("places")
        .delete()
        .eq("id", placeId)
        .eq("created_by", user.id);

      if (deleteError) {
        console.error("Delete error:", deleteError);
        setError(deleteError.message || "Failed to delete place");
        setDeleting(false);
        return;
      }

      // Redirect to profile
      router.push("/profile");
    } catch (err) {
      console.error("Exception deleting place:", err);
      setError(err instanceof Error ? err.message : "Failed to delete place");
      setDeleting(false);
    }
  }

  async function handleToggleVisibility() {
    if (!placeId || !user) return;

    setHiding(true);
    setError(null);

    const newHiddenState = !isHidden;

    // Try multiple possible field names
    const payload: any = {
      is_hidden: newHiddenState,
      visibility: newHiddenState ? 'hidden' : 'public',
    };

    const { error: updateError } = await supabase
      .from("places")
      .update(payload)
      .eq("id", placeId)
      .eq("created_by", user.id)
      .select();

    setHiding(false);

    if (updateError) {
      console.error("Update error:", updateError);
      setError(updateError.message || "Failed to update visibility");
      return;
    }

    setIsHidden(newHiddenState);
    
    if (navigator.vibrate) navigator.vibrate(10);
  }

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-sm text-[#6F7A5A]">Loading…</div>
      </main>
    );
  }

  if (!place) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-[#C96A5B] mb-2">Place not found</div>
          <button
            onClick={() => router.push("/profile")}
            className="text-sm text-[#8F9E4F] underline"
          >
            Back to profile
          </button>
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
              onClick={() => router.push(`/places/${placeId}/edit`)}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-[#1F2A1F]">Place settings</h1>
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

        <div className="space-y-6">
          {/* Visibility Section */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5">
            <h2 className="text-base font-semibold text-[#1F2A1F] mb-3">Visibility</h2>
            <p className="text-sm text-[#6F7A5A] mb-4">
              {isHidden 
                ? "This place is hidden from other users. Only you can see it."
                : "This place is visible to all users on Maporia."}
            </p>
            <button
              onClick={handleToggleVisibility}
              disabled={hiding}
              className={cx(
                "w-full rounded-xl border px-4 py-3 text-sm font-medium transition",
                hiding
                  ? "border-[#ECEEE4] bg-[#FAFAF7] text-[#6F7A5A] cursor-not-allowed"
                  : isHidden
                  ? "border-[#8F9E4F] bg-[#8F9E4F] text-white hover:bg-[#556036]"
                  : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]"
              )}
            >
              {hiding ? "Updating…" : isHidden ? "Make visible" : "Hide from users"}
            </button>
          </div>

          {/* Danger Zone */}
          <div className="rounded-2xl border border-red-200 bg-red-50/20 p-5">
            <h2 className="text-base font-semibold text-red-700 mb-3">Danger zone</h2>
            <p className="text-sm text-[#6F7A5A] mb-4">
              Once you delete a place, there is no going back. Please be certain.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cx(
                "w-full rounded-xl border border-red-300 bg-red-500 px-4 py-3 text-sm font-medium text-white hover:bg-red-600 transition",
                deleting && "opacity-50 cursor-not-allowed"
              )}
            >
              {deleting ? "Deleting…" : "Delete place"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

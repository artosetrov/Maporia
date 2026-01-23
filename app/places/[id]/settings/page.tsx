"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useUserAccess } from "../../../hooks/useUserAccess";
import { isUserAdmin } from "../../../lib/access";
import Icon from "../../../components/Icon";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function PlaceSettingsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user, access } = useUserAccess(true, false);
  const isAdmin = isUserAdmin(access);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<{ id: string; title: string | null; created_by: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(false);

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

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

      // Check ownership or admin status
      const currentIsAdmin = isUserAdmin(access);
      const isOwner = data.created_by === user.id;
      if (!isOwner && !currentIsAdmin) {
        router.push(`/id/${placeId}`);
        return;
      }

      // Settings moved into the main editor screen.
      // Keep this route for backwards compatibility and redirect.
      router.replace(`/places/${placeId}/edit`);
      return;

      setPlace(data);
      // Check if place is hidden (try multiple possible fields)
      setIsHidden(data.is_hidden === true || data.visibility === 'hidden' || data.visibility === 'private');
      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  async function handleDelete() {
    if (!placeId || !user || !place) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete "${place.title || 'this place'}"? This action cannot be undone.`
    );
    
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      // Step 1: Get all photos to delete from storage
      const { data: photosData } = await supabase
        .from("place_photos")
        .select("url")
        .eq("place_id", placeId);

      // Step 2: Delete photos from storage (if they exist in storage bucket)
      if (photosData && photosData.length > 0) {
        const photoUrls = photosData.map((p) => p.url).filter(Boolean) as string[];
        const bucketName = 'place-photos'; // Bucket name from upload code
        
        for (const url of photoUrls) {
          try {
            // Only delete if it's a Supabase storage URL, not external URL
            if (url.includes('supabase.co/storage')) {
              // Extract file path from URL
              // Format: https://...supabase.co/storage/v1/object/public/place-photos/places/{uuid}.{ext}
              const storageMatch = url.match(/\/place-photos\/(.+)$/);
              if (storageMatch && storageMatch[1]) {
                const filePath = storageMatch[1];
                const { error: storageError } = await supabase.storage
                  .from(bucketName)
                  .remove([filePath]);
                
                if (storageError) {
                  console.warn(`Failed to delete photo from storage: ${filePath}`, storageError);
                  // Continue even if storage deletion fails
                }
              }
            }
          } catch (storageErr) {
            console.warn("Error deleting photo from storage:", storageErr);
            // Continue even if storage deletion fails
          }
        }
      }

      // Step 3: Delete related data from database
      // Delete in parallel for better performance
      const [photosResult, commentsResult, reactionsResult] = await Promise.all([
        supabase.from("place_photos").delete().eq("place_id", placeId),
        supabase.from("comments").delete().eq("place_id", placeId),
        supabase.from("reactions").delete().eq("place_id", placeId),
      ]);

      // Log any errors but continue (some tables might not have data)
      if (photosResult.error) {
        console.warn("Error deleting place_photos:", photosResult.error);
      }
      if (commentsResult.error) {
        console.warn("Error deleting comments:", commentsResult.error);
      }
      if (reactionsResult.error) {
        console.warn("Error deleting reactions:", reactionsResult.error);
      }

      // Step 4: Delete the place itself (admin can delete any place, owner can delete their own)
      const currentIsAdmin = isUserAdmin(access);
      const deleteQuery = supabase
        .from("places")
        .delete()
        .eq("id", placeId);
      
      // If not admin, add ownership check
      if (!currentIsAdmin) {
        deleteQuery.eq("created_by", user.id);
      }
      
      const { error: deleteError } = await deleteQuery;

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

    // Admin can update any place, owner can update their own
    const currentIsAdmin = isUserAdmin(access);
    const updateQuery = supabase
      .from("places")
      .update(payload)
      .eq("id", placeId);
    
    // If not admin, add ownership check
    if (!currentIsAdmin) {
      updateQuery.eq("created_by", user.id);
    }
    
    const { error: updateError } = await updateQuery.select();

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
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-10 w-full bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-24 w-full bg-[#ECEEE4] rounded animate-pulse" />
          </div>
        </div>
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
              <Icon name="back" size={20} />
            </button>
            <h1 className="font-semibold font-fraunces text-[#1F2A1F]" style={{ fontSize: '24px' }}>Place settings</h1>
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

        <div className="space-y-6">
          {/* Visibility Section */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5">
            <h2 className="text-base font-semibold font-fraunces text-[#1F2A1F] mb-3">Visibility</h2>
            <p className="text-sm text-[#6F7A5A] mb-4">
              {isHidden 
                ? "This place is hidden from other users. Only you can see it."
                : "This place is visible to all users on Maporia."}
            </p>
            <button
              onClick={handleToggleVisibility}
              disabled={hiding}
              className={cx(
                "w-full h-11 rounded-xl border px-5 text-sm font-medium transition",
                hiding
                  ? "border-[#ECEEE4] bg-[#FAFAF7] text-[#6F7A5A] cursor-not-allowed"
                  : isHidden
                  ? "border-[#8F9E4F] bg-[#8F9E4F] text-white hover:bg-[#7A8A42]"
                  : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]"
              )}
            >
              {hiding ? "Updating…" : isHidden ? "Make visible" : "Hide from users"}
            </button>
          </div>

          {/* Danger Zone */}
          <div className="rounded-2xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-5">
            <h2 className="text-base font-semibold font-fraunces text-[#C96A5B] mb-3">Danger zone</h2>
            <p className="text-sm text-[#6F7A5A] mb-4">
              Once you delete a place, there is no going back. Please be certain.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cx(
                "w-full h-11 rounded-xl border border-[#C96A5B] bg-[#C96A5B] px-5 text-sm font-medium text-white hover:bg-[#B85A4B] transition",
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

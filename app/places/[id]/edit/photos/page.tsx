"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccess } from "../../../../hooks/useUserAccess";

type Photo = {
  id: string;
  url: string;
  sort: number;
  is_cover: boolean;
  uploading?: boolean;
  error?: string;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function generateUUID(): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function PhotosEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [originalPhotos, setOriginalPhotos] = useState<Photo[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load photos
  useEffect(() => {
    if (!placeId || !user) return;

    (async () => {
      setLoading(true);

      // Check ownership
      const { data: placeData } = await supabase
        .from("places")
        .select("created_by, cover_url")
        .eq("id", placeId)
        .single();

      if (!placeData || placeData.created_by !== user.id) {
        router.push(`/id/${placeId}`);
        return;
      }

      // Load photos from place_photos table
      const { data: photosData } = await supabase
        .from("place_photos")
        .select("url, sort, is_cover")
        .eq("place_id", placeId)
        .order("sort", { ascending: true });

      let loadedPhotos: Photo[] = [];

      if (photosData && photosData.length > 0) {
        loadedPhotos = photosData
          .map((p, idx) => ({
            id: `photo-${idx}`,
            url: p.url || "",
            sort: p.sort ?? idx,
            is_cover: p.is_cover ?? idx === 0,
          }))
          .filter((p) => p.url);
      } else if (placeData.cover_url) {
        // Fallback to legacy cover_url
        loadedPhotos = [{ id: "photo-0", url: placeData.cover_url, sort: 0, is_cover: true }];
      }

      setPhotos(loadedPhotos);
      setOriginalPhotos(loadedPhotos.map((p) => ({ ...p })));
      setLoading(false);
    })();
  }, [placeId, user, router]);

  async function uploadToSupabase(file: File): Promise<{ url: string | null; error: string | null }> {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `places/${generateUUID()}.${ext}`;

      console.log("Uploading to storage:", { path, fileName: file.name, fileSize: file.size });

      const { data: uploadData, error } = await supabase.storage
        .from("place-photos")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error("Storage upload error:", error);
        return { url: null, error: error.message || "Upload failed" };
      }

      console.log("Upload successful:", { path, uploadData });

      const { data: urlData } = supabase.storage.from("place-photos").getPublicUrl(path);
      const publicUrl = urlData?.publicUrl ?? null;
      
      console.log("Public URL:", publicUrl);

      return { url: publicUrl, error: null };
    } catch (err) {
      console.error("Upload exception:", err);
      return { url: null, error: err instanceof Error ? err.message : "Upload failed" };
    }
  }

  function handleFilePick(files: FileList | null) {
    if (!files) return;

    const newFiles = Array.from(files);
    const timestamp = Date.now();
    const newPhotos: Photo[] = newFiles.map((file, idx) => ({
      id: `new-${timestamp}-${idx}`,
      url: URL.createObjectURL(file),
      sort: photos.length + idx,
      is_cover: photos.length === 0 && idx === 0,
      uploading: true,
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);

    // Upload each file
    newPhotos.forEach(async (photo, photoIdx) => {
      const file = newFiles[photoIdx];
      if (!file) {
        console.error("File not found for photo:", photo.id);
        setPhotos((prev) =>
          prev.map((p) => {
            if (p.id !== photo.id) return p;
            URL.revokeObjectURL(p.url);
            return { ...p, uploading: false, error: "File not found" };
          })
        );
        return;
      }

      console.log("Uploading photo:", { photoId: photo.id, fileName: file.name, fileSize: file.size });

      const result = await uploadToSupabase(file);
      
      console.log("Upload result:", { photoId: photo.id, url: result.url, error: result.error });

      setPhotos((prev) =>
        prev.map((p) => {
          if (p.id !== photo.id) return p;
          if (!result.url) {
            URL.revokeObjectURL(p.url);
            return { ...p, uploading: false, error: result.error || "Upload failed" };
          }
          URL.revokeObjectURL(p.url);
          return { ...p, url: result.url, uploading: false };
        })
      );
    });
  }

  function removePhoto(photoId: string) {
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) return;

    if (photo.is_cover && photos.length === 1) {
      setError("Cannot remove the last photo (cover is required)");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setPhotos((prev) => {
      const filtered = prev.filter((p) => p.id !== photoId);
      // If we removed the cover, make the first one the cover
      if (photo.is_cover && filtered.length > 0) {
        filtered[0].is_cover = true;
      }
      return filtered;
    });
  }

  function setAsCover(photoId: string) {
    setPhotos((prev) =>
      prev.map((p) => ({
        ...p,
        is_cover: p.id === photoId,
      }))
    );
  }

  const hasChanges = JSON.stringify(photos.map((p) => ({ url: p.url, is_cover: p.is_cover, sort: p.sort }))) !==
    JSON.stringify(originalPhotos.map((p) => ({ url: p.url, is_cover: p.is_cover, sort: p.sort })));
  const canSave = hasChanges && photos.length > 0 && !photos.some((p) => p.uploading) && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    const photoUrls = photos.map((p) => p.url).filter(Boolean) as string[];
    if (photoUrls.length === 0) {
      setError("At least one photo is required");
      setSaving(false);
      return;
    }

    const coverUrl = photoUrls[0];

    console.log("Saving photos:", { placeId, userId: user.id, photoCount: photoUrls.length });

    // Update cover_url in places table (legacy)
    const { error: coverError } = await supabase
      .from("places")
      .update({ cover_url: coverUrl })
      .eq("id", placeId)
      .eq("created_by", user.id)
      .select();

    if (coverError) {
      console.error("Cover update error:", coverError);
      setSaving(false);
      setError(coverError.message || "Failed to update cover photo");
      return;
    }

    // Delete existing photos
    const { error: deleteError } = await supabase
      .from("place_photos")
      .delete()
      .eq("place_id", placeId);

    if (deleteError) {
      console.error("Delete photos error:", deleteError);
      setSaving(false);
      setError(deleteError.message || "Failed to delete old photos");
      return;
    }

    // Insert new photos
    const rows = photoUrls.map((url, i) => ({
      place_id: placeId,
      user_id: user.id,
      url,
      is_cover: i === 0,
      sort: i,
    }));

    const { data: insertData, error: photosError } = await supabase
      .from("place_photos")
      .insert(rows)
      .select();

    console.log("Photos insert result:", { data: insertData, error: photosError });

    setSaving(false);

    if (photosError) {
      console.error("Insert photos error:", photosError);
      setError(photosError.message || "Failed to save photos");
      return;
    }

    // If no data returned but no error, the insert likely succeeded
    // This can happen with RLS policies that allow INSERT but restrict SELECT
    if (!insertData || insertData.length === 0) {
      console.warn("No data returned from photos insert, but no error occurred. Insert likely succeeded.");
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
    <main className="min-h-screen bg-[#FAFAF7] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleCancel}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-[#1F2A1F]">Photos</h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50/50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Upload Dropzone */}
        <div className="mb-6">
          <label className="block w-full rounded-2xl border-2 border-dashed border-[#ECEEE4] bg-white p-8 text-center cursor-pointer hover:border-[#8F9E4F] transition">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFilePick(e.target.files)}
            />
            <svg className="w-12 h-12 text-[#A8B096] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm font-medium text-[#1F2A1F] mb-1">Add photos</p>
            <p className="text-xs text-[#6F7A5A]">Drag and drop or click to browse</p>
          </label>
        </div>

        {/* Photo Grid */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <div className="aspect-square rounded-2xl overflow-hidden bg-[#FAFAF7] border border-[#ECEEE4]">
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                  {photo.uploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="text-white text-xs">Uploading…</div>
                    </div>
                  )}
                  {photo.error && (
                    <div className="absolute inset-0 bg-red-500/40 flex items-center justify-center">
                      <div className="text-white text-xs px-2 text-center">{photo.error}</div>
                    </div>
                  )}
                  {photo.is_cover && (
                    <div className="absolute top-2 left-2 rounded-full bg-[#8F9E4F] text-white text-[10px] px-2 py-0.5 font-medium">
                      Cover
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute inset-0 bg-black/20 rounded-2xl" />
                  <div className="absolute bottom-2 left-2 right-2 flex gap-2">
                    {!photo.is_cover && (
                      <button
                        onClick={() => setAsCover(photo.id)}
                        className="flex-1 rounded-lg bg-white/90 backdrop-blur-sm px-2 py-1.5 text-xs font-medium text-[#1F2A1F] hover:bg-white transition"
                      >
                        Set cover
                      </button>
                    )}
                    <button
                      onClick={() => removePhoto(photo.id)}
                      className="rounded-lg bg-red-500/90 backdrop-blur-sm px-2 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-[#6F7A5A]">No photos yet. Add at least one photo to use as cover.</p>
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#ECEEE4]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
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

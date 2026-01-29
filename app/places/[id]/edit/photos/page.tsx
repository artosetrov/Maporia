"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccess } from "../../../../hooks/useUserAccess";
import { isUserAdmin } from "../../../../lib/access";
import Icon from "../../../../components/Icon";

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

  const { loading: accessLoading, user, access } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [originalPhotos, setOriginalPhotos] = useState<Photo[]>([]);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [originalVideoUrl, setOriginalVideoUrl] = useState<string>("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLLabelElement>(null);
  const menuRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (openMenuId) {
        const menuElement = menuRefs.current.get(openMenuId);
        const target = event.target as HTMLElement;
        if (menuElement && !menuElement.contains(target)) {
          // Check if click is on the menu button
          if (!target.closest(`[data-menu-button="${openMenuId}"]`)) {
            setOpenMenuId(null);
          }
        }
      }
    }

    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [openMenuId]);

  // Load photos
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);

      // Check ownership or admin status
      const { data: placeData } = await supabase
        .from("places")
        .select("created_by, cover_url, video_url")
        .eq("id", placeId)
        .single();

      if (!placeData) {
        router.push(`/id/${placeId}`);
        return;
      }

      const currentIsAdmin = isUserAdmin(access);
      const isOwner = placeData.created_by === user.id;
      
      if (!isOwner && !currentIsAdmin) {
        router.push(`/id/${placeId}`);
        return;
      }

      // Load photos from place_photos table
      const { data: photosData } = await supabase
        .from("place_photos")
        .select("id, url, sort, is_cover")
        .eq("place_id", placeId)
        .order("sort", { ascending: true });

      let loadedPhotos: Photo[] = [];

      if (photosData && photosData.length > 0) {
        // Find if any photo is marked as cover
        const hasCover = photosData.some(photo => photo.is_cover === true);
        
        loadedPhotos = photosData
          .map((p, idx) => ({
            id: p.id || `photo-${idx}`,
            url: p.url || "",
            sort: p.sort ?? idx,
            // If no cover is set in DB, make first photo the cover
            is_cover: p.is_cover ?? (!hasCover && idx === 0),
          }))
          .filter((p) => p.url);
        
        // Ensure at least one photo is marked as cover
        if (loadedPhotos.length > 0 && !loadedPhotos.some(p => p.is_cover)) {
          loadedPhotos[0].is_cover = true;
        }
      } else if (placeData.cover_url) {
        // Fallback to legacy cover_url
        loadedPhotos = [{ id: "photo-0", url: placeData.cover_url, sort: 0, is_cover: true }];
      }

      setPhotos(loadedPhotos);
      setOriginalPhotos(loadedPhotos.map((p) => ({ ...p })));
      
      // Load video_url
      const videoUrlValue = placeData.video_url || "";
      setVideoUrl(videoUrlValue);
      setOriginalVideoUrl(videoUrlValue);
      
      setLoading(false);
    })();
  }, [placeId, user, access, accessLoading, router]);

  async function uploadToSupabase(file: File): Promise<{ url: string | null; error: string | null }> {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `places/${generateUUID()}.${ext}`;


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


      const { data: urlData } = supabase.storage.from("place-photos").getPublicUrl(path);
      const publicUrl = urlData?.publicUrl ?? null;
      

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


      const result = await uploadToSupabase(file);
      

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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFilePick(files);
    }
  }

  function handleBrowseClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
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

  const hasPhotoChanges = JSON.stringify(photos.map((p) => ({ url: p.url, is_cover: p.is_cover, sort: p.sort }))) !==
    JSON.stringify(originalPhotos.map((p) => ({ url: p.url, is_cover: p.is_cover, sort: p.sort })));
  const hasVideoChanges = videoUrl !== originalVideoUrl;
  const hasChanges = hasPhotoChanges || hasVideoChanges;
  const canSave = hasChanges && photos.length > 0 && !photos.some((p) => p.uploading) && !saving && !videoError;

  function validateVideoUrl(url: string): boolean {
    if (!url.trim()) return true; // Empty is valid (optional field)
    const trimmed = url.trim();
    // Must contain instagram.com/reel
    return trimmed.includes("instagram.com/reel");
  }

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);
    setVideoError(null);

    // Validate video URL
    if (videoUrl.trim() && !validateVideoUrl(videoUrl)) {
      setVideoError("Please enter a valid Instagram Reel URL (must contain instagram.com/reel)");
      setSaving(false);
      return;
    }

    const photoUrls = photos.map((p) => p.url).filter(Boolean) as string[];
    if (photoUrls.length === 0) {
      setError("At least one photo is required");
      setSaving(false);
      return;
    }

    // Find the cover photo (photo with is_cover: true)
    const coverPhoto = photos.find((p) => p.is_cover);
    const coverUrl = coverPhoto?.url || photoUrls[0]; // Fallback to first photo if no cover set

    // Update cover_url and video_url in places table
    // Admin can update any place, owner can update their own
    const currentIsAdmin = isUserAdmin(access);
    const updateQuery = supabase
      .from("places")
      .update({ 
        cover_url: coverUrl,
        video_url: videoUrl.trim() || null
      })
      .eq("id", placeId);
    
    // If not admin, add ownership check
    if (!currentIsAdmin) {
      updateQuery.eq("created_by", user.id);
    }
    
    const { error: coverError } = await updateQuery.select();
    
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

    // Insert new photos - preserve cover selection from state
    // First, ensure only one photo is marked as cover
    const photosWithSingleCover = photos.map((p, idx) => ({
      ...p,
      is_cover: p.is_cover && idx === photos.findIndex(photo => photo.is_cover),
    }));

    // If no cover is set, make the first one the cover
    const hasCover = photosWithSingleCover.some(p => p.is_cover);
    if (!hasCover && photosWithSingleCover.length > 0) {
      photosWithSingleCover[0].is_cover = true;
    }

    // Sort photos to put cover first, then by sort order
    const sortedPhotos = photosWithSingleCover
      .filter((p) => p.url)
      .sort((a, b) => {
        // Cover photo first
        if (a.is_cover && !b.is_cover) return -1;
        if (!a.is_cover && b.is_cover) return 1;
        // Then by sort order
        return a.sort - b.sort;
      });

    const rows = sortedPhotos.map((photo, i) => ({
      place_id: placeId,
      user_id: user.id,
      url: photo.url,
      sort: i,
      is_cover: photo.is_cover, // Use the cover flag from state
    }));

    const { data: insertData, error: photosError } = await supabase
      .from("place_photos")
      .insert(rows)
      .select();


    setSaving(false);

    if (photosError) {
      console.error("Insert photos error:", photosError);
      setError(photosError.message || "Failed to save photos");
      return;
    }

    // If no data returned but no error, the insert likely succeeded
    // This can happen with RLS policies that allow INSERT but restrict SELECT
    if (!insertData || insertData.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn("No data returned from photos insert, but no error occurred. Insert likely succeeded.");
      }
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square bg-[#ECEEE4] rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleCancel}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <h1 className="font-semibold font-fraunces text-[#1F2A1F]" style={{ fontSize: '24px' }}>Photos</h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 pb-32">
        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        {/* Photo Grid with Upload Dropzone */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Upload Dropzone - same size as photos */}
          <label
            ref={dropzoneRef}
            className={cx(
              "aspect-square rounded-2xl border-2 border-dashed bg-white flex flex-col items-center justify-center cursor-pointer transition relative overflow-hidden",
              isDragging ? "border-[#8F9E4F] bg-[#FAFAF7]" : "border-[#ECEEE4] hover:border-[#8F9E4F]"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFilePick(e.target.files)}
            />
            <div className="flex flex-col items-center justify-center flex-1 px-2 py-3">
              <span className="text-[36px] mb-1.5">📷</span>
              <p className="text-[11px] font-semibold text-[#1F2A1F] mb-0.5 text-center leading-tight">Drag and drop</p>
              <p className="text-center leading-tight mb-1.5" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>or browse for photos</p>
              <button
                type="button"
                onClick={handleBrowseClick}
                className="mt-1.5 rounded-md bg-[#8F9E4F] text-white text-xs font-medium py-1.5 px-3 hover:bg-[#556036] transition"
              >
                Browse
              </button>
            </div>
          </label>

          {/* Photo Grid */}
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
                  <div className="absolute inset-0 bg-[#C96A5B]/40 flex items-center justify-center">
                    <div className="text-white text-xs px-2 text-center">{photo.error}</div>
                  </div>
                )}
                {photo.is_cover && (
                  <div className="absolute top-2 left-2 rounded-full bg-[#8F9E4F] text-white text-[10px] px-2 py-0.5 font-medium z-10">
                    Cover
                  </div>
                )}
                {/* Menu button - visible on mobile, hidden on desktop (where hover works) */}
                <button
                  data-menu-button={photo.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === photo.id ? null : photo.id);
                  }}
                  className="lg:hidden absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center z-20 shadow-sm"
                  aria-label="Photo options"
                >
                  <svg className="w-5 h-5 text-[#1F2A1F]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </button>
                {/* Mobile Menu */}
                {openMenuId === photo.id && (
                  <div
                    ref={(el) => {
                      if (el) menuRefs.current.set(photo.id, el);
                      else menuRefs.current.delete(photo.id);
                    }}
                    className="lg:hidden absolute top-10 right-2 bg-white rounded-xl border border-[#ECEEE4] shadow-lg z-30 min-w-[140px] overflow-hidden"
                  >
                    {!photo.is_cover && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setAsCover(photo.id);
                          setOpenMenuId(null);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-[#1F2A1F] hover:bg-[#FAFAF7] transition-colors flex items-center gap-2"
                      >
                        <Icon name="star" size={16} className="text-[#1F2A1F]" />
                        Set as cover
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removePhoto(photo.id);
                        setOpenMenuId(null);
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-[#C96A5B] hover:bg-[#C96A5B]/10 transition-colors flex items-center gap-2"
                    >
                      <Icon name="delete" size={16} className="text-[#C96A5B]" />
                      Delete photo
                    </button>
                  </div>
                )}
              </div>
              {/* Desktop hover overlay */}
              <div className="hidden lg:block absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    className="rounded-lg bg-[#C96A5B] backdrop-blur-sm px-2 py-1.5 text-xs font-medium text-white hover:bg-[#B85A4B] transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Instagram Reel Video Section */}
        <div className="mt-8 pt-8 border-t border-[#ECEEE4]">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
                Instagram Reel
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => {
                  setVideoUrl(e.target.value);
                  setVideoError(null);
                }}
                onBlur={() => {
                  if (videoUrl.trim() && !validateVideoUrl(videoUrl)) {
                    setVideoError("Please enter a valid Instagram Reel URL (must contain instagram.com/reel)");
                  } else {
                    setVideoError(null);
                  }
                }}
                placeholder="Paste Instagram Reel link"
                className={cx(
                  "w-full rounded-xl border px-4 py-3 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none transition",
                  videoError
                    ? "border-[#C96A5B]/50 bg-[#C96A5B]/10 focus:bg-white focus:border-[#C96A5B]"
                    : "border-[#ECEEE4] bg-white focus:border-[#8F9E4F] focus:bg-white"
                )}
              />
              {videoError && (
                <p className="mt-2 text-xs text-[#C96A5B]">{videoError}</p>
              )}
              {!videoError && videoUrl.trim() && (
                <p className="mt-2 text-xs text-[#6F7A5A]">
                  Video will be displayed on the place details page
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#ECEEE4] pb-safe-bottom">
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

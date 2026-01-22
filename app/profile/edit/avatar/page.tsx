"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useUserAccess } from "../../../hooks/useUserAccess";
import Icon from "../../../components/Icon";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function generateUUID() {
  return crypto.randomUUID();
}

export default function AvatarEditorPage() {
  const router = useRouter();
  const { loading: accessLoading, user } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [originalAvatarUrl, setOriginalAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load profile
  useEffect(() => {
    if (!user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .single();

      if (profileError || !data) {
        router.push(`/profile/edit`);
        return;
      }

      const currentAvatarUrl = data.avatar_url;
      setAvatarUrl(currentAvatarUrl);
      setOriginalAvatarUrl(currentAvatarUrl);
      setLoading(false);
    })();
  }, [user, router, accessLoading]);

  async function uploadAvatar(file: File): Promise<{ url: string | null; error: string | null }> {
    if (!user) return { url: null, error: "User not found" };

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${generateUUID()}.${ext}`;

      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) {
        console.error("Upload error:", error);
        return { url: null, error: error.message || "Upload failed" };
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      return { url: data.publicUrl ?? null, error: null };
    } catch (err) {
      console.error("Upload exception:", err);
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      return { url: null, error: errorMessage };
    }
  }

  async function handleFilePick(files: FileList | null) {
    if (!files || !files[0] || !user) return;

    const file = files[0];

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image size should be less than 5MB");
      return;
    }

    setUploading(true);
    setError(null);

    // Delete old avatar if exists
    if (avatarUrl && avatarUrl.includes("avatars/")) {
      const pathMatch = avatarUrl.match(/avatars\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        const path = pathMatch[1].split('?')[0];
        await supabase.storage.from("avatars").remove([path]);
      }
    }

    const result = await uploadAvatar(file);
    setUploading(false);

    if (result.url) {
      setAvatarUrl(result.url);
    } else {
      setError(result.error || "Failed to upload avatar");
    }
  }

  async function handleSave() {
    if (!user) return;

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message || "Failed to save avatar");
      return;
    }

    if (navigator.vibrate) navigator.vibrate(10);
    window.location.href = `/profile/edit`;
  }

  async function handleDelete() {
    if (!user || !avatarUrl) return;

    setUploading(true);
    setError(null);

    // Delete from storage
    if (avatarUrl.includes("avatars/")) {
      const pathMatch = avatarUrl.match(/avatars\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        const path = pathMatch[1].split('?')[0];
        await supabase.storage.from("avatars").remove([path]);
      }
    }

    // Update profile
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);

    setUploading(false);

    if (updateError) {
      setError(updateError.message || "Failed to delete avatar");
      return;
    }

    setAvatarUrl(null);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function handleCancel() {
    router.push(`/profile/edit`);
  }

  const hasChanges = avatarUrl !== originalAvatarUrl;
  const canSave = hasChanges && !saving && !uploading;

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            <div className="w-32 h-32 rounded-full bg-[#ECEEE4] mx-auto animate-pulse" />
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
            <h1 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Profile photo</h1>
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
          {/* Avatar Preview */}
          <div className="flex flex-col items-center">
            <div className="w-32 h-32 rounded-full bg-[#FAFAF7] border-4 border-[#ECEEE4] overflow-hidden flex-shrink-0 mb-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-semibold text-[#8F9E4F]">
                  {user?.email?.[0]?.toUpperCase() || "U"}
                </div>
              )}
            </div>
            {uploading && (
              <p className="text-sm text-[#6F7A5A]">Uploading...</p>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFilePick(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-xl border-2 border-dashed border-[#ECEEE4] bg-[#FAFAF7] px-4 py-4 text-sm font-medium text-[#1F2A1F] hover:border-[#8F9E4F] hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading..." : avatarUrl ? "Change photo" : "Add photo"}
            </button>
            {avatarUrl && (
              <button
                onClick={handleDelete}
                disabled={uploading || saving}
                className="w-full rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Remove photo
              </button>
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

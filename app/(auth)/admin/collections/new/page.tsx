"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase";
import type { Database } from "../../../../types/supabase";
import { useUserAccessContext } from "../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../lib/access";
import Icon from "../../../../components/Icon";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

type CollectionInsert = Database["public"]["Tables"]["collections"]["Insert"];

/* Use existing place-photos bucket; collection covers in subfolder collections/ */
const COLLECTION_COVERS_BUCKET = "place-photos";
const COLLECTION_COVERS_PREFIX = "collections";
const MAX_COVER_SIZE_MB = 5;

type AccessType = "free" | "premium";

export default function NewCollectionPage() {
  const router = useRouter();
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [accessType, setAccessType] = useState<AccessType>("free");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadCover(file: File): Promise<{ url: string | null; error: string | null }> {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${COLLECTION_COVERS_PREFIX}/temp/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(COLLECTION_COVERS_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadError) return { url: null, error: uploadError.message };
      const { data } = supabase.storage.from(COLLECTION_COVERS_BUCKET).getPublicUrl(path);
      return { url: data.publicUrl ?? null, error: null };
    } catch (err) {
      return { url: null, error: err instanceof Error ? err.message : "Upload failed" };
    }
  }

  async function handleCoverFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPG, PNG, etc.)");
      return;
    }
    if (file.size > MAX_COVER_SIZE_MB * 1024 * 1024) {
      setError(`File size must be under ${MAX_COVER_SIZE_MB} MB`);
      return;
    }
    setCoverUploading(true);
    setError(null);
    const result = await uploadCover(file);
    setCoverUploading(false);
    if (result.url) setCoverImage(result.url);
    else setError(result.error || "Failed to upload image");
    e.target.value = "";
  }

  if (accessLoading) {
    return (
      <main className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="h-8 w-48 bg-border-light rounded animate-pulse" />
      </main>
    );
  }

  if (!isAdmin) {
    router.replace("/profile");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    setError(null);

    const payload: CollectionInsert = {
      title: title.trim(),
      description: description.trim() || null,
      cover_image: coverImage.trim() || null,
      access_type: accessType,
      is_active: isActive,
    };
    const { data, error: insertError } = await supabase
      .from("collections")
      .insert(payload as never)
      .select("id")
      .single();

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const inserted = data as { id: string } | null;
    if (inserted?.id) {
      router.push(`/admin/collections/${inserted.id}/edit`);
    } else {
      router.push("/admin/collections");
    }
  }

  return (
    <main className="min-h-screen bg-warm-white pb-24">
      <div className="sticky top-0 z-30 bg-white border-b border-border-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/admin/collections"
              className="p-2 -ml-2 text-content-primary hover:bg-warm-white rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </Link>
            <h1 className="font-semibold font-fraunces text-content-primary text-lg">
              New collection
            </h1>
            <span className="w-9" />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-content-primary mb-1">
              Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Collection title"
              className="w-full rounded-xl border border-border-light bg-white px-4 py-3 text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-olive-primary focus:border-transparent"
              required
              minLength={2}
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-content-primary mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              rows={3}
              className="w-full rounded-xl border border-border-light bg-white px-4 py-3 text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-olive-primary focus:border-transparent resize-none"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-content-primary mb-1">
              Collection cover
            </span>
            {coverImage && (
              <div className="mb-3 rounded-xl border border-border-light overflow-hidden bg-border-light aspect-[21/9] max-h-40">
                <img src={coverImage} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex flex-wrap gap-3 mb-2">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverFilePick}
                aria-label="Upload cover from computer"
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-border-light bg-white text-content-primary text-sm font-medium hover:bg-warm-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {coverUploading ? (
                  <>Uploading…</>
                ) : (
                  <>
                    <Icon name="photo" size={18} />
                    Upload from computer
                  </>
                )}
              </button>
              {coverImage && (
                <button
                  type="button"
                  onClick={() => setCoverImage("")}
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-error/30 bg-error/10 text-error text-sm font-medium hover:bg-error/20 transition"
                >
                  Remove cover
                </button>
              )}
            </div>
            <label htmlFor="cover_image" className="block text-xs text-content-secondary mb-1">
              Or paste image URL
            </label>
            <input
              id="cover_image"
              type="url"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-border-light bg-white px-4 py-3 text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-olive-primary focus:border-transparent"
            />
          </div>

          {/* Access type: Free (off) / Premium (on) — default Free */}
          <div className="flex items-center justify-between rounded-xl border border-border-light bg-white p-4">
            <div>
              <div className="font-fraunces font-semibold text-content-primary text-sm">Access type</div>
              <p className="text-sm text-content-secondary mt-0.5">
                {accessType === "premium"
                  ? "Premium — requires subscription to view."
                  : "Free — visible to everyone."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={accessType === "premium"}
              aria-label={accessType === "premium" ? "Premium (switch to Free)" : "Free (switch to Premium)"}
              onClick={() => setAccessType((prev) => (prev === "free" ? "premium" : "free"))}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-olive-primary focus:ring-offset-2 ${
                accessType === "premium" ? "bg-olive-primary" : "bg-disabled-bg"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  accessType === "premium" ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Active: visible on public Collections page */}
          <div className="flex items-center justify-between rounded-xl border border-border-light bg-white p-4">
            <div>
              <div className="font-fraunces font-semibold text-content-primary text-sm">Active</div>
              <p className="text-sm text-content-secondary mt-0.5">
                {isActive ? "Visible on the public Collections page." : "Hidden from the public Collections page."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((prev) => !prev)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-olive-primary focus:ring-offset-2 ${
                isActive ? "bg-olive-primary" : "bg-disabled-bg"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isActive ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex gap-3 pt-4">
            <Link
              href="/admin/collections"
              className="flex-1 h-11 rounded-xl border border-border-light bg-white px-5 text-sm font-medium text-content-primary hover:bg-warm-white transition flex items-center justify-center"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 h-11 rounded-xl bg-olive-primary text-white text-sm font-medium hover:bg-olive-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

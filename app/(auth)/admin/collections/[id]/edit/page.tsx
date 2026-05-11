"use client";

import { use, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../../../../lib/supabase";
import type { Database } from "../../../../../types/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import { useIsDesktop } from "../../../../../hooks/useIsDesktop";
import { isUserAdmin } from "../../../../../lib/access";
import Icon from "../../../../../components/Icon";
import type { Collection } from "../../../../../types";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

type CollectionUpdate = Database["public"]["Tables"]["collections"]["Update"];
type PlaceCollectionUpdate = Database["public"]["Tables"]["place_collections"]["Update"];

/* Use existing place-photos bucket; collection covers in subfolder collections/ */
const COLLECTION_COVERS_BUCKET = "place-photos";
const COLLECTION_COVERS_PREFIX = "collections";
const MAX_COVER_SIZE_MB = 5;
const MAX_COVER_SIZE_BYTES = MAX_COVER_SIZE_MB * 1024 * 1024;
const ALLOWED_COVER_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

function validateCoverFile(file: File): { extension: string | null; error: string | null } {
  const extension = ALLOWED_COVER_TYPES.get(file.type) ?? null;
  if (!extension) {
    return { extension: null, error: "Please select a JPG, PNG, WebP, or AVIF image" };
  }
  if (file.size > MAX_COVER_SIZE_BYTES) {
    return { extension: null, error: `File size must be under ${MAX_COVER_SIZE_MB} MB` };
  }
  return { extension, error: null };
}

type PlaceCollectionRow = {
  id: string;
  place_id: string;
  collection_id: string;
  sort_order?: number;
};

type PlaceRow = {
  id: string;
  title: string | null;
  cover_url: string | null;
};

type PageProps = { params: Promise<{ id: string }> };

export default function EditCollectionPage(props: PageProps) {
  const router = useRouter();
  const { id: collectionId } = use(props.params);
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);
  const isDesktop = useIsDesktop();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [placeRows, setPlaceRows] = useState<PlaceCollectionRow[]>([]);
  const [placesMap, setPlacesMap] = useState<Record<string, PlaceRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [accessType, setAccessType] = useState<"free" | "premium">("free");
  const [isActive, setIsActive] = useState(true);

  async function uploadCover(file: File): Promise<{ url: string | null; error: string | null }> {
    if (!collectionId) return { url: null, error: "No collection" };
    try {
      const { extension, error: validationError } = validateCoverFile(file);
      if (validationError || !extension) return { url: null, error: validationError };
      const path = `${COLLECTION_COVERS_PREFIX}/${collectionId}/${crypto.randomUUID()}.${extension}`;
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
    const { error: validationError } = validateCoverFile(file);
    if (validationError) {
      setError(validationError);
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

  useEffect(() => {
    if (accessLoading || !collectionId) return;
    if (!isAdmin) {
      router.replace("/profile");
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);

      const { data: colData, error: colError } = await supabase
        .from("collections")
        .select("id, title, description, cover_image, access_type, is_active, created_at")
        .eq("id", collectionId)
        .single();

      if (colError || !colData) {
        setError("Collection not found");
        setLoading(false);
        return;
      }

      const col = colData as Collection;
      setCollection(col);
      setTitle(col.title);
      setDescription(col.description ?? "");
      setCoverImage(col.cover_image ?? "");
      setAccessType(col.access_type);
      setIsActive(col.is_active);

      let pcData: PlaceCollectionRow[] | null = null;
      const pcRes = await supabase
        .from("place_collections")
        .select("id, place_id, collection_id, sort_order")
        .eq("collection_id", collectionId)
        .order("sort_order", { ascending: true });

      if (pcRes.error && pcRes.error.message?.includes("sort_order")) {
        const legacy = await supabase
          .from("place_collections")
          .select("id, place_id, collection_id")
          .eq("collection_id", collectionId);
        pcData = (legacy.data ?? []).map((r: { id: string; place_id: string; collection_id: string }, i: number) => ({
          ...r,
          sort_order: i,
        })) as PlaceCollectionRow[];
      } else if (pcRes.error) {
        setError(pcRes.error.message);
        setLoading(false);
        return;
      } else {
        pcData = (pcRes.data ?? []) as PlaceCollectionRow[];
      }

      const rows = pcData ?? [];
      setPlaceRows(rows);

      if (rows.length > 0) {
        const placeIds = rows.map((r) => r.place_id);
        const { data: placesData } = await supabase
          .from("places")
          .select("id, title, cover_url")
          .in("id", placeIds);

        const map: Record<string, PlaceRow> = {};
        (placesData as PlaceRow[] | null)?.forEach((p) => {
          map[p.id] = p;
        });
        setPlacesMap(map);
      }

      setLoading(false);
    })();
  }, [accessLoading, isAdmin, collectionId, router]);

  async function handleSaveCollection() {
    if (!collectionId || saving) return;

    setSaving(true);
    setError(null);

    const updatePayload: CollectionUpdate = {
      title: title.trim(),
      description: description.trim() || null,
      cover_image: coverImage.trim() || null,
      access_type: accessType,
      is_active: isActive,
    };
    const { error: updateError } = await supabase
      .from("collections")
      .update(updatePayload as never)
      .eq("id", collectionId);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCollection((prev) =>
      prev
        ? {
            ...prev,
            title: title.trim(),
            description: description.trim() || null,
            cover_image: coverImage.trim() || null,
            access_type: accessType,
            is_active: isActive,
          }
        : prev
    );
  }

  async function movePlace(index: number, direction: "up" | "down") {
    if (index < 0 || index >= placeRows.length) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= placeRows.length) return;

    const reordered = [...placeRows];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, removed);

    setPlaceRows(
      reordered.map((r, i) => ({ ...r, sort_order: i }))
    );

    for (let i = 0; i < reordered.length; i++) {
      const row = reordered[i];
      const sortPayload: PlaceCollectionUpdate = { sort_order: i };
      let err = (await supabase.from("place_collections").update(sortPayload as never).eq("id", row.id)).error;
      if (err?.message?.includes("sort_order")) {
        err = (await supabase.from("place_collections").update({ sort_order: i } as never).eq("id", row.id)).error;
      }
      if (err) setError(err.message);
    }
  }

  async function removePlace(placeCollectionId: string) {
    const { error: delError } = await supabase
      .from("place_collections")
      .delete()
      .eq("id", placeCollectionId);

    if (delError) {
      setError(delError.message);
      return;
    }

    setPlaceRows((prev) => prev.filter((r) => r.id !== placeCollectionId));
  }

  if (accessLoading || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
      </main>
    );
  }

  if (loading || !collection) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-[#ECEEE4]">
                <div className="h-6 w-32 bg-[#ECEEE4] rounded mb-4 animate-pulse" />
                <div className="h-10 w-full bg-[#ECEEE4] rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <SectionErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7] pb-24">
      {/* Top App Bar — same as Place editor */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 relative">
            <Link
              href="/admin/collections"
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </Link>
            <div className="absolute left-1/2 -translate-x-1/2 font-semibold font-fraunces text-[#1F2A1F]" style={{ fontSize: "24px" }}>
              Edit collection
            </div>
            <button
              onClick={handleSaveCollection}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-[#8F9E4F] text-white text-sm font-medium shadow-sm hover:bg-[#556036] transition disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Save"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* Content — same container and card style as Place editor */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-4 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="pt-2">
            <h2 className="font-fraunces font-semibold text-[#1F2A1F] text-base">Details</h2>
          </div>

          {/* Title & Description card */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
            <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-4">Title & description</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-[#1F2A1F] mb-1">
                  Title *
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-[#ECEEE4] bg-white px-4 py-3 text-[#1F2A1F] placeholder-[#A8B096] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Collection title"
                />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-[#1F2A1F] mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-[#ECEEE4] bg-white px-4 py-3 text-[#1F2A1F] placeholder-[#A8B096] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] resize-none"
                  placeholder="Short description"
                />
              </div>
            </div>
          </div>

          {/* Cover card */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
            <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-4">Cover</h3>
            {coverImage && (
              <div className="mb-4 rounded-xl border border-[#ECEEE4] overflow-hidden bg-[#ECEEE4] aspect-[21/9] max-h-44">
                <Image
                  src={coverImage}
                  alt=""
                  width={840}
                  height={360}
                  sizes="(max-width: 768px) 100vw, 672px"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-3 mb-3">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={handleCoverFilePick}
                aria-label="Upload cover from computer"
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 text-[#C96A5B] text-sm font-medium hover:bg-[#C96A5B]/20 transition"
                >
                  Remove cover
                </button>
              )}
            </div>
            <label htmlFor="cover_image" className="block text-xs text-[#6F7A5A] mb-1">
              Or paste image URL
            </label>
            <input
              id="cover_image"
              type="url"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-[#ECEEE4] bg-white px-4 py-3 text-[#1F2A1F] placeholder-[#A8B096] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
            />
          </div>

          {/* Access & visibility card */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
            <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-4">Access & visibility</h3>
            <div className="space-y-4">
              {/* Access type: Free (off) / Premium (on) — default Free */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-fraunces font-semibold text-[#1F2A1F] text-sm">Access type</div>
                  <p className="text-sm text-[#6F7A5A]">
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
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2 ${
                    accessType === "premium" ? "bg-[#8F9E4F]" : "bg-[#DADDD0]"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      accessType === "premium" ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-[#ECEEE4]">
                <div>
                  <div className="font-fraunces font-semibold text-[#1F2A1F] text-sm">Active</div>
                  <p className="text-sm text-[#6F7A5A]">
                    {isActive ? "Visible on the public Collections page." : "Hidden from the public Collections page."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  onClick={() => setIsActive((prev) => !prev)}
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2 ${
                    isActive ? "bg-[#8F9E4F]" : "bg-[#DADDD0]"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isActive ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <h2 className="font-fraunces font-semibold text-[#1F2A1F] text-base">
              Places in this collection
            </h2>
          </div>

          {/* Places list card */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
            <p className="text-sm text-[#6F7A5A] mb-4">
              Assign places from the Place editor (Collections). Here you can reorder or remove them.
            </p>
            {placeRows.length === 0 ? (
              <div className="rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-6 text-center text-[#6F7A5A] text-sm">
                No places in this collection yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {placeRows.map((row, index) => {
                  const place = placesMap[row.place_id];
                  return (
                    <li
                      key={row.id}
                      className="flex items-center gap-3 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => movePlace(index, "up")}
                          disabled={index === 0}
                          className="p-1 text-[#6F7A5A] hover:text-[#1F2A1F] disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => movePlace(index, "down")}
                          disabled={index === placeRows.length - 1}
                          className="p-1 text-[#6F7A5A] hover:text-[#1F2A1F] disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-[#ECEEE4] overflow-hidden flex-shrink-0">
                        {place?.cover_url ? (
                          <Image
                            src={place.cover_url}
                            alt=""
                            width={48}
                            height={48}
                            sizes="48px"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#A8B096]">
                            <Icon name="photo" size={20} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/id/${row.place_id}`}
                          target={isDesktop ? "_blank" : undefined}
                          rel={isDesktop ? "noopener noreferrer" : undefined}
                          className="font-medium text-[#1F2A1F] hover:underline truncate block"
                        >
                          {place?.title ?? "Place"}
                        </Link>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePlace(row.id)}
                        className="p-2 text-[#C96A5B] hover:bg-[#C96A5B]/10 rounded-lg transition"
                        aria-label="Remove from collection"
                      >
                        <Icon name="remove" size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
      </main>
    </SectionErrorBoundary>
  );
}

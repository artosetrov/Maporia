"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import type { Database } from "../../../../../types/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../../lib/access";

type PlaceCategoriesRow = Pick<Database["public"]["Tables"]["places"]["Row"], "created_by" | "categories" | "tags">;
import { CATEGORIES, getTagEmoji, stripTagEmoji } from "../../../../../constants";
import Icon from "../../../../../components/Icon";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

type PageProps = { params: Promise<{ id: string }> };

export default function CategoriesEditorPage(props: PageProps) {
  const router = useRouter();
  const { id: placeId } = use(props.params);

  const { loading: accessLoading, user, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [originalCategories, setOriginalCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [originalTags, setOriginalTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  // Load available tags
  useEffect(() => {
    async function loadTags() {
      try {
        setLoadingTags(true);
        const response = await fetch("/api/tags");
        if (response.ok) {
          const data = await response.json();
          setAvailableTags(data.tags || []);
        }
      } catch (err) {
        console.error("Error loading tags:", err);
      } finally {
        setLoadingTags(false);
      }
    }
    loadTags();
  }, []);

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data: rawData, error: placeError } = await supabase
        .from("places")
        .select("categories, tags, created_by")
        .eq("id", placeId)
        .single();

      const data = rawData as PlaceCategoriesRow | null;
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
      const currentTags = Array.isArray(data.tags) ? data.tags : [];
      setCategories(currentCategories);
      setOriginalCategories([...currentCategories]);
      setTags(currentTags);
      setOriginalTags([...currentTags]);
      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  const hasChanges =
    categories.sort().join(",") !== originalCategories.sort().join(",") ||
    tags.sort().join(",") !== originalTags.sort().join(",");
  const canSave = hasChanges && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    const validCategories = categories.filter((cat) => CATEGORIES.includes(cat as any));
    const validTags = tags
      .filter((tag) => typeof tag === "string" && tag.trim().length > 0)
      .map((tag) => tag.trim()); // Trim whitespace from tags

    console.log("Saving categories and tags:", { 
      placeId, 
      userId: user.id, 
      categories: validCategories,
      tags: validTags,
      originalTags,
    });

    // If user is admin, ensure all tags are synced to tags table
    const currentIsAdmin = isUserAdmin(access);
    if (currentIsAdmin && validTags.length > 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Sync each tag to tags table (API handles duplicates gracefully)
          await Promise.all(
            validTags.map(async (tagName) => {
              try {
                await fetch("/api/admin/tags", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ name: tagName }),
                });
                // Ignore errors - tag might already exist or table might not exist
              } catch (err) {
                console.warn(`Failed to sync tag "${tagName}" to tags table:`, err);
              }
            })
          );
        }
      } catch (err) {
        console.warn("Error syncing tags to tags table:", err);
        // Continue anyway - tags will still be saved to place
      }
    }

    // Admin can update any place, owner can update their own
    const updateQuery = supabase
      .from("places")
      // @ts-expect-error Supabase generated types infer update payload as never
      .update({ 
        categories: validCategories.length > 0 ? validCategories : null,
        tags: validTags.length > 0 ? validTags : null,
      })
      .eq("id", placeId);
    
    // If not admin, add ownership check
    if (!currentIsAdmin) {
      updateQuery.eq("created_by", user.id);
    }
    
    const { data, error: updateError } = await updateQuery.select();

    console.log("Update result:", { data, error: updateError });

    if (updateError) {
      console.error("Update error:", updateError);
      setSaving(false);
      setError(updateError.message || "Failed to save categories and tags");
      return;
    }

    // Verify the update succeeded by checking returned data
    if (data && data.length > 0) {
      const updatedPlace = data[0] as PlaceCategoriesRow;
      console.log("Successfully updated place:", {
        categories: updatedPlace.categories,
        tags: updatedPlace.tags,
      });
      
      // Update original state to reflect saved values
      setOriginalCategories(validCategories);
      setOriginalTags(validTags);
    } else {
      console.warn("No data returned from update, but no error occurred. Update likely succeeded.");
    }

    setSaving(false);

    if (navigator.vibrate) navigator.vibrate(10);
    // Force reload by using window.location to ensure fresh data
    window.location.href = `/places/${placeId}/edit`;
  }

  function handleCancel() {
    router.push(`/places/${placeId}/edit`);
  }

  async function handleAddNewTag() {
    const tagName = newTagName.trim();
    if (!tagName) {
      setError("Tag name cannot be empty");
      return;
    }

    // Check for duplicates (case-insensitive)
    const tagLower = tagName.toLowerCase();
    if (availableTags.some((t) => t.toLowerCase() === tagLower)) {
      setError("Tag already exists");
      return;
    }

    if (tags.some((t) => t.toLowerCase() === tagLower)) {
      setError("Tag is already selected");
      return;
    }

    // If user is admin, try to create tag in tags table via API
    if (isAdmin) {
      try {
        // Get session token for authorization
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError("Not authenticated");
          return;
        }

        const response = await fetch("/api/admin/tags", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ name: tagName }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.code === "DUPLICATE_TAG") {
            setError("Tag already exists");
            return;
          }
          // If tag creation fails (e.g., table doesn't exist), continue anyway
          console.warn("Failed to create tag in tags table:", errorData);
        } else {
          // Tag successfully created in tags table
          console.log("Tag created in tags table:", tagName);
        }
      } catch (err) {
        console.error("Error creating tag:", err);
        // Continue anyway - tag will be saved when place is saved
      }
    }

    // Add to available tags and select it
    const updatedAvailableTags = [...availableTags, tagName].sort((a, b) => a.localeCompare(b));
    const updatedTags = [...tags, tagName];
    
    setAvailableTags(updatedAvailableTags);
    setTags(updatedTags);
    setNewTagName("");
    setAddingTag(false);
    setError(null);
    
    console.log("Tag added:", { tagName, updatedTags });
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
            <h1 className="font-semibold font-fraunces text-[#1F2A1F]" style={{ fontSize: '24px' }}>Categories & Tags</h1>
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
            <h2 className="text-xs font-semibold text-[#6F7A5A] uppercase tracking-wide mb-4">Category</h2>
            <p className="text-xs text-[#6F7A5A] mb-4">
              Select at least one category that best describes your place.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {CATEGORIES.map((cat) => {
                const isSelected = categories.includes(cat);
                const emojiMatch = cat.match(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
                const emoji = emojiMatch ? emojiMatch[0] : "📍";
                const label = cat.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+\s*/u, "").trim();
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      if (isSelected) {
                        setCategories((prev) => prev.filter((c) => c !== cat));
                      } else {
                        setCategories((prev) => [...prev, cat]);
                      }
                    }}
                    className={cx(
                      "relative flex flex-col items-center justify-center px-2 py-4 rounded-xl border-2 transition-all",
                      isSelected
                        ? "border-[#8F9E4F] bg-[#F4F6EF]"
                        : "border-[#ECEEE4] bg-white hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
                    )}
                  >
                    <span className="text-2xl mb-1.5">{emoji}</span>
                    <span className="text-sm font-medium text-[#1F2A1F] text-center leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
            {categories.length === 0 && (
              <p className="mt-3 text-xs text-[#6F7A5A]">Pick what best describes the vibe</p>
            )}
          </div>

          {/* Tags Section */}
          <div>
            <h2 className="text-xs font-semibold text-[#6F7A5A] uppercase tracking-wide mb-4">Tags</h2>
            <p className="text-xs text-[#6F7A5A] mb-4">
              Add tags to help others discover this place. Tags are optional.
            </p>
            {loadingTags ? (
              <div className="text-xs text-[#6F7A5A]">Loading tags...</div>
            ) : (
              <>
                {/* Add new tag */}
                {addingTag ? (
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => {
                        setNewTagName(e.target.value);
                        setError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddNewTag();
                        } else if (e.key === "Escape") {
                          setAddingTag(false);
                          setNewTagName("");
                          setError(null);
                        }
                      }}
                      placeholder="New tag name"
                      autoFocus
                      className="flex-1 px-3 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                    />
                    <button
                      onClick={handleAddNewTag}
                      disabled={!newTagName.trim()}
                      className="px-4 py-2 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setAddingTag(false);
                        setNewTagName("");
                        setError(null);
                      }}
                      className="px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTag(true)}
                    className="mb-4 px-4 py-2 rounded-xl border border-dashed border-[#ECEEE4] bg-[#FAFAF7] text-[#1F2A1F] text-sm font-medium hover:bg-white hover:border-[#8F9E4F] transition flex items-center gap-2"
                  >
                    <Icon name="add" size={16} />
                    Add new tag
                  </button>
                )}

                {/* All tags as a grid (selected + available combined) */}
                {availableTags.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {availableTags.map((tag) => {
                      const isSelected = tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            if (isSelected) {
                              setTags((prev) => prev.filter((t) => t !== tag));
                            } else {
                              setTags((prev) => [...prev, tag]);
                            }
                          }}
                          className={cx(
                            "relative flex flex-col items-center justify-center px-1 py-3 rounded-xl border-2 transition-all",
                            isSelected
                              ? "border-[#8F9E4F] bg-[#F4F6EF]"
                              : "border-[#ECEEE4] bg-white hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
                          )}
                        >
                          <span className="text-lg mb-1">{getTagEmoji(tag)}</span>
                          <span className="text-sm font-medium text-[#1F2A1F] text-center leading-tight line-clamp-2">{stripTagEmoji(tag)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Tags selected but not in availableTags (custom tags) */}
                {tags.filter((t) => !availableTags.includes(t)).length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {tags.filter((t) => !availableTags.includes(t)).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                        className="relative flex flex-col items-center justify-center px-1 py-3 rounded-xl border-2 transition-all border-[#8F9E4F] bg-[#F4F6EF]"
                      >
                        <span className="text-lg mb-1">{getTagEmoji(tag)}</span>
                        <span className="text-sm font-medium text-[#1F2A1F] text-center leading-tight line-clamp-2">{stripTagEmoji(tag)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {availableTags.length === 0 && tags.length === 0 && !addingTag && (
                  <p className="text-xs text-[#6F7A5A]">No tags available yet. Create your first tag above.</p>
                )}
              </>
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

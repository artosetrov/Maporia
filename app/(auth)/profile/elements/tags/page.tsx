"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccessContext } from "../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../lib/access";
import Icon from "../../../../components/Icon";
import { getTagEmoji } from "../../../../constants";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

export default function EditTagsPage() {
  const router = useRouter();
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);

  type TagRow = { name: string; emoji: string | null };
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingEmoji, setEditingEmoji] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagEmoji, setNewTagEmoji] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  const loadTags = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/admin/tags", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load tags");
      }

      const data = await response.json();
      const raw = data.tags || [];
      const normalized: TagRow[] = Array.isArray(raw)
        ? raw.map((t: string | TagRow) =>
            typeof t === "string" ? { name: t, emoji: null } : { name: t.name, emoji: t.emoji ?? null }
          )
        : [];
      setTags(normalized);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load tags";
      console.error("Error loading tags:", err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessLoading) return;
    if (!isAdmin) {
      router.replace("/profile");
      return;
    }
    loadTags();
  }, [accessLoading, isAdmin, router]);

  async function handleAddTag() {
    if (!newTagName.trim()) return;

    const tagName = newTagName.trim();
    const tagEmoji = newTagEmoji.trim() || null;
    if (tags.some((t) => t.name.toLowerCase() === tagName.toLowerCase())) {
      setError("Tag already exists");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch("/api/admin/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: tagName, emoji: tagEmoji }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to add tag");
      }

      await response.json();
      await loadTags();
      setNewTagName("");
      setNewTagEmoji("");
      setAddingTag(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add tag";
      console.error("Error adding tag:", err);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTag(oldName: string, newName: string, newEmoji: string) {
    const tagName = newName.trim();
    const tagEmoji = newEmoji.trim() || null;
    const nameUnchanged = oldName === tagName;
    const currentRow = tags.find((t) => t.name === oldName);
    const emojiUnchanged = currentRow && (currentRow.emoji ?? "") === (tagEmoji ?? "");
    if (nameUnchanged && emojiUnchanged) {
      setEditingTag(null);
      setEditingName("");
      setEditingEmoji("");
      return;
    }

    if (!tagName) {
      setError("Tag name is required");
      return;
    }

    if (tags.some((t) => t.name !== oldName && t.name.toLowerCase() === tagName.toLowerCase())) {
      setError("Tag already exists");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch("/api/admin/tags", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ oldName, newName: tagName, emoji: tagEmoji }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update tag");
      }

      setTags(
        tags
          .map((t) =>
            t.name === oldName ? { name: tagName, emoji: tagEmoji } : t
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingTag(null);
      setEditingName("");
      setEditingEmoji("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update tag";
      console.error("Error updating tag:", err);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTag(tagRow: TagRow) {
    const tagName = tagRow.name;
    if (!confirm(`Delete tag "${tagName}"? This will remove it from all places.`)) {
      return;
    }

    try {
      setDeletingTag(tagName);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`/api/admin/tags?name=${encodeURIComponent(tagName)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete tag");
      }

      setTags(tags.filter((t) => t.name !== tagName));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete tag";
      console.error("Error deleting tag:", err);
      setError(message);
    } finally {
      setDeletingTag(null);
    }
  }

  if (accessLoading || !isAdmin) {
    return (
      <main className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="h-8 w-48 bg-border-light rounded animate-pulse" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-warm-white pb-24 flex flex-col">
      {/* Desktop Header */}
      <div className="hidden lg:block sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/profile?section=elements"
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition flex items-center justify-center"
              aria-label="Back to Elements"
            >
              <Icon name="back" size={20} />
            </Link>
            <h1 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Edit Tags</h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      {/* Mobile Header — как на других внутренних страницах профиля */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-[#ECEEE4]">
        <div className="px-4 pt-safe-top pt-4 pb-4 flex items-center justify-between h-[64px]">
          <Link
            href="/profile?section=elements"
            className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] active:bg-[#ECEEE4] transition-colors flex items-center justify-center flex-shrink-0"
            aria-label="Back to Elements"
          >
            <Icon name="back" size={20} className="text-[#1F2A1F]" />
          </Link>
          <h1 className="font-semibold text-[#1F2A1F] leading-none" style={{ fontSize: "24px" }}>
            Edit Tags
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 pt-[80px] lg:pt-6">
        <p className="text-sm text-[#6F7A5A] mb-6">Manage tags used across all places</p>

        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-[#6F7A5A]">Loading tags...</div>
        ) : (
          <div className="space-y-4">
            {/* Add new tag */}
            {addingTag ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={newTagEmoji}
                  onChange={(e) => {
                    setNewTagEmoji(e.target.value);
                    setError(null);
                  }}
                  placeholder="Emoji (e.g. ☕)"
                  className="w-14 px-2 py-2 rounded-xl border border-[#ECEEE4] bg-white text-lg text-center text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  disabled={saving}
                />
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => {
                    setNewTagName(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddTag();
                    } else if (e.key === "Escape") {
                      setAddingTag(false);
                      setNewTagName("");
                      setNewTagEmoji("");
                    }
                  }}
                  placeholder="Tag name"
                  autoFocus
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                  disabled={saving}
                />
                <button
                  onClick={handleAddTag}
                  disabled={saving || !newTagName.trim()}
                  className="px-4 py-2 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "..." : "Add"}
                </button>
                <button
                  onClick={() => {
                    setAddingTag(false);
                    setNewTagName("");
                    setNewTagEmoji("");
                  }}
                  className="px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingTag(true)}
                className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] text-[#1F2A1F] text-sm font-medium hover:bg-white transition flex items-center justify-center gap-2"
              >
                <Icon name="add" size={16} />
                Add new tag
              </button>
            )}

            {/* Tags list — 3 per row */}
            {tags.length === 0 ? (
              <div className="text-sm text-[#6F7A5A] text-center py-8">No tags yet</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {tags.map((tagRow) => (
                  <div
                    key={tagRow.name}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition min-w-0 ${editingTag === tagRow.name ? "col-span-3" : ""}`}
                  >
                    {editingTag === tagRow.name ? (
                      <>
                        <input
                          type="text"
                          value={editingEmoji}
                          onChange={(e) => setEditingEmoji(e.target.value)}
                          placeholder="Emoji"
                          className="w-12 px-1 py-1 rounded border border-[#ECEEE4] bg-white text-lg text-center text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                          disabled={saving}
                        />
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdateTag(tagRow.name, editingName, editingEmoji);
                            } else if (e.key === "Escape") {
                              setEditingTag(null);
                              setEditingName("");
                              setEditingEmoji("");
                            }
                          }}
                          autoFocus
                          className="flex-1 min-w-0 px-2 py-1 rounded border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                          disabled={saving}
                        />
                        <button
                          onClick={() => handleUpdateTag(tagRow.name, editingName, editingEmoji)}
                          disabled={saving}
                          className="p-1.5 rounded-lg bg-[#8F9E4F] text-white hover:bg-[#556036] transition disabled:opacity-50"
                          aria-label="Save"
                        >
                          <Icon name="check" size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingTag(null);
                            setEditingName("");
                            setEditingEmoji("");
                          }}
                          className="p-1.5 rounded-lg border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition"
                          aria-label="Cancel"
                        >
                          <Icon name="close" size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteTag(tagRow)}
                          disabled={deletingTag === tagRow.name}
                          className="p-1.5 rounded-lg border border-[#C96A5B]/30 bg-[#C96A5B]/10 hover:bg-[#C96A5B]/20 text-[#C96A5B] transition disabled:opacity-50"
                          aria-label="Delete"
                        >
                          <Icon name="delete" size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-base leading-none flex-shrink-0">{getTagEmoji(tagRow.name, tagRow.emoji)}</span>
                        <span className="flex-1 text-sm sm:text-base text-[#1F2A1F] truncate min-w-0">{tagRow.name}</span>
                        <button
                          onClick={() => {
                            setEditingTag(tagRow.name);
                            setEditingName(tagRow.name);
                            setEditingEmoji(tagRow.emoji ?? "");
                          }}
                          className="p-1.5 rounded-lg border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition"
                          aria-label="Edit"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

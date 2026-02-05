"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccessContext } from "../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../lib/access";
import Icon from "../../../../components/Icon";
import { getTagEmoji } from "../../../../constants";

export default function EditTagsPage() {
  const router = useRouter();
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);

  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
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
      setTags(data.tags || []);
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
    if (tags.some((t) => t.toLowerCase() === tagName.toLowerCase())) {
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
        body: JSON.stringify({ name: tagName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to add tag");
      }

      await response.json();
      await loadTags();
      setNewTagName("");
      setAddingTag(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add tag";
      console.error("Error adding tag:", err);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTag(oldName: string, newName: string) {
    if (!newName.trim() || oldName === newName.trim()) {
      setEditingTag(null);
      setEditingValue("");
      return;
    }

    const tagName = newName.trim();
    if (tags.some((t) => t !== oldName && t.toLowerCase() === tagName.toLowerCase())) {
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
        body: JSON.stringify({ oldName, newName: tagName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update tag");
      }

      setTags(tags.map((t) => (t === oldName ? tagName : t)).sort((a, b) => a.localeCompare(b)));
      setEditingTag(null);
      setEditingValue("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update tag";
      console.error("Error updating tag:", err);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTag(tagName: string) {
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

      setTags(tags.filter((t) => t !== tagName));
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
              <div className="flex items-center gap-2">
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
                    }
                  }}
                  placeholder="Tag name"
                  autoFocus
                  className="flex-1 px-3 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
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

            {/* Tags list */}
            {tags.length === 0 ? (
              <div className="text-sm text-[#6F7A5A] text-center py-8">No tags yet</div>
            ) : (
              <div className="space-y-2">
                {tags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition"
                  >
                    {editingTag === tag ? (
                      <>
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdateTag(tag, editingValue);
                            } else if (e.key === "Escape") {
                              setEditingTag(null);
                              setEditingValue("");
                            }
                          }}
                          autoFocus
                          className="flex-1 px-2 py-1 rounded border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                          disabled={saving}
                        />
                        <button
                          onClick={() => handleUpdateTag(tag, editingValue)}
                          disabled={saving}
                          className="p-1.5 rounded-lg bg-[#8F9E4F] text-white hover:bg-[#556036] transition disabled:opacity-50"
                          aria-label="Save"
                        >
                          <Icon name="check" size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingTag(null);
                            setEditingValue("");
                          }}
                          className="p-1.5 rounded-lg border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition"
                          aria-label="Cancel"
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-base leading-none">{getTagEmoji(tag)}</span>
                        <span className="flex-1 text-sm text-[#1F2A1F]">{tag}</span>
                        <button
                          onClick={() => {
                            setEditingTag(tag);
                            setEditingValue(tag);
                          }}
                          className="p-1.5 rounded-lg border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition"
                          aria-label="Edit"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteTag(tag)}
                          disabled={deletingTag === tag}
                          className="p-1.5 rounded-lg border border-[#C96A5B]/30 bg-[#C96A5B]/10 hover:bg-[#C96A5B]/20 text-[#C96A5B] transition disabled:opacity-50"
                          aria-label="Delete"
                        >
                          <Icon name="delete" size={14} />
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

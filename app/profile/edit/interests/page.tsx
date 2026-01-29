"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useUserAccess } from "../../../hooks/useUserAccess";
import Icon from "../../../components/Icon";
import { CATEGORIES } from "../../../constants";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function InterestsEditorPage() {
  const router = useRouter();
  const { loading: accessLoading, user } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [originalCategories, setOriginalCategories] = useState<string[]>([]);
  
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [originalTags, setOriginalTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);

  // Load profile interests
  useEffect(() => {
    if (!user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("favorite_categories, favorite_tags")
        .eq("id", user.id)
        .single();

      if (profileError || !data) {
        router.push(`/profile/edit`);
        return;
      }

      const categories = (data.favorite_categories || []) as string[];
      const tags = (data.favorite_tags || []) as string[];
      
      setSelectedCategories(categories);
      setOriginalCategories(categories);
      setSelectedTags(tags);
      setOriginalTags(tags);
      setLoading(false);
    })();
  }, [user, router, accessLoading]);

  // Load available tags
  useEffect(() => {
    (async () => {
      setTagsLoading(true);
      try {
        const response = await fetch("/api/tags");
        if (response.ok) {
          const data = await response.json();
          setAvailableTags(data.tags || []);
        }
      } catch (err) {
        console.error("Error loading tags:", err);
      } finally {
        setTagsLoading(false);
      }
    })();
  }, []);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
    );
  };

  const hasChanges =
    JSON.stringify(selectedCategories.sort()) !== JSON.stringify(originalCategories.sort()) ||
    JSON.stringify(selectedTags.sort()) !== JSON.stringify(originalTags.sort());

  const canSave = hasChanges && !saving;

  async function handleSave() {
    if (!canSave || !user) return;

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        favorite_categories: selectedCategories.length > 0 ? selectedCategories : null,
        favorite_tags: selectedTags.length > 0 ? selectedTags : null,
      })
      .eq("id", user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message || "Failed to save interests");
      return;
    }

    if (navigator.vibrate) navigator.vibrate(10);
    window.location.href = `/profile/edit`;
  }

  function handleCancel() {
    router.push(`/profile/edit`);
  }

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-32 w-full bg-[#ECEEE4] rounded animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Desktop Header */}
      <div className="hidden lg:block sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleCancel}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h1 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Interests</h1>
            <div className="w-9" /> {/* Spacer */}
          </div>
        </div>
      </div>

      {/* Mobile Custom Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white">
        <div className="px-4 pt-safe-top pt-4 pb-4 flex items-center justify-between h-[64px]">
          <button
            onClick={handleCancel}
            className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] active:bg-[#ECEEE4] transition-colors flex items-center justify-center flex-shrink-0"
            aria-label="Back"
          >
            <Icon name="back" size={20} className="text-[#1F2A1F]" />
          </button>
          <h1 className="font-semibold text-[#1F2A1F] leading-none" style={{ fontSize: '24px' }}>Interests</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 pt-[80px] lg:pt-8">
        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        <div className="space-y-8">
          {/* Categories Section */}
          <div>
            <h2 className="text-base font-semibold text-[#1F2A1F] mb-3">Categories</h2>
            <p className="text-sm text-[#6F7A5A] mb-4">
              Select categories you're interested in to get personalized recommendations
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => {
                const isSelected = selectedCategories.includes(category);
                return (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={cx(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all",
                      isSelected
                        ? "bg-[#8F9E4F] text-white border border-[#8F9E4F]"
                        : "bg-[#FAFAF7] text-[#1F2A1F] border border-[#ECEEE4] hover:border-[#8F9E4F]"
                    )}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags Section */}
          <div>
            <h2 className="text-base font-semibold text-[#1F2A1F] mb-3">Tags</h2>
            <p className="text-sm text-[#6F7A5A] mb-4">
              Select tags that match your interests
            </p>
            {tagsLoading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-9 w-20 bg-[#ECEEE4] rounded-full animate-pulse"
                  />
                ))}
              </div>
            ) : availableTags.length === 0 ? (
              <p className="text-sm text-[#6F7A5A]">No tags available</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cx(
                        "px-4 py-2 rounded-full text-sm font-medium transition-all",
                        isSelected
                          ? "bg-[#8F9E4F] text-white border border-[#8F9E4F]"
                          : "bg-[#FAFAF7] text-[#1F2A1F] border border-[#ECEEE4] hover:border-[#8F9E4F]"
                      )}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
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

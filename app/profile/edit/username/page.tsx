"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useUserAccess } from "../../../hooks/useUserAccess";
import Icon from "../../../components/Icon";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function UsernameEditorPage() {
  const router = useRouter();
  const { loading: accessLoading, user } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Load profile
  useEffect(() => {
    if (!user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      if (profileError || !data) {
        router.push(`/profile/edit`);
        return;
      }

      const currentUsername = data.username || "";
      setUsername(currentUsername);
      setOriginalUsername(currentUsername);
      setLoading(false);
    })();
  }, [user, router, accessLoading]);

  // Check username availability
  async function checkUsernameAvailability(value: string): Promise<boolean> {
    if (!value.trim() || value.trim() === originalUsername) return true;
    
    setChecking(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", value.trim())
      .neq("id", user?.id || "")
      .maybeSingle();
    
    setChecking(false);
    return !data && !error;
  }

  const hasChanges = username.trim() !== originalUsername.trim();
  const isValid = username.trim().length >= 3 && username.trim().length <= 30 && /^[a-zA-Z0-9_]+$/.test(username.trim());
  const [isAvailable, setIsAvailable] = useState(true);
  const canSave = hasChanges && isValid && isAvailable && !saving && !checking;

  // Check availability when username changes
  useEffect(() => {
    if (!username.trim() || username.trim() === originalUsername) {
      setIsAvailable(true);
      return;
    }

    if (isValid) {
      checkUsernameAvailability(username).then(setIsAvailable);
    } else {
      setIsAvailable(true);
    }
  }, [username, originalUsername, isValid]);

  async function handleSave() {
    if (!canSave || !user) return;

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ username: username.trim() || null })
      .eq("id", user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message || "Failed to save username");
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
            <div className="h-10 w-full bg-[#ECEEE4] rounded animate-pulse" />
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
            <h1 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Username</h1>
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

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6F7A5A]">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                  setUsername(value);
                  setError(null);
                }}
                placeholder="username"
                className={cx(
                  "w-full rounded-xl border pl-8 pr-4 py-4 text-lg font-medium text-[#1F2A1F] placeholder:text-[#A8B096] outline-none transition",
                  (isValid || username.length === 0) && isAvailable
                    ? "border-[#ECEEE4] bg-[#FAFAF7] focus:bg-white focus:border-[#8F9E4F]"
                    : "border-red-300 bg-red-50/50 focus:bg-white focus:border-red-400"
                )}
                maxLength={30}
                autoFocus
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className={cx(
                "text-xs",
                (isValid || username.length === 0) && isAvailable ? "text-[#6F7A5A]" : "text-red-600"
              )}>
                {checking
                  ? "Checking availability..."
                  : !isAvailable && username.trim() !== originalUsername
                  ? "Username is already taken"
                  : username.length < 3 && username.length > 0
                  ? "Username must be at least 3 characters"
                  : !/^[a-zA-Z0-9_]+$/.test(username.trim()) && username.length > 0
                  ? "Username can only contain letters, numbers, and underscores"
                  : "Choose a unique username"}
              </p>
              <span className="text-xs text-[#6F7A5A]">
                {username.length}/30
              </span>
            </div>
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

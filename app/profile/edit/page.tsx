"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useUserAccess } from "../../hooks/useUserAccess";
import Icon from "../../components/Icon";
import UnifiedGoogleImportField from "../../components/UnifiedGoogleImportField";
import type { Profile } from "../../types";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

async function handleGoogleImport(data: any, profile: Profile | null, setProfile: (p: Profile) => void, user: any) {
  // Update profile with imported data
  const updates: any = {
    display_name: data.name || data.business_name || profile?.display_name || null,
    address: data.formatted_address || data.address || profile?.address || null,
    website: data.website || profile?.website || null,
    phone: data.phone || profile?.phone || null,
    google_place_id: data.place_id || data.google_place_id || null,
    google_maps_url: data.google_maps_url || null,
    google_rating: data.rating || null,
    google_reviews_count: data.reviews_count || data.user_ratings_total || null,
    google_opening_hours: data.opening_hours || null,
  };

  // Only update bio if it's currently empty
  if (!profile?.bio && data.types && data.types.length > 0) {
    const city = data.city || data.formatted_address?.split(",").pop()?.trim() || "";
    const category = data.category || data.types[0] || "";
    updates.bio = `${category}${city ? ` in ${city}` : ""}`;
  }

  // Save to database
  const { error: updateError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (updateError) {
    throw new Error(updateError.message || "Failed to save imported data");
  }

  // Update local state
  setProfile({
    ...profile!,
    ...updates,
  });
}

export default function ProfileEditorHub() {
  const router = useRouter();
  const { loading: accessLoading, user, access } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load profile data
  useEffect(() => {
    if (!user || accessLoading) return;

    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, role, subscription_status, is_admin, favorite_categories, favorite_tags")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (profileError || !profileData) {
        setError("Profile not found");
        setLoading(false);
        return;
      }

      setProfile(profileData as Profile);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [user, accessLoading]);

  // Reload data when page becomes visible (returning from editor)
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Reload data when page becomes visible
        (async () => {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id, username, display_name, bio, avatar_url, role, subscription_status, is_admin, favorite_categories, favorite_tags")
            .eq("id", user.id)
            .single();

          if (profileData) {
            setProfile(profileData as Profile);
          }
        })();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
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

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-[#C96A5B] mb-2">{error || "Profile not found"}</div>
          <button
            onClick={() => router.push("/profile")}
            className="text-sm text-[#8F9E4F] underline"
          >
            Back to profile
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-24">
      {/* Desktop Top App Bar */}
      <div className="hidden lg:block sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push("/profile")}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <h1 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Profile editor</h1>
            <div className="w-9" /> {/* Spacer */}
          </div>
        </div>
      </div>

      {/* Mobile Custom Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white">
        <div className="px-4 pt-safe-top pt-4 pb-4 flex items-center justify-between h-[64px]">
          <button
            onClick={() => router.push("/profile")}
            className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] active:bg-[#ECEEE4] transition-colors flex items-center justify-center flex-shrink-0"
            aria-label="Back"
          >
            <Icon name="back" size={20} className="text-[#1F2A1F]" />
          </button>
          <h1 className="font-semibold text-[#1F2A1F] leading-none" style={{ fontSize: '24px' }}>Profile editor</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pt-[80px] lg:pt-6">
        <div className="space-y-4">
            {/* Google Import Card */}
            {user && (
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
                <UnifiedGoogleImportField
                  userId={user.id}
                  context="profile"
                  onImportSuccess={(data) => handleGoogleImport(data, profile, setProfile, user)}
                />
              </div>
            )}

          {/* Avatar Card */}
          <Link
            href={`/profile/edit/avatar`}
            className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="w-16 h-16 rounded-full bg-[#FAFAF7] border-2 border-[#ECEEE4] overflow-hidden flex-shrink-0">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-semibold text-[#8F9E4F]">
                      {profile.display_name?.[0]?.toUpperCase() || profile.username?.[0]?.toUpperCase() || "U"}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[#1F2A1F] mb-1">Profile photo</h3>
                  <p className="text-sm text-[#6F7A5A]">
                    {profile.avatar_url ? "Change photo" : "Add a photo"}
                  </p>
                </div>
              </div>
              <Icon name="forward" size={20} className="text-[#6F7A5A]" />
            </div>
          </Link>

          {/* Display Name Card */}
          <Link
            href={`/profile/edit/name`}
            className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-[#1F2A1F] mb-1">Display name</h3>
                <p className="text-sm text-[#6F7A5A] line-clamp-1">
                  {profile.display_name || "No name set"}
                </p>
              </div>
              <Icon name="forward" size={20} className="text-[#6F7A5A]" />
            </div>
          </Link>

          {/* Username Card */}
          <Link
            href={`/profile/edit/username`}
            className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-[#1F2A1F] mb-1">Username</h3>
                <p className="text-sm text-[#6F7A5A] line-clamp-1">
                  {profile.username || "No username set"}
                </p>
              </div>
              <Icon name="forward" size={20} className="text-[#6F7A5A]" />
            </div>
          </Link>

          {/* Bio Card */}
          <Link
            href={`/profile/edit/bio`}
            className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-[#1F2A1F] mb-1">Bio</h3>
                <p className="text-sm text-[#6F7A5A] line-clamp-2">
                  {profile.bio || "No bio yet"}
                </p>
              </div>
              <Icon name="forward" size={20} className="text-[#6F7A5A]" />
            </div>
          </Link>

          {/* Interests Card */}
          <Link
            href={`/profile/edit/interests`}
            className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-[#1F2A1F] mb-1">Interests</h3>
                <p className="text-sm text-[#6F7A5A] line-clamp-1">
                  {profile.favorite_categories && profile.favorite_categories.length > 0
                    ? `${profile.favorite_categories.length} categories, ${(profile.favorite_tags || []).length} tags`
                    : "No interests set"}
                </p>
              </div>
              <Icon name="forward" size={20} className="text-[#6F7A5A]" />
            </div>
          </Link>
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#ECEEE4] pb-safe-bottom">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="flex-1 rounded-xl border border-[#ECEEE4] bg-white px-4 py-3 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
            >
              Cancel
            </button>
            <Link
              href={`/profile`}
              className="flex-1 rounded-xl bg-[#8F9E4F] text-white px-4 py-3 text-sm font-medium text-center hover:bg-[#556036] transition"
            >
              Done
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

// Removed force-dynamic — page has no searchParams/cookies/headers and can prerender shell

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../../lib/supabase";
import { useUserAccessContext } from "../../../contexts/UserAccessContext";
import Icon from "../../../components/Icon";
import type { Profile } from "../../../types";
import { getTagEmoji, stripTagEmoji } from "../../../constants";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

export default function ProfileEditorHub() {
  const router = useRouter();
  const { loading: accessLoading, user } = useUserAccessContext();
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
    <SectionErrorBoundary>
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
          {/* Avatar Card */}
          <Link
            href={`/profile/edit/avatar`}
            className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="w-16 h-16 rounded-full bg-[#FAFAF7] border-2 border-[#ECEEE4] overflow-hidden flex-shrink-0">
                  {profile.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt=""
                      width={64}
                      height={64}
                      sizes="64px"
                      className="h-full w-full object-cover"
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

          {/* Email Card */}
          <Link
            href="/settings/email"
            className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#1F2A1F] mb-1">Email</h3>
                <p className="text-sm text-[#6F7A5A] truncate">
                  {user?.email || "Not set"}
                </p>
              </div>
              <Icon name="forward" size={20} className="text-[#6F7A5A] flex-shrink-0" />
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#1F2A1F] mb-2">Interests</h3>
                {profile.favorite_categories?.length || profile.favorite_tags?.length ? (
                  <div className="space-y-2">
                    {profile.favorite_categories && profile.favorite_categories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.favorite_categories.map((cat) => (
                          <span
                            key={cat}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FAFAF7] text-[#1F2A1F] border border-[#ECEEE4]"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}
                    {profile.favorite_tags && profile.favorite_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.favorite_tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-[#FAFAF7] text-[#1F2A1F] border border-[#ECEEE4]"
                          >
                            <span className="leading-none">{getTagEmoji(tag)}</span>
                            <span className="ml-1">{stripTagEmoji(tag)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[#6F7A5A]">No interests set</p>
                )}
              </div>
              <Icon name="forward" size={20} className="text-[#6F7A5A] flex-shrink-0" />
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
    </SectionErrorBoundary>
  );
}

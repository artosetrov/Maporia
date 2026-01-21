"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { supabase } from "../lib/supabase";

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/auth");
        return;
      }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? null);

      // Load profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", data.user.id)
        .maybeSingle();
      
      if (profile?.display_name) {
        setUserDisplayName(profile.display_name);
      } else {
        setUserDisplayName(data.user.email?.split("@")[0] || null);
      }
      
      if (profile?.avatar_url) {
        setUserAvatar(profile.avatar_url);
      }
    })();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <TopBar
        showSearchBar={true}
        searchValue={""}
        onSearchChange={(value) => {
          const params = new URLSearchParams();
          if (value) params.set("q", value);
          router.push(`/map?${params.toString()}`);
        }}
        selectedCity={null}
        onCityChange={(city) => {
          const params = new URLSearchParams();
          if (city) params.set("city", city);
          router.push(`/map?${params.toString()}`);
        }}
        onFiltersClick={() => router.push("/map")}
        activeFiltersCount={0}
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
      />

      <div className="flex-1 pt-[80px] pb-20">
        <div className="mx-auto max-w-md px-6">
          <div className="space-y-6">
            {/* Account Section */}
            <div>
              <div className="text-xs font-medium text-[#6F7A5A] mb-3 uppercase tracking-wide">Account</div>
              <div className="rounded-2xl bg-white border border-[#ECEEE4] p-5 space-y-3">
                <button
                  onClick={() => router.push("/profile")}
                  className="w-full text-left text-sm text-[#1F2A1F] hover:text-[#8F9E4F] transition-colors"
                >
                  Edit profile
                </button>
              </div>
            </div>

            {/* Preferences Section */}
            <div>
              <div className="text-xs font-medium text-[#6F7A5A] mb-3 uppercase tracking-wide">Preferences</div>
              <div className="rounded-2xl bg-white border border-[#ECEEE4] p-5 space-y-3">
                <div className="text-sm text-[#A8B096]">More options coming soon</div>
              </div>
            </div>

            {/* Logout */}
            <div className="pt-4">
              <button
                onClick={handleLogout}
                className="w-full rounded-xl bg-white border border-[#ECEEE4] text-[#C96A5B] px-5 py-3 text-sm font-medium hover:bg-[#FAFAF7] transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}

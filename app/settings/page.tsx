"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { supabase } from "../lib/supabase";
import { DEFAULT_CITY } from "../constants";

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
    <main className="min-h-screen bg-[#faf9f7] flex flex-col">
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
        <div className="mx-auto max-w-md px-4">
          <div className="space-y-4">
            {/* Account Section */}
            <div>
              <div className="text-xs font-medium text-[#6b7d47] mb-3">Account</div>
              <div className="rounded-2xl bg-white border border-[#6b7d47]/10 p-4 space-y-3">
                <button
                  onClick={() => router.push("/profile")}
                  className="w-full text-left text-sm text-[#2d2d2d] hover:text-[#6b7d47] transition"
                >
                  Edit profile
                </button>
              </div>
            </div>

            {/* Preferences Section */}
            <div>
              <div className="text-xs font-medium text-[#6b7d47] mb-3">Preferences</div>
              <div className="rounded-2xl bg-white border border-[#6b7d47]/10 p-4 space-y-3">
                <div className="text-sm text-[#6b7d47]/60">More options coming soon</div>
              </div>
            </div>

            {/* Logout */}
            <div className="pt-4">
              <button
                onClick={handleLogout}
                className="w-full rounded-xl bg-white border border-red-200 text-red-600 px-4 py-3 text-sm font-medium hover:bg-red-50 transition"
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

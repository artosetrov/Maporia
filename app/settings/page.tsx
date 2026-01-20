"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { supabase } from "../lib/supabase";

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/auth");
        return;
      }
      setUserId(data.user.id);
    })();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <main className="min-h-screen bg-[#faf9f7] flex flex-col">
      <TopBar
        backHref="/profile"
        center={
          <div className="text-sm font-semibold text-[#2d2d2d]">Settings</div>
        }
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

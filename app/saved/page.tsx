"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import PlaceCard from "../components/PlaceCard";

type Place = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SavedPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/auth");
        return;
      }
      setUserId(data.user.id);
      await loadSavedPlaces(data.user.id);
    })();
  }, [router]);

  async function loadSavedPlaces(userId: string) {
    setLoading(true);
    const { data: reactions } = await supabase
      .from("reactions")
      .select("place_id")
      .eq("user_id", userId)
      .eq("reaction", "like");

    if (reactions && reactions.length > 0) {
      const placeIds = reactions.map((r) => r.place_id);
      const { data, error } = await supabase
        .from("places")
        .select("id,title,city,country,address,cover_url")
        .in("id", placeIds)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setPlaces(data as Place[]);
      }
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#faf9f7] flex flex-col">
      <TopBar title="Saved" />

      <div className="flex-1 pt-[80px] pb-20">
        <div className="mx-auto max-w-7xl px-4">
          {loading ? (
            <div className="text-center py-16">
              <div className="text-sm text-[#6b7d47]/60">Loading…</div>
            </div>
          ) : places.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-sm text-[#6b7d47]/60 mb-1">No saved places</div>
              <div className="text-xs text-[#6b7d47]/50">Saved places appear here</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {places.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}

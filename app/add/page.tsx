"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AddPlacePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Check authentication
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) {
        router.push("/auth");
        return;
      }

      // Create empty place and redirect to editor
      setCreating(true);
      try {
        const payload = {
          title: "", // Empty string instead of null (title has NOT NULL constraint)
          description: null,
          city: null,
          address: null,
          lat: null,
          lng: null,
          categories: null,
          link: null,
          access_level: "public",
          is_hidden: true, // Hidden by default until all required fields are filled
          created_by: u.id,
        };

        const { data: placeData, error: createError } = await supabase
          .from("places")
          .insert(payload)
          .select("id")
          .single();

        if (createError) {
          console.error("Error creating place:", createError);
          const errorMessage = createError.message || createError.code || createError.details || createError.hint || "Failed to create place. Check console for details.";
          setError(errorMessage);
          setCreating(false);
          return;
        }

        if (!placeData || !placeData.id) {
          console.error("No data returned from create");
          setError("Failed to create place. No ID returned. Check RLS policies.");
          setCreating(false);
          return;
        }

        // Redirect to editor
        window.location.href = `/places/${placeData.id}/edit`;
      } catch (err) {
        console.error("Exception creating place:", err);
        console.error("Exception details:", JSON.stringify(err, null, 2));
        setError(err instanceof Error ? err.message : "Failed to create place");
        setCreating(false);
      }
    })();
  }, [router]);

  if (creating) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-[#6F7A5A] mb-2">Creating place...</div>
          {error && (
            <div className="text-sm text-red-600 mt-2">{error}</div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7]">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="bg-white rounded-2xl p-6 border border-gray-200 space-y-4">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
        </div>
        {error && (
          <div className="text-sm text-red-600 mt-2">{error}</div>
        )}
      </div>
    </main>
  );
}

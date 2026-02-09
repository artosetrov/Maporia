"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { useUserAccessContext } from "../../contexts/UserAccessContext";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";
import { canUserAddPlace } from "../../lib/access";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

type PlacesRow = Database["public"]["Tables"]["places"]["Row"];
type PlaceIdResult = { data: Pick<PlacesRow, "id"> | null; error: PostgrestError | null };

export default function AddPlacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { redirectToAuth } = useAuthRedirect();
  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessLoading) return;

    (async () => {
      // Check authentication
      if (!user) {
        redirectToAuth();
        return;
      }

      // Check if user can add places (only Premium and Admin)
      if (!canUserAddPlace(access)) {
        setError("Only Premium users can create places. Please upgrade to Premium to add new places.");
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
          created_by: user.id,
        };

        // Return type explicit (PlaceIdResult); TODO: type after schema alignment
        const result = (await supabase
          .from("places")
          // @ts-expect-error - client infers Insert as never; payload matches Database['public']['Tables']['places']['Insert']
          .insert(payload)
          .select("id")
          .single()) as PlaceIdResult;
        const placeData = result.data;
        const createError = result.error;

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

        // Redirect to editor, passing returnTo so Cancel can send user back
        const returnTo = searchParams.get("returnTo") || "/profile";
        const editUrl = `/places/${placeData.id}/edit?returnTo=${encodeURIComponent(returnTo)}`;
        window.location.href = editUrl;
      } catch (err) {
        console.error("Exception creating place:", err);
        console.error("Exception details:", JSON.stringify(err, null, 2));
        setError(err instanceof Error ? err.message : "Failed to create place");
        setCreating(false);
      }
    })();
  }, [router, user, access, accessLoading, searchParams]);

  if (creating) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-[#6F7A5A] mb-2">Creating place...</div>
          {error && (
            <div className="text-sm text-[#C96A5B] mt-2">{error}</div>
          )}
        </div>
      </main>
    );
  }

  if (accessLoading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-[#6F7A5A] mb-2">Loading...</div>
        </div>
      </main>
    );
  }

  if (error && !canUserAddPlace(access)) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="max-w-md mx-auto px-6 text-center">
          <div className="text-lg font-semibold text-[#1F2A1F] mb-2">Premium Required</div>
          <div className="text-sm text-[#6F7A5A] mb-4">{error}</div>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-[#1F2A1F] text-white rounded-lg hover:bg-[#2A3A2A] transition-colors"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7]">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
        <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
          <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="h-10 w-full bg-[#ECEEE4] rounded animate-pulse" />
        </div>
        {error && (
          <div className="text-sm text-[#C96A5B] mt-2">{error}</div>
        )}
      </div>
    </main>
  );
}

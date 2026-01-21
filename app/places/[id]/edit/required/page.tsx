"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase";
import { useUserAccess } from "../../../../hooks/useUserAccess";

type RequiredStep = {
  id: string;
  label: string;
  completed: boolean;
  route?: string;
};

export default function RequiredStepsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user } = useUserAccess(true, false);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);

  // Load place data
  useEffect(() => {
    if (!placeId || !user) return;

    (async () => {
      setLoading(true);

      const { data: placeData, error: placeError } = await supabase
        .from("places")
        .select("*")
        .eq("id", placeId)
        .single();

      if (placeError || !placeData) {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      if (placeData.created_by !== user.id) {
        router.push(`/id/${placeId}`);
        return;
      }

      setPlace(placeData);

      // Load photos
      const { data: photosData } = await supabase
        .from("place_photos")
        .select("url")
        .eq("place_id", placeId)
        .order("sort", { ascending: true });

      if (photosData) {
        const photoUrls = photosData
          .map((p) => p.url)
          .filter((u: string | null): u is string => typeof u === "string" && u.length > 0);
        setPhotos(photoUrls);
      } else if (placeData.cover_url) {
        setPhotos([placeData.cover_url]);
      }

      setLoading(false);
    })();
  }, [placeId, user, router]);

  const requiredSteps = useMemo<RequiredStep[]>(() => {
    if (!place) return [];

    return [
      {
        id: "cover",
        label: "Add a cover photo",
        completed: photos.length > 0,
        route: `/places/${placeId}/edit/photos`,
      },
      {
        id: "title",
        label: "Add a title",
        completed: !!(place.title && place.title.trim().length > 0),
        route: `/places/${placeId}/edit/title`,
      },
      {
        id: "category",
        label: "Select a category",
        completed: !!(place.categories && place.categories.length > 0),
        route: `/places/${placeId}/edit/categories`,
      },
      {
        id: "location",
        label: "Set location",
        completed: !!(place.lat && place.lng),
        route: `/places/${placeId}/edit/location`,
      },
      {
        id: "description",
        label: "Add description",
        completed: !!(place.description && place.description.trim().length > 0),
        route: `/places/${placeId}/edit/description`,
      },
    ];
  }, [place, photos, placeId]);

  const incompleteSteps = requiredSteps.filter((s) => !s.completed);
  const completedCount = requiredSteps.filter((s) => s.completed).length;

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-sm text-[#6F7A5A]">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push(`/places/${placeId}/edit`)}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-[#1F2A1F]">Required steps</h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <div className="text-sm text-[#6F7A5A] mb-1">
            {completedCount} of {requiredSteps.length} completed
          </div>
          <div className="h-2 bg-[#ECEEE4] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#8F9E4F] transition-all"
              style={{ width: `${(completedCount / requiredSteps.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {requiredSteps.map((step) => (
            <Link
              key={step.id}
              href={step.route || "#"}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {step.completed ? (
                    <div className="w-6 h-6 rounded-full bg-[#7FA35C] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-[#ECEEE4] flex-shrink-0" />
                  )}
                  <span className={step.completed ? "text-[#6F7A5A] line-through" : "text-[#1F2A1F] font-medium"}>
                    {step.label}
                  </span>
                </div>
                <svg className="w-5 h-5 text-[#6F7A5A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {incompleteSteps.length === 0 && (
          <div className="mt-6 rounded-2xl border border-[#7FA35C] bg-[#7FA35C]/10 p-5 text-center">
            <p className="text-sm font-medium text-[#7FA35C]">
              🎉 All required steps completed! Your place is ready to publish.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

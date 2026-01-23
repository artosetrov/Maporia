"use client";

/**
 * ============================================
 * SCHEMA DISCOVERY - EXISTING PLACE FIELDS
 * ============================================
 * 
 * Based on codebase analysis, the `places` table has:
 * 
 * Core Fields:
 * - id: string
 * - created_by: string (owner/user_id)
 * - title: string | null
 * - description: string | null
 * - city: string | null
 * - country: string | null (nullable, not commonly used)
 * - address: string | null
 * - google_place_id: string | null
 * - lat: number | null
 * - lng: number | null
 * - link: string | null (website/contact link)
 * - categories: string[] | null (array of category strings)
 * - tags: string[] | null (array of tag strings, if exists)
 * - cover_url: string | null (legacy, single cover photo)
 * - photo_urls: unknown[] | null (legacy, array of photo URLs)
 * - created_at: string (timestamp)
 * 
 * Photos Storage:
 * - Separate table: `place_photos`
 *   - place_id: string
 *   - user_id: string
 *   - url: string
 *   - sort: number (order)
 *   - is_cover: boolean (first photo is cover)
 * 
 * Premium/Access Fields:
 * - TODO: No premium field found in schema
 * - Potential fields (not confirmed): is_premium, premium_only, access_level, visibility
 * - For now, accessLevel stored in draft state only (from v2 implementation)
 * 
 * Guide/Arrival Fields:
 * - TODO: No guide-specific fields found (tips, arrival instructions, etc.)
 * - "Guide" tab will be disabled/coming soon
 */

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { useUserAccess } from "../../../hooks/useUserAccess";
import { isUserAdmin } from "../../../lib/access";
import { CATEGORIES } from "../../../constants";
import Icon from "../../../components/Icon";
import UnifiedGoogleImportField from "../../../components/UnifiedGoogleImportField";
import { resolveCity } from "../../../lib/cityResolver";

type Place = {
  id: string;
  created_by: string;
  title: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  link: string | null;
  categories: string[] | null;
  tags: string[] | null;
  cover_url: string | null;
  created_at: string;
  is_hidden?: boolean | null;
  // Premium/Access fields
  access_level?: string | null; // Primary field: 'public' | 'premium'
  // Legacy fields (for backward compatibility)
  is_premium?: boolean | null;
  premium_only?: boolean | null;
  visibility?: string | null;
};

type PlacePhoto = {
  url: string;
  sort: number;
  is_cover: boolean;
};

type RequiredStep = {
  id: string;
  label: string;
  completed: boolean;
  route?: string;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function PlaceEditorHub() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const { loading: accessLoading, user, access } = useUserAccess(true, false);
  const isAdmin = isUserAdmin(access);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<Place | null>(null);
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const autoVisibilityEnabledRef = useRef(false); // Track if auto-visibility was already enabled

  // Load place data
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);

      // Load place
      const { data: placeData, error: placeError } = await supabase
        .from("places")
        .select("*")
        .eq("id", placeId)
        .single();

      if (!mounted) return;

      if (placeError || !placeData) {
        setError("Place not found");
        setLoading(false);
        return;
      }

      const placeItem = placeData as Place;

      // Check ownership or admin status
      const currentIsAdmin = isUserAdmin(access);
      const isOwner = placeItem.created_by === user.id;
      if (!isOwner && !currentIsAdmin) {
        router.push(`/id/${placeId}`);
        return;
      }

      setPlace(placeItem);
      // Check if place is hidden (try multiple possible fields)
      setIsHidden(
        placeItem.is_hidden === true ||
          placeItem.visibility === "hidden" ||
          placeItem.visibility === "private"
      );

      // Load photos
      const { data: photosData, error: photosError } = await supabase
        .from("place_photos")
        .select("url, sort, is_cover")
        .eq("place_id", placeId)
        .order("sort", { ascending: true });

      if (!mounted) return;

      if (!photosError && photosData) {
        const photoUrls = photosData
          .map((p) => p.url)
          .filter((u: string | null): u is string => typeof u === "string" && u.length > 0);
        
        setPhotos(
          photoUrls.map((url, i) => ({
            url,
            sort: i,
            is_cover: i === 0,
          }))
        );
      } else if (placeItem.cover_url) {
        // Fallback to legacy cover_url
        setPhotos([{ url: placeItem.cover_url, sort: 0, is_cover: true }]);
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [placeId, user, router, access, accessLoading]);

  // Reload data when page becomes visible (returning from editor)
  useEffect(() => {
    if (!placeId || !user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Reload data when page becomes visible
        (async () => {
          const { data: placeData } = await supabase
            .from("places")
            .select("*")
            .eq("id", placeId)
            .single();

          if (placeData) {
            setPlace(placeData as Place);
          }
        })();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [placeId, user]);

  async function handleToggleVisibility() {
    if (!placeId || !user) return;

    setHiding(true);
    setError(null);

    const newHiddenState = !isHidden;

    // Try multiple possible field names
    const payload: any = {
      is_hidden: newHiddenState,
      visibility: newHiddenState ? "hidden" : "public",
    };

    // Admin can update any place, owner can update their own
    const currentIsAdmin = isUserAdmin(access);
    const updateQuery = supabase.from("places").update(payload).eq("id", placeId);

    // If not admin, add ownership check
    if (!currentIsAdmin) {
      updateQuery.eq("created_by", user.id);
    }

    const { error: updateError } = await updateQuery.select();

    setHiding(false);

    if (updateError) {
      console.error("Update error:", updateError);
      setError(updateError.message || "Failed to update visibility");
      return;
    }

    setIsHidden(newHiddenState);
    setPlace((prev) =>
      prev
        ? {
            ...prev,
            is_hidden: newHiddenState,
            visibility: newHiddenState ? "hidden" : "public",
          }
        : prev
    );

    // Reset auto-visibility ref when manually hiding, so it can auto-enable again if all fields are filled
    if (newHiddenState) {
      autoVisibilityEnabledRef.current = false;
    }

    if (navigator.vibrate) navigator.vibrate(10);
  }

  async function handleDelete() {
    if (!placeId || !user || !place) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${place.title || "this place"}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      // Step 1: Get all photos to delete from storage
      const { data: photosData } = await supabase
        .from("place_photos")
        .select("url")
        .eq("place_id", placeId);

      // Step 2: Delete photos from storage (if they exist in storage bucket)
      if (photosData && photosData.length > 0) {
        const photoUrls = photosData.map((p) => p.url).filter(Boolean) as string[];
        const bucketName = "place-photos";

        for (const url of photoUrls) {
          try {
            // Only delete if it's a Supabase storage URL, not external URL
            if (url.includes("supabase.co/storage")) {
              // Format: .../storage/v1/object/public/place-photos/<path>
              const storageMatch = url.match(/\/place-photos\/(.+)$/);
              if (storageMatch && storageMatch[1]) {
                const filePath = storageMatch[1];
                const { error: storageError } = await supabase.storage
                  .from(bucketName)
                  .remove([filePath]);

                if (storageError) {
                  console.warn(`Failed to delete photo from storage: ${filePath}`, storageError);
                }
              }
            }
          } catch (storageErr) {
            console.warn("Error deleting photo from storage:", storageErr);
          }
        }
      }

      // Step 3: Delete related data from database
      const [photosResult, commentsResult, reactionsResult] = await Promise.all([
        supabase.from("place_photos").delete().eq("place_id", placeId),
        supabase.from("comments").delete().eq("place_id", placeId),
        supabase.from("reactions").delete().eq("place_id", placeId),
      ]);

      if (photosResult.error) console.warn("Error deleting place_photos:", photosResult.error);
      if (commentsResult.error) console.warn("Error deleting comments:", commentsResult.error);
      if (reactionsResult.error) console.warn("Error deleting reactions:", reactionsResult.error);

      // Step 4: Delete the place itself (admin can delete any place, owner can delete their own)
      const currentIsAdmin = isUserAdmin(access);
      const deleteQuery = supabase.from("places").delete().eq("id", placeId);

      if (!currentIsAdmin) {
        deleteQuery.eq("created_by", user.id);
      }

      const { error: deleteError } = await deleteQuery;

      if (deleteError) {
        console.error("Delete error:", deleteError);
        setError(deleteError.message || "Failed to delete place");
        setDeleting(false);
        return;
      }

      router.push("/profile");
    } catch (err) {
      console.error("Exception deleting place:", err);
      setError(err instanceof Error ? err.message : "Failed to delete place");
    } finally {
      setDeleting(false);
    }
  }

  // Calculate required steps
  const requiredSteps = useMemo<RequiredStep[]>(() => {
    if (!place) return [];

    const steps: RequiredStep[] = [];

    // Cover photo required
    steps.push({
      id: "cover",
      label: "Add a cover photo",
      completed: photos.length > 0,
      route: `/places/${placeId}/edit/photos`,
    });

    // Title required
    steps.push({
      id: "title",
      label: "Add a title",
      completed: !!(place.title && place.title.trim().length > 0),
      route: `/places/${placeId}/edit/title`,
    });

    // Category required
    steps.push({
      id: "category",
      label: "Select a category",
      completed: !!(place.categories && place.categories.length > 0),
      route: `/places/${placeId}/edit/categories`,
    });

    // Location required (lat/lng)
    steps.push({
      id: "location",
      label: "Set location",
      completed: !!(place.lat && place.lng),
      route: `/places/${placeId}/edit/location`,
    });

    // Description (optional but recommended)
    steps.push({
      id: "description",
      label: "Add description",
      completed: !!(place.description && place.description.trim().length > 0),
      route: `/places/${placeId}/edit/description`,
    });

    return steps;
  }, [place, photos, placeId]);

  const incompleteSteps = requiredSteps.filter((s) => !s.completed);
  const completionPercentage = requiredSteps.length > 0 
    ? Math.round((requiredSteps.filter((s) => s.completed).length / requiredSteps.length) * 100)
    : 100;

  // Check if all required fields are filled (excluding description which is optional)
  const allRequiredFieldsFilled = useMemo(() => {
    if (!place) return false;
    // Required fields: cover photo, title, category, location
    return (
      photos.length > 0 &&
      !!(place.title && place.title.trim().length > 0) &&
      !!(place.categories && place.categories.length > 0) &&
      !!(place.lat && place.lng)
    );
  }, [place, photos]);

  // Automatically enable Visibility when all required fields are filled
  useEffect(() => {
    if (!placeId || !user || !place || !allRequiredFieldsFilled || !isHidden) {
      // Reset ref when conditions are not met
      if (!allRequiredFieldsFilled || !isHidden) {
        autoVisibilityEnabledRef.current = false;
      }
      return;
    }
    
    // Prevent duplicate requests
    if (autoVisibilityEnabledRef.current) return;
    
    // Only auto-enable if currently hidden
    autoVisibilityEnabledRef.current = true;
    (async () => {
      const currentIsAdmin = isUserAdmin(access);
      const updateQuery = supabase
        .from("places")
        .update({ is_hidden: false, visibility: "public" })
        .eq("id", placeId);

      if (!currentIsAdmin) {
        updateQuery.eq("created_by", user.id);
      }

      const { error: updateError } = await updateQuery.select();

      if (!updateError) {
        setIsHidden(false);
        setPlace((prev) =>
          prev
            ? {
                ...prev,
                is_hidden: false,
                visibility: "public",
              }
            : prev
        );
      } else {
        // Reset ref on error so it can retry
        autoVisibilityEnabledRef.current = false;
      }
    })();
  }, [placeId, user, place, allRequiredFieldsFilled, isHidden, access]);

  // Determine if this is a new place (no title or empty title)
  const isNewPlace = !place || !place.title || place.title.trim().length === 0;

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

  if (error || !place) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-[#C96A5B] mb-2">{error || "Place not found"}</div>
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
      {/* Top App Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 relative">
            <button
              onClick={() => router.push("/profile")}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 font-semibold font-fraunces text-[#1F2A1F]" style={{ fontSize: '24px' }}>
              {isNewPlace ? "Create new place" : "Place editor"}
            </div>
            <div className="w-[76px]" /> {/* Spacer (replaced Settings) */}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="space-y-4">
            {/* Required Steps Card */}
            {incompleteSteps.length > 0 && (
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#C96A5B] flex-shrink-0 mt-1.5" />
                    <h3 className="font-semibold text-[#1F2A1F]">Complete required steps</h3>
                  </div>
                  <span className="text-xs text-[#6F7A5A]">{completionPercentage}%</span>
                </div>
                <p className="text-sm text-[#6F7A5A] mb-4">
                  Finish these final tasks to publish your place.
                </p>
                <button
                  onClick={() => router.push(`/places/${placeId}/edit/required`)}
                  className="text-sm font-medium text-[#8F9E4F] hover:text-[#556036] transition"
                >
                  View all steps →
                </button>
              </div>
            )}

            {/* Photo Tour Card */}
            <Link
              href={`/places/${placeId}/edit/photos`}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-[#1F2A1F] mb-1">Photo tour</h3>
                  {photos.length > 0 ? (
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        {photos.slice(0, 3).map((photo, idx) => (
                          <div
                            key={idx}
                            className="w-12 h-12 rounded-lg border-2 border-white overflow-hidden bg-[#FAFAF7]"
                          >
                            <img
                              src={photo.url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                      <span className="text-sm text-[#6F7A5A]">{photos.length} photos</span>
                    </div>
                  ) : (
                    <p className="text-sm text-[#6F7A5A]">No photos yet</p>
                  )}
                </div>
                <Icon name="forward" size={20} className="text-[#6F7A5A]" />
              </div>
            </Link>

            {/* Title Card */}
            <Link
              href={`/places/${placeId}/edit/title`}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-[#1F2A1F] mb-1">Title</h3>
                  <p className="text-sm text-[#6F7A5A] line-clamp-1">
                    {place.title || "No title yet"}
                  </p>
                </div>
                <Icon name="forward" size={20} className="text-[#6F7A5A]" />
              </div>
            </Link>

            {/* Categories Card */}
            <Link
              href={`/places/${placeId}/edit/categories`}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-[#1F2A1F] mb-1">Categories</h3>
                  <p className="text-sm text-[#6F7A5A]">
                    {place.categories && place.categories.length > 0
                      ? `${place.categories[0]}${place.categories.length > 1 ? ` +${place.categories.length - 1}` : ""}`
                      : "No categories selected"}
                  </p>
                </div>
                <Icon name="forward" size={20} className="text-[#6F7A5A]" />
              </div>
            </Link>

            {/* Location Card */}
            <Link
              href={`/places/${placeId}/edit/location`}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-[#1F2A1F] mb-1">Location</h3>
                  <p className="text-sm text-[#6F7A5A] line-clamp-1">
                    {place.address || place.city || "No location set"}
                  </p>
                </div>
                <Icon name="forward" size={20} className="text-[#6F7A5A]" />
              </div>
            </Link>

            {/* Description Card */}
            <Link
              href={`/places/${placeId}/edit/description`}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-[#1F2A1F] mb-1">Description</h3>
                  <p className="text-sm text-[#6F7A5A] line-clamp-2">
                    {place.description || "No description yet"}
                  </p>
                </div>
                <Icon name="forward" size={20} className="text-[#6F7A5A]" />
              </div>
            </Link>

            {/* Access Card (Premium) */}
            <Link
              href={`/places/${placeId}/edit/access`}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-[#1F2A1F] mb-1">Access</h3>
                  <p className="text-sm text-[#6F7A5A]">
                    {place.access_level === 'premium' ? "Premium" : "Public"}
                  </p>
                </div>
                <Icon name="forward" size={20} className="text-[#6F7A5A]" />
              </div>
            </Link>

            {/* Visibility (moved from Place settings) */}
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-[#1F2A1F] mb-1">Visibility</h3>
                  <p className="text-sm text-[#6F7A5A]">
                    {isHidden
                      ? "Hidden from other users (only you can see it)."
                      : "Visible to all users on Maporia."}
                  </p>
                </div>
                <button
                  onClick={handleToggleVisibility}
                  disabled={hiding}
                  className={cx(
                    "relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2",
                    hiding && "opacity-50 cursor-not-allowed",
                    isHidden ? "bg-[#8F9E4F]" : "bg-[#DADDD0]"
                  )}
                  role="switch"
                  aria-checked={isHidden}
                  aria-label={isHidden ? "Make visible" : "Hide from users"}
                >
                  <span
                    className={cx(
                      "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      isHidden ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Google Import Card (moved below Visibility) */}
            {user && placeId && (
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
                <UnifiedGoogleImportField
                  userId={user.id}
                  context="place"
                  onImportSuccess={async (data) => {
                    // Resolve city to city_id
                    let cityId: string | null = null;
                    const cityName = data.city || null;
                    if (cityName) {
                      const cityData = await resolveCity(
                        cityName,
                        data.city_state || null,
                        data.city_country || null,
                        data.lat || null,
                        data.lng || null
                      );
                      if (cityData) {
                        cityId = cityData.city_id;
                      }
                    }

                    // Update place with imported data
                    const updates: any = {
                      title: data.name || data.business_name || place?.title || null,
                      address: data.formatted_address || data.address || place?.address || null,
                      city: cityName || place?.city || null, // Keep for backward compatibility
                      city_id: cityId,
                      city_name_cached: cityName || null,
                      link: data.website || place?.link || null,
                      google_place_id: data.place_id || data.google_place_id || place?.google_place_id || null,
                      lat: data.lat || data.latitude || place?.lat || null,
                      lng: data.lng || data.longitude || place?.lng || null,
                    };
                    // Update categories if types are available
                    if (data.types && data.types.length > 0) {
                      const categoryMap: Record<string, string> = {
                        restaurant: "restaurant",
                        cafe: "cafe",
                        bar: "bar",
                        hotel: "hotel",
                        museum: "museum",
                        park: "park",
                        beach: "beach",
                        shopping_mall: "shopping",
                        store: "shopping",
                      };
                      const mappedCategories = data.types
                        .map((type: string) => categoryMap[type])
                        .filter(Boolean);
                      if (mappedCategories.length > 0) {
                        updates.categories = mappedCategories.slice(0, 3);
                      }
                    }
                    await supabase.from("places").update(updates).eq("id", placeId);
                    // Reload place data
                    const { data: placeData } = await supabase
                      .from("places")
                      .select("*")
                      .eq("id", placeId)
                      .single();
                    if (placeData) {
                      setPlace(placeData as Place);
                    }
                  }}
                />
              </div>
            )}

            {/* Danger zone (moved from Place settings) */}
            <div className="rounded-2xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-5 shadow-sm">
              <h3 className="font-semibold font-fraunces text-[#C96A5B] mb-2">Danger zone</h3>
              <p className="text-sm text-[#6F7A5A] mb-4">
                Once you delete a place, there is no going back. Please be certain.
              </p>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={cx(
                  "w-full h-11 rounded-xl border border-[#C96A5B] bg-[#C96A5B] px-5 text-sm font-medium text-white hover:bg-[#B85A4B] transition",
                  deleting && "opacity-50 cursor-not-allowed"
                )}
              >
                {deleting ? "Deleting…" : "Delete place"}
              </button>
            </div>
          </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#ECEEE4] pb-safe-bottom">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="flex-1 h-11 rounded-xl border border-[#ECEEE4] bg-white px-5 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
            >
              Cancel
            </button>
            <Link
              href={`/id/${placeId}`}
              className="flex-1 h-11 rounded-xl bg-[#8F9E4F] text-white px-5 text-sm font-medium text-center hover:bg-[#7A8A42] transition flex items-center justify-center"
            >
              Save
            </Link>
          </div>
        </div>
      </div>

      {/* Floating View Button */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30">
        <Link
          href={`/id/${placeId}`}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1F2A1F] text-white text-sm font-medium shadow-lg hover:bg-[#2d3a2d] transition"
        >
          <Icon name="eye" size={16} />
          View
        </Link>
      </div>
    </main>
  );
}

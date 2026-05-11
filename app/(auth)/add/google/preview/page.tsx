"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccessContext } from "../../../../contexts/UserAccessContext";
// useAuthRedirect больше не используется — RequireAuth в (auth)/layout.tsx
// гарантирует user. См. feedback_useauthredirect_deps.
import { canUserAddPlace } from "../../../../lib/access";
import {
  GOOGLE_IMPORT_PREVIEW_STORAGE_KEY,
  getImportFieldsFoundCount,
  getImportProgressPercent,
  IMPORT_FIELDS_COUNT,
  type GoogleImportPreviewStored,
  type GoogleImportSearchResult,
} from "../../../../lib/googleImport";
import Icon from "../../../../components/Icon";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
import { PageSkeleton } from "../../../../components/Skeleton";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function GoogleImportPreviewPage() {
  const router = useRouter();
  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [stored, setStored] = useState<GoogleImportPreviewStored | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicatePlace, setDuplicatePlace] = useState<{
    id: string;
    title?: string | null;
  } | null>(null);

  const [titleSelected, setTitleSelected] = useState(true);
  const [addressSelected, setAddressSelected] = useState(true);
  const [descriptionSelected, setDescriptionSelected] = useState(true);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [descriptionHint, setDescriptionHint] = useState<string | null>(null);
  const storedGooglePlaceId = stored?.result.google_place_id ?? null;
  const storedIsCoordinateOnly = stored?.result.is_coordinate_only === true;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(GOOGLE_IMPORT_PREVIEW_STORAGE_KEY);
      if (!raw) {
        router.replace("/add/google");
        return;
      }
      const parsed = JSON.parse(raw) as GoogleImportPreviewStored;
      if (!parsed?.result) {
        router.replace("/add/google");
        return;
      }
      setStored(parsed);
      const ids = parsed.result.photos.map((p: { id: string }) => p.id);
      setSelectedPhotos(ids);
      setCoverPhotoId(ids[0] ?? null);
    } catch {
      router.replace("/add/google");
    }
  }, [router]);

  // Generate AI description when we have a place with google_place_id (same as inline flow in GoogleImportField)
  useEffect(() => {
    if (!storedGooglePlaceId || storedIsCoordinateOnly) return;

    let cancelled = false;
    setGeneratingDescription(true);
    setDescriptionHint(null);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;

        const res = await fetch("/api/ai/generate-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            google_place_id: storedGooglePlaceId,
            access_token: session.access_token,
            save: false,
          }),
        });
        const text = await res.text();
        let data: { description?: string; code?: string };
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { code: "PARSE_ERROR" };
        }

        if (cancelled) return;

        if (!res.ok) {
          if (data?.code === "PREMIUM_REQUIRED") {
            setDescriptionHint("AI description is available for Premium users.");
          } else if (data?.code === "OPENAI_INSUFFICIENT_QUOTA") {
            setDescriptionHint("AI description is temporarily unavailable (OpenAI billing/quota).");
          } else if (data?.code === "MISSING_OPENAI_KEY" || data?.code === "MISSING_GOOGLE_KEY") {
            setDescriptionHint("AI description is not available. You can still import other fields.");
          } else {
            setDescriptionHint("Couldn't generate AI description. You can still import other fields.");
          }
          setGeneratingDescription(false);
          return;
        }

        const generated = String(data?.description ?? "").trim();
        if (generated) {
          setStored((prev) =>
            prev
              ? {
                  ...prev,
                  result: { ...prev.result, description: generated },
                }
              : prev
          );
        } else {
          setDescriptionHint("AI returned an empty description. You can still import other fields.");
        }
      } catch {
        if (!cancelled) {
          setDescriptionHint("Couldn't generate AI description. You can still import other fields.");
        }
      } finally {
        if (!cancelled) setGeneratingDescription(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storedGooglePlaceId, storedIsCoordinateOnly]);

  const handleBack = useCallback(() => {
    try {
      sessionStorage.removeItem(GOOGLE_IMPORT_PREVIEW_STORAGE_KEY);
    } catch {}
    if (stored?.targetPlaceId) {
      router.push(`/places/${stored.targetPlaceId}/edit`);
    } else {
      router.push("/add/google");
    }
  }, [router, stored?.targetPlaceId]);

  const handleImport = useCallback(
    async () => {
      if (!stored?.result || !user) return;

      const result = stored.result as GoogleImportSearchResult;
      const isCoordinateOnly =
        result.is_coordinate_only === true || !result.google_place_id;
      const hasSelectedFields =
        isCoordinateOnly ||
        titleSelected ||
        addressSelected ||
        descriptionSelected ||
        selectedPhotos.length > 0;
      if (!hasSelectedFields) return;

      setImporting(true);
      setError(null);
      setDuplicatePlace(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("Not authenticated");
        }

        const selectedFieldsData: Record<string, unknown> = {
          lat: result.lat,
          lng: result.lng,
          google_maps_url: result.google_maps_url,
          city: result.city ?? null,
          city_state: result.city_state ?? null,
          city_country: result.city_country ?? null,
          is_coordinate_only: isCoordinateOnly,
          title: false,
          address: false,
          description: false,
          photos: [],
        };

        if (titleSelected && result.title) {
          selectedFieldsData.title = true;
          selectedFieldsData.titleData = result.title;
        }
        if (addressSelected && result.address) {
          selectedFieldsData.address = true;
          selectedFieldsData.addressData = result.address;
        }
        if (descriptionSelected && result.description) {
          selectedFieldsData.description = true;
          selectedFieldsData.descriptionData = result.description;
        }
        const selectedPhotoObjects = result.photos.filter((p) =>
          selectedPhotos.includes(p.id)
        );
        // Первая фотография в массиве станет обложкой (is_cover) — ставим выбранную обложку первой
        const coverId =
          coverPhotoId && selectedPhotos.includes(coverPhotoId)
            ? coverPhotoId
            : selectedPhotoObjects[0]?.id;
        const coverFirst = coverId
          ? [
              ...selectedPhotoObjects.filter((p) => p.id === coverId),
              ...selectedPhotoObjects.filter((p) => p.id !== coverId),
            ]
          : selectedPhotoObjects;
        selectedFieldsData.photos = coverFirst;

        const response = await fetch("/api/google-import/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            google_place_id: result.google_place_id,
            target_place_id: stored.targetPlaceId,
            selectedFields: selectedFieldsData,
            access_token: session.access_token,
          }),
        });

        const responseText = await response.text();
        let data: {
          place_id?: string;
          code?: string;
          existing_place_id?: string;
          existing_title?: string;
          error?: string;
          message?: string;
          details?: string;
        };
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          throw new Error("Invalid response from server. Please try again.");
        }

        if (!response.ok) {
          if (data?.code === "DUPLICATE_PLACE" && data?.existing_place_id) {
            setDuplicatePlace({
              id: String(data.existing_place_id),
              title: data?.existing_title ?? null,
            });
            setImporting(false);
            return;
          }
          if (response.status === 403 || data?.code === "PREMIUM_REQUIRED") {
            throw new Error(
              "Premium required to create places. Please upgrade to Premium to import."
            );
          }
          const msg =
            data?.error ||
            data?.message ||
            (responseText && responseText.trim() !== "{}"
              ? responseText.slice(0, 160)
              : "") ||
            "Failed to import place";
          throw new Error(data?.details ? `${msg}: ${data.details}` : msg);
        }

        if (!data?.place_id) {
          throw new Error("Invalid response: place_id not found");
        }

        try {
          sessionStorage.removeItem(GOOGLE_IMPORT_PREVIEW_STORAGE_KEY);
        } catch {}
        router.push(`/places/${data.place_id}/edit`);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to import place"
        );
        setImporting(false);
      }
    },
    [
      stored,
      user,
      titleSelected,
      addressSelected,
      descriptionSelected,
      selectedPhotos,
      coverPhotoId,
      router,
    ]
  );

  useEffect(() => {
    if (accessLoading) return;
    // 2026-05-10: убрали replaceToAuth() — (auth)/layout.tsx → RequireAuth
    // редиректит сам. replaceToAuth — fresh ref на каждый render →
    // нельзя в deps (см. feedback_useauthredirect_deps).
    if (!user) return;
    if (!canUserAddPlace(access)) {
      setError(
        "Only Premium users can create places. Please upgrade to Premium to add new places."
      );
    }
  }, [user, access, accessLoading]);

  useEffect(() => {
    if (selectedPhotos.length === 0) {
      setCoverPhotoId(null);
      return;
    }
    if (!coverPhotoId || !selectedPhotos.includes(coverPhotoId)) {
      setCoverPhotoId(selectedPhotos[0]);
    }
  }, [selectedPhotos, coverPhotoId]);

  if (accessLoading || stored === null) {
    return <PageSkeleton />;
  }

  if (!user) {
    return null;
  }

  const result = stored.result;
  const isCoordinateOnly =
    result.is_coordinate_only === true || !result.google_place_id;
  const hasSelectedFields =
    isCoordinateOnly ||
    titleSelected ||
    addressSelected ||
    descriptionSelected ||
    selectedPhotos.length > 0;
  const fieldsFound = getImportFieldsFoundCount(result);
  const progressPercent = getImportProgressPercent(result);

  const togglePhoto = (photoId: string) => {
    setSelectedPhotos((prev) => {
      const next = prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId];
      return next;
    });
    setCoverPhotoId((current) => {
      if (current === photoId) return null;
      return current;
    });
  };

  const setCover = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPhotos.includes(photoId)) setCoverPhotoId(photoId);
  };

  const cardClass =
    "rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm";
  const checkboxClass = (selected: boolean) =>
    cx(
      "w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0",
      selected
        ? "bg-[#8F9E4F] border-[#8F9E4F]"
        : "bg-white border-[#ECEEE4] group-hover:border-[#8F9E4F]"
    );

  return (
    <SectionErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7] pb-24">
      {/* Top App Bar — как в Place Editor */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 relative">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <div
              className="absolute left-1/2 -translate-x-1/2 font-semibold font-fraunces text-[#1F2A1F]"
              style={{ fontSize: "24px" }}
            >
              Import Preview
            </div>
            <a
              href={result.google_maps_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-[#8F9E4F] hover:text-[#556036] transition-colors whitespace-nowrap"
            >
              <Icon name="external-link" size={14} />
              <span className="hidden sm:inline">View on Maps</span>
            </a>
          </div>
        </div>
      </div>

      {/* Content — как в Place Editor: max-w-7xl, space-y-4 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-4 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Progress card — как в Place Editor */}
          <div className={cx(cardClass, "hover:shadow-md transition")}>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[#1F2A1F]">
                  Fields found
                </span>
                <span className="text-sm font-semibold text-[#1F2A1F]">
                  {fieldsFound}/{IMPORT_FIELDS_COUNT} — {progressPercent}%
                </span>
              </div>
              <div className="w-full h-2 bg-[#ECEEE4] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#8F9E4F] rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-[#6F7A5A]">
              Select the fields you want to import from Google Maps.
            </p>
          </div>

          {/* Coordinate-only warning */}
          {isCoordinateOnly && (
            <div className="rounded-2xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-5 shadow-sm">
              <div className="flex items-start gap-2">
                <Icon name="alert-circle" size={16} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-[#C96A5B] mb-1">
                    Unregistered location
                  </p>
                  <p className="text-xs text-[#C96A5B] opacity-90">
                    This location doesn&apos;t have a Google Place ID. Only
                    coordinates and address will be imported.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Title card */}
          {result.title && (
            <div className={cardClass}>
              <label className="flex items-center gap-3 cursor-pointer group">
                <button
                  type="button"
                  onClick={() => setTitleSelected(!titleSelected)}
                  className={checkboxClass(titleSelected)}
                >
                  {titleSelected && (
                    <Icon name="check" size={12} className="text-white" />
                  )}
                </button>
                <span className="text-sm font-medium text-[#1F2A1F]">
                  Title
                </span>
              </label>
              {titleSelected && (
                <div className="pl-8 mt-2 text-sm text-[#1F2A1F]">
                  {result.title}
                </div>
              )}
            </div>
          )}

          {/* Photos card — после Title */}
          {result.photos.length > 0 && (
            <div className={cardClass}>
              <label className="flex items-center gap-3 cursor-pointer group">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPhotos.length > 0) {
                      setSelectedPhotos([]);
                    } else {
                      setSelectedPhotos(result.photos.map((p) => p.id));
                    }
                  }}
                  className={checkboxClass(selectedPhotos.length > 0)}
                >
                  {selectedPhotos.length > 0 && (
                    <Icon name="check" size={12} className="text-white" />
                  )}
                </button>
                <span className="text-sm font-medium text-[#1F2A1F]">
                  Photos ({selectedPhotos.length} selected)
                </span>
              </label>
              {selectedPhotos.length > 0 && (
                <div className="pl-8 mt-2 space-y-1">
                  <p className="text-sm text-[#6F7A5A] mb-2 font-fraunces">
                    Tap a photo to set as cover
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {result.photos.map((photo) => {
                      const isSelected = selectedPhotos.includes(photo.id);
                      const isCover = coverPhotoId === photo.id;
                      return (
                        <div
                          key={photo.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => togglePhoto(photo.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              togglePhoto(photo.id);
                            }
                          }}
                          className="relative group cursor-pointer"
                        >
                          <div
                            className="relative rounded-lg overflow-hidden"
                            style={{ paddingBottom: "100%" }}
                          >
                            <Image
                              src={photo.url}
                              alt="Place"
                              fill
                              sizes="(max-width: 640px) 33vw, 160px"
                              className="absolute inset-0 w-full h-full object-cover"
                              // Skip Vercel /_next/image optimization: our source URL
                              // is a same-origin proxy that 302-redirects to
                              // lh3.googleusercontent.com, and the optimizer rejects
                              // redirects with INVALID_IMAGE_OPTIMIZE_REQUEST (400).
                              // Browser follows the 302 itself with no optimizer in between.
                              unoptimized
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ECEEE4' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%236F7A5A' font-size='12'%3EPhoto%3C/text%3E%3C/svg%3E";
                              }}
                            />
                            <div
                              className={cx(
                                "absolute inset-0 rounded-lg border-2 transition",
                                isSelected
                                  ? "border-[#8F9E4F] bg-[#8F9E4F]/20"
                                  : "border-transparent group-hover:border-[#ECEEE4]"
                              )}
                            >
                              {isSelected && (
                                <div className="absolute top-1 right-1 bg-[#8F9E4F] rounded-full p-1">
                                  <Icon
                                    name="check"
                                    size={12}
                                    className="text-white"
                                  />
                                </div>
                              )}
                              {isSelected && (
                                <div
                                  className={cx(
                                    "absolute bottom-0 left-0 right-0 rounded-b-lg py-2 px-2 flex items-center justify-center min-h-[32px] transition-colors font-fraunces text-sm font-medium",
                                    isCover
                                      ? "bg-[#8F9E4F] text-white"
                                      : "bg-[#1F2A1F]/85 text-white hover:bg-[#2A3A2A]/90"
                                  )}
                                  onClick={(e) => setCover(photo.id, e)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setCoverPhotoId(photo.id);
                                    }
                                  }}
                                >
                                  {isCover ? (
                                    <span className="flex items-center gap-1.5">
                                      <Icon name="star" size={14} className="text-white" />
                                      Cover
                                    </span>
                                  ) : (
                                    <span>Set as cover</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Address card */}
          {result.address && (
            <div className={cardClass}>
              <label className="flex items-center gap-3 cursor-pointer group">
                <button
                  type="button"
                  onClick={() => setAddressSelected(!addressSelected)}
                  className={checkboxClass(addressSelected)}
                >
                  {addressSelected && (
                    <Icon name="check" size={12} className="text-white" />
                  )}
                </button>
                <span className="text-sm font-medium text-[#1F2A1F]">
                  Address
                </span>
              </label>
              {addressSelected && (
                <div className="pl-8 mt-2 text-sm text-[#6F7A5A] flex items-start gap-2">
                  <Icon name="location" size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{result.address}</span>
                </div>
              )}
            </div>
          )}

          {/* Description card — show when generating or when we have description */}
          {(result.description || generatingDescription) && (
            <div className={cardClass}>
              <label className="flex items-center gap-3 cursor-pointer group">
                <button
                  type="button"
                  onClick={() => setDescriptionSelected(!descriptionSelected)}
                  className={checkboxClass(descriptionSelected)}
                >
                  {descriptionSelected && (
                    <Icon name="check" size={12} className="text-white" />
                  )}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#1F2A1F]">
                    Description
                  </span>
                  <span className="text-[11px] rounded-full border border-[#ECEEE4] bg-[#FAFAF7] px-2 py-0.5 text-[#6F7A5A]">
                    AI draft
                  </span>
                </div>
              </label>
              {descriptionSelected && (
                <div className="pl-8 mt-2 space-y-1">
                  {generatingDescription && !result.description ? (
                    <div className="text-sm text-[#6F7A5A]">
                      Generating description…
                    </div>
                  ) : (
                    <>
                      <div
                        className={cx(
                          "text-sm text-[#6F7A5A]",
                          !descriptionExpanded ? "line-clamp-3" : ""
                        )}
                      >
                        {result.description}
                      </div>
                      {result.description && result.description.length > 100 && (
                        <button
                          onClick={() =>
                            setDescriptionExpanded(!descriptionExpanded)
                          }
                          className="text-xs text-[#8F9E4F] hover:text-[#556036] underline"
                        >
                          {descriptionExpanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </>
                  )}
                  {descriptionHint && (
                    <div className="text-xs text-[#6F7A5A]">{descriptionHint}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Buttons — как в Place Editor */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#ECEEE4] pb-safe-bottom">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              disabled={importing}
              className="flex-1 h-11 rounded-xl border border-[#ECEEE4] bg-white px-5 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!hasSelectedFields || importing}
              className={cx(
                "flex-1 h-11 rounded-xl px-5 text-sm font-medium transition flex items-center justify-center",
                hasSelectedFields && !importing
                  ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                  : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
              )}
            >
              {importing ? "Importing..." : "Import Selected"}
            </button>
          </div>
        </div>
      </div>

      {/* Duplicate place modal */}
      {duplicatePlace && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDuplicatePlace(null)}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-[#ECEEE4] shadow-xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-fraunces font-semibold text-[#1F2A1F] text-lg">
                  Place already exists
                </h3>
                <p className="text-sm text-[#6F7A5A] mt-1">
                  This place is already in your account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDuplicatePlace(null)}
                className="p-2 -mr-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            {duplicatePlace.title ? (
              <div className="mt-4 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-3">
                <div className="text-xs text-[#6F7A5A] mb-1">
                  Existing gem
                </div>
                <div className="text-sm font-medium text-[#1F2A1F] line-clamp-2">
                  {duplicatePlace.title}
                </div>
              </div>
            ) : null}
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  const id = duplicatePlace.id;
                  setDuplicatePlace(null);
	                  try {
	                    sessionStorage.removeItem(
	                      GOOGLE_IMPORT_PREVIEW_STORAGE_KEY
	                    );
	                  } catch {}
	                  router.push(`/places/${id}/edit`);
	                }}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-medium bg-[#8F9E4F] text-white hover:bg-[#556036] transition"
              >
                Open existing
              </button>
              <button
                type="button"
                onClick={() => setDuplicatePlace(null)}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-medium border border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </SectionErrorBoundary>
  );
}

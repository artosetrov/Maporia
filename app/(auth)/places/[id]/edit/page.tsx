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

import { use, useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../../../lib/supabase";
import type { Database } from "../../../../types/supabase";
import { useUserAccessContext } from "../../../../contexts/UserAccessContext";
import { isUserAdmin, canUserCreatePremiumPlace, type AccessLevel } from "../../../../lib/access";
import { getPublicStoragePath, PLACE_PHOTOS_BUCKET } from "../../../../lib/storagePaths";
import { getPlaceCatalogHref } from "../../../../lib/navigation";

type PlacePhotoUrlRow = Pick<Database["public"]["Tables"]["place_photos"]["Row"], "url">;
import Icon from "../../../../components/Icon";
import PremiumBadge from "../../../../components/PremiumBadge";
import GoogleImportField from "../../../../components/GoogleImportField";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
import LinkedPlacesEditorBlock from "../../../../components/LinkedPlacesEditorBlock";

type Place = {
  id: string;
  created_by: string;
  title: string | null;
  description: string | null;
  city: string | null;
  /** Денормализованное имя города (заполняется resolveCity при сохранении локации). */
  city_name_cached?: string | null;
  country: string | null;
  address: string | null;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  link: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
  telegram: string | null;
  categories: string[] | null;
  tags: string[] | null;
  cover_url: string | null;
  created_at: string;
  is_hidden?: boolean | null;
  /** True когда владелец скрыл карточку через тумблер. Auto-publish эффект пропускает такие карточки. */
  manually_hidden?: boolean | null;
  // Place kind + offer-specific fields (для service / experience)
  kind?: "location" | "service" | "experience" | null;
  price_amount?: number | null;
  price_currency?: string | null;
  price_unit?: string | null;
  price_options?: unknown[] | null;
  duration_minutes?: number | null;
  schedule?: unknown | null;
  host_qualification?: string | null;
  service_mode?: 'at_provider' | 'at_client' | 'online' | 'flexible' | null;
  max_guests?: number | null;
  min_guests?: number | null;
  meeting_point?: string | null;
  cancellation_policy?: string | null;
  included_items?: string[] | null;
  bring_items?: string[] | null;
  // Premium/Access fields
  access_level?: string | null; // Primary field: 'public' | 'premium'
  // Legacy fields (for backward compatibility)
  is_premium?: boolean | null;
  premium_only?: boolean | null;
  visibility?: string | null;
  // Comments
  comments_enabled?: boolean | null;
};

type PlacePhoto = {
  url: string;
  sort: number;
  is_cover: boolean;
};

type AdminOwnerUser = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  is_admin: boolean | null;
  plan: string | null;
  email: string | null;
};

type ErrorLike = {
  code?: string;
  message?: string;
};

type PlaceLoadResult = {
  data: Place | null;
  error: unknown | null;
};

const PLACE_SELECT_BASE =
  "id, title, description, address, city, city_id, city_name_cached, country, cover_url, photo_urls, video_url, categories, tags, link, phone, website, instagram, youtube, telegram, created_by, created_at, lat, lng, access_level, visibility, is_hidden, manually_hidden, google_place_id, comments_enabled, kind, price_amount, price_currency, price_unit, duration_minutes, schedule, host_qualification, service_mode, max_guests, min_guests, meeting_point, cancellation_policy, included_items, bring_items";

const PLACE_SELECT_WITH_PRICE_OPTIONS =
  "id, title, description, address, city, city_id, city_name_cached, country, cover_url, photo_urls, video_url, categories, tags, link, phone, website, instagram, youtube, telegram, created_by, created_at, lat, lng, access_level, visibility, is_hidden, manually_hidden, google_place_id, comments_enabled, kind, price_amount, price_currency, price_unit, price_options, duration_minutes, schedule, host_qualification, service_mode, max_guests, min_guests, meeting_point, cancellation_policy, included_items, bring_items";

function isMissingPriceOptionsColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as ErrorLike;
  return (
    err.code === "42703" &&
    (err.message?.includes("places.price_options") === true ||
      err.message?.includes("price_options") === true)
  );
}

async function loadEditablePlace(placeId: string): Promise<PlaceLoadResult> {
  const primary = (await supabase
    .from("places")
    .select(PLACE_SELECT_WITH_PRICE_OPTIONS)
    .eq("id", placeId)
    .single()) as PlaceLoadResult;

  if (!primary.error) {
    return { data: primary.data as Place, error: null };
  }

  if (!isMissingPriceOptionsColumn(primary.error)) {
    return { data: null, error: primary.error };
  }

  const fallback = (await supabase
    .from("places")
    .select(PLACE_SELECT_BASE)
    .eq("id", placeId)
    .single()) as PlaceLoadResult;

  if (fallback.error || !fallback.data) {
    return { data: null, error: fallback.error ?? primary.error };
  }

  return {
    data: { ...(fallback.data as Place), price_options: null },
    error: null,
  };
}

type RequiredStep = {
  id: string;
  label: string;
  completed: boolean;
  route?: string;
  priority: "required" | "recommended";
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

// ── helpers for hub cards (Price / Schedule) ─────────────────────────
const PRICE_UNIT_SUFFIX: Record<string, string> = {
  fixed: "",
  from: "",
  per_hour: " / hr",
  per_person: " / person",
  per_day: " / day",
  per_month: " / month",
  per_session: " / session",
};
const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", EUR: "€", RUB: "₽", GBP: "£",
};
function formatPriceSummary(
  amount: number | null | undefined,
  currency: string | null | undefined,
  unit: string | null | undefined
): string {
  if (amount == null) return "By request";
  const sym = CURRENCY_SYMBOL[(currency || "USD").toUpperCase()] || (currency || "USD");
  const hasCents = amount % 1 !== 0;
  const formatted = hasCents ? amount.toFixed(2) : Math.round(amount).toString();
  const fromPrefix = unit === "from" ? "from " : "";
  const suffix = PRICE_UNIT_SUFFIX[unit || ""] ?? "";
  return `${fromPrefix}${sym}${formatted}${suffix}`;
}
function formatDetailsSummary(place: { max_guests?: number | null; min_guests?: number | null; meeting_point?: string | null; cancellation_policy?: string | null; included_items?: string[] | null; bring_items?: string[] | null }): string {
  const parts: string[] = [];
  if (place.max_guests != null) {
    if (place.min_guests != null && place.min_guests !== place.max_guests) {
      parts.push(`${place.min_guests}–${place.max_guests} guests`);
    } else {
      parts.push(`Up to ${place.max_guests} guests`);
    }
  }
  if (place.meeting_point) parts.push("Meeting point set");
  if (place.cancellation_policy) parts.push(`${place.cancellation_policy} cancellation`);
  const incCount = (place.included_items?.length ?? 0);
  const brCount = (place.bring_items?.length ?? 0);
  if (incCount > 0) parts.push(`${incCount} included`);
  if (brCount > 0) parts.push(`${brCount} to bring`);
  return parts.length > 0 ? parts.join(" • ") : "Add guest size, meeting point, cancellation policy";
}

function formatServiceModeLabel(mode: string | null | undefined): string {
  if (mode === "at_provider") return "At provider's place";
  if (mode === "at_client") return "At your place";
  if (mode === "online") return "Online";
  if (mode === "flexible") return "Flexible";
  return "";
}
function formatScheduleSummary(raw: unknown, durationMinutes: number | null | undefined): string {
  const parts: string[] = [];
  if (raw && typeof raw === "object") {
    const s = raw as { type?: string; days?: string[]; from?: string; to?: string; dates?: string[] };
    if (s.type === "weekly" && Array.isArray(s.days) && s.days.length > 0) {
      const labels: Record<string, string> = {
        mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
      };
      const ds = s.days.map((d) => labels[d] || d).join(", ");
      parts.push(s.from && s.to ? `${ds} ${s.from}–${s.to}` : ds);
    } else if (s.type === "dates" && Array.isArray(s.dates) && s.dates.length > 0) {
      parts.push(`${s.dates.length} date${s.dates.length === 1 ? "" : "s"}`);
    } else if (s.type === "on_request") {
      parts.push("By request");
    }
  }
  if (durationMinutes && durationMinutes > 0) {
    const h = Math.floor(durationMinutes / 60);
    const m = durationMinutes % 60;
    const dur = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
    parts.push(dur);
  }
  return parts.length > 0 ? parts.join(" • ") : "Not set";
}

function hasText(value: string | null | undefined): boolean {
  return !!(value && value.trim().length > 0);
}

function hasContactInfo(placeData: Place): boolean {
  return [
    placeData.phone,
    placeData.website,
    placeData.instagram,
    placeData.youtube,
    placeData.telegram,
  ].some(hasText);
}

function hasOfferLocation(placeData: Place): boolean {
  return !!(
    hasText(placeData.city_name_cached) ||
    hasText(placeData.city) ||
    hasText(placeData.address)
  );
}

function hasScheduleInfo(placeData: Place): boolean {
  return !!placeData.schedule || !!(placeData.duration_minutes && placeData.duration_minutes > 0);
}

function hasHostInfo(placeData: Place): boolean {
  return hasText(placeData.host_qualification) || !!placeData.service_mode;
}

function hasExperienceDetails(placeData: Place): boolean {
  return !!(
    placeData.max_guests ||
    placeData.min_guests ||
    hasText(placeData.meeting_point) ||
    hasText(placeData.cancellation_policy) ||
    (placeData.included_items && placeData.included_items.length > 0) ||
    (placeData.bring_items && placeData.bring_items.length > 0)
  );
}

function ownerDisplayName(owner: AdminOwnerUser | null): string {
  if (!owner) return "Unknown owner";
  return owner.display_name || owner.username || owner.email || "Unnamed user";
}

function ownerSubtitle(owner: AdminOwnerUser | null): string {
  if (!owner) return "";
  return [owner.email, owner.plan || owner.role].filter(Boolean).join(" • ");
}

function ownerInitials(owner: AdminOwnerUser | null): string {
  const label = ownerDisplayName(owner);
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return label[0]?.toUpperCase() || "U";
}

type PageProps = { params: Promise<{ id: string }> };

export default function PlaceEditorHub(props: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id: placeId } = use(props.params);
  const returnTo = searchParams.get("returnTo") || "";

  const { loading: accessLoading, user, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<Place | null>(null);
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(false);
  const isHiddenRef = useRef(false);
  const [hiding, setHiding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(true); // Default to enabled
  const [togglingComments, setTogglingComments] = useState(false);
  const [togglingAccess, setTogglingAccess] = useState(false);
  const [currentOwner, setCurrentOwner] = useState<AdminOwnerUser | null>(null);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState("");
  const [ownerSearchResults, setOwnerSearchResults] = useState<AdminOwnerUser[]>([]);
  const [ownerSearchLoading, setOwnerSearchLoading] = useState(false);
  const [ownerTransferLoading, setOwnerTransferLoading] = useState(false);
  const [ownerTransferReason, setOwnerTransferReason] = useState("");
  const [ownerTransferError, setOwnerTransferError] = useState<string | null>(null);
  const [ownerTransferNotice, setOwnerTransferNotice] = useState<string | null>(null);
  const isUpdatingRef = useRef(false); // Track if we're currently updating to prevent reload

  useEffect(() => {
    isHiddenRef.current = isHidden;
  }, [isHidden]);

  // Load place data
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;
    if (isUpdatingRef.current) {
      console.log("Skipping data reload - update in progress");
      return; // Don't reload if we're updating
    }

    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);

      // Load place + photos in parallel. They're independent and waiting
      // for place to resolve before kicking off photos was wasting one
      // round-trip on every editor open.
      const [placeRes, photosRes] = await Promise.all([
        loadEditablePlace(placeId),
        supabase
          .from("place_photos")
          .select("url, sort, is_cover")
          .eq("place_id", placeId)
          .order("sort", { ascending: true }),
      ]);
      const { data: rawPlace, error: placeError } = placeRes;

      const placeData = rawPlace as Place | null;
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

      // Check if we're updating - if so, check if data matches our expected state
      if (isUpdatingRef.current) {
        const loadedHiddenState = placeItem.is_hidden === true ||
                                  placeItem.visibility === "hidden" ||
                                  placeItem.visibility === "private";
        const currentHiddenState = isHiddenRef.current;
        console.warn("WARNING: Data reloaded during update!", {
          isUpdating: isUpdatingRef.current,
          loadedIsHidden: placeItem.is_hidden,
          loadedVisibility: placeItem.visibility,
          loadedHiddenState,
          currentIsHidden: currentHiddenState,
          expectedHiddenState: currentHiddenState // Keep current state
        });
        
        // If data doesn't match our current state, it means update didn't persist
        // In this case, we should keep the current state and log an error
        if (loadedHiddenState !== currentHiddenState) {
          console.error("CRITICAL: Server data doesn't match current state! Update may have failed.", {
            serverIsHidden: loadedHiddenState,
            currentIsHidden: currentHiddenState,
            serverData: { is_hidden: placeItem.is_hidden, visibility: placeItem.visibility }
          });
          // Don't update state - keep the current state that user set
          setLoading(false);
          return;
        }
      }
      
      setPlace(placeItem);
      // Check if place is hidden (try multiple possible fields)
      const hiddenState = placeItem.is_hidden === true ||
                          placeItem.visibility === "hidden" ||
                          placeItem.visibility === "private";
      setIsHidden(hiddenState);
      // Load comments enabled state (default to true if not set)
      setCommentsEnabled(placeItem.comments_enabled !== false);
      // Photos came back from the parallel fetch above.
      const { data: rawPhotos, error: photosError } = photosRes;
      const photosData = rawPhotos as PlacePhotoUrlRow[] | null;
      if (!mounted) return;

      if (!photosError && photosData && photosData.length > 0) {
        const photoUrls = photosData
          .map((p) => p.url)
          .filter((u: string | null): u is string => typeof u === "string" && u.length > 0);
        
        if (photoUrls.length > 0) {
          setPhotos(
            photoUrls.map((url, i) => ({
              url,
              sort: i,
              is_cover: i === 0,
            }))
          );
        } else {
          // No valid photo URLs, check legacy cover_url
          if (placeItem.cover_url) {
            setPhotos([{ url: placeItem.cover_url, sort: 0, is_cover: true }]);
          } else {
            setPhotos([]);
          }
        }
      } else {
        // No photos in place_photos table, check legacy cover_url
        if (placeItem.cover_url) {
          setPhotos([{ url: placeItem.cover_url, sort: 0, is_cover: true }]);
        } else {
          setPhotos([]);
        }
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [placeId, user, router, access, accessLoading]);

  useEffect(() => {
    if (!isAdmin || !place?.created_by) {
      setCurrentOwner(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const res = await fetch(
        `/api/admin/users/search?ids=${encodeURIComponent(place.created_by)}&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok || cancelled) return;
      const data = (await res.json().catch(() => ({}))) as { users?: AdminOwnerUser[] };
      if (!cancelled) setCurrentOwner(data.users?.[0] ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, place?.created_by]);

  useEffect(() => {
    if (!isAdmin || ownerSearchQuery.trim().length < 2) {
      setOwnerSearchResults([]);
      setOwnerSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setOwnerSearchLoading(true);
      setOwnerTransferError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setOwnerSearchLoading(false);
          setOwnerTransferError("Admin session is missing. Please sign in again.");
        }
        return;
      }

      const params = new URLSearchParams({
        q: ownerSearchQuery.trim(),
        limit: "8",
      });
      const res = await fetch(`/api/admin/users/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        users?: AdminOwnerUser[];
        error?: string;
      };

      if (cancelled) return;
      if (!res.ok) {
        setOwnerSearchResults([]);
        setOwnerTransferError(data.error || "Could not search users.");
      } else {
        setOwnerSearchResults(data.users ?? []);
      }
      setOwnerSearchLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isAdmin, ownerSearchQuery]);

  // Reload data when page becomes visible (returning from editor)
  useEffect(() => {
    if (!placeId || !user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isUpdatingRef.current) {
        // Reload data when page becomes visible (but not if we're currently updating)
        (async () => {
          const { data: rawPlace } = await loadEditablePlace(placeId);

          const placeData = rawPlace as Place | null;
          if (placeData) {
            setPlace(placeData);
            // Update state from reloaded data
            const placeItem = placeData;
            setIsHidden(
              placeItem.is_hidden === true ||
                placeItem.visibility === "hidden" ||
                placeItem.visibility === "private"
            );
            setCommentsEnabled(placeItem.comments_enabled !== false);
          }
        })();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [placeId, user]);

  async function handleTransferOwner(targetOwner: AdminOwnerUser) {
    if (!isAdmin || !placeId || !place) return;
    if (targetOwner.id === place.created_by) {
      setOwnerTransferNotice("This user already owns the listing.");
      setOwnerTransferError(null);
      return;
    }

    const confirmed = window.confirm(
      `Transfer "${place.title || "this listing"}" to ${ownerDisplayName(targetOwner)}?`,
    );
    if (!confirmed) return;

    setOwnerTransferLoading(true);
    setOwnerTransferError(null);
    setOwnerTransferNotice(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setOwnerTransferLoading(false);
      setOwnerTransferError("Admin session is missing. Please sign in again.");
      return;
    }

    const res = await fetch(`/api/admin/places/${encodeURIComponent(placeId)}/owner`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetUserId: targetOwner.id,
        reason: ownerTransferReason,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      place?: { created_by?: string | null };
      owner?: AdminOwnerUser;
      auditWarning?: string | null;
    };

    setOwnerTransferLoading(false);

    if (!res.ok) {
      setOwnerTransferError(data.error || "Could not transfer owner.");
      return;
    }

    const nextOwner = data.owner ?? targetOwner;
    setCurrentOwner(nextOwner);
    setPlace((prev) =>
      prev ? { ...prev, created_by: data.place?.created_by ?? targetOwner.id } : prev,
    );
    setOwnerSearchQuery("");
    setOwnerSearchResults([]);
    setOwnerTransferReason("");
    setOwnerTransferNotice(
      data.auditWarning
        ? `Owner changed. Audit warning: ${data.auditWarning}`
        : `Owner changed to ${ownerDisplayName(nextOwner)}.`,
    );
  }

  async function handleToggleVisibility() {
    if (!placeId || !user) {
      console.error("Missing placeId or user:", { placeId, user });
      return;
    }

    isUpdatingRef.current = true;
    setHiding(true);
    setError(null);

    const newHiddenState = !isHidden;
    if (!newHiddenState && !allRequiredFieldsFilled) {
      setError("Finish the required items before making this listing public.");
      return;
    }
    console.log("Toggling visibility:", { placeId, newHiddenState, currentIsHidden: isHidden });

    // Try multiple possible field names.
    // manually_hidden stores explicit user intent. Publishing sets it false;
    // hiding sets it true so the listing stays a draft/private listing.
    const payload: Record<string, boolean | string> = {
      is_hidden: newHiddenState,
      visibility: newHiddenState ? "hidden" : "public",
      manually_hidden: newHiddenState,
    };

    // Admin can update any place, owner can update their own
    const currentIsAdmin = isUserAdmin(access);
    console.log("User info:", { userId: user.id, isAdmin: currentIsAdmin, placeCreatedBy: place?.created_by });
    
    // @ts-expect-error Supabase generated types infer update payload as never
    const updateQuery = supabase.from("places").update(payload).eq("id", placeId);

    // If not admin, add ownership check
    if (!currentIsAdmin) {
      updateQuery.eq("created_by", user.id);
    }

    console.log("Update payload:", payload);
    const { error: updateError, data: updateData, count } = await updateQuery.select();
    console.log("Update response:", { 
      error: updateError, 
      data: updateData, 
      count,
      rowsAffected: updateData?.length || 0
    });
    
    // Verify the update actually affected rows
    if (!updateError && (!updateData || updateData.length === 0)) {
      console.error("WARNING: Update succeeded but no data returned! This may indicate RLS policy issue.");
    }

    setHiding(false);

    if (updateError) {
      console.error("Update error:", updateError);
      
      // Check for specific error types
      if (updateError.message?.includes("is_hidden") || updateError.message?.includes("visibility")) {
        setError("Database fields missing. Please run add-place-visibility-fields.sql in Supabase Dashboard > SQL Editor");
      } else if (updateError.code === "PGRST116") {
        setError("No rows updated. You may not have permission to edit this place.");
      } else {
        setError(updateError.message || "Failed to update visibility");
      }
      return;
    }

    if (!updateData || updateData.length === 0) {
      console.error("No data returned from update");
      setError("No rows were updated. Please check your permissions or run the database migration.");
      return;
    }

    // Use data from server response to update state
    const updatedPlace = updateData[0] as Place;
    const actualHiddenState = updatedPlace.is_hidden === true || 
                              updatedPlace.visibility === "hidden" || 
                              updatedPlace.visibility === "private";
    
    console.log("Updating state from server response:", { 
      actualHiddenState, 
      is_hidden: updatedPlace.is_hidden, 
      visibility: updatedPlace.visibility 
    });

    // Update state immediately with server response
    setIsHidden(actualHiddenState);
    
    // Update place object with server response - merge to preserve all fields
    setPlace((prev) => {
      const updated = {
        ...(prev || {}),
        ...updatedPlace,
        is_hidden: updatedPlace.is_hidden ?? newHiddenState,
        visibility: updatedPlace.visibility ?? (newHiddenState ? "hidden" : "public"),
        manually_hidden: updatedPlace.manually_hidden ?? newHiddenState,
      } as Place;
      
      console.log("State updated in setPlace:", { 
        isHidden: actualHiddenState, 
        placeIsHidden: updated.is_hidden, 
        placeVisibility: updated.visibility,
        prevIsHidden: prev?.is_hidden,
        prevVisibility: prev?.visibility
      });
      return updated;
    });
    
    // Double-check state after a brief moment to ensure it sticks
    setTimeout(() => {
      setIsHidden((current) => {
        if (current !== actualHiddenState) {
          console.warn("State mismatch detected, forcing update from", current, "to", actualHiddenState);
          return actualHiddenState;
        }
        return current;
      });
    }, 100);

    console.log("Visibility updated successfully:", { 
      newHiddenState, 
      actualHiddenState,
      updateData,
      updatedPlace 
    });

    // Reset update flag after a longer delay to prevent data reload
    setTimeout(() => {
      isUpdatingRef.current = false;
      console.log("Update flag reset - data reload now allowed");
    }, 2000); // Increased to 2 seconds to prevent immediate reload

    if (navigator.vibrate) navigator.vibrate(10);
  }

  async function handleToggleComments() {
    if (!placeId || !user) {
      console.error("Missing placeId or user:", { placeId, user });
      return;
    }

    isUpdatingRef.current = true;
    setTogglingComments(true);
    setError(null);

    const newCommentsState = !commentsEnabled;
    console.log("Toggling comments:", { placeId, newCommentsState, currentCommentsEnabled: commentsEnabled });

    // Admin can update any place, owner can update their own
    const currentIsAdmin = isUserAdmin(access);
    console.log("User info:", { userId: user.id, isAdmin: currentIsAdmin, placeCreatedBy: place?.created_by });
    
    const updateQuery = supabase
      .from("places")
      // @ts-expect-error Supabase generated types infer update payload as never
      .update({ comments_enabled: newCommentsState })
      .eq("id", placeId);

    // If not admin, add ownership check
    if (!currentIsAdmin) {
      updateQuery.eq("created_by", user.id);
    }

    console.log("Update payload:", { comments_enabled: newCommentsState });
    const { error: updateError, data: updateData, count } = await updateQuery.select();
    console.log("Update response:", { 
      error: updateError, 
      data: updateData, 
      count,
      rowsAffected: updateData?.length || 0
    });
    
    // Verify the update actually affected rows
    if (!updateError && (!updateData || updateData.length === 0)) {
      console.error("WARNING: Update succeeded but no data returned! This may indicate RLS policy issue.");
    }
    
    // Check if error is due to missing column
    if (updateError && updateError.message?.includes("comments_enabled")) {
      setError("Database migration required. Please run add-comments-enabled-field.sql in Supabase Dashboard > SQL Editor");
      setTogglingComments(false);
      return;
    }

    setTogglingComments(false);

    if (updateError) {
      console.error("Update error:", updateError);
      
      // Check for specific error types
      if (updateError.message?.includes("comments_enabled")) {
        setError("Database migration required. Please run add-all-place-fields.sql in Supabase Dashboard > SQL Editor");
      } else if (updateError.code === "PGRST116") {
        setError("No rows updated. You may not have permission to edit this place.");
      } else {
        setError(updateError.message || "Failed to update comments setting");
      }
      return;
    }

    if (!updateData || updateData.length === 0) {
      console.error("No data returned from update");
      setError("No rows were updated. Please check your permissions or run the database migration.");
      return;
    }

    // Use data from server response to update state
    const updatedPlace = updateData[0] as Place;
    const actualCommentsState = updatedPlace.comments_enabled !== false;
    
    console.log("Updating state from server response:", { 
      actualCommentsState, 
      comments_enabled: updatedPlace.comments_enabled 
    });

    setCommentsEnabled(actualCommentsState);
    setPlace((prev) =>
      prev
        ? {
            ...prev,
            comments_enabled: updatedPlace.comments_enabled ?? newCommentsState,
          }
        : prev
    );

    // Show success message
    const successMessage = newCommentsState 
      ? "Comments enabled. Changes will be visible on the place page."
      : "Comments disabled. The comments section will be hidden on the place page.";
    
    // You may want to show a toast notification here
    console.log(successMessage);

    // Reset update flag after a longer delay to prevent data reload
    setTimeout(() => {
      isUpdatingRef.current = false;
      console.log("Comments update flag reset - data reload now allowed");
    }, 2000); // Increased to 2 seconds to prevent immediate reload

    if (navigator.vibrate) navigator.vibrate(10);
  }

  async function handleToggleAccess() {
    if (!placeId || !user || !place) return;

    const currentIsPremium = place.access_level === "premium";
    const newLevel: AccessLevel = currentIsPremium ? "public" : "premium";

    const currentIsAdmin = isUserAdmin(access);
    if (newLevel === "premium" && !canUserCreatePremiumPlace(access) && !currentIsAdmin) {
      setError("You need a Premium subscription to set a place as Premium.");
      return;
    }

    isUpdatingRef.current = true;
    setTogglingAccess(true);
    setError(null);

    const updateQuery = supabase
      .from("places")
      // @ts-expect-error Supabase generated types infer update payload as never
      .update({ access_level: newLevel })
      .eq("id", placeId);
    if (!currentIsAdmin) updateQuery.eq("created_by", user.id);

    const { error: updateError, data: updateData } = await updateQuery.select();
    setTogglingAccess(false);

    if (updateError) {
      setError(updateError.message || "Failed to update access");
      isUpdatingRef.current = false;
      return;
    }
    if (updateData?.[0]) {
      setPlace((prev) => (prev ? { ...prev, access_level: newLevel } : prev));
    }
    setTimeout(() => { isUpdatingRef.current = false; }, 2000);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function openDeleteModal() {
    if (!placeId || !user || !place) return;
    setShowDeleteModal(true);
    setError(null);
  }

  function closeDeleteModal() {
    setShowDeleteModal(false);
  }

  async function confirmDeletePlace() {
    if (!placeId || !user || !place) return;
    setDeleting(true);
    setShowDeleteModal(false);
    setError(null);

    try {
      const currentIsAdmin = isUserAdmin(access);
      const targetQuery = supabase
        .from("places")
        .select("id, created_by")
        .eq("id", placeId);

      if (!currentIsAdmin) {
        targetQuery.eq("created_by", user.id);
      }

      const { data: deleteTarget, error: targetError } = await targetQuery.single();
      if (targetError || !deleteTarget) {
        setError(targetError?.message || "You do not have permission to delete this place.");
        setDeleting(false);
        return;
      }

      const { data: rawPhotos } = await supabase
        .from("place_photos")
        .select("url")
        .eq("place_id", placeId);

      const photosData = rawPhotos as PlacePhotoUrlRow[] | null;
      const photoStoragePaths = Array.from(
        new Set(
          (photosData ?? [])
            .map((photo) => getPublicStoragePath(photo.url, PLACE_PHOTOS_BUCKET))
            .filter((path): path is string => Boolean(path)),
        ),
      );

      const [photosResult, commentsResult, reactionsResult] = await Promise.all([
        supabase.from("place_photos").delete().eq("place_id", placeId),
        supabase.from("comments").delete().eq("place_id", placeId),
        supabase.from("reactions").delete().eq("place_id", placeId),
      ]);

      const relatedDeleteError = photosResult.error || commentsResult.error || reactionsResult.error;
      if (relatedDeleteError) {
        console.error("Related place delete error:", relatedDeleteError);
        setError(relatedDeleteError.message || "Failed to delete related place data");
        setDeleting(false);
        return;
      }

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

      if (photoStoragePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(PLACE_PHOTOS_BUCKET)
          .remove(photoStoragePaths);

        if (storageError) {
          console.warn("Failed to delete place photos from storage:", storageError);
        }
      }

      router.push("/profile");
    } catch (err) {
      console.error("Exception deleting place:", err);
      setError(err instanceof Error ? err.message : "Failed to delete place");
    } finally {
      setDeleting(false);
    }
  }

  /** Cancel Add Gem: delete the new place and go back to returnTo (where user came from). */
  async function handleCancelAddGem() {
    if (!placeId || !user || !place) return;
    setDeleting(true);
    setError(null);
    const targetPath = returnTo || "/profile";

    try {
      const currentIsAdmin = isUserAdmin(access);
      const targetQuery = supabase
        .from("places")
        .select("id, created_by")
        .eq("id", placeId);

      if (!currentIsAdmin) {
        targetQuery.eq("created_by", user.id);
      }

      const { data: deleteTarget, error: targetError } = await targetQuery.single();
      if (targetError || !deleteTarget) {
        setError(targetError?.message || "You do not have permission to cancel this place.");
        setDeleting(false);
        return;
      }

      const { data: rawPhotos } = await supabase
        .from("place_photos")
        .select("url")
        .eq("place_id", placeId);
      const photosData = rawPhotos as PlacePhotoUrlRow[] | null;
      const photoStoragePaths = Array.from(
        new Set(
          (photosData ?? [])
            .map((photo) => getPublicStoragePath(photo.url, PLACE_PHOTOS_BUCKET))
            .filter((path): path is string => Boolean(path)),
        ),
      );

      const [photosResult, commentsResult, reactionsResult] = await Promise.all([
        supabase.from("place_photos").delete().eq("place_id", placeId),
        supabase.from("comments").delete().eq("place_id", placeId),
        supabase.from("reactions").delete().eq("place_id", placeId),
      ]);

      const relatedDeleteError = photosResult.error || commentsResult.error || reactionsResult.error;
      if (relatedDeleteError) {
        setError(relatedDeleteError.message || "Failed to cancel");
        setDeleting(false);
        return;
      }

      const deleteQuery = supabase.from("places").delete().eq("id", placeId);
      if (!currentIsAdmin) deleteQuery.eq("created_by", user.id);
      const { error: deleteError } = await deleteQuery;
      if (deleteError) {
        setError(deleteError.message || "Failed to cancel");
        setDeleting(false);
        return;
      }

      if (photoStoragePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(PLACE_PHOTOS_BUCKET)
          .remove(photoStoragePaths);

        if (storageError) {
          console.warn("Failed to delete place photos from storage:", storageError);
        }
      }

      router.push(targetPath);
    } catch (err) {
      console.error("Cancel Add Gem error:", err);
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setDeleting(false);
    }
  }

  function handleExitEditor() {
    if (isNewPlace) {
      void handleCancelAddGem();
      return;
    }

    router.push(`/id/${placeId}`);
  }

  // Calculate publishing checklist
  const requiredSteps = useMemo<RequiredStep[]>(() => {
    if (!place) return [];

    const steps: RequiredStep[] = [];
    const isService = place.kind === "service";
    const isExperience = place.kind === "experience";
    const isOfferKind = isService || isExperience;

    steps.push({
      id: "cover",
      label: "Add a cover photo",
      completed: photos.length > 0,
      route: `/places/${placeId}/edit/photos`,
      priority: "required",
    });

    steps.push({
      id: "title",
      label: "Add a title",
      completed: !!(place.title && place.title.trim().length > 0),
      route: `/places/${placeId}/edit/title`,
      priority: "required",
    });

    steps.push({
      id: "category",
      label: "Select a category",
      completed: !!(place.categories && place.categories.length > 0),
      route: `/places/${placeId}/edit/categories`,
      priority: "required",
    });

    steps.push({
      id: "location",
      label: isOfferKind ? "Set city or address" : "Set location",
      completed: isOfferKind ? hasOfferLocation(place) : !!(place.lat && place.lng),
      route: `/places/${placeId}/edit/location`,
      priority: "required",
    });

    steps.push({
      id: "description",
      label: "Add description",
      completed: !!(place.description && place.description.trim().length > 0),
      route: `/places/${placeId}/edit/description`,
      priority: "recommended",
    });

    if (isOfferKind) {
      steps.push({
        id: "contacts",
        label: "Add a contact method",
        completed: hasContactInfo(place),
        route: `/places/${placeId}/edit/contacts`,
        priority: "required",
      });

      steps.push({
        id: "price",
        label: "Set price or keep By request",
        completed: true,
        route: `/places/${placeId}/edit/price`,
        priority: "recommended",
      });

      steps.push({
        id: "host",
        label: "Add host/provider info",
        completed: hasHostInfo(place),
        route: `/places/${placeId}/edit/host`,
        priority: "recommended",
      });
    }

    if (isExperience) {
      steps.push({
        id: "schedule",
        label: "Set schedule or duration",
        completed: hasScheduleInfo(place),
        route: `/places/${placeId}/edit/schedule`,
        priority: "required",
      });

      steps.push({
        id: "details",
        label: "Add guest size and meeting details",
        completed: hasExperienceDetails(place),
        route: `/places/${placeId}/edit/details`,
        priority: "recommended",
      });
    } else if (isService) {
      steps.push({
        id: "schedule",
        label: "Add availability",
        completed: hasScheduleInfo(place),
        route: `/places/${placeId}/edit/schedule`,
        priority: "recommended",
      });
    }

    return steps;
  }, [place, photos, placeId]);

  const publishSteps = requiredSteps.filter((s) => s.priority === "required");
  const recommendedSteps = requiredSteps.filter((s) => s.priority === "recommended");
  const incompleteSteps = publishSteps.filter((s) => !s.completed);
  const incompleteRecommendedSteps = recommendedSteps.filter((s) => !s.completed);
  const nextStep = incompleteSteps[0] ?? incompleteRecommendedSteps[0] ?? null;
  const completionPercentage = publishSteps.length > 0
    ? Math.round((publishSteps.filter((s) => s.completed).length / publishSteps.length) * 100)
    : 100;

  // Check if all publish-required fields are filled.
  const allRequiredFieldsFilled = useMemo(() => {
    return publishSteps.length > 0 && publishSteps.every((s) => s.completed);
  }, [publishSteps]);

  async function publishListing() {
    if (!placeId || !user || !place) return;
    if (!allRequiredFieldsFilled) {
      setError("Finish the required items before publishing.");
      setShowPublishConfirm(false);
      return;
    }

    setPublishing(true);
    setError(null);

    const updateQuery = supabase
      .from("places")
      // @ts-expect-error Supabase generated types infer update payload as never
      .update({ is_hidden: false, visibility: "public", manually_hidden: false })
      .eq("id", placeId);

    if (!isUserAdmin(access)) {
      updateQuery.eq("created_by", user.id);
    }

    const { error: updateError, data: updateData } = await updateQuery.select();
    setPublishing(false);
    setShowPublishConfirm(false);

    if (updateError) {
      setError(updateError.message || "Failed to publish listing");
      return;
    }

    if (updateData?.[0]) {
      setIsHidden(false);
      setPlace((prev) =>
        prev
          ? {
              ...prev,
              ...(updateData[0] as Place),
              is_hidden: false,
              visibility: "public",
              manually_hidden: false,
            }
          : prev
      );
    }

    if (navigator.vibrate) navigator.vibrate(10);
    const catalogHref = getPlaceCatalogHref(place.kind);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", catalogHref);
    }
    router.push(`/id/${placeId}`);
  }

  // Determine if this is a new place (no title or empty title)
  const isNewPlace = !place || !place.title || place.title.trim().length === 0;
  // "New Gem" / "New Service" / "New Experience" — зависит от типа карточки.
  // Gem оставлен как ласкательное обращение к локациям (исторически было).
  const newPlaceTitle =
    place?.kind === "service"    ? "New Service" :
    place?.kind === "experience" ? "New Experience" :
                                    "New Gem";
  const placeKindNoun =
    place?.kind === "service"    ? "service" :
    place?.kind === "experience" ? "experience" :
                                    "place";
  const placeKindLabel =
    place?.kind === "service"    ? "Service" :
    place?.kind === "experience" ? "Experience" :
                                    "Location";
  const previewCoverUrl = photos[0]?.url || place?.cover_url || null;
  const previewTitle = place?.title?.trim() || newPlaceTitle;
  const previewLocation =
    place?.address || place?.city_name_cached || place?.city || "Location not set";
  const previewCategory =
    place?.categories && place.categories.length > 0 ? place.categories[0] : "No category yet";
  const previewContactSummary = place && hasContactInfo(place)
    ? [
        place.phone && "Phone",
        place.website && "Website",
        place.instagram && "Instagram",
        place.youtube && "YouTube",
        place.telegram && "Telegram",
      ].filter(Boolean).join(", ")
    : "No contact method yet";
  const priceOptionsCount = Array.isArray(place?.price_options) ? place.price_options.length : 0;
  const hasPriceInfo = (place?.price_amount != null) || priceOptionsCount > 0;
  const priceSummary = place?.price_amount != null
    ? formatPriceSummary(place.price_amount, place.price_currency, place.price_unit)
    : priceOptionsCount > 0
      ? `${priceOptionsCount} ${priceOptionsCount === 1 ? "price option" : "price options"}`
      : "By request";

  // NOTE: keep editor minimal (as before)

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
    <SectionErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7] pb-24">
      {/* Top App Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-2">
            <div className="font-semibold font-fraunces text-[#1F2A1F] min-w-0 flex-1 truncate" style={{ fontSize: '24px' }}>
              {isNewPlace ? newPlaceTitle : (place?.title?.trim() || "")}
            </div>
            <button
              onClick={handleExitEditor}
              disabled={deleting}
              className={cx(
                "p-2 -mr-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition flex-shrink-0",
                deleting && "opacity-50 cursor-not-allowed"
              )}
              aria-label={isNewPlace ? "Cancel and go back" : "Close"}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-4 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}
        <div className="space-y-4">
            {/* Import from Google Maps — самостоятельный блок перед Progress */}
            {user && placeId && (
              <GoogleImportField userId={user.id} targetPlaceId={placeId} redirectToPreview />
            )}

            {isAdmin && (
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                      Admin owner
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FAFAF7] text-sm font-semibold text-[#8F9E4F] ring-1 ring-[#ECEEE4]">
                        {currentOwner?.avatar_url ? (
                          <Image
                            src={currentOwner.avatar_url}
                            alt=""
                            width={40}
                            height={40}
                            sizes="40px"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          ownerInitials(currentOwner)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[#1F2A1F]">
                          {ownerDisplayName(currentOwner)}
                        </div>
                        <div className="truncate text-xs text-[#6F7A5A]">
                          {ownerSubtitle(currentOwner) || place.created_by || "No owner id"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full space-y-3 lg:max-w-md">
                    <input
                      value={ownerSearchQuery}
                      onChange={(e) => setOwnerSearchQuery(e.target.value)}
                      className="h-11 w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F] focus:bg-white"
                      placeholder="Search registered users"
                    />
                    <input
                      value={ownerTransferReason}
                      onChange={(e) => setOwnerTransferReason(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#ECEEE4] bg-white px-3 text-xs text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F]"
                      placeholder="Reason (optional)"
                    />

                    {ownerTransferError && (
                      <div className="rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 px-3 py-2 text-xs text-[#C96A5B]">
                        {ownerTransferError}
                      </div>
                    )}
                    {ownerTransferNotice && (
                      <div className="rounded-xl border border-[#8F9E4F]/30 bg-[#F4F7EA] px-3 py-2 text-xs text-[#556036]">
                        {ownerTransferNotice}
                      </div>
                    )}

                    {ownerSearchLoading ? (
                      <div className="text-xs text-[#6F7A5A]">Searching...</div>
                    ) : ownerSearchResults.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-[#ECEEE4]">
                        {ownerSearchResults.map((candidate) => {
                          const isCurrentOwner = candidate.id === place.created_by;
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => handleTransferOwner(candidate)}
                              disabled={ownerTransferLoading || isCurrentOwner}
                              className={cx(
                                "flex w-full items-center justify-between gap-3 border-b border-[#ECEEE4] bg-white px-3 py-2 text-left last:border-b-0 transition",
                                isCurrentOwner
                                  ? "cursor-default opacity-60"
                                  : "hover:bg-[#FAFAF7]",
                                ownerTransferLoading && "cursor-wait opacity-70",
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-[#1F2A1F]">
                                  {ownerDisplayName(candidate)}
                                </span>
                                <span className="block truncate text-xs text-[#6F7A5A]">
                                  {ownerSubtitle(candidate) || candidate.id}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs font-medium text-[#8F9E4F]">
                                {isCurrentOwner ? "Current" : "Transfer"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : ownerSearchQuery.trim().length >= 2 ? (
                      <div className="text-xs text-[#6F7A5A]">No users found</div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Next best step */}
            <div className="rounded-2xl border border-[#DDE5C2] bg-[#F4F7EA] p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                    Next step
                  </div>
                  <h2 className="mt-1 font-fraunces text-lg font-semibold text-[#1F2A1F]">
                    {nextStep ? nextStep.label : "Preview and publish"}
                  </h2>
                  <p className="mt-1 text-sm text-[#6F7A5A]">
                    {nextStep
                      ? nextStep.priority === "required"
                        ? "This is required before the listing can go live."
                        : "This is optional, but it will make the listing easier to trust."
                      : "Everything required is ready. Check the listing preview before it goes public."}
                  </p>
                </div>
                {nextStep ? (
                  <Link
                    href={nextStep.route || `/places/${placeId}/edit`}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#1F2A1F] px-5 text-sm font-medium text-white hover:bg-[#2A3A2A] transition"
                  >
                    Continue
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#1F2A1F] px-5 text-sm font-medium text-white hover:bg-[#2A3A2A] transition"
                  >
                    Preview
                  </button>
                )}
              </div>
            </div>

            {/* Publishing checklist */}
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-sm font-medium text-[#1F2A1F]">Ready to publish</span>
                  <span className="text-sm font-semibold text-[#1F2A1F]">
                    {publishSteps.filter((s) => s.completed).length}/{publishSteps.length}
                  </span>
                </div>
                <div className="w-full h-2 bg-[#ECEEE4] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#8F9E4F] rounded-full transition-all duration-300"
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>

              {incompleteSteps.length > 0 ? (
                <>
                  <p className="text-sm text-[#6F7A5A]">
                    Finish the required items before publishing your {placeKindNoun}.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {incompleteSteps.slice(0, 4).map((step) => (
                      <Link
                        key={step.id}
                        href={step.route || `/places/${placeId}/edit`}
                        className="rounded-full border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-1 text-xs font-medium text-[#3F4A35] hover:border-[#8F9E4F] hover:bg-white transition"
                      >
                        {step.label}
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[#6F7A5A]">
                  Required items are complete. Use Publish when you are ready for this {placeKindNoun} to go live.
                </p>
              )}

              {incompleteRecommendedSteps.length > 0 && (
                <div className="mt-4 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                    Recommended
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {incompleteRecommendedSteps.slice(0, 4).map((step) => (
                      <Link
                        key={step.id}
                        href={step.route || `/places/${placeId}/edit`}
                        className="rounded-full bg-white px-3 py-1 text-xs text-[#6F7A5A] hover:text-[#1F2A1F] transition"
                      >
                        {step.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Legacy progress card, kept only for an empty checklist fallback */}
            {requiredSteps.length === 0 && incompleteSteps.length > 0 && (
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[#1F2A1F]">Progress</span>
                    <span className="text-sm font-semibold text-[#1F2A1F]">{completionPercentage}%</span>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-[#ECEEE4] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#8F9E4F] rounded-full transition-all duration-300"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm text-[#6F7A5A]">
                  Finish these final tasks to publish your {placeKindNoun}.
                </p>
              </div>
            )}

            {/* Photo Tour Card */}
            <Link
              href={`/places/${placeId}/edit/photos`}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  {/* Status Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    photos.length > 0 ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                  }`}>
                    <Icon 
                      name="check" 
                      size={16} 
                      className={photos.length > 0 ? 'text-white' : 'text-[#A8B096]'} 
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Photo tour</h3>
                    {photos.length > 0 ? (
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                          {photos.slice(0, 3).map((photo, idx) => (
                            <div
                              key={idx}
                              className="w-12 h-12 rounded-lg border-2 border-white overflow-hidden bg-[#FAFAF7]"
                            >
                              <Image
                                src={photo.url}
                                alt=""
                                width={48}
                                height={48}
                                sizes="48px"
                                className="h-full w-full object-cover"
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
                <div className="flex items-center gap-3 flex-1">
                  {/* Status Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    place.title && place.title.trim().length > 0 ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                  }`}>
                    <Icon 
                      name="check" 
                      size={16} 
                      className={place.title && place.title.trim().length > 0 ? 'text-white' : 'text-[#A8B096]'} 
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Title</h3>
                    <p className="text-sm text-[#6F7A5A] line-clamp-1">
                      {place.title || "No title yet"}
                    </p>
                  </div>
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
                <div className="flex items-center gap-3 flex-1">
                  {/* Status Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    place.description && place.description.trim().length > 0 ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                  }`}>
                    <Icon 
                      name="check" 
                      size={16} 
                      className={place.description && place.description.trim().length > 0 ? 'text-white' : 'text-[#A8B096]'} 
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Description</h3>
                    <p className="text-sm text-[#6F7A5A] line-clamp-2">
                      {place.description || "No description yet"}
                    </p>
                  </div>
                </div>
                <Icon name="forward" size={20} className="text-[#6F7A5A]" />
              </div>
            </Link>

            {/* Location Card.
                Для service/experience карточка не точка на карте — поэтому считаем
                заполненной по city/address (без lat/lng) и переименовываем заголовок. */}
            {(() => {
              const isOfferKindCard = place.kind === "service" || place.kind === "experience";
              const cityFilled = !!(
                (place.city_name_cached && place.city_name_cached.trim().length > 0) ||
                (place.city && place.city.trim().length > 0) ||
                (place.address && place.address.trim().length > 0)
              );
              const locationDone = isOfferKindCard ? cityFilled : !!(place.lat && place.lng);
              const cardTitle = isOfferKindCard ? "City & address" : "Location";
              const cardSubtitle = place.address || place.city_name_cached || place.city || (isOfferKindCard ? "No city set" : "No location set");
              return (
                <Link
                  href={`/places/${placeId}/edit/location`}
                  className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {/* Status Icon */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        locationDone ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                      }`}>
                        <Icon
                          name="check"
                          size={16}
                          className={locationDone ? 'text-white' : 'text-[#A8B096]'}
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">{cardTitle}</h3>
                        <p className="text-sm text-[#6F7A5A] line-clamp-1">{cardSubtitle}</p>
                      </div>
                    </div>
                    <Icon name="forward" size={20} className="text-[#6F7A5A]" />
                  </div>
                </Link>
              );
            })()}

            {/* Categories Card */}
            <Link
              href={`/places/${placeId}/edit/categories`}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  {/* Status Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    place.categories && place.categories.length > 0 ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                  }`}>
                    <Icon 
                      name="check" 
                      size={16} 
                      className={place.categories && place.categories.length > 0 ? 'text-white' : 'text-[#A8B096]'} 
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Categories</h3>
                    <p className="text-sm text-[#6F7A5A]">
                      {place.categories && place.categories.length > 0
                        ? `${place.categories[0]}${place.categories.length > 1 ? ` +${place.categories.length - 1}` : ""}`
                        : "No categories selected"}
                    </p>
                  </div>
                </div>
                <Icon name="forward" size={20} className="text-[#6F7A5A]" />
              </div>
            </Link>

            {/* Contacts Card — для всех kinds (location/service/experience) */}
            <Link
              href={`/places/${placeId}/edit/contacts`}
              className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  {(() => {
                    const filledCount =
                      (place.phone ? 1 : 0) +
                      (place.website ? 1 : 0) +
                      (place.instagram ? 1 : 0) +
                      (place.youtube ? 1 : 0) +
                      (place.telegram ? 1 : 0);
                    const hasAny = filledCount > 0;
                    return (
                      <>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          hasAny ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                        }`}>
                          <Icon
                            name="check"
                            size={16}
                            className={hasAny ? 'text-white' : 'text-[#A8B096]'}
                          />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Contacts</h3>
                          <p className="text-sm text-[#6F7A5A] line-clamp-1">
                            {hasAny
                              ? `${filledCount} of 5 set${
                                  [
                                    place.phone && "phone",
                                    place.website && "website",
                                    place.instagram && "Instagram",
                                    place.youtube && "YouTube",
                                    place.telegram && "Telegram",
                                  ]
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .join(", ")
                                    ? ` — ${[
                                        place.phone && "phone",
                                        place.website && "website",
                                        place.instagram && "Instagram",
                                        place.youtube && "YouTube",
                                        place.telegram && "Telegram",
                                      ]
                                        .filter(Boolean)
                                        .join(", ")}`
                                    : ""
                                }`
                              : "Phone, website, Instagram, YouTube, Telegram"}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <Icon name="forward" size={20} className="text-[#6F7A5A]" />
              </div>
            </Link>

            {/* Linked places — встроенная панель добавления + мини-список active.
                Видна для всех kinds. Полное управление (approve/reject/rejected log) —
                на /places/[id]/edit/links через ссылку "Manage all". */}
            {place.kind && (
              <SectionErrorBoundary>
                <LinkedPlacesEditorBlock
                  placeId={placeId}
                  kind={place.kind}
                />
              </SectionErrorBoundary>
            )}

            {/* Price + Schedule cards — только для service / experience */}
            {place.kind && place.kind !== "location" && (
              <>
                {/* Price Card */}
                <Link
                  href={`/places/${placeId}/edit/price`}
                  className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        hasPriceInfo ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                      }`}>
                        <Icon
                          name="check"
                          size={16}
                          className={hasPriceInfo ? 'text-white' : 'text-[#A8B096]'}
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Price</h3>
                        <p className="text-sm text-[#6F7A5A]">
                          {priceSummary}
                        </p>
                      </div>
                    </div>
                    <Icon name="forward" size={20} className="text-[#6F7A5A]" />
                  </div>
                </Link>

                {/* Schedule Card */}
                <Link
                  href={`/places/${placeId}/edit/schedule`}
                  className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        place.schedule || place.duration_minutes ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                      }`}>
                        <Icon
                          name="check"
                          size={16}
                          className={place.schedule || place.duration_minutes ? 'text-white' : 'text-[#A8B096]'}
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Schedule</h3>
                        <p className="text-sm text-[#6F7A5A]">
                          {formatScheduleSummary(place.schedule, place.duration_minutes)}
                        </p>
                      </div>
                    </div>
                    <Icon name="forward" size={20} className="text-[#6F7A5A]" />
                  </div>
                </Link>

                {/* Details Card — только для experience */}
                {place.kind === "experience" && (
                  <Link
                    href={`/places/${placeId}/edit/details`}
                    className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          (place.max_guests || place.meeting_point || place.cancellation_policy ||
                           (place.included_items && place.included_items.length > 0) ||
                           (place.bring_items && place.bring_items.length > 0))
                            ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                        }`}>
                          <Icon
                            name="check"
                            size={16}
                            className={
                              (place.max_guests || place.meeting_point || place.cancellation_policy ||
                               (place.included_items && place.included_items.length > 0) ||
                               (place.bring_items && place.bring_items.length > 0))
                                ? 'text-white' : 'text-[#A8B096]'
                            }
                          />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Details</h3>
                          <p className="text-sm text-[#6F7A5A] line-clamp-1">
                            {formatDetailsSummary(place)}
                          </p>
                        </div>
                      </div>
                      <Icon name="forward" size={20} className="text-[#6F7A5A]" />
                    </div>
                  </Link>
                )}

                {/* Host info Card */}
                <Link
                  href={`/places/${placeId}/edit/host`}
                  className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        place.host_qualification || place.service_mode ? 'bg-[#7FA35C]' : 'bg-[#ECEEE4]'
                      }`}>
                        <Icon
                          name="check"
                          size={16}
                          className={place.host_qualification || place.service_mode ? 'text-white' : 'text-[#A8B096]'}
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Host info</h3>
                        <p className="text-sm text-[#6F7A5A] line-clamp-1">
                          {place.host_qualification || (place.service_mode
                            ? formatServiceModeLabel(place.service_mode)
                            : "Add your qualification + where you work")}
                        </p>
                      </div>
                    </div>
                    <Icon name="forward" size={20} className="text-[#6F7A5A]" />
                  </div>
                </Link>
              </>
            )}

            {/* Collections Card (Admin only) */}
            {isAdmin && (
              <Link
                href={`/places/${placeId}/edit/collections`}
                className="block rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-[#ECEEE4]">
                      <Icon name="grid" size={16} className="text-[#A8B096]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Collections</h3>
                      <p className="text-sm text-[#6F7A5A]">Assign to curated collections (admin)</p>
                    </div>
                  </div>
                  <Icon name="forward" size={20} className="text-[#6F7A5A]" />
                </div>
              </Link>
            )}

            <div className="pt-2">
              <h2 className="font-fraunces font-semibold text-[#1F2A1F] text-base">
                Settings
              </h2>
            </div>

            {/* Visibility (moved from Place settings) */}
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Visibility</h3>
                  <p className="text-sm text-[#6F7A5A]">
                    {!isHidden
                      ? "Visible to all users on Maporia."
                      : "Hidden from other users (only you can see it)."}
                  </p>
                </div>
                <button
                  onClick={handleToggleVisibility}
                  disabled={hiding}
                  className={cx(
                    "relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2",
                    hiding && "opacity-50 cursor-not-allowed",
                    !isHidden ? "bg-[#8F9E4F]" : "bg-[#DADDD0]"
                  )}
                  role="switch"
                  aria-checked={!isHidden}
                  aria-label={!isHidden ? "Public listing" : "Draft listing"}
                >
                  <span
                    className={cx(
                      "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      !isHidden ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Comments Card */}
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Comments</h3>
                  <p className="text-sm text-[#6F7A5A]">
                    {commentsEnabled
                      ? "Users can comment on this place."
                      : "Comments are disabled for this place."}
                  </p>
                </div>
                <button
                  onClick={handleToggleComments}
                  disabled={togglingComments}
                  className={cx(
                    "relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2",
                    togglingComments && "opacity-50 cursor-not-allowed",
                    commentsEnabled ? "bg-[#8F9E4F]" : "bg-[#DADDD0]"
                  )}
                  role="switch"
                  aria-checked={commentsEnabled}
                  aria-label="Comments enabled"
                >
                  <span
                    className={cx(
                      "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      commentsEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Access Card — свитч: выключен = Public, включен = Premium */}
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-fraunces font-semibold text-[#1F2A1F] mb-1">Access</h3>
                  <p className="text-sm text-[#6F7A5A] flex flex-wrap items-center gap-1.5">
                    {place.access_level === "premium" ? (
                      <>
                        <PremiumBadge />
                        <span>— visible to Premium subscribers.</span>
                      </>
                    ) : (
                      "Public — visible to all users."
                    )}
                  </p>
                </div>
                <button
                  onClick={handleToggleAccess}
                  disabled={togglingAccess}
                  className={cx(
                    "relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2",
                    togglingAccess && "opacity-50 cursor-not-allowed",
                    place.access_level === "premium" ? "bg-[#8F9E4F]" : "bg-[#DADDD0]"
                  )}
                  role="switch"
                  aria-checked={place.access_level === "premium"}
                  aria-label={place.access_level === "premium" ? "Premium access" : "Free access"}
                >
                  <span
                    className={cx(
                      "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      place.access_level === "premium" ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Danger zone (moved from Place settings) */}
            <div className="rounded-2xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-5 shadow-sm">
              <h3 className="font-semibold font-fraunces text-[#C96A5B] mb-2">Danger zone</h3>
              <p className="text-sm text-[#6F7A5A] mb-4">
                Once you delete a place, there is no going back. Please be certain.
              </p>
              <button
                onClick={openDeleteModal}
                disabled={deleting}
                className={cx(
                  "text-sm font-medium text-[#C96A5B] hover:text-[#C96A5B] underline transition hover:opacity-80",
                  deleting && "opacity-50 cursor-not-allowed"
                )}
              >
                {deleting ? "Deleting…" : "Delete place"}
              </button>
            </div>
          </div>
      </div>

      {/* Delete place confirmation modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-place-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#ECEEE4] shadow-lg p-6">
            <h2 id="delete-place-modal-title" className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
              Delete place
            </h2>
            <p className="text-sm text-[#6F7A5A] mb-6">
              Are you sure you want to delete <strong className="text-[#1F2A1F]">{place?.title || "this place"}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="px-4 py-2.5 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletePlace}
                className="px-4 py-2.5 rounded-xl bg-[#C96A5B] text-white text-sm font-medium hover:bg-[#B85A4B] transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Listing preview modal */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="listing-preview-modal-title"
        >
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#ECEEE4] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#ECEEE4] px-5 py-4">
              <div>
                <h2 id="listing-preview-modal-title" className="font-fraunces text-xl font-semibold text-[#1F2A1F]">
                  Listing preview
                </h2>
                <p className="mt-0.5 text-sm text-[#6F7A5A]">
                  This is the core information buyers will see first.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="rounded-lg p-2 text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
                aria-label="Close preview"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="overflow-hidden rounded-2xl border border-[#ECEEE4] bg-[#FFFEFB]">
                <div className="relative aspect-[16/9] bg-[#ECEEE4]">
                  {previewCoverUrl ? (
                    <Image
                      src={previewCoverUrl}
                      alt={previewTitle}
                      fill
                      sizes="(max-width: 768px) 100vw, 640px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[#6F7A5A]">
                      No cover photo yet
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#1F2A1F] shadow-sm">
                    {placeKindLabel}
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8F9E4F]">
                      {previewCategory}
                    </div>
                    <h3 className="mt-1 font-fraunces text-2xl font-semibold leading-tight text-[#1F2A1F]">
                      {previewTitle}
                    </h3>
                    <p className="mt-1 text-sm text-[#6F7A5A]">{previewLocation}</p>
                  </div>

                  <p className="text-sm leading-relaxed text-[#3F4A35]">
                    {place.description?.trim() || "Description is not set yet."}
                  </p>

                  {place.kind !== "location" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[#ECEEE4] bg-white p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                          Price
                        </div>
                        <div className="mt-1 text-sm font-medium text-[#1F2A1F]">
                          {priceSummary}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#ECEEE4] bg-white p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                          Schedule
                        </div>
                        <div className="mt-1 text-sm font-medium text-[#1F2A1F]">
                          {formatScheduleSummary(place.schedule, place.duration_minutes)}
                        </div>
                      </div>
                    </div>
                  )}

                  {place.kind === "experience" && (
                    <div className="rounded-xl border border-[#ECEEE4] bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                        Details
                      </div>
                      <div className="mt-1 text-sm font-medium text-[#1F2A1F]">
                        {formatDetailsSummary(place)}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-[#ECEEE4] bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                      Contact
                    </div>
                    <div className="mt-1 text-sm font-medium text-[#1F2A1F]">
                      {previewContactSummary}
                    </div>
                  </div>
                </div>
              </div>

              {!allRequiredFieldsFilled && (
                <div className="mt-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
                  Finish required items before publishing: {incompleteSteps.map((step) => step.label).join(", ")}.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-[#ECEEE4] px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="h-11 rounded-xl border border-[#ECEEE4] bg-white px-5 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPreviewModal(false);
                  setShowPublishConfirm(true);
                }}
                disabled={!allRequiredFieldsFilled || publishing}
                className={cx(
                  "h-11 rounded-xl px-5 text-sm font-medium transition",
                  allRequiredFieldsFilled && !publishing
                    ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                    : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
                )}
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish confirmation modal */}
      {showPublishConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-listing-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#ECEEE4] shadow-lg p-6">
            <h2 id="publish-listing-modal-title" className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
              Publish {placeKindNoun}
            </h2>
            <p className="text-sm text-[#6F7A5A] mb-4">
              This {placeKindNoun} will become visible on Maporia. You can still edit it later.
            </p>
            {incompleteRecommendedSteps.length > 0 && (
              <div className="mb-5 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                  Still recommended
                </div>
                <div className="mt-1 text-sm text-[#3F4A35]">
                  {incompleteRecommendedSteps.slice(0, 3).map((step) => step.label).join(", ")}
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowPublishConfirm(false)}
                disabled={publishing}
                className="px-4 py-2.5 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium hover:bg-[#FAFAF7] transition disabled:opacity-50"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={publishListing}
                disabled={publishing}
                className="px-4 py-2.5 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition disabled:opacity-50"
              >
                {publishing ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#ECEEE4] pb-safe-bottom">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/profile?section=added")}
              disabled={deleting || publishing}
              className={cx(
                "flex-1 h-11 rounded-xl border border-[#ECEEE4] bg-white px-5 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition",
                (deleting || publishing) && "opacity-50 cursor-not-allowed"
              )}
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              disabled={deleting || publishing}
              className={cx(
                "flex-1 h-11 rounded-xl border border-[#8F9E4F] bg-white px-5 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition",
                (deleting || publishing) && "opacity-50 cursor-not-allowed"
              )}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => {
                if (!allRequiredFieldsFilled) {
                  setError("Finish the required items before publishing.");
                  return;
                }
                setShowPreviewModal(true);
              }}
              disabled={!allRequiredFieldsFilled || deleting || publishing}
              className={cx(
                "flex-1 h-11 rounded-xl px-5 text-sm font-medium text-center transition flex items-center justify-center",
                allRequiredFieldsFilled && !deleting && !publishing
                  ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                  : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
              )}
            >
              {isHidden ? "Publish" : "Update live listing"}
            </button>
          </div>
        </div>
      </div>

      </main>
    </SectionErrorBoundary>
  );
}

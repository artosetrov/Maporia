import type { PlaceKind, PriceUnit } from "../types/supabase";

export const ORPHAN_ADD_DRAFT_TTL_HOURS = 24;
export const ORPHAN_ADD_DRAFT_CLEANUP_LIMIT = 100;

export type OrphanAddDraftCandidate = {
  id: string;
  title: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  city_name_cached?: string | null;
  country: string | null;
  cover_url: string | null;
  photo_urls: string[] | null;
  video_url?: string | null;
  categories: string[] | null;
  tags: string[] | null;
  link: string | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  telegram?: string | null;
  lat: number | null;
  lng: number | null;
  is_hidden: boolean | null;
  visibility: string | null;
  manually_hidden?: boolean | null;
  kind?: PlaceKind | null;
  price_amount?: number | null;
  price_currency?: string | null;
  price_unit?: PriceUnit | null;
  price_options?: unknown[] | null;
  duration_minutes?: number | null;
  schedule?: unknown;
  host_qualification?: string | null;
  service_mode?: string | null;
  max_guests?: number | null;
  min_guests?: number | null;
  meeting_point?: string | null;
  cancellation_policy?: string | null;
  included_items?: string[] | null;
  bring_items?: string[] | null;
  created_at: string;
};

export const ORPHAN_ADD_DRAFT_SELECT = [
  "id",
  "title",
  "description",
  "address",
  "city",
  "city_name_cached",
  "country",
  "cover_url",
  "photo_urls",
  "video_url",
  "categories",
  "tags",
  "link",
  "phone",
  "website",
  "instagram",
  "youtube",
  "telegram",
  "lat",
  "lng",
  "is_hidden",
  "visibility",
  "manually_hidden",
  "kind",
  "price_amount",
  "price_currency",
  "price_unit",
  "price_options",
  "duration_minutes",
  "schedule",
  "host_qualification",
  "service_mode",
  "max_guests",
  "min_guests",
  "meeting_point",
  "cancellation_policy",
  "included_items",
  "bring_items",
  "created_at",
].join(",");

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function isEmptyArray(value: unknown[] | null | undefined): boolean {
  return !value || value.length === 0;
}

function isEmptyJsonObject(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).length === 0;
}

export function orphanAddDraftCutoff(now = Date.now()): string {
  return new Date(now - ORPHAN_ADD_DRAFT_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function isOrphanAddDraftCandidate(place: OrphanAddDraftCandidate): boolean {
  const isHiddenDraft = place.is_hidden === true || place.visibility === "hidden" || place.visibility === "private";
  if (!isHiddenDraft || place.manually_hidden === true) return false;

  return (
    isBlank(place.title) &&
    isBlank(place.description) &&
    isBlank(place.address) &&
    isBlank(place.city) &&
    isBlank(place.city_name_cached) &&
    isBlank(place.country) &&
    isBlank(place.cover_url) &&
    isBlank(place.video_url) &&
    isEmptyArray(place.photo_urls) &&
    isEmptyArray(place.categories) &&
    isEmptyArray(place.tags) &&
    isBlank(place.link) &&
    isBlank(place.phone) &&
    isBlank(place.website) &&
    isBlank(place.instagram) &&
    isBlank(place.youtube) &&
    isBlank(place.telegram) &&
    place.lat == null &&
    place.lng == null &&
    place.price_amount == null &&
    isBlank(place.price_currency) &&
    place.price_unit == null &&
    isEmptyArray(place.price_options) &&
    place.duration_minutes == null &&
    isEmptyJsonObject(place.schedule) &&
    isBlank(place.host_qualification) &&
    place.service_mode == null &&
    place.max_guests == null &&
    place.min_guests == null &&
    isBlank(place.meeting_point) &&
    place.cancellation_policy == null &&
    isEmptyArray(place.included_items) &&
    isEmptyArray(place.bring_items)
  );
}

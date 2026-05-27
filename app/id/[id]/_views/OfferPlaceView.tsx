"use client";

/**
 * OfferPlaceView — страница места для kind = "service" | "experience".
 *
 * "location" остаётся в текущем app/id/[id]/page.tsx (огромный файл с галереями/комментариями).
 * Здесь — отдельная страница в стиле Airbnb Experience: hero, цена, длительность,
 * расписание, описание, мини-карта, CTA.
 *
 * MVP: без комментариев и сложной галереи. Расширим, как сообщество протестит формат.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "../../../providers/GoogleMapsProvider";
import { PLACE_LAYOUT_CONFIG } from "../../../config/placeLayout";
import { getMapOptions } from "../../../config/googleMaps";
import { createStaticPinSvg } from "../../../lib/mapMarkers";
import { supabase } from "../../../lib/supabase";
import TopBar from "../../../components/TopBar";
import DesktopMosaic from "../../../components/DesktopMosaic";
import MobileCarousel from "../../../components/MobileCarousel";
import FavoriteIcon from "../../../components/FavoriteIcon";
import Icon from "../../../components/Icon";
import PremiumBadge from "../../../components/PremiumBadge";
import ReviewsSection from "../../../components/ReviewsSection";
import ParentLocationCard from "./ParentLocationCard";
import StarRating from "../../../components/StarRating";
import PlaceContacts from "../../../components/PlaceContacts";
import { isPlacePremium } from "../../../lib/access";
import { getPlaceCatalogHref } from "../../../lib/navigation";
import { CategoryVisualIcon, getCategoryLabel } from "../../../lib/categoryVisuals";

type OfferPlace = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  link: string | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  telegram?: string | null;
  tags: string[] | null;
  categories: string[] | null;
  cover_url: string | null;
  photo_urls: string[] | null;
  created_by: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  access_level?: string | null;
  comments_enabled?: boolean | null;
  kind?: "location" | "service" | "experience" | null;
  price_amount?: number | null;
  price_currency?: string | null;
  price_unit?: string | null;
  price_options?: unknown | null;
  duration_minutes?: number | null;
  schedule?: unknown | null;
  host_qualification?: string | null;
  service_mode?: 'at_provider' | 'at_client' | 'online' | 'flexible' | null;
  max_guests?: number | null;
  min_guests?: number | null;
  meeting_point?: string | null;
  cancellation_policy?: 'flexible' | 'moderate' | 'strict' | 'non_refundable' | 'custom' | null;
  included_items?: string[] | null;
  bring_items?: string[] | null;
};

type HostProfile = {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type Props = {
  place: OfferPlace;
  kind: "service" | "experience";
  canEdit: boolean;
  userAvatar: string | null;
  userDisplayName: string | null;
  userEmail: string | null;
  isFavorite: boolean;
  favoriteLoading: boolean;
  onToggleFavorite: () => void;
  /** Профиль создателя карточки (host) — для блока «Hosted by». */
  hostProfile?: HostProfile | null;
  /** Already batched by the parent page: place_photos, then legacy fallbacks. */
  photos?: string[];
};

// ---------- helpers ----------

const PRICE_UNIT_LABEL: Record<string, string> = {
  fixed: "",
  from: "from",
  per_hour: "/ hr",
  per_person: "/ person",
  per_day: "/ day",
  per_month: "/ month",
  per_session: "/ session",
};

type PriceOption = {
  id?: string | null;
  group_label?: string | null;
  label?: string | null;
  amount: number;
  compare_at_amount?: number | null;
  currency?: string | null;
  unit?: string | null;
  duration_minutes?: number | null;
  badge?: string | null;
  is_featured?: boolean | null;
  note?: string | null;
  sort_order?: number | null;
};

const SERVICE_MODE_LABELS: Record<string, string> = {
  at_provider: "At provider's place",
  at_client:   "At your place",
  online:      "Online",
  flexible:    "Flexible",
};

const CANCELLATION_LABELS: Record<string, string> = {
  flexible:       "Flexible cancellation",
  moderate:       "Moderate cancellation",
  strict:         "Strict cancellation",
  non_refundable: "Non-refundable",
  custom:         "Custom policy",
};

function formatGuests(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min == null && max == null) return null;
  if (max != null && min != null && min !== max) return `${min}–${max} guests`;
  if (max != null) return `Up to ${max} guests`;
  if (min != null) return `Min ${min} guests`;
  return null;
}

function initialsFromHost(name?: string | null, username?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
    return name[0]?.toUpperCase() || "U";
  }
  if (username) return username[0]?.toUpperCase() || "U";
  return "U";
}

function formatPrice(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return null;
  const cur = (currency || "USD").toUpperCase();
  const symbol =
    cur === "USD" ? "$" :
    cur === "EUR" ? "€" :
    cur === "RUB" ? "₽" :
    cur === "GBP" ? "£" : "";
  // Если есть копейки — оставляем 2 знака, иначе целое
  const hasCents = amount % 1 !== 0;
  const formatted = hasCents ? amount.toFixed(2) : Math.round(amount).toString();
  return symbol ? `${symbol}${formatted}` : `${formatted} ${cur}`;
}

function normalizePriceOptions(raw: unknown): PriceOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): PriceOption | null => {
      if (!item || typeof item !== "object") return null;
      const option = item as Record<string, unknown>;
      const amount = typeof option.amount === "number" ? option.amount : Number(option.amount);
      if (!Number.isFinite(amount)) return null;
      const compareAtAmount =
        typeof option.compare_at_amount === "number" && Number.isFinite(option.compare_at_amount)
          ? option.compare_at_amount
          : null;
      const durationMinutes =
        typeof option.duration_minutes === "number" && Number.isFinite(option.duration_minutes)
          ? Math.round(option.duration_minutes)
          : null;
      const sortOrder =
        typeof option.sort_order === "number" && Number.isFinite(option.sort_order)
          ? option.sort_order
          : null;
      return {
        id: typeof option.id === "string" ? option.id : null,
        group_label: typeof option.group_label === "string" ? option.group_label : null,
        label: typeof option.label === "string" ? option.label : null,
        amount,
        compare_at_amount: compareAtAmount,
        currency: typeof option.currency === "string" ? option.currency : "USD",
        unit: typeof option.unit === "string" ? option.unit : "fixed",
        duration_minutes: durationMinutes,
        badge: typeof option.badge === "string" ? option.badge : null,
        is_featured: option.is_featured === true,
        note: typeof option.note === "string" ? option.note : null,
        sort_order: sortOrder,
      };
    })
    .filter((item): item is PriceOption => Boolean(item))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function formatPriceOption(option: PriceOption): string {
  const text = formatPrice(option.amount, option.currency) ?? "";
  const unit = option.unit ? PRICE_UNIT_LABEL[option.unit] ?? "" : "";
  const suffix = unit && option.unit !== "from" ? ` ${unit}` : "";
  return `${text}${suffix}`;
}

function formatBasePrice(
  amount: number | null | undefined,
  currency: string | null | undefined,
  unit: string | null | undefined
): string | null {
  const text = formatPrice(amount, currency);
  if (!text) return null;
  const unitLabel = unit ? PRICE_UNIT_LABEL[unit] ?? "" : "";
  const suffix = unitLabel && unit !== "from" ? ` ${unitLabel}` : "";
  return `${text}${suffix}`;
}

function formatBasePriceAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
  unit: string | null | undefined
): string | null {
  const text = formatPrice(amount, currency);
  if (!text) return null;
  const unitLabel = unit ? PRICE_UNIT_LABEL[unit] ?? "" : "";
  const suffix = unitLabel && unit !== "from" ? ` ${unitLabel}` : "";
  return `${text}${suffix}`;
}

function getPrimaryPriceOption(options: PriceOption[]): PriceOption | null {
  if (options.length === 0) return null;
  return options.find((option) => option.is_featured) ?? options[0];
}

function getPriceOptionTitle(option: PriceOption, index: number): string {
  return option.group_label?.trim() || option.label?.trim() || `Option ${index + 1}`;
}

function getPriceOptionMetaLabel(option: PriceOption, title: string): string | null {
  const label = option.label?.trim();
  if (!label || label.toLowerCase() === title.toLowerCase()) return null;
  return label;
}

function getPriceOptionAmountText(option: PriceOption): string {
  const text = formatPrice(option.amount, option.currency) ?? "";
  const unit = option.unit ? PRICE_UNIT_LABEL[option.unit] ?? "" : "";
  const suffix = unit && option.unit !== "from" ? ` ${unit}` : "";
  return `${text}${suffix}`;
}

function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

function describeSchedule(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { type?: string; days?: string[]; from?: string; to?: string; dates?: string[] };
  if (s.type === "weekly" && Array.isArray(s.days) && s.days.length > 0) {
    const days = s.days.map((d) => DAY_LABELS[d] || d).join(", ");
    if (s.from && s.to) return `${days}, ${s.from}–${s.to}`;
    return days;
  }
  if (s.type === "dates" && Array.isArray(s.dates) && s.dates.length > 0) {
    const first = s.dates.slice(0, 3).join(", ");
    return s.dates.length > 3 ? `${first} +${s.dates.length - 3} more` : first;
  }
  if (s.type === "on_request") return "By request";
  return null;
}

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function normalizeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "#";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function stripUrlForCompare(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

// ---------- component ----------

export default function OfferPlaceView({
  place,
  kind,
  canEdit,
  userAvatar,
  userDisplayName,
  userEmail,
  isFavorite,
  favoriteLoading,
  onToggleFavorite,
  hostProfile,
  photos,
}: Props) {
  const router = useRouter();
  const handleBackClick = () => router.push(getPlaceCatalogHref(kind));
  const { isLoaded: mapsLoaded, loadError: mapsLoadError } = useGoogleMaps();

  const isService = kind === "service";
  const kindLabel = isService ? "Service" : "Experience";
  const kindEmoji = isService ? "🛠" : "✨";

  const basePriceText = useMemo(
    () => formatBasePrice(place.price_amount, place.price_currency, place.price_unit),
    [place.price_amount, place.price_currency, place.price_unit]
  );
  const priceOptions = useMemo(() => normalizePriceOptions(place.price_options), [place.price_options]);
  const primaryPriceOption = useMemo(() => getPrimaryPriceOption(priceOptions), [priceOptions]);
  const primaryPriceOptionText = primaryPriceOption ? formatPriceOption(primaryPriceOption) : null;
  const badgeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const option of priceOptions) {
      const key = option.badge?.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [priceOptions]);
  const durationText = useMemo(() => formatDuration(place.duration_minutes), [place.duration_minutes]);
  const scheduleText = useMemo(() => describeSchedule(place.schedule), [place.schedule]);

  const isPremium = isPlacePremium(place);

  const center = useMemo(
    () => (place.lat && place.lng ? { lat: place.lat, lng: place.lng } : null),
    [place.lat, place.lng]
  );

  const ctaLabel = "Contact";

  const allPhotos = useMemo(() => {
    if (photos && photos.length > 0) return photos;
    const list: string[] = [];
    if (place.cover_url) list.push(place.cover_url);
    for (const u of place.photo_urls ?? []) {
      if (typeof u === "string" && u.length > 0 && !list.includes(u)) list.push(u);
    }
    return list;
  }, [photos, place.cover_url, place.photo_urls]);

  const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
  const [galleryPhotoIndex, setGalleryPhotoIndex] = useState(0);
  const [contactModalOpen, setContactModalOpen] = useState(false);

  useEffect(() => {
    if (!photoGalleryOpen && !contactModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPhotoGalleryOpen(false);
        setContactModalOpen(false);
      }
      if (photoGalleryOpen && event.key === "ArrowLeft") {
        setGalleryPhotoIndex((current) => (current > 0 ? current - 1 : allPhotos.length - 1));
      }
      if (photoGalleryOpen && event.key === "ArrowRight") {
        setGalleryPhotoIndex((current) => (current < allPhotos.length - 1 ? current + 1 : 0));
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [photoGalleryOpen, contactModalOpen, allPhotos.length]);

  const openPhotoGallery = (index: number) => {
    if (allPhotos.length === 0) return;
    setGalleryPhotoIndex(Math.min(Math.max(index, 0), allPhotos.length - 1));
    setPhotoGalleryOpen(true);
  };

  const closePhotoGallery = () => {
    setPhotoGalleryOpen(false);
  };

  const showNextPhoto = () => {
    setGalleryPhotoIndex((current) => (current < allPhotos.length - 1 ? current + 1 : 0));
  };

  const showPreviousPhoto = () => {
    setGalleryPhotoIndex((current) => (current > 0 ? current - 1 : allPhotos.length - 1));
  };

  const contactLink = place.link?.trim() || null;
  const showContactLink = Boolean(
    contactLink && stripUrlForCompare(contactLink) !== stripUrlForCompare(place.website)
  );
  const hasContactDetails = Boolean(
    place.phone?.trim() ||
    place.website?.trim() ||
    place.instagram?.trim() ||
    place.youtube?.trim() ||
    place.telegram?.trim() ||
    showContactLink
  );
  const hostName = hostProfile?.display_name?.trim() || hostProfile?.username?.trim() || "your host";

  const handleShare = async () => {
    const url = `${window.location.origin}/id/${place.id}`;
    const shareData = {
      title: place.title || "Maporia",
      text: place.description || place.title || "Maporia",
      url,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      // Sharing is a convenience action; leave the modal open if the user cancels.
    }
  };

  // Aggregate rating через RPC. Молча ничего не показываем при ошибке.
  const [rating, setRating] = useState<{ avg: number; count: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc(
        "get_place_rating" as never,
        { p_place_id: place.id } as never
      );
      if (cancelled || error || !data) return;
      const r = data as { avg: number; count: number };
      if (typeof r?.count === "number" && r.count > 0) setRating({ avg: Number(r.avg), count: r.count });
    })();
    return () => { cancelled = true; };
  }, [place.id]);

  const guestsText = formatGuests(place.min_guests, place.max_guests);
  const hasIncluded = (place.included_items?.length ?? 0) > 0;
  const hasBring = (place.bring_items?.length ?? 0) > 0;
  const hasLogistics = guestsText || place.meeting_point || place.cancellation_policy;
  const leadPriceText = primaryPriceOptionText || basePriceText;
  const leadPriceAmountText = primaryPriceOption
    ? getPriceOptionAmountText(primaryPriceOption)
    : formatBasePriceAmount(place.price_amount, place.price_currency, place.price_unit);
  const leadOfferTitle =
    primaryPriceOption?.label?.trim() ||
    (priceOptions.length > 0 ? (isService ? "Featured service" : "Featured experience") : kindLabel);
  const leadOfferBadge =
    primaryPriceOption?.badge?.trim() ||
    (priceOptions.length > 1 ? `${priceOptions.length} options` : isPremium ? "Premium" : kindLabel);
  const snapshotFacts = [
    durationText ? { icon: "clock" as const, label: "Duration", value: durationText } : null,
    scheduleText ? { icon: "calendar" as const, label: isService ? "Hours" : "Dates", value: scheduleText } : null,
    guestsText ? { icon: "users" as const, label: "Group", value: guestsText } : null,
    place.service_mode ? { icon: "location" as const, label: "Format", value: SERVICE_MODE_LABELS[place.service_mode] } : null,
  ].filter((fact): fact is { icon: "clock" | "calendar" | "users" | "location"; label: string; value: string } => Boolean(fact));

  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-24">
      {/* Top bar — desktop only; на мобиле есть назад/сердечко в hero */}
      <div className="hidden lg:block">
        <TopBar
          showBackButton
          onBackClick={handleBackClick}
          userAvatar={userAvatar}
          userDisplayName={userDisplayName}
          userEmail={userEmail}
        />
      </div>

      {/* HERO — same gallery system used by location pages */}
      <section className="relative w-full bg-[#FAFAF7]">
        <div className="lg:hidden relative">
          <MobileCarousel
            photos={allPhotos}
            title={place.title || "Untitled"}
            height={PLACE_LAYOUT_CONFIG.mobile.galleryHeight}
            onPhotoClick={openPhotoGallery}
          />

          {/* Mobile back button */}
          <button
            type="button"
            onClick={handleBackClick}
            className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur shadow"
            aria-label="Back"
          >
            <Icon name="back" size={18} />
          </button>

          {/* Favorite — top right. A labeled action is also shown below the title. */}
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={favoriteLoading}
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur shadow disabled:opacity-50"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <FavoriteIcon isActive={isFavorite} size={20} />
          </button>

          {/* Kind chip — bottom left (mobile only) */}
          <div className="absolute left-3 bottom-3 z-10 flex items-center gap-2">
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-[#1F2A1F] shadow">
              {kindEmoji} {kindLabel}
            </span>
            {isPremium && <PremiumBadge />}
          </div>
        </div>

        <div className="hidden lg:block max-w-[1280px] mx-auto px-6 pt-6">
          <DesktopMosaic
            photos={allPhotos}
            title={place.title || "Untitled"}
            gap={PLACE_LAYOUT_CONFIG.desktopXL.galleryGap}
            radius={PLACE_LAYOUT_CONFIG.desktopXL.galleryRadius}
            onShowAll={() => openPhotoGallery(allPhotos.length > 5 ? 5 : 0)}
            onPhotoClick={openPhotoGallery}
          />
        </div>
      </section>

      {photoGalleryOpen && allPhotos.length > 0 && (
        <div className="fixed inset-0 z-[100] bg-black">
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 sm:p-4 pt-safe-top">
            <div className="absolute left-1/2 -translate-x-1/2 rounded-lg bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
              {galleryPhotoIndex + 1} / {allPhotos.length}
            </div>
            <button
              type="button"
              onClick={closePhotoGallery}
              className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
              aria-label="Close"
            >
              <Icon name="close" size={24} className="text-white" />
            </button>
          </div>

          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <Image
              src={allPhotos[galleryPhotoIndex]}
              alt={`${place.title || "Photo"} - Photo ${galleryPhotoIndex + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
          </div>

          {allPhotos.length > 1 && (
            <>
              <button
                type="button"
                onClick={showPreviousPhoto}
                className="absolute left-2 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70 sm:left-4"
                aria-label="Previous photo"
              >
                <Icon name="back" size={24} className="text-white" />
              </button>
              <button
                type="button"
                onClick={showNextPhoto}
                className="absolute right-2 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70 sm:right-4"
                aria-label="Next photo"
              >
                <Icon name="forward" size={24} className="text-white" />
              </button>
            </>
          )}
        </div>
      )}

      {contactModalOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setContactModalOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-[#ECEEE4] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-[#6F7A5A]">Contact</div>
                <h2 className="font-fraunces text-2xl font-semibold leading-tight text-[#1F2A1F]">
                  {place.title || "Provider"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ECEEE4] bg-white text-[#1F2A1F] transition hover:bg-[#FAFAF7]"
                aria-label="Close contact modal"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            {hasContactDetails ? (
              <div className="space-y-3">
                <PlaceContacts
                  phone={place.phone}
                  website={place.website}
                  instagram={place.instagram}
                  youtube={place.youtube}
                  telegram={place.telegram}
                  title={null}
                  variant="inline"
                />
                {showContactLink && contactLink && (
                  <a
                    href={normalizeExternalUrl(contactLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-sm font-medium text-[#1F2A1F] transition hover:bg-[#ECEEE4]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#556036]">
                      <Icon name="external-link" size={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {stripUrlForCompare(contactLink) || "Contact link"}
                    </span>
                    <Icon name="forward" size={16} className="text-[#6F7A5A]" />
                  </a>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-[#ECEEE4] bg-[#FAFAF7] p-4 text-sm text-[#6F7A5A]">
                Contact details have not been added yet.
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#ECEEE4] bg-white px-4 text-sm font-medium text-[#1F2A1F] transition hover:bg-[#FAFAF7]"
              >
                <Icon name="share" size={16} />
                Share
              </button>
              <button
                type="button"
                onClick={onToggleFavorite}
                disabled={favoriteLoading}
                className={cx(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition",
                  isFavorite
                    ? "border-[#8F9E4F] bg-[#FAFAF7] text-[#8F9E4F] hover:bg-[#ECEEE4]"
                    : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]",
                  favoriteLoading && "opacity-50"
                )}
              >
                <FavoriteIcon isActive={isFavorite} size={16} />
                {isFavorite ? "Saved" : "Add to favorites"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            {/* Title row */}
            <div className="flex flex-col gap-3 mb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <h1 className="font-fraunces text-2xl sm:text-3xl font-semibold text-[#1F2A1F] leading-tight">
                {place.title || "Untitled"}
              </h1>
              <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
                <button
                  type="button"
                  onClick={onToggleFavorite}
                  disabled={favoriteLoading}
                  className={cx(
                    "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors sm:flex-none lg:hidden",
                    isFavorite
                      ? "border-[#8F9E4F] bg-[#FAFAF7] text-[#8F9E4F] hover:bg-[#ECEEE4]"
                      : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]",
                    favoriteLoading && "opacity-50"
                  )}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <FavoriteIcon isActive={isFavorite} size={16} />
                  {isFavorite ? "Saved" : "Add to favorites"}
                </button>
                {canEdit && (
                  <Link
                    href={`/places/${place.id}/edit`}
                    className="inline-flex h-10 flex-1 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#ECEEE4] bg-white px-4 text-sm font-medium text-[#1F2A1F] no-underline transition-colors hover:bg-[#FAFAF7] hover:text-[#556036] sm:flex-none lg:h-11 lg:px-5"
                  >
                    <Icon name="edit" size={16} />
                    Edit
                  </Link>
                )}
              </div>
            </div>
        {/* Aggregate rating под title — Airbnb-style. Скрыт пока нет отзывов. */}
        {rating && (
          <div className="flex items-center gap-1.5 mb-3 text-sm text-[#1F2A1F]">
            <StarRating value={rating.avg} size={14} />
            <span className="font-semibold">{rating.avg.toFixed(2)}</span>
            <span className="text-[#6F7A5A]">·</span>
            <span className="text-[#6F7A5A]">
              {rating.count} review{rating.count === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {/* Subtitle: city/address + service_mode chip */}
        {(place.city || place.address || place.service_mode) && (
          <div className="text-sm text-[#6F7A5A] mb-5 flex items-center gap-3 flex-wrap">
            {(place.city || place.address) && (
              <span className="flex items-center gap-1.5 min-w-0">
                <Icon name="location" size={14} />
                <span className="truncate">{place.address || place.city}</span>
              </span>
            )}
            {place.service_mode && (
              <span className="inline-flex items-center rounded-full bg-[#FAFAF7] border border-[#ECEEE4] px-3 py-1 text-xs font-medium text-[#1F2A1F]">
                {SERVICE_MODE_LABELS[place.service_mode]}
              </span>
            )}
          </div>
        )}

        {/* Hosted by — show only if we have host data or qualification */}
        {(hostProfile || place.host_qualification) && (
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-[#ECEEE4]">
            <div className="w-12 h-12 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] overflow-hidden flex items-center justify-center text-sm font-semibold text-[#8F9E4F] flex-shrink-0">
              {hostProfile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hostProfile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{initialsFromHost(hostProfile?.display_name, hostProfile?.username)}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#1F2A1F]">
                Hosted by {hostName}
              </div>
              {place.host_qualification && (
                <div className="text-xs text-[#6F7A5A] truncate">{place.host_qualification}</div>
              )}
            </div>
          </div>
        )}

        {/* Offer snapshot — one price anchor, with package details below. */}
        <section className="mb-6 overflow-hidden rounded-lg border border-[#ECEEE4] bg-white shadow-sm">
          <div className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-1 text-xs font-semibold text-[#556036]">
                <Icon name={isService ? "wrench" : "sparkles"} size={14} />
                {kindLabel}
              </span>
              {leadOfferBadge && (
                <span className="inline-flex rounded-full bg-[#8F9E4F]/10 px-3 py-1 text-xs font-semibold text-[#556036]">
                  {leadOfferBadge}
                </span>
              )}
              {rating && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1F2A1F]">
                  <Icon name="star" size={12} active className="text-[#D6B25E]" />
                  {rating.avg.toFixed(2)}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                  {priceOptions.length > 0 ? "Recommended pick" : "Experience details"}
                </div>
                <h2 className="mt-1 font-fraunces text-2xl font-semibold leading-tight text-[#1F2A1F]">
                  {leadOfferTitle}
                </h2>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                {leadPriceText ? (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                      {priceOptions.length > 0 ? "Starts at" : "Price"}
                    </div>
                    <div className="flex items-baseline gap-1.5 font-fraunces text-3xl font-semibold leading-none text-[#1F2A1F] sm:justify-end">
                      <span>{leadPriceAmountText || leadPriceText}</span>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-2 text-sm font-medium text-[#6F7A5A]">
                    Price on request
                  </div>
                )}
              </div>
            </div>

            {snapshotFacts.length > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {snapshotFacts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex min-h-[64px] items-center gap-3 rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-2"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#8F9E4F]">
                      <Icon name={fact.icon} size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                        {fact.label}
                      </span>
                      <span className="block truncate text-sm font-medium text-[#1F2A1F]">
                        {fact.value}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Parent location backlink + owner CTA (host pattern) */}
        <ParentLocationCard childId={place.id} canEdit={canEdit} />

        {priceOptions.length > 0 && (
          <section className="mb-8">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                  {isService ? "Service menu" : "Experience menu"}
                </div>
                <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F]">
                  Choose a package
                </h2>
              </div>
              <div className="text-sm text-[#6F7A5A]">
                {priceOptions.length} option{priceOptions.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="space-y-3">
              {priceOptions.map((option, index) => {
                const title = getPriceOptionTitle(option, index);
                const metaLabel = getPriceOptionMetaLabel(option, title);
                const oldPrice = option.compare_at_amount != null
                  ? formatPrice(option.compare_at_amount, option.currency)
                  : null;
                const amountText = getPriceOptionAmountText(option);
                const showFromPrefix = option.unit === "from";
                const duration = formatDuration(option.duration_minutes);
                const badgeKey = option.badge?.trim().toLowerCase();
                const showBadge = Boolean(
                  option.badge &&
                  (option.is_featured || !badgeKey || (badgeCounts.get(badgeKey) ?? 0) === 1)
                );

                return (
                  <article
                    key={option.id || `${title}-${index}`}
                    className={cx(
                      "relative overflow-hidden rounded-lg border p-4 text-[#1F2A1F] transition duration-200 hover:-translate-y-0.5 sm:p-5",
                      option.is_featured
                        ? "border-[#8F9E4F] bg-[linear-gradient(180deg,rgba(244,247,234,0.95)_0%,rgba(255,255,255,0.98)_72%)] shadow-[0_16px_36px_rgba(143,158,79,0.16)] ring-1 ring-[#8F9E4F]/25"
                        : "border-[#ECEEE4] bg-white shadow-[0_12px_28px_rgba(31,42,31,0.06)] hover:border-[#DCE4C6] hover:shadow-[0_16px_34px_rgba(31,42,31,0.09)]",
                    )}
                  >
                    <div
                      className={cx(
                        "pointer-events-none absolute inset-y-0 left-0 w-1",
                        option.is_featured ? "bg-[#8F9E4F]" : "bg-[#ECEEE4]",
                      )}
                    />
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1 pl-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {metaLabel && (
                            <span className="inline-flex rounded-full border border-[#E1E7CB] bg-white/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#556036]">
                              {metaLabel}
                            </span>
                          )}
                          {duration && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E1E7CB] bg-white/85 px-2.5 py-1 text-xs font-medium text-[#556036]">
                              <Icon name="clock" size={12} />
                              <span>{duration}</span>
                            </span>
                          )}
                          {showBadge && option.badge && (
                            <span className={cx(
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.1em]",
                              option.is_featured
                                ? "border-[#8F9E4F] bg-[#8F9E4F] text-white"
                                : "border-[#C96A5B]/25 bg-[#C96A5B]/10 text-[#B63D32]",
                            )}>
                              {option.badge}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-3 font-fraunces text-xl font-semibold leading-tight text-[#1F2A1F] sm:text-2xl">
                          {title}
                        </h3>
                        {option.note && (
                          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6F7A5A]">
                            {option.note}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 pl-1 text-left sm:min-w-[148px] sm:text-right">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                          {showFromPrefix ? "Starts at" : "Price"}
                        </div>
                        <div className="flex items-baseline gap-1.5 font-fraunces text-[30px] font-semibold leading-none text-[#1F2A1F] sm:justify-end">
                          <span>{amountText}</span>
                        </div>
                        {oldPrice && (
                          <div className="mt-1 text-sm text-[#8A9281] line-through">
                            {oldPrice}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Description */}
        {place.description && (
          <section className="mb-8">
            <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-3">About</h2>
            <p className="text-[15px] leading-relaxed text-[#1F2A1F] whitespace-pre-wrap">
              {place.description}
            </p>
          </section>
        )}

        {/* Categories / tags */}
        {((place.categories && place.categories.length > 0) || (place.tags && place.tags.length > 0)) && (
          <section className="mb-8">
            <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-3">
              {isService ? "What's included" : "What to expect"}
            </h2>
            <div className="flex flex-wrap gap-2">
              {place.categories?.map((c) => (
                <span
                  key={`c-${c}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-1.5 text-sm text-[#1F2A1F]"
                >
                  <CategoryVisualIcon category={c} className="h-4 w-4" />
                  {getCategoryLabel(c)}
                </span>
              ))}
              {place.tags?.map((t) => (
                <span
                  key={`t-${t}`}
                  className="rounded-full bg-[#ECEEE4]/60 px-3 py-1.5 text-sm text-[#3F4A35]"
                >
                  #{t}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Logistics — guests, meeting point, cancellation */}
        {hasLogistics && (
          <section className="mb-8 rounded-2xl border border-[#ECEEE4] bg-[#FAFAF7] p-5">
            <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-3">Logistics</h2>
            <div className="space-y-3 text-sm">
              {guestsText && (
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none">👥</span>
                  <div>
                    <div className="font-medium text-[#1F2A1F]">{guestsText}</div>
                  </div>
                </div>
              )}
              {place.meeting_point && (
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none">📍</span>
                  <div>
                    <div className="font-medium text-[#1F2A1F]">Meeting point</div>
                    <div className="text-[#3F4A35]">{place.meeting_point}</div>
                  </div>
                </div>
              )}
              {place.cancellation_policy && (
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none">↩️</span>
                  <div>
                    <div className="font-medium text-[#1F2A1F]">
                      {CANCELLATION_LABELS[place.cancellation_policy] || "Cancellation policy"}
                    </div>
                    <div className="text-xs text-[#6F7A5A]">
                      Maporia is a directory — refund terms are between you and the host.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Included / Bring */}
        {(hasIncluded || hasBring) && (
          <section className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hasIncluded && (
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5">
                <h3 className="font-fraunces text-lg font-semibold text-[#1F2A1F] mb-3">What&apos;s included</h3>
                <ul className="space-y-2">
                  {place.included_items!.map((it) => (
                    <li key={`inc-${it}`} className="flex items-start gap-2 text-sm text-[#1F2A1F]">
                      <span className="mt-0.5 text-[#8F9E4F]">✓</span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasBring && (
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5">
                <h3 className="font-fraunces text-lg font-semibold text-[#1F2A1F] mb-3">What to bring</h3>
                <ul className="space-y-2">
                  {place.bring_items!.map((it) => (
                    <li key={`br-${it}`} className="flex items-start gap-2 text-sm text-[#1F2A1F]">
                      <span className="mt-0.5 text-[#D6B25E]">•</span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Map */}
        {center && (
          <section className="mb-8">
            <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-3">Where</h2>
            <div className="h-64 sm:h-80 w-full overflow-hidden rounded-2xl border border-[#ECEEE4]">
              {mapsLoadError ? (
                <div className="flex h-full w-full items-center justify-center bg-[#ECEEE4] px-5 text-center">
                  <div>
                    <div className="mb-1 text-sm font-medium text-[#1F2A1F]">Map unavailable</div>
                    <div className="text-xs text-[#6F7A5A]">Google Maps is not configured for this environment.</div>
                  </div>
                </div>
              ) : mapsLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  center={center}
                  zoom={14}
                  options={getMapOptions()}
                >
                  <Marker
                    position={center}
                    icon={{
                      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(createStaticPinSvg())}`,
                      scaledSize: new google.maps.Size(40, 50),
                    }}
                  />
                </GoogleMap>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#ECEEE4] text-sm text-[#6F7A5A]">
                  Loading map...
                </div>
              )}
            </div>
            {place.address && (
              <div className="mt-2 text-sm text-[#6F7A5A]">{place.address}</div>
            )}
          </section>
        )}

            {/* Reviews — pb для запаса под sticky-CTA снизу */}
            <div className="pb-8">
              <ReviewsSection placeId={place.id} commentsEnabled={place.comments_enabled} />
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-lg border border-[#ECEEE4] bg-white p-5 shadow-sm">
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setContactModalOpen(true)}
                  className={cx(
                    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition",
                    hasContactDetails
                      ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                      : "bg-[#ECEEE4] text-[#6F7A5A] hover:bg-[#E2E5D8]"
                  )}
                >
                  {ctaLabel}
                  <Icon name="forward" size={16} />
                </button>

                <button
                  type="button"
                  onClick={onToggleFavorite}
                  disabled={favoriteLoading}
                  className={cx(
                    "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition",
                    isFavorite
                      ? "border-[#8F9E4F] bg-[#FAFAF7] text-[#8F9E4F] hover:bg-[#ECEEE4]"
                      : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]",
                    favoriteLoading && "opacity-50"
                  )}
                >
                  <FavoriteIcon isActive={isFavorite} size={16} />
                  {isFavorite ? "Saved" : "Add to favorites"}
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#ECEEE4] bg-white px-4 text-sm font-medium text-[#1F2A1F] transition hover:bg-[#FAFAF7]"
                >
                  <Icon name="share" size={16} />
                  Share
                </button>

                <div className="border-t border-[#ECEEE4] pt-5">
                  <h3 className="mb-3 font-fraunces text-lg font-semibold text-[#1F2A1F]">
                    Contact
                  </h3>
                  {hasContactDetails ? (
                    <PlaceContacts
                      phone={place.phone}
                      website={place.website}
                      instagram={place.instagram}
                      youtube={place.youtube}
                      telegram={place.telegram}
                      title={null}
                      variant="inline"
                    />
                  ) : (
                    <div className="rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] p-4 text-sm leading-relaxed text-[#6F7A5A]">
                      Contact details have not been added yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Bottom CTA bar — sticky */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#ECEEE4] bg-white/95 backdrop-blur pb-safe-bottom lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#ECEEE4] bg-[#FAFAF7] text-xs font-semibold text-[#8F9E4F]">
              {hostProfile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hostProfile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{initialsFromHost(hostProfile?.display_name, hostProfile?.username)}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#6F7A5A]">Hosted by</div>
              <div className="truncate text-sm font-semibold text-[#1F2A1F]">{hostName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setContactModalOpen(true)}
            className={cx(
              "rounded-xl px-5 py-2.5 text-sm font-medium transition",
              hasContactDetails
                ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                : "bg-[#ECEEE4] text-[#6F7A5A] hover:bg-[#E2E5D8]"
            )}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </main>
  );
}

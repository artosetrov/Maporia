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
  per_session: "/ session",
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
  const { isLoaded: mapsLoaded, loadError: mapsLoadError } = useGoogleMaps();

  const isService = kind === "service";
  const kindLabel = isService ? "Service" : "Experience";
  const kindEmoji = isService ? "🛠" : "✨";

  const priceText = useMemo(
    () => formatPrice(place.price_amount, place.price_currency),
    [place.price_amount, place.price_currency]
  );
  const priceUnitLabel = place.price_unit ? PRICE_UNIT_LABEL[place.price_unit] ?? "" : "";
  const durationText = useMemo(() => formatDuration(place.duration_minutes), [place.duration_minutes]);
  const scheduleText = useMemo(() => describeSchedule(place.schedule), [place.schedule]);

  const isPremium = isPlacePremium(place);

  const center = useMemo(
    () => (place.lat && place.lng ? { lat: place.lat, lng: place.lng } : null),
    [place.lat, place.lng]
  );

  const ctaLabel = isService ? "Contact" : "Book";

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

  useEffect(() => {
    if (!photoGalleryOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhotoGalleryOpen(false);
      if (event.key === "ArrowLeft") {
        setGalleryPhotoIndex((current) => (current > 0 ? current - 1 : allPhotos.length - 1));
      }
      if (event.key === "ArrowRight") {
        setGalleryPhotoIndex((current) => (current < allPhotos.length - 1 ? current + 1 : 0));
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [photoGalleryOpen, allPhotos.length]);

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

  return (
    <main className="min-h-screen bg-white pb-24">
      {/* Top bar — desktop only; на мобиле есть назад/сердечко в hero */}
      <div className="hidden lg:block">
        <TopBar
          showBackButton
          onBackClick={() => router.back()}
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

        {/* Mobile back button */}
        <button
          type="button"
          onClick={() => router.back()}
          className="lg:hidden absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur shadow"
          aria-label="Back"
        >
          <Icon name="back" size={18} />
        </button>

        {/* Favorite — top right (mobile only). Desktop has a labeled action in the title row. */}
        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={favoriteLoading}
          className="lg:hidden absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur shadow disabled:opacity-50"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <FavoriteIcon isActive={isFavorite} size={20} />
        </button>

        {/* Kind chip — bottom left (mobile only) */}
        <div className="lg:hidden absolute left-3 bottom-3 z-10 flex items-center gap-2">
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-[#1F2A1F] shadow">
            {kindEmoji} {kindLabel}
          </span>
          {isPremium && <PremiumBadge />}
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

      {/* CONTENT */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="font-fraunces text-2xl sm:text-3xl font-semibold text-[#1F2A1F] leading-tight">
            {place.title || "Untitled"}
          </h1>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleFavorite}
              disabled={favoriteLoading}
              className={cx(
                "hidden lg:inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-medium transition-colors",
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
                className="shrink-0 text-sm text-[#8F9E4F] underline hover:text-[#556036] lg:inline-flex lg:h-11 lg:items-center lg:justify-center lg:gap-2 lg:rounded-xl lg:border lg:border-[#ECEEE4] lg:bg-white lg:px-5 lg:font-medium lg:text-[#1F2A1F] lg:no-underline lg:transition-colors lg:hover:bg-[#FAFAF7]"
              >
                <Icon name="edit" size={16} className="hidden lg:block" />
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
                Hosted by {hostProfile?.display_name || hostProfile?.username || "your host"}
              </div>
              {place.host_qualification && (
                <div className="text-xs text-[#6F7A5A] truncate">{place.host_qualification}</div>
              )}
            </div>
          </div>
        )}

        {/* Quick facts row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {/* Price */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-[#6F7A5A] mb-1">Price</div>
            {priceText ? (
              <div className="font-fraunces text-xl font-semibold text-[#1F2A1F]">
                {place.price_unit === "from" && <span className="text-sm font-normal text-[#6F7A5A] mr-1">from</span>}
                {priceText}
                {priceUnitLabel && place.price_unit !== "from" && (
                  <span className="text-sm font-normal text-[#6F7A5A] ml-1">{priceUnitLabel}</span>
                )}
              </div>
            ) : (
              <div className="text-sm text-[#A8B096]">By request</div>
            )}
          </div>

          {/* Duration — particularly important for experiences */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-[#6F7A5A] mb-1">Duration</div>
            {durationText ? (
              <div className="font-fraunces text-xl font-semibold text-[#1F2A1F]">{durationText}</div>
            ) : (
              <div className="text-sm text-[#A8B096]">Not set</div>
            )}
          </div>

          {/* Schedule */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-[#6F7A5A] mb-1">
              {isService ? "Hours" : "Dates"}
            </div>
            {scheduleText ? (
              <div className="text-sm text-[#1F2A1F]">{scheduleText}</div>
            ) : (
              <div className="text-sm text-[#A8B096]">{isService ? "By appointment" : "TBA"}</div>
            )}
          </div>
        </div>

        {/* Parent location backlink + owner CTA (host pattern) */}
        <ParentLocationCard childId={place.id} canEdit={canEdit} />

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
                  className="rounded-full border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-1.5 text-sm text-[#1F2A1F]"
                >
                  {c}
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

        {/* Contacts — телефон, сайт, соцсети. Скрывается, если все 5 пустые. */}
        <section className="mb-8">
          <PlaceContacts
            phone={place.phone}
            website={place.website}
            instagram={place.instagram}
            youtube={place.youtube}
            telegram={place.telegram}
          />
        </section>

        {/* Reviews — pb для запаса под sticky-CTA снизу */}
        <div className="pb-8">
          <ReviewsSection placeId={place.id} commentsEnabled={place.comments_enabled} />
        </div>
      </div>

      {/* Bottom CTA bar — sticky */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#ECEEE4] bg-white/95 backdrop-blur pb-safe-bottom">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            {priceText ? (
              <div className="font-fraunces text-lg font-semibold text-[#1F2A1F]">
                {place.price_unit === "from" && <span className="text-sm font-normal text-[#6F7A5A] mr-1">from</span>}
                {priceText}
                {priceUnitLabel && place.price_unit !== "from" && (
                  <span className="text-sm font-normal text-[#6F7A5A] ml-1">{priceUnitLabel}</span>
                )}
              </div>
            ) : (
              <div className="text-sm text-[#6F7A5A]">Price on request</div>
            )}
          </div>
          {place.link ? (
            <a
              href={place.link}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-[#8F9E4F] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#556036] transition"
            >
              {ctaLabel}
            </a>
          ) : (
            <button
              type="button"
              disabled
              className={cx(
                "rounded-xl bg-[#ECEEE4] px-5 py-2.5 text-sm font-medium text-[#6F7A5A]",
                "cursor-not-allowed"
              )}
              title="No contact link provided"
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

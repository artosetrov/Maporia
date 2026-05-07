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

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "../../../providers/GoogleMapsProvider";
import { getMapOptions } from "../../../config/googleMaps";
import { createStaticPinSvg } from "../../../lib/mapMarkers";
import TopBar from "../../../components/TopBar";
import FavoriteIcon from "../../../components/FavoriteIcon";
import Icon from "../../../components/Icon";
import PremiumBadge from "../../../components/PremiumBadge";
import { isPlacePremium } from "../../../lib/access";

type OfferPlace = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  link: string | null;
  tags: string[] | null;
  categories: string[] | null;
  cover_url: string | null;
  photo_urls: string[] | null;
  created_by: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  access_level?: string | null;
  kind?: "location" | "service" | "experience" | null;
  price_amount?: number | null;
  price_currency?: string | null;
  price_unit?: string | null;
  duration_minutes?: number | null;
  schedule?: unknown | null;
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
}: Props) {
  const router = useRouter();
  const { isLoaded: mapsLoaded } = useGoogleMaps();

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
  const cover = place.cover_url || (place.photo_urls?.find((u) => typeof u === "string" && u.length > 0) ?? null);

  const center = useMemo(
    () => (place.lat && place.lng ? { lat: place.lat, lng: place.lng } : null),
    [place.lat, place.lng]
  );

  const ctaLabel = isService ? "Contact" : "Book";

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

      {/* HERO */}
      <section className="relative w-full bg-[#FAFAF7]" style={{ paddingBottom: "56.25%" }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={place.title || "Cover"}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-6xl">
            {kindEmoji}
          </div>
        )}

        {/* Mobile back button */}
        <button
          type="button"
          onClick={() => router.back()}
          className="lg:hidden absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur shadow"
          aria-label="Back"
        >
          <Icon name="back" size={18} />
        </button>

        {/* Favorite — top right */}
        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={favoriteLoading}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur shadow disabled:opacity-50"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <FavoriteIcon isActive={isFavorite} size={20} />
        </button>

        {/* Kind chip — bottom left */}
        <div className="absolute left-3 bottom-3 flex items-center gap-2">
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-[#1F2A1F] shadow">
            {kindEmoji} {kindLabel}
          </span>
          {isPremium && <PremiumBadge />}
        </div>
      </section>

      {/* CONTENT */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="font-fraunces text-2xl sm:text-3xl font-semibold text-[#1F2A1F] leading-tight">
            {place.title || "Untitled"}
          </h1>
          {canEdit && (
            <Link
              href={`/places/${place.id}/edit`}
              className="shrink-0 text-sm text-[#8F9E4F] underline hover:text-[#556036]"
            >
              Edit
            </Link>
          )}
        </div>

        {/* Subtitle: city/address */}
        {(place.city || place.address) && (
          <div className="text-sm text-[#6F7A5A] mb-5 flex items-center gap-1.5">
            <Icon name="location" size={14} />
            <span className="truncate">{place.address || place.city}</span>
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

        {/* Map */}
        {center && mapsLoaded && (
          <section className="mb-8">
            <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-3">Where</h2>
            <div className="h-64 sm:h-80 w-full overflow-hidden rounded-2xl border border-[#ECEEE4]">
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
            </div>
            {place.address && (
              <div className="mt-2 text-sm text-[#6F7A5A]">{place.address}</div>
            )}
          </section>
        )}
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

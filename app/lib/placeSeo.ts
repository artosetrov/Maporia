import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import type { Database } from "../types/supabase";

type PlaceSeoRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  | "id"
  | "title"
  | "description"
  | "cover_url"
  | "city"
  | "city_name_cached"
  | "address"
  | "kind"
  | "visibility"
  | "is_hidden"
  | "lat"
  | "lng"
>;

const SITE_URL = "https://www.maporia.co";

const fallbackTitle = "Maporia";
const fallbackDescription = "Places locals love";
const fallbackImage = "/maporia-social-preview.jpg";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const serverSupabase =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "x-client-info": "maporia-seo" } },
      })
    : null;

function stripText(input: string | null | undefined, maxLength: number): string | null {
  const text = (input ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function kindLabel(kind: PlaceSeoRow["kind"]): string {
  if (kind === "service") return "Service";
  if (kind === "experience") return "Experience";
  return "Place";
}

function placeCity(place: PlaceSeoRow): string | null {
  return (
    stripText(place.city_name_cached, 60) ||
    stripText(place.city, 60) ||
    null
  );
}

/**
 * SEO-friendly title: "Name, City | Maporia" вместо просто "Name".
 * Гео в title даёт +10-30% CTR на long-tail запросах вроде
 * "best [thing] in [city]", где наша карточка матчит обе части.
 */
function buildTitle(place: PlaceSeoRow): string {
  const name = stripText(place.title, 70) || fallbackTitle;
  const city = placeCity(place);
  if (!city) return name;
  // Аккуратно с длиной: <60 символов до template '%s | Maporia'.
  const combined = `${name}, ${city}`;
  return combined.length <= 60 ? combined : name;
}

function buildDescription(place: PlaceSeoRow): string {
  const description = stripText(place.description, 160);
  const city = placeCity(place);

  if (description) {
    // Если описание есть, но нет упоминания города — мягко допишем хвост с гео,
    // чтобы long-tail "[thing] in [city]" матчился.
    if (city && !description.toLowerCase().includes(city.toLowerCase())) {
      const suffix = ` — ${kindLabel(place.kind).toLowerCase()} in ${city} on Maporia.`;
      if (description.length + suffix.length <= 200) {
        return description + suffix;
      }
    }
    return description;
  }

  return city
    ? `${kindLabel(place.kind)} in ${city} — find this and other hidden gems on Maporia.`
    : `${kindLabel(place.kind)} on Maporia — places locals love.`;
}

export async function getPlaceSeoById(id: string): Promise<PlaceSeoRow | null> {
  if (!serverSupabase || !id) return null;

  const { data, error } = (await serverSupabase
    .from("places")
    .select("id,title,description,cover_url,city,city_name_cached,address,kind,visibility,is_hidden,lat,lng")
    .eq("id", id)
    .maybeSingle()) as { data: PlaceSeoRow | null; error: unknown | null };

  if (error || !data) return null;
  if (data.is_hidden === true || data.visibility === "hidden" || data.visibility === "private") return null;
  return data as PlaceSeoRow;
}

/**
 * JSON-LD структурированная разметка schema.org/Place.
 * Цель: rich snippets в Google (название, фото, адрес, рейтинг прямо в выдаче).
 *
 * Для service/experience — `LocalBusiness`, для location — `TouristAttraction` (более точный
 * тип для «hidden gems», лучше ранжируется в гео-поиске).
 *
 * Документация: https://schema.org/Place, https://developers.google.com/search/docs/appearance/structured-data/local-business
 */
export function buildPlaceJsonLd(place: PlaceSeoRow | null): Record<string, unknown> | null {
  if (!place) return null;
  const name = stripText(place.title, 100);
  if (!name) return null;

  const schemaType =
    place.kind === "service" || place.kind === "experience"
      ? "LocalBusiness"
      : "TouristAttraction";

  const image = place.cover_url ? [place.cover_url] : undefined;
  const city = placeCity(place);
  const address = stripText(place.address, 200);
  const description = buildDescription(place);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name,
    description,
    url: `${SITE_URL}/id/${place.id}`,
  };

  if (image) jsonLd.image = image;

  if (address || city) {
    jsonLd.address = {
      "@type": "PostalAddress",
      ...(address ? { streetAddress: address } : {}),
      ...(city ? { addressLocality: city } : {}),
      addressCountry: "US",
    };
  }

  if (typeof place.lat === "number" && typeof place.lng === "number") {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: place.lat,
      longitude: place.lng,
    };
  }

  return jsonLd;
}

export function buildPlaceMetadata(place: PlaceSeoRow | null, canonicalPath: string): Metadata {
  if (!place) {
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      alternates: { canonical: canonicalPath },
      openGraph: {
        type: "website",
        url: canonicalPath,
        siteName: "Maporia",
        title: fallbackTitle,
        description: fallbackDescription,
        images: [{ url: fallbackImage, alt: "Maporia - Places locals love" }],
      },
      twitter: {
        card: "summary_large_image",
        title: fallbackTitle,
        description: fallbackDescription,
        images: [fallbackImage],
      },
    };
  }

  const title = buildTitle(place);
  const description = buildDescription(place);
  const image = place.cover_url || fallbackImage;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      url: canonicalPath,
      siteName: "Maporia",
      title,
      description,
      images: [{ url: image, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

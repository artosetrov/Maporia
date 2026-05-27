import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import type { Database } from "../types/supabase";

type PlaceSeoRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  "id" | "title" | "description" | "cover_url" | "city" | "city_name_cached" | "address" | "kind" | "visibility" | "is_hidden"
>;

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

function buildDescription(place: PlaceSeoRow): string {
  const description = stripText(place.description, 180);
  if (description) return description;

  const location = place.city_name_cached || place.city || place.address;
  return location
    ? `${kindLabel(place.kind)} in ${location} on Maporia.`
    : `${kindLabel(place.kind)} on Maporia.`;
}

export async function getPlaceSeoById(id: string): Promise<PlaceSeoRow | null> {
  if (!serverSupabase || !id) return null;

  const { data, error } = (await serverSupabase
    .from("places")
    .select("id,title,description,cover_url,city,city_name_cached,address,kind,visibility,is_hidden")
    .eq("id", id)
    .maybeSingle()) as { data: PlaceSeoRow | null; error: unknown | null };

  if (error || !data) return null;
  if (data.is_hidden === true || data.visibility === "hidden" || data.visibility === "private") return null;
  return data as PlaceSeoRow;
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

  const title = stripText(place.title, 80) || fallbackTitle;
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

/**
 * app/sitemap.ts — динамический sitemap.xml.
 *
 * Покрывает:
 *  - статические страницы (/, /map, /pricing)
 *  - все visible места `/id/<uuid>` (~311 URL по данным БД на 2026-05-28)
 *
 * Next.js автоматически отдаёт это по `/sitemap.xml`.
 * Документация: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 *
 * После деплоя — submit в Google Search Console:
 *   https://search.google.com/search-console → Sitemaps → https://www.maporia.co/sitemap.xml
 */

import { createClient } from "@supabase/supabase-js";
import type { MetadataRoute } from "next";
import type { Database } from "./types/supabase";

// Force runtime generation: build-time prerender фейлится из-за того,
// что SUPABASE_SERVICE_ROLE_KEY и/или network к Supabase недоступны
// в Vercel build-runner. На runtime — всё работает.
// CDN-кеш Vercel держит результат сам (s-maxage по умолчанию).
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE_URL = "https://www.maporia.co";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Service-role клиент обходит RLS — гарантирует полный список visible places.
// Anon fallback на случай если service key недоступен на build/runtime.
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

const supabaseClient =
  supabaseUrl && supabaseKey
    ? createClient<Database>(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "x-client-info": "maporia-sitemap" } },
      })
    : null;

type PlaceForSitemap = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  "id" | "updated_at"
>;

type StaticEntry = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
};

const STATIC_ROUTES: readonly StaticEntry[] = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/map", priority: 0.9, changeFrequency: "daily" },
  { path: "/pricing", priority: 0.6, changeFrequency: "monthly" },
];

async function fetchVisiblePlaces(): Promise<PlaceForSitemap[]> {
  if (!supabaseClient) {
    console.error("[sitemap] supabase client unavailable — env missing");
    return [];
  }

  // Фильтр: только публичные, не скрытые места.
  // Совпадает с предикатом в `get_top_cities` RPC и фильтром главной.
  // NOTE: NOT IN через два neq() надёжнее чем `.not(col,'in',…)` — синтаксис
  // последнего в supabase-js v2.93 неустойчив, иногда возвращает 0 строк.
  const { data, error } = await supabaseClient
    .from("places")
    .select("id,updated_at")
    .eq("manually_hidden", false)
    .eq("is_hidden", false)
    .neq("visibility", "hidden")
    .neq("visibility", "private")
    .order("updated_at", { ascending: false })
    .limit(50000); // Google sitemap limit = 50K URL.

  if (error) {
    console.error("[sitemap] fetch places failed:", error.message);
    return [];
  }
  console.log(`[sitemap] fetched ${data?.length ?? 0} visible places`);
  return (data ?? []) as PlaceForSitemap[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const places = await fetchVisiblePlaces();
  const placeEntries: MetadataRoute.Sitemap = places.map((place) => ({
    url: `${SITE_URL}/id/${place.id}`,
    lastModified: place.updated_at ? new Date(place.updated_at) : now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...placeEntries];
}

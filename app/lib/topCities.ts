import { supabase, hasValidSupabaseConfig } from "./supabase";
import { CITIES } from "../constants";

/**
 * Top-N cities by visible place count.
 *
 * Source of truth: Postgres function `public.get_top_cities(p_limit int)`
 * (see migration `add_get_top_cities_rpc`, 2026-05-08). It returns
 * `{ city: string; total: number }` for the same visibility predicate the
 * homepage applies (manually_hidden=false, is_hidden=false, visibility
 * NOT IN hidden|private), sorted by count desc.
 *
 * Why an RPC and not a client-side group-by:
 *   • Group-by-on-the-server is one round trip + one indexed plan.
 *   • Client-side group-by needs to ship every row, which scales badly.
 *   • Anon role has EXECUTE on this function (RPC migration grants it).
 *
 * Caching:
 *   • Module-level promise cache so concurrent renders dedupe.
 *   • Lifetime = page session (we don't bust on navigation). The list
 *     barely changes; if it goes stale, a hard reload refreshes.
 *
 * Fallback:
 *   • If supabase is misconfigured or the RPC errors, we return the
 *     hardcoded `CITIES` constant. The constant is kept in sync as a
 *     snapshot so first-paint and offline-mode still render a sane list.
 */
export type TopCity = { city: string; total: number };

let pending: Promise<TopCity[]> | null = null;

export function fetchTopCities(limit = 5): Promise<TopCity[]> {
  if (pending) return pending;

  if (!hasValidSupabaseConfig) {
    return Promise.resolve(
      CITIES.map((city) => ({ city, total: 0 })).slice(0, limit),
    );
  }

  pending = (async () => {
    try {
      // supabase-js v2.93's rpc() generic inference fails when the client
      // is typed with a Database. The same workaround is used in
      // app/api/google-import/import/route.ts (a separately-built untyped
      // client). Here we narrow the cast to the rpc call only and keep
      // the rest of this file fully typed.
      const rpc = supabase.rpc as unknown as (
        fn: "get_top_cities",
        args: { p_limit: number },
      ) => Promise<{ data: TopCity[] | null; error: { message: string } | null }>;
      const { data, error } = await rpc("get_top_cities", { p_limit: limit });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) {
        // Empty result — fall back to constants so the dropdown is never
        // visually empty.
        return CITIES.map((city) => ({ city, total: 0 })).slice(0, limit);
      }
      return rows;
    } catch {
      // Reset cache so a future call can retry.
      pending = null;
      return CITIES.map((city) => ({ city, total: 0 })).slice(0, limit);
    }
  })();

  return pending;
}

/** Sync helper for components that just want city names. */
export function topCityNames(cities: TopCity[]): string[] {
  return cities.map((c) => c.city);
}

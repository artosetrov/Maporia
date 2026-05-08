"use client";

import { useEffect, useState } from "react";
import { supabase, hasValidSupabaseConfig } from "../lib/supabase";

/**
 * useHomeKindCounts — единый источник live-чисел для главной (v2).
 *
 * Возвращает 4 счётчика:
 *   - users       (profiles)
 *   - locations   (places where kind='location'    and is_hidden=false)
 *   - services    (places where kind='service'     and is_hidden=false)
 *   - experiences (places where kind='experience'  and is_hidden=false)
 *
 * Считаем ТОЛЬКО primary `kind` без `secondary_kinds` — согласовано
 * с фильтрами и StatsBanner (см. memory: maporia_place_kinds.md).
 *
 * Используется:
 *   - HomeTabsSegmented — для бейджей-счётчиков рядом с подписью таба
 *   - HomeVisualPanel — для live-чипа «276 places live in Fort Lauderdale»
 *   - StatsTicker — заменяет собственный fetch (DRY): один общий запрос
 *     на главную вместо дубля
 *
 * Отдаём СЫРЫЕ live counts. Manual override из app_settings.stats_banner —
 * забота консьюмера (StatsTicker), потому что он завязан на свои настройки
 * видимости. Tabs/Visual всегда показывают live, без override.
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase A).
 */

export type HomeKindCounts = {
  users: number | null;
  locations: number | null;
  services: number | null;
  experiences: number | null;
};

const INITIAL: HomeKindCounts = {
  users: null,
  locations: null,
  services: null,
  experiences: null,
};

export function useHomeKindCounts(): {
  counts: HomeKindCounts;
  loading: boolean;
} {
  const [counts, setCounts] = useState<HomeKindCounts>(INITIAL);
  const [loading, setLoading] = useState<boolean>(hasValidSupabaseConfig);

  useEffect(() => {
    if (!hasValidSupabaseConfig) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const [usersRes, locRes, srvRes, expRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase
            .from("places")
            .select("id", { count: "exact", head: true })
            .eq("kind", "location")
            .eq("is_hidden", false),
          supabase
            .from("places")
            .select("id", { count: "exact", head: true })
            .eq("kind", "service")
            .eq("is_hidden", false),
          supabase
            .from("places")
            .select("id", { count: "exact", head: true })
            .eq("kind", "experience")
            .eq("is_hidden", false),
        ]);
        if (cancelled) return;
        setCounts({
          users: usersRes.error ? null : usersRes.count ?? 0,
          locations: locRes.error ? null : locRes.count ?? 0,
          services: srvRes.error ? null : srvRes.count ?? 0,
          experiences: expRes.error ? null : expRes.count ?? 0,
        });
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError" || e?.message?.includes("abort")) return;
        if (e?.name === "TypeError" && e?.message?.includes("fetch")) return;
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[useHomeKindCounts] failed to load:", e?.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { counts, loading };
}

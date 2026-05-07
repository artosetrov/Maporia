"use client";

import { useEffect, useState } from "react";
import { supabase, hasValidSupabaseConfig } from "../lib/supabase";
import {
  useStatsBannerSettings,
  type StatsMetricKey,
} from "../hooks/useStatsBannerSettings";

/**
 * StatsTicker — компактная одно-строчная версия StatsBanner для нового
 * редизайна главной (Phase 4). Тот же источник данных, та же логика
 * «manual override побеждает live count», та же видимость через
 * `app_settings(id='stats_banner')`. Меняется ТОЛЬКО визуальная подача:
 *  • desktop — горизонтальная строка с разделителями `·`;
 *  • mobile — горизонтально-скроллящиеся чипы.
 *
 * Why duplicate the fetch logic and not extract a shared hook?
 * Это намеренная копия 1:1 на время A/B флага HOME_REDESIGN_ENABLED.
 * Когда редизайн станет дефолтом и StatsBanner будет удалён, общий хук
 * `useLiveStatsCounts()` можно вынести одной отдельной фазой. До этого
 * момента два независимых компонента — самый дешёвый способ гарантировать,
 * что переключение флага не задевает работу старого баннера и
 * админ-страницы `/profile/elements/stats-banner`.
 *
 * Counts:
 *   • users      → profiles.count (exact, head)
 *   • locations  → places.count where kind='location' and is_hidden=false
 *   • services   → places.count where kind='service'  and is_hidden=false
 *   • experiences→ places.count where kind='experience' and is_hidden=false
 * Считаем ТОЛЬКО primary `kind`, без `secondary_kinds` — согласовано
 * с фильтрами и StatsBanner. См. memory: maporia_place_kinds.md.
 *
 * Cross-link: docs/HOME_REDESIGN_INTEGRATION_PLAN.md (Phase 4).
 */

type LiveStats = Record<StatsMetricKey, number | null>;

const INITIAL_LIVE: LiveStats = {
  users: null,
  locations: null,
  services: null,
  experiences: null,
};

const EMOJI: Record<StatsMetricKey, string> = {
  users: "👥",
  locations: "📍",
  services: "🛠",
  experiences: "✨",
};

const ORDER: StatsMetricKey[] = ["users", "locations", "services", "experiences"];

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

export default function StatsTicker() {
  const { settings, loading: settingsLoading } = useStatsBannerSettings();
  const [live, setLive] = useState<LiveStats>(INITIAL_LIVE);

  const visibleKeys = ORDER.filter((k) => settings.metrics[k].enabled);
  const autoKeys = visibleKeys.filter((k) => settings.metrics[k].manual === null);

  useEffect(() => {
    if (!hasValidSupabaseConfig) return;
    if (settingsLoading) return;
    if (autoKeys.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const requests = autoKeys.map((key) => {
          if (key === "users") {
            return supabase
              .from("profiles")
              .select("id", { count: "exact", head: true });
          }
          const placeKind =
            key === "locations" ? "location" : key === "services" ? "service" : "experience";
          return supabase
            .from("places")
            .select("id", { count: "exact", head: true })
            .eq("kind", placeKind)
            .eq("is_hidden", false);
        });

        const results = await Promise.all(requests);
        if (cancelled) return;

        setLive((prev) => {
          const next = { ...prev };
          results.forEach((res, idx) => {
            const key = autoKeys[idx];
            next[key] = res.error ? null : res.count ?? 0;
          });
          return next;
        });
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError" || e?.message?.includes("abort")) return;
        if (e?.name === "TypeError" && e?.message?.includes("fetch")) return;
        if (process.env.NODE_ENV !== "production") {
          console.warn("[StatsTicker] failed to load counts:", e?.message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // autoKeys пересоздаётся каждый рендер — стабильный ключ из join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading, autoKeys.join("|")]);

  if (!settings.enabled) return null;
  if (visibleKeys.length === 0) return null;

  return (
    <div
      role="status"
      aria-label="Live Maporia stats"
      className="mt-4 mb-6 sm:mt-6 sm:mb-8"
    >
      {/* Desktop: одна строка с разделителями */}
      <div className="hidden sm:flex flex-wrap items-center justify-center gap-x-6 gap-y-2
                      py-3 border-t border-b border-[#ECEEE4]
                      text-[13px] text-[#5A5F4D]">
        {visibleKeys.map((key, i) => {
          const cfg = settings.metrics[key];
          const value = cfg.manual !== null ? cfg.manual : live[key];
          return (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span aria-hidden>{EMOJI[key]}</span>
              <b className="text-[#1F2A1F] font-semibold">
                {value == null ? "—" : fmt(value)}
              </b>
              <span className="text-[#6F7A5A]">{cfg.label}</span>
              {i < visibleKeys.length - 1 && (
                <span aria-hidden className="opacity-50 ml-2">
                  ·
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Mobile: горизонтальные чипы. flex-wrap игнорим, разрешаем
          горизонтальный скролл, чтобы 4 ровные плитки помещались на 320px. */}
      <div className="sm:hidden flex items-center gap-2 overflow-x-auto py-2 -mx-4 px-4
                      [&::-webkit-scrollbar]:hidden">
        {visibleKeys.map((key) => {
          const cfg = settings.metrics[key];
          const value = cfg.manual !== null ? cfg.manual : live[key];
          return (
            <span
              key={key}
              className="flex-none inline-flex items-center gap-1.5
                         bg-white border border-[#ECEEE4] rounded-full
                         px-3 py-1.5 text-[12px] text-[#5A5F4D] whitespace-nowrap"
            >
              <span aria-hidden>{EMOJI[key]}</span>
              <b className="text-[#1F2A1F] font-semibold">
                {value == null ? "—" : fmt(value)}
              </b>
              <span>{cfg.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

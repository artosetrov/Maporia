"use client";

import { useEffect, useState } from "react";
import { supabase, hasValidSupabaseConfig } from "../lib/supabase";
import {
  useStatsBannerSettings,
  type StatsMetricKey,
} from "../hooks/useStatsBannerSettings";
import StatsBannerView, { type StatsBannerItem } from "./StatsBannerView";

/**
 * StatsBanner — горизонтальная полоска с до 4 живыми счётчиками для главной:
 *   👥 explorers · 📍 locations · 🛠 services · ✨ experiences
 *
 * Этот компонент отвечает ТОЛЬКО за данные:
 *  - Сами числа: либо live из Supabase (`count: 'exact', head: true`), либо
 *    ручное значение из админских настроек (`metric.manual !== null`).
 *  - Конфиг: app_settings(id='stats_banner') через `useStatsBannerSettings`.
 *    Из настроек берутся: глобальный enabled, per-metric enabled, manual
 *    override и редактируемые подписи (label).
 *
 * Визуал — в `StatsBannerView`. Тот же view используется в админском
 * Live preview (`/profile/elements/stats-banner`), чтобы редактор видел
 * ровно то, что увидит пользователь на главной.
 *
 * Если master `enabled=false` или все 4 метрики отключены — возвращаем null.
 *
 * Live-запросы делаются ТОЛЬКО для тех метрик, у которых нет manual override
 * — лишние round-trip'ы не выполняем. Если запрос упал — ячейка показывает
 * «—», UI не блокируется. См. memory: maporia_place_kinds.md (считаем
 * primary kind, без secondary_kinds, чтобы цифры совпадали с лентой).
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

export default function StatsBanner() {
  const { settings, loading: settingsLoading } = useStatsBannerSettings();
  const [live, setLive] = useState<LiveStats>(INITIAL_LIVE);

  // Какие метрики видимы и какие из них требуют живого запроса (Auto).
  const visibleKeys = ORDER.filter((k) => settings.metrics[k].enabled);
  const autoKeys = visibleKeys.filter((k) => settings.metrics[k].manual === null);

  useEffect(() => {
    if (!hasValidSupabaseConfig) return;
    if (settingsLoading) return; // Дождёмся настроек, чтобы не делать лишних запросов.
    if (autoKeys.length === 0) {
      // Все ручные — нечего грузить.
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Запускаем только нужные запросы, в правильном порядке.
        const requests = autoKeys.map((key) => {
          if (key === "users") {
            return supabase
              .from("profiles")
              .select("id", { count: "exact", head: true });
          }
          // location | service | experience — фильтр по primary kind.
          const placeKind = key === "locations" ? "location" : key === "services" ? "service" : "experience";
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
          console.warn("[StatsBanner] failed to load counts:", e?.message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // autoKeys пересоздаётся каждый рендер, поэтому используем строковый
    // ключ — стабильное представление набора авто-метрик.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading, autoKeys.join("|"), hasValidSupabaseConfig]);

  // Глобальный выкл / все метрики отключены — баннера нет.
  if (!settings.enabled) return null;
  if (visibleKeys.length === 0) return null;

  // Собираем входные данные для презентационного слоя.
  // - manual !== null → используем ручное число
  // - manual === null + есть live → live count
  // - manual === null + ещё нет live + есть Supabase → loading=true (skeleton)
  // - manual === null + нет Supabase → "—"
  const items: StatsBannerItem[] = visibleKeys.map((key) => {
    const cfg = settings.metrics[key];
    const value = cfg.manual !== null ? cfg.manual : live[key];
    const isLoading =
      value === null && hasValidSupabaseConfig && (settingsLoading || cfg.manual === null);
    return {
      key,
      emoji: EMOJI[key],
      value,
      label: cfg.label,
      loading: isLoading,
    };
  });

  return (
    <StatsBannerView
      items={items}
      className="mt-4 mb-6 sm:mt-6 sm:mb-8"
    />
  );
}

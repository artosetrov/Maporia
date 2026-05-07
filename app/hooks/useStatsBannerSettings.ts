import { useEffect, useState } from "react";
import { supabase, hasValidSupabaseConfig } from "../lib/supabase";

/**
 * useStatsBannerSettings
 * ----------------------
 * Читает админские настройки баннера статистики на главной из
 * `app_settings(id='stats_banner', settings jsonb)`.
 *
 * Поведение полностью совпадает с `usePremiumModalSettings`:
 *  - public read через RLS (анон тоже видит запись),
 *  - если строки нет / RLS / сеть — отдаём DEFAULTS, UI не блокируется,
 *  - shape хранится в JSONB, по полям мерджится с дефолтами, чтобы старые
 *    клиенты переживали добавление новых ключей.
 *
 * Использование:
 *   const { settings, loading } = useStatsBannerSettings();
 *   if (!settings.enabled) return null;
 *   const cfg = settings.metrics.users; // { enabled, manual, label }
 */

export type StatsMetricKey = "users" | "locations" | "services" | "experiences";

export type StatsMetricSettings = {
  /** Показывать ли эту метрику в полоске. */
  enabled: boolean;
  /**
   * Ручной override. `null` = Auto (брать count из БД).
   * Любое число (включая 0) — показывать его вместо живого значения.
   */
  manual: number | null;
  /** Подпись под цифрой (например, "explorers", "users"). */
  label: string;
};

export type StatsBannerSettings = {
  /** Глобальный тоггл — если false, баннер скрыт целиком. */
  enabled: boolean;
  metrics: Record<StatsMetricKey, StatsMetricSettings>;
};

export const DEFAULT_STATS_BANNER_SETTINGS: StatsBannerSettings = {
  enabled: true,
  metrics: {
    users: { enabled: true, manual: null, label: "explorers" },
    locations: { enabled: true, manual: null, label: "locations" },
    services: { enabled: true, manual: null, label: "services" },
    experiences: { enabled: true, manual: null, label: "experiences" },
  },
};

/**
 * Глубокий мердж (только наши известные ключи) — на случай, если в БД
 * лежит частичная запись (например, без какой-то метрики или без её label).
 */
function mergeSettings(
  raw: Partial<StatsBannerSettings> | null | undefined
): StatsBannerSettings {
  if (!raw) return DEFAULT_STATS_BANNER_SETTINGS;
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_STATS_BANNER_SETTINGS.enabled;
  const metrics = { ...DEFAULT_STATS_BANNER_SETTINGS.metrics };
  if (raw.metrics && typeof raw.metrics === "object") {
    (Object.keys(metrics) as StatsMetricKey[]).forEach((key) => {
      const m = (raw.metrics as Partial<Record<StatsMetricKey, Partial<StatsMetricSettings>>>)[key];
      if (m && typeof m === "object") {
        metrics[key] = {
          enabled: typeof m.enabled === "boolean" ? m.enabled : metrics[key].enabled,
          manual:
            m.manual === null || m.manual === undefined
              ? null
              : Number.isFinite(Number(m.manual))
                ? Math.max(0, Math.floor(Number(m.manual)))
                : null,
          label: typeof m.label === "string" && m.label.trim().length > 0 ? m.label : metrics[key].label,
        };
      }
    });
  }
  return { enabled, metrics };
}

export function useStatsBannerSettings() {
  const [settings, setSettings] = useState<StatsBannerSettings>(DEFAULT_STATS_BANNER_SETTINGS);
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    if (!hasValidSupabaseConfig) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("settings")
        .eq("id", "stats_banner")
        .single();

      type Row = { settings: Partial<StatsBannerSettings> | null };
      const row = data as Row | null;

      if (!error && row && typeof row === "object" && row.settings) {
        setSettings(mergeSettings(row.settings));
      } else if (error) {
        const errMsg = String((error as { message?: string })?.message ?? "");
        const code = (error as { code?: string })?.code;
        // Нет строки / нет таблицы / сеть — тихо отдаём дефолты.
        if (
          code === "PGRST116" ||
          errMsg.includes("does not exist") ||
          errMsg.includes("Failed to fetch") ||
          errMsg.includes("NetworkError")
        ) {
          return;
        }
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useStatsBannerSettings] using defaults:", errMsg || code || "Unknown");
        }
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      const msg = String(e?.message ?? "");
      if (
        e?.name === "AbortError" ||
        msg.includes("abort") ||
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError")
      ) {
        return;
      }
      if (process.env.NODE_ENV !== "production") {
        console.warn("[useStatsBannerSettings] exception:", msg || e?.name || "Unknown");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return { settings, loading, reloadSettings: loadSettings };
}

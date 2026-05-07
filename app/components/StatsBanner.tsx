"use client";

import { useEffect, useState } from "react";
import { supabase, hasValidSupabaseConfig } from "../lib/supabase";
import {
  useStatsBannerSettings,
  type StatsMetricKey,
} from "../hooks/useStatsBannerSettings";

/**
 * StatsBanner — горизонтальная полоска с до 4 живыми счётчиками для главной:
 *   👥 explorers · 📍 locations · 🛠 services · ✨ experiences
 *
 * Источник данных:
 *  - Сами числа: либо live из Supabase (`count: 'exact', head: true`), либо
 *    ручное значение из админских настроек (`metric.manual !== null`).
 *  - Конфиг: app_settings(id='stats_banner') через `useStatsBannerSettings`.
 *    Из настроек берутся: глобальный enabled, per-metric enabled, manual
 *    override и редактируемые подписи (label).
 *
 * Если все 4 метрики отключены — компонент возвращает null. Если master
 * `enabled=false` — тоже null. Это позволяет админу временно «погасить»
 * полоску без правки кода.
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

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

/**
 * Tailwind grid-cols-* должен быть статичной строкой, иначе JIT-компилятор
 * не сгенерирует класс. Поэтому мапим число «видимых» метрик в литерал.
 */
const GRID_COLS_SM: Record<1 | 2 | 3 | 4, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

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

  const cols = (Math.min(visibleKeys.length, 4) as 1 | 2 | 3 | 4);
  // На мобильном: 1 колонка для одной метрики, иначе 2x2 (или 2x1).
  const mobileGrid = visibleKeys.length === 1 ? "grid-cols-1" : "grid-cols-2";

  return (
    <section
      aria-label="Maporia by the numbers"
      className="mt-4 mb-6 sm:mt-6 sm:mb-8 rounded-2xl border border-[#ECEEE4] bg-white/80 backdrop-blur-[2px] overflow-hidden"
    >
      <ul className={`grid ${mobileGrid} ${GRID_COLS_SM[cols]} sm:divide-x sm:divide-[#ECEEE4]`}>
        {visibleKeys.map((key, idx) => {
          const cfg = settings.metrics[key];
          const value = cfg.manual !== null ? cfg.manual : live[key];
          // Skeleton пока не пришли ни настройки, ни ответ Supabase для Auto-метрики.
          const isLoading =
            value === null && hasValidSupabaseConfig && (settingsLoading || cfg.manual === null);
          // Тонкая горизонтальная граница для нижнего ряда на мобиле, когда 2x2.
          const mobileRowBorder =
            visibleKeys.length > 2 && idx >= 2 ? "border-t border-[#ECEEE4] sm:border-t-0" : "";
          return (
            <li
              key={key}
              className={`flex flex-col items-center justify-center text-center px-3 py-4 sm:py-5 ${mobileRowBorder}`}
            >
              <div className="flex items-baseline gap-2">
                <span aria-hidden className="text-xl sm:text-2xl leading-none">
                  {EMOJI[key]}
                </span>
                <span className="font-fraunces text-[26px] sm:text-3xl font-semibold text-[#1F2A1F] tabular-nums leading-none">
                  {isLoading ? (
                    <span className="inline-block w-14 h-6 sm:h-7 bg-[#ECEEE4] rounded animate-pulse align-middle" />
                  ) : value === null ? (
                    <span className="text-[#A8B096]">—</span>
                  ) : (
                    fmt(value)
                  )}
                </span>
              </div>
              <span className="mt-1.5 text-[11px] sm:text-[12px] font-medium text-[#6F7A5A] uppercase tracking-[0.08em]">
                {cfg.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

import {
  useStatsBannerSettings,
  type StatsMetricKey,
} from "../hooks/useStatsBannerSettings";
import { useHomeKindCounts } from "../hooks/useHomeKindCounts";
import Icon, { type IconName } from "./Icon";

/**
 * StatsTicker — компактная одно-строчная версия StatsBanner для нового
 * редизайна главной (Phase 4). Тот же источник данных, та же логика
 * «manual override побеждает live count», та же видимость через
 * `app_settings(id='stats_banner')`. Меняется ТОЛЬКО визуальная подача:
 *  • desktop (sm+) — ряд мягких чипов (иконка + число + подпись);
 *  • Видимость <sm — задаётся родителем (на главной: секция в page.tsx).
 *
 * v2 update: live-числа берутся из общего хука `useHomeKindCounts`
 * (тот же, что использует HomeTabsSegmented для бейджей и
 * HomeVisualPanel для live-чипа). Это убирает дубликат запросов на
 * главной — на сегодня их 4 на страницу вместо 8.
 *
 * Manual override / visibility / per-metric labels — остаются
 * в `useStatsBannerSettings` (источник правды для админки
 * `/profile/elements/stats-banner`). Этот компонент только консьюмер.
 *
 * Counts:
 *   • users      — profiles count
 *   • locations  — places where kind='location'  and is_hidden=false
 *   • services   — places where kind='service'   and is_hidden=false
 *   • experiences→ places where kind='experience' and is_hidden=false
 * Считаем ТОЛЬКО primary `kind`, без `secondary_kinds`. См. memory:
 * maporia_place_kinds.md.
 *
 * Cross-link: docs/HOME_REDESIGN_INTEGRATION_PLAN.md (Phase 4) +
 * docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase A migration).
 */

// 2026-05-08: эмодзи заменены на Lucide-иконки через фасад `Icon`
// (см. memory: maporia_project / Icons). Это держит главную в едином
// design-system визуальном языке — те же штрихи и веса, что и кнопки/
// табы, без «случайных» emoji-глифов разной ширины.
const ICONS: Record<StatsMetricKey, IconName> = {
  users: "users",
  locations: "location",
  services: "wrench",
  experiences: "sparkles",
};

const ORDER: StatsMetricKey[] = ["users", "locations", "services", "experiences"];

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

export default function StatsTicker() {
  const { settings } = useStatsBannerSettings();
  const { counts: live } = useHomeKindCounts();

  const visibleKeys = ORDER.filter((k) => settings.metrics[k].enabled);

  if (!settings.enabled) return null;
  if (visibleKeys.length === 0) return null;

  return (
    <div
      role="status"
      aria-label="Live Maporia stats"
      className="mt-0 w-full mb-3 sm:mb-4"
    >
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 py-1">
        {visibleKeys.map((key) => {
          const cfg = settings.metrics[key];
          const value = cfg.manual !== null ? cfg.manual : live[key];
          return (
            <span
              key={key}
              className={[
                "inline-flex max-w-full min-w-0 items-center gap-2.5 rounded-2xl border border-[#e4e8da]",
                "bg-white/95 px-3 py-2 shadow-[0_1px_3px_rgba(31,42,31,0.06)]",
                "transition-[box-shadow,transform] duration-200 hover:shadow-[0_2px_8px_rgba(31,42,31,0.08)]",
              ].join(" ")}
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef0e0] text-[#5d6b3f]"
              >
                <Icon name={ICONS[key]} size={16} />
              </span>
              <span className="min-w-0 text-left leading-tight">
                <span className="block font-extrabold tabular-nums tracking-[-0.02em] text-[#16190f] text-[15px]">
                  {value == null ? "—" : fmt(value)}
                </span>
                <span className="mt-0.5 block text-[11px] font-medium text-[#6F7A5A]">
                  {cfg.label}
                </span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

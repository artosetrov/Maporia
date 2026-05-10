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
 *  • desktop (sm+) — горизонтальная строка с разделителями `·`;
 *  • <sm — блок не показываем (место на главной не занимает).
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
      className="hidden sm:block mt-4 mb-6 sm:mt-6 sm:mb-8"
    >
      <div
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2
                      py-3 border-t border-b border-[#ECEEE4]
                      text-[13px] text-[#5A5F4D]"
      >
        {visibleKeys.map((key, i) => {
          const cfg = settings.metrics[key];
          const value = cfg.manual !== null ? cfg.manual : live[key];
          return (
            <span key={key} className="inline-flex items-center gap-1.5">
              <Icon name={ICONS[key]} size={16} className="text-[#6F7A5A]" />
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
    </div>
  );
}

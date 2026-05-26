"use client";

import Icon, { type IconName } from "./Icon";
import {
  useStatsBannerSettings,
  type StatsMetricKey,
} from "../hooks/useStatsBannerSettings";
import { useHomeKindCounts } from "../hooks/useHomeKindCounts";

type CreatorPremiumGateProps = {
  eyebrow?: string;
  title?: string;
  copy?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary: () => void;
};

type StatItem = {
  key: string;
  label: string;
  value: string;
  icon: IconName;
  accent: string;
};

const formatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const metricIcons: Record<StatsMetricKey, IconName> = {
  users: "users",
  locations: "location",
  services: "wrench",
  experiences: "sparkles",
};

function formatCount(value: number | null): string {
  if (value === null) return "Live";
  return `${formatter.format(value)}+`;
}

export default function CreatorPremiumGate({
  eyebrow = "Creator access",
  title = "Put your place where people are already looking.",
  copy = "Upgrade to a creator plan to publish locations, services, and experiences with photos, tags, Google import, and AI-polished descriptions.",
  primaryLabel = "See creator plans",
  secondaryLabel = "Explore Maporia",
  onPrimary,
  onSecondary,
}: CreatorPremiumGateProps) {
  const { settings } = useStatsBannerSettings();
  const { counts } = useHomeKindCounts();

  const metricValue = (key: StatsMetricKey): number | null => {
    const cfg = settings.metrics[key];
    return cfg.manual !== null ? cfg.manual : counts[key];
  };

  const metricLabel = (key: StatsMetricKey, fallback: string): string => {
    const label = settings.metrics[key].label?.trim();
    return label.length > 0 ? label : fallback;
  };

  const services = metricValue("services");
  const experiences = metricValue("experiences");
  const offers =
    services === null && experiences === null
      ? null
      : (services ?? 0) + (experiences ?? 0);

  const stats: StatItem[] = [
    {
      key: "users",
      label: metricLabel("users", "explorers"),
      value: formatCount(metricValue("users")),
      icon: metricIcons.users,
      accent: "bg-[#E8F0D2] text-[#556036]",
    },
    {
      key: "locations",
      label: metricLabel("locations", "locations mapped"),
      value: formatCount(metricValue("locations")),
      icon: metricIcons.locations,
      accent: "bg-[#F3E2B8] text-[#7A5A18]",
    },
    {
      key: "offers",
      label: "services + experiences",
      value: formatCount(offers),
      icon: "sparkles",
      accent: "bg-[#F5D6CF] text-[#9A4638]",
    },
    {
      key: "views",
      label: "views, saves, leads",
      value: "Built in",
      icon: "bar-chart",
      accent: "bg-[#DEE7E2] text-[#31594D]",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FAFAF7]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(143,158,79,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(143,158,79,0.12) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0.25) 68%, transparent)",
        }}
      />

      <section className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#E3E8D4] bg-white/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#556036] shadow-sm">
            <Icon name="sparkles" size={14} />
            {eyebrow}
          </div>

          <h1 className="font-fraunces text-[42px] font-semibold leading-[0.98] text-[#1F2A1F] sm:text-[58px] lg:text-[72px]">
            {title}
          </h1>

          <p className="mt-5 max-w-xl text-[16px] leading-7 text-[#4F5A43] sm:text-[18px]">
            {copy}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onPrimary}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1F2A1F] px-6 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(31,42,31,0.22)] transition hover:bg-[#2A3A2A] active:scale-[0.98]"
            >
              {primaryLabel}
              <Icon name="forward" size={18} />
            </button>
            <button
              type="button"
              onClick={onSecondary}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#C9D0BC] bg-white/90 px-6 text-sm font-semibold text-[#1F2A1F] transition hover:bg-white active:scale-[0.98]"
            >
              <Icon name="map" size={18} />
              {secondaryLabel}
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium text-[#6F7A5A]">
            <span className="rounded-full border border-[#E3E8D4] bg-white/80 px-3 py-1.5">
              Google Maps import
            </span>
            <span className="rounded-full border border-[#E3E8D4] bg-white/80 px-3 py-1.5">
              AI description polish
            </span>
            <span className="rounded-full border border-[#E3E8D4] bg-white/80 px-3 py-1.5">
              Map and search visibility
            </span>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#E1E5D5] bg-white/92 p-4 shadow-[0_28px_80px_rgba(31,42,31,0.16)] backdrop-blur sm:p-5">
          <div className="rounded-2xl bg-[#1F2A1F] p-5 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#DDE7BF]">
                  Maporia reach
                </div>
                <div className="mt-1 font-fraunces text-2xl font-semibold">
                  Your listing launchpad
                </div>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/12 text-[#F3E2B8]">
                <Icon name="bar-chart" size={20} />
              </span>
            </div>

            <div className="mt-5 h-2 rounded-full bg-white/12">
              <div className="h-2 w-[78%] rounded-full bg-[#D6B25E]" />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-medium text-white/70">
              <span>Draft</span>
              <span>Photos</span>
              <span>Live</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div
                key={stat.key}
                className="min-h-[118px] rounded-2xl border border-[#ECEEE4] bg-[#FAFAF7] p-4"
              >
                <span
                  className={`mb-3 flex size-9 items-center justify-center rounded-full ${stat.accent}`}
                >
                  <Icon name={stat.icon} size={18} />
                </span>
                <div className="font-fraunces text-2xl font-semibold leading-none text-[#1F2A1F]">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs font-medium leading-snug text-[#6F7A5A]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 rounded-2xl border border-[#ECEEE4] bg-white p-4">
            {[
              ["location", "Show up by city, category, and map search."],
              ["eye", "Turn views into saves, clicks, and customer intent."],
              ["sparkles", "Launch faster with AI-assisted place copy."],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-start gap-3 text-sm text-[#3F4A35]">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#EEF0E0] text-[#556036]">
                  <Icon name={icon as IconName} size={14} />
                </span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

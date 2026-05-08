"use client";

import { useRef } from "react";
import { HOME_TABS, type HomeKind } from "../types/home";
import type { HomeKindCounts } from "../hooks/useHomeKindCounts";

/**
 * HomeTabsSegmented (v2) — minimal Dribbble-style tab strip.
 *
 * Visual:
 *   • inactive tab — text + icon, no chip background, hover tint
 *   • active tab — solid dark pill ([#16190f]), cream foreground
 *   • optional count badge after the label, fed by useHomeKindCounts
 *
 * Behaviour:
 *   • role="tablist" + roving tabindex (only active tab has tabindex=0)
 *   • Left/Right keyboard arrows cycle through tabs and focus the new one
 *   • emits onChange(kind); URL contract (?tab=services|experiences) is
 *     wired in page.tsx via setActiveKind, NOT in this component
 *
 * Counts:
 *   • optional `counts` prop — when null/undefined, badge is hidden
 *     (we don't render "—"; absent badge = "still loading or n/a")
 *   • count = 0 still renders the badge (intentional: signals empty kind)
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase B).
 */

type IconKey = "pin" | "spark" | "wrench";

const ICON_BY_KIND: Record<HomeKind, IconKey> = {
  location: "pin",
  experience: "spark",
  service: "wrench",
};

function TabIcon({ kind }: { kind: IconKey }) {
  // Inline SVG so we don't pay an Icon-facade lookup for three tabs that
  // are always present. `currentColor` lets the active style colour the
  // stroke automatically.
  if (kind === "pin") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 2c4 0 7 3 7 7 0 5.2-7 13-7 13S5 14.2 5 9c0-4 3-7 7-7Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === "spark") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3l2 6h6l-5 4 2 7-5-4-5 4 2-7-5-4h6z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 7l3-3 3 3-4 4M9 10l-5 5v5h5l5-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function countFor(kind: HomeKind, counts?: HomeKindCounts): number | null {
  if (!counts) return null;
  if (kind === "location") return counts.locations;
  if (kind === "experience") return counts.experiences;
  return counts.services;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

export default function HomeTabsSegmented({
  active,
  onChange,
  counts,
}: {
  active: HomeKind;
  onChange: (kind: HomeKind) => void;
  counts?: HomeKindCounts;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const idx = HOME_TABS.findIndex((t) => t.id === active);
    if (idx < 0) return;
    const next =
      e.key === "ArrowRight"
        ? HOME_TABS[(idx + 1) % HOME_TABS.length]
        : HOME_TABS[(idx - 1 + HOME_TABS.length) % HOME_TABS.length];
    e.preventDefault();
    onChange(next.id);
    const nextEl = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab-id="${next.id}"]`
    );
    nextEl?.focus();
  }

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Home content type"
      onKeyDown={handleKeyDown}
      className="inline-flex items-center gap-1.5"
    >
      {HOME_TABS.map((tab) => {
        const isActive = active === tab.id;
        const n = countFor(tab.id, counts);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-tab-id={tab.id}
            onClick={() => onChange(tab.id)}
            className={[
              "h-11 px-4 rounded-full text-[14px] font-semibold whitespace-nowrap",
              "inline-flex items-center gap-2",
              "transition-colors focus:outline-none",
              "focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1",
              isActive
                ? "bg-[#16190f] text-white"
                : "text-[#4A4F3D] hover:bg-[#16190f]/5",
            ].join(" ")}
          >
            <TabIcon kind={ICON_BY_KIND[tab.id]} />
            <span>{tab.label}</span>
            {n !== null && (
              <span
                aria-hidden
                className={[
                  "text-[11px] font-bold px-2 py-0.5 rounded-full",
                  isActive
                    ? "bg-white/15 text-white/90"
                    : "bg-[#16190f]/8 text-[#4A4F3D]",
                ].join(" ")}
              >
                {fmt(n)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

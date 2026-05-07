"use client";

import { useRef } from "react";
import { HOME_TABS, type HomeKind } from "../types/home";

/**
 * HomeTabsSegmented — single segmented control for switching the home
 * content kind (Locations / Experiences / Services).
 *
 * Replaces the legacy three-<Pill variant="tab"> row only on the home
 * page; <Pill> remains untouched because it's used in many other places.
 *
 * Contract preserved:
 *   • onChange(kind) is the same callback `setActiveKind` from page.tsx
 *     which mutates `?tab=` via router.replace. We do NOT change URL
 *     handling here — we only emit the choice.
 *
 * A11y:
 *   • role="tablist" + role="tab" + aria-selected.
 *   • Roving tabindex: only the active tab is in the tab order; the
 *     other two are reachable with Left/Right arrows. This matches the
 *     APG segmented-control pattern and avoids polluting the focus ring
 *     with three sibling buttons.
 *
 * Cross-link: docs/HOME_REDESIGN_INTEGRATION_PLAN.md (Phase 2).
 */
export default function HomeTabsSegmented({
  active,
  onChange,
}: {
  active: HomeKind;
  onChange: (kind: HomeKind) => void;
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
    // Move focus to the newly-active tab so screen readers announce it.
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
      className="inline-flex bg-white border border-[#ECEEE4] rounded-full p-1.5 shadow-sm"
    >
      {HOME_TABS.map((tab) => {
        const isActive = active === tab.id;
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
              "h-10 px-5 rounded-full text-[14px] font-medium",
              "inline-flex items-center gap-2 whitespace-nowrap",
              "transition-colors focus:outline-none",
              "focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1",
              isActive
                ? "bg-[#8F9E4F] text-[#F7F3DA] shadow-[0_1px_0_rgba(0,0,0,0.06)]"
                : "text-[#5A5F4D] hover:bg-[#F1EDE2]",
            ].join(" ")}
          >
            <span aria-hidden>{tab.emoji}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

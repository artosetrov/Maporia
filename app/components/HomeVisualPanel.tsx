"use client";

import type { HomeKindCounts } from "../hooks/useHomeKindCounts";

/**
 * HomeVisualPanel (v2) — right-column visual hero panel.
 *
 * Desktop only (>= lg). On smaller viewports the parent grid hides this
 * column entirely, so we don't ship the markup at all.
 *
 * Composition (all CSS, no images, ~0 KB to bundle):
 *   • map-dot textured background
 *   • 5 floating pin silhouettes hinting at coastal density
 *   • main "featured" mock card (sunset gradient = Las Olas at dusk)
 *   • secondary peeking card
 *   • live-chip showing real `locations` count via useHomeKindCounts
 *
 * Phase E.1: mock data only. Phase E.2 (post-rollout) can swap to real
 * top-rated places via a `featured` prop populated by an RPC. The shape
 * is intentionally tiny so the wiring stays trivial.
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase E).
 */

const PIN_PATH =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 2c4 0 7 3 7 7 0 5.2-7 13-7 13S5 14.2 5 9c0-4 3-7 7-7Z' fill='black'/></svg>"
  );

function Pin({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`absolute w-3.5 h-[18px] bg-[#d34736] ${className}`}
      style={{
        WebkitMask: `url("${PIN_PATH}") no-repeat center/contain`,
        mask: `url("${PIN_PATH}") no-repeat center/contain`,
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))",
      }}
    />
  );
}

export default function HomeVisualPanel({
  city,
  counts,
}: {
  city: string;
  counts?: HomeKindCounts;
}) {
  const liveCount = counts?.locations ?? null;

  return (
    <aside
      aria-hidden
      className="relative rounded-[22px] overflow-hidden hidden lg:block"
      style={{
        height: 480,
        background:
          "radial-gradient(120% 70% at 30% 20%, rgba(255,255,255,.85) 0%, transparent 60%)," +
          "linear-gradient(140deg, #e9e3c8 0%, #c8cf9e 100%)",
        boxShadow:
          "0 4px 16px rgba(31,36,23,.08), 0 24px 48px rgba(31,36,23,.10)",
      }}
    >
      {/* dotted map texture overlay */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(31,36,23,.08) 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* floating pins */}
      <Pin className="top-[64px] left-[56px]" />
      <Pin className="top-[130px] left-[200px] opacity-80" />
      <Pin className="bottom-[110px] left-[84px] opacity-85" />
      <Pin className="bottom-[140px] right-[72px]" />
      <Pin className="bottom-[56px] right-[220px] opacity-70" />

      {/* secondary peeking card */}
      <div
        className="absolute right-6 top-9 w-[168px] h-[110px] bg-white rounded-2xl overflow-hidden flex flex-col"
        style={{
          transform: "rotate(5deg)",
          boxShadow: "0 12px 28px rgba(0,0,0,.16)",
        }}
      >
        <div
          className="flex-1 relative"
          style={{ background: "linear-gradient(135deg, #6fb1c8 0%, #2f6f87 80%)" }}
        >
          <span className="absolute inset-0 flex items-center justify-center text-[28px] opacity-85">
            🥾
          </span>
        </div>
        <div className="px-2.5 py-1.5 bg-white">
          <div className="text-[12px] font-semibold text-[#16190f] truncate">
            Hugh Taylor Birch SP
          </div>
          <div className="text-[10px] text-[#8a8f7d]">🌳 Nature & Walks</div>
        </div>
      </div>

      {/* main featured card — Las Olas Boulevard */}
      <div
        className="absolute left-1/2 top-[46%] w-[268px] h-[320px] bg-white rounded-[22px] overflow-hidden"
        style={{
          transform: "translate(-58%, -50%) rotate(-3deg)",
          boxShadow:
            "0 30px 60px rgba(0,0,0,.18), 0 8px 16px rgba(0,0,0,.10)",
        }}
      >
        <div
          className="relative"
          style={{
            height: 180,
            background:
              "linear-gradient(180deg, transparent 0%, rgba(0,0,0,.18) 100%)," +
              "linear-gradient(180deg, #f9c178 0%, #ec7c52 38%, #c84d54 70%, #5a3a6e 100%)",
          }}
        >
          <span className="absolute left-3 top-3 bg-white/90 text-[#16190f] text-[11px] font-bold px-2.5 py-1 rounded-full tracking-[0.02em]">
            🤫 Hidden gem
          </span>
          <span className="absolute right-3 top-3 w-[30px] h-[30px] rounded-full bg-black/30 backdrop-blur text-white inline-flex items-center justify-center text-[14px]">
            ♡
          </span>
          {/* horizon line */}
          <span className="absolute left-0 right-0 bottom-7 h-px bg-black/20" />
          {/* palm silhouette */}
          <span className="absolute left-3.5 -bottom-0.5 text-[36px]" style={{ filter: "brightness(.4) saturate(.6)" }}>
            🌴
          </span>
        </div>
        <div className="px-4 py-3.5">
          <div className="font-fraunces text-[18px] font-semibold tracking-[-0.01em] text-[#16190f]">
            Las Olas Boulevard
          </div>
          <div className="mt-1 text-[12px] text-[#8a8f7d] flex items-center gap-1.5">
            📍 {city} · 🌅 Scenic & Views
          </div>
          <div className="mt-3.5 flex items-center justify-between">
            <span className="font-bold text-[14px] text-[#16190f]">Free walk</span>
            <span className="text-[12px] text-[#4a4f3d]">★ 4.8 · 142 saved</span>
          </div>
        </div>
      </div>

      {/* live counter chip */}
      <div
        className="absolute right-[18px] bottom-[18px] bg-[#16190f] text-[#f7f3da] rounded-full px-3.5 py-2 text-[12px] font-semibold inline-flex items-center gap-2"
        style={{ boxShadow: "0 1px 2px rgba(31,36,23,.04), 0 8px 24px rgba(31,36,23,.06)" }}
      >
        <span
          className="w-2 h-2 rounded-full bg-[#6abf6a]"
          style={{ boxShadow: "0 0 0 4px rgba(106,191,106,.25)" }}
        />
        {liveCount === null ? `Live in ${city}` : `${new Intl.NumberFormat("en-US").format(liveCount)} places live in ${city}`}
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { HomeKindCounts } from "../hooks/useHomeKindCounts";
import { useFeaturedPlaces, type FeaturedPlace } from "../hooks/useFeaturedPlaces";

/**
 * HomeVisualPanel (v2.2) — desktop-only "wow" panel on the right side of
 * the home hero.
 *
 * Composition:
 *   • Stylised Florida map background (inline SVG: ocean wash, land
 *     silhouette, coastal stipple) — sets the local-by-locals tone for
 *     South Florida content.
 *   • Subtle drifting "sun" blob over the ocean for warmth.
 *   • Five floating map pins clustered around the Atlantic coast where
 *     Fort Lauderdale / Lighthouse Point / Dania Beach actually sit.
 *   • Featured card — the same production place-card visual used in the home feed and
 *     /map list. Auto-rotates every ~6s with a fade-in + slight zoom.
 *     Pulls real places from `useFeaturedPlaces`. Hover pauses rotation.
 *   • Progress dots underneath as a quiet rotation indicator.
 *   • Live chip — locations count from `useHomeKindCounts`.
 *
 * Why we use the production PlaceCard here:
 *   The hero acts as a teaser for what users will see in the feed.
 *   Showing a different visual style would disconnect the promise from
 *   the experience two scrolls down. Same component = same affordances,
 *   premium badge, hover behaviour, photo handling, etc.
 *
 * Reduced motion: globals.css disables drift / pulse / fade-in keyframes
 * under prefers-reduced-motion. The carousel still rotates content —
 * just without visual transitions.
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase E.2).
 */

const ROTATE_MS = 6000;

/**
 * FloridaMap — hand-illustrated Florida raster from /public.
 *
 * The image is fetched from `/florida-map.png` (place file there).
 * If the file is missing the panel still works — onError swaps the
 * background to the legacy bisque tone so we don't get a broken-image
 * icon.
 *
 * A subtle white wash + hint of blur sits between the artwork and the
 * floating cards / satellites so the playful illustration doesn't
 * compete with photo content placed on top.
 */
function FloridaMap() {
  return (
    <>
      {/* base wash — always visible behind the artwork in case the
          image hasn't loaded yet (or the path is wrong) */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 30% 20%, rgba(255,255,255,.85) 0%, transparent 60%)," +
            "linear-gradient(140deg, #e9e3c8 0%, #c8cf9e 100%)",
        }}
      />
      {/* the illustration */}
      <span
        aria-hidden
        className="absolute inset-0 bg-center bg-cover"
        style={{
          backgroundImage: "url(/florida-map.png)",
          // gentle blur so card content stays the focus; remove if you
          // want crisp illustration detail.
          filter: "saturate(0.95)",
        }}
      />
      {/* contrast wash — a soft cream layer keeps text + chips readable */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,253,244,0.18) 0%, rgba(255,253,244,0.32) 100%)",
        }}
      />
      {/* warm sunlight blob — drifting, lifts the upper-left corner */}
      <span
        aria-hidden
        className="absolute inset-0 home-hero-blob-1"
        style={{
          background:
            "radial-gradient(40% 32% at 22% 18%, rgba(255,236,180,0.55) 0%, transparent 60%)",
        }}
      />
    </>
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
  const { places: featured } = useFeaturedPlaces(8);

  // Auto-rotate the main card every ROTATE_MS while not hovered.
  const [activeIdx, setActiveIdx] = useState(0);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (featured.length <= 1) return;
    if (hovering) return;
    const t = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % featured.length);
    }, ROTATE_MS);
    return () => window.clearInterval(t);
  }, [featured.length, hovering]);

  // Reset idx if pool size shrinks.
  useEffect(() => {
    if (activeIdx >= featured.length && featured.length > 0) setActiveIdx(0);
  }, [featured.length, activeIdx]);

  const liveLabel = useMemo(
    () =>
      liveCount === null
        ? `Live in ${city}`
        : `${new Intl.NumberFormat("en-US").format(liveCount)} places live in ${city}`,
    [liveCount, city]
  );

  return (
    <aside
      aria-label="Featured places"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="relative rounded-[22px] overflow-hidden hidden lg:block isolate cursor-pointer"
      style={{
        height: 480,
        boxShadow:
          "0 4px 16px rgba(31,36,23,.08), 0 24px 48px rgba(31,36,23,.10)",
      }}
    >
      {/* ── Florida map background ── */}
      <FloridaMap />

      <Link
        href="/map?view=map"
        aria-label="Open map view"
        className="absolute inset-0 z-[1] rounded-[22px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-2"
      />

      {/* No floating red pins on this version — the illustration already
          carries its own "pins" (sand castles, lighthouses, boats), and
          adding extra map pins on top creates visual noise. */}

      {/* ── Constellation ──
          One central featured card + 6 orbiting satellite chips. The
          centre card auto-rotates every ROTATE_MS pulling fresh photos
          from the same pool; the satellites stay locked to their
          starting place so the orbit motion stays smooth. */}
      <Constellation featured={featured} activeIdx={activeIdx} />

      {/* live counter chip */}
      <div
        className="absolute right-[18px] top-[18px] z-[2] bg-[#16190f] text-[#f7f3da] rounded-full px-3.5 py-2 text-[12px] font-semibold inline-flex items-center gap-2 pointer-events-none"
        style={{
          boxShadow:
            "0 1px 2px rgba(31,36,23,.04), 0 8px 24px rgba(31,36,23,.06)",
        }}
      >
        <span
          className="w-2 h-2 rounded-full bg-[#6abf6a]"
          style={{ boxShadow: "0 0 0 4px rgba(106,191,106,.25)" }}
        />
        {liveLabel}
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Constellation — central featured card + 6 orbiting satellite chips.
//
// Centre: stable anchor; React just swaps the photo URL when activeIdx
// ticks, so the card stays put and we get a soft cross-fade via CSS
// transition on background-image (rendered as two stacked layers).
//
// Satellites: 6 small chips on two orbit rings. Animation lives in CSS
// (`home-hero-orbit-1` / `home-hero-orbit-2` keyframes in globals.css).
// We use negative animation-delay to evenly distribute satellites along
// their orbit so they don't bunch up at start.
//
// Each satellite is a Link to its place page. Hover bumps z-index so
// the card jumps to the front; otherwise satellites pass behind/under
// the centre as they orbit.
// ────────────────────────────────────────────────────────────────────────

const CENTER_W = 224;
const CENTER_H = 220;

const ORBIT_1_RADIUS = 180; // outer ring
const ORBIT_1_DURATION = 26; // seconds
const ORBIT_2_RADIUS = 130; // inner ring
const ORBIT_2_DURATION = 32; // seconds (slower, for natural parallax)

/** Cheap deterministic gradient per place id for cards without photos. */
function gradientFor(id: string): string {
  const palettes = [
    "linear-gradient(180deg, #f9c178 0%, #ec7c52 38%, #c84d54 70%, #5a3a6e 100%)",
    "linear-gradient(180deg, #ffd6a4 0%, #f1916b 40%, #a4527a 75%, #3a3a6b 100%)",
    "linear-gradient(180deg, #cde7ff 0%, #6fb1c8 45%, #2f6f87 80%, #1f2c3a 100%)",
    "linear-gradient(180deg, #d8e6b1 0%, #8ea757 40%, #4d5b27 80%, #2a2f15 100%)",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palettes[hash % palettes.length];
}

function CenterCard({ place }: { place: FeaturedPlace }) {
  const photo = place.photoUrl;
  return (
    <Link
      href={`/id/${place.id}`}
      // Re-key on place.id so the fade-in keyframe retriggers each
      // rotation; CSS transitions on background also help, but keying
      // gives the cleanest "the card was just dealt" feel.
      key={place.id}
      className="home-hero-card-in absolute left-1/2 top-1/2 block rounded-[20px] overflow-hidden border border-white/50"
      style={{
        width: CENTER_W,
        height: CENTER_H,
        transform: "translate(-50%, -50%) rotate(-3deg)",
        zIndex: 5,
        filter: "drop-shadow(0 28px 56px rgba(0,0,0,0.22))",
      }}
    >
      <div className="relative w-full h-full">
        {photo ? (
          <span
            aria-hidden
            className="absolute inset-0 bg-center bg-cover home-hero-card-photo"
            style={{
              backgroundImage: `url(${JSON.stringify(photo).slice(1, -1)})`,
            }}
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ background: gradientFor(place.id) }}
          />
        )}
        {/* gentle vignette */}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.18) 100%)",
          }}
        />
      </div>
    </Link>
  );
}

function Satellite({
  place,
  ring, // 1 = outer, 2 = inner
  /** Index within its ring (0..N-1), used to distribute via negative delay. */
  indexInRing,
  ringSize,
}: {
  place: FeaturedPlace;
  ring: 1 | 2;
  indexInRing: number;
  ringSize: number;
}) {
  const duration = ring === 1 ? ORBIT_1_DURATION : ORBIT_2_DURATION;
  const radius = ring === 1 ? ORBIT_1_RADIUS : ORBIT_2_RADIUS;
  // Negative delay = "fast-forward" the animation on mount so each
  // satellite starts at a different point on the same orbit.
  const delay = -(duration / ringSize) * indexInRing;
  const photo = place.photoUrl;

  return (
    <div
      // Wrapper carries the orbit motion (rotate + translateX + counter-rotate).
      // The actual visual chip lives inside so hover effects don't fight
      // the orbit transform.
      className={`absolute left-1/2 top-1/2 ${
        ring === 1 ? "home-hero-orbit-1" : "home-hero-orbit-2"
      }`}
      style={
        {
          marginLeft: -28,
          marginTop: -28,
          "--orbit-r": `${radius}px`,
          "--orbit-duration": `${duration}s`,
          "--orbit-delay": `${delay}s`,
          zIndex: 3,
        } as React.CSSProperties
      }
    >
      <Link
        href={`/id/${place.id}`}
        aria-label={`${place.title}${place.city ? ` — ${place.city}` : ""}`}
        className="block w-14 h-14 rounded-2xl overflow-hidden border-2 border-white transition-transform hover:scale-110"
        style={{ boxShadow: "0 6px 14px rgba(0,0,0,.18)" }}
      >
        {photo ? (
          <span
            aria-hidden
            className="block w-full h-full bg-center bg-cover"
            style={{
              backgroundImage: `url(${JSON.stringify(photo).slice(1, -1)})`,
            }}
          />
        ) : (
          <span
            aria-hidden
            className="block w-full h-full"
            style={{ background: gradientFor(place.id) }}
          />
        )}
      </Link>
    </div>
  );
}

function Constellation({
  featured,
  activeIdx,
}: {
  featured: FeaturedPlace[];
  activeIdx: number;
}) {
  if (featured.length === 0) return null;
  const N = featured.length;

  // Centre = currently-active item. Satellites = up to 6 of the
  // remaining places (fall back to wrapping around if pool is smaller).
  const centre = featured[activeIdx % N];
  const others: FeaturedPlace[] = [];
  for (let i = 1; i <= 6 && i < N; i++) {
    others.push(featured[(activeIdx + i) % N]);
  }

  // Split satellites: indices 0/2/4 → outer ring, 1/3/5 → inner ring.
  const outer = others.filter((_, i) => i % 2 === 0); // up to 3
  const inner = others.filter((_, i) => i % 2 === 1); // up to 3

  return (
    <>
      {/* satellites first so they sit behind the centre by default */}
      {outer.map((p, i) => (
        <Satellite
          key={`o-${p.id}`}
          place={p}
          ring={1}
          indexInRing={i}
          ringSize={Math.max(outer.length, 1)}
        />
      ))}
      {inner.map((p, i) => (
        <Satellite
          key={`i-${p.id}`}
          place={p}
          ring={2}
          indexInRing={i}
          ringSize={Math.max(inner.length, 1)}
        />
      ))}
      <CenterCard place={centre} />
    </>
  );
}

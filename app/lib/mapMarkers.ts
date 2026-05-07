/**
 * Branded SVG map markers for Maporia.
 *
 * Marker variants:
 * - default: olive gradient pin with emoji
 * - active / selected: larger, glowing ring, elevated shadow
 * - premium: default + small diamond badge overlay
 *
 * All markers are SVG data-URL based (no external assets required).
 */

// ── Brand palette ──────────────────────────────────────────────
const OLIVE_PRIMARY = "#8F9E4F";
const OLIVE_DARK = "#556036";
const SOFT_SAGE = "#C9D2A3";
const WARM_WHITE = "#FAFAF7";
const PREMIUM_GOLD = "#D4A853";
const PREMIUM_GOLD_DARK = "#B8922F";

// ── Size presets ───────────────────────────────────────────────
export const MARKER_SIZE_DEFAULT = 40;
export const MARKER_SIZE_ACTIVE = 52;

// ── Types ──────────────────────────────────────────────────────
export type MarkerState = "default" | "active";

/** Тип карточки на карте — определяет emoji и (потенциально) tint маркера. */
export type MarkerKind = "location" | "service" | "experience";

/** Эмодзи по умолчанию, если для service/experience не пришла категория. */
const KIND_EMOJI: Record<MarkerKind, string> = {
  location: "📍",
  service: "🛠",
  experience: "✨",
};

/**
 * Эмодзи для маркера: для service/experience всегда специфичная иконка,
 * для location — берём первую категорию (как раньше). Это даёт мгновенное
 * визуальное различие на карте без ломки бренд-палитры.
 */
export const getMarkerEmoji = (
  kind: MarkerKind | null | undefined,
  categories: string[] | null,
): string => {
  if (kind === "service" || kind === "experience") return KIND_EMOJI[kind];
  return getCategoryEmoji(categories);
};

// ── Helpers ────────────────────────────────────────────────────

/** Extracts the leading emoji from a category string like "🍽 Food & Drinks" */
export const getCategoryEmoji = (categories: string[] | null): string => {
  if (!categories || categories.length === 0) return "📍";
  const first = categories[0];
  const emoji = first.split(" ")[0];
  return emoji || "📍";
};

// ── SVG Generators ─────────────────────────────────────────────

/**
 * Branded pin marker with emoji.
 *
 * Shape: rounded rectangle (squircle) with subtle shadow.
 * Fill: olive gradient.
 * Center: white circle with emoji.
 */
const createBrandedMarkerSvg = (
  emoji: string,
  size: number,
  state: MarkerState,
  isPremium: boolean,
): string => {
  const isActive = state === "active";

  // Outer dimensions include glow padding for active state
  const padding = isActive ? 6 : 0;
  const totalSize = size + padding * 2;
  const cx = totalSize / 2;
  const cy = totalSize / 2;

  // Main circle radius
  const mainR = size / 2 - 2;
  // Inner white circle for emoji
  const innerR = mainR * 0.62;
  const emojiSize = Math.round(innerR * 1.3);

  // Shadow / glow
  const shadowStd = isActive ? 3 : 2;
  const shadowOpacity = isActive ? 0.4 : 0.25;

  // Build SVG
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">`;

  // Defs: gradient + shadow
  svg += `<defs>`;
  svg += `<linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">`;
  svg += `<stop offset="0%" stop-color="${OLIVE_PRIMARY}"/>`;
  svg += `<stop offset="100%" stop-color="${OLIVE_DARK}"/>`;
  svg += `</linearGradient>`;
  svg += `<filter id="ms" x="-30%" y="-20%" width="160%" height="160%">`;
  svg += `<feDropShadow dx="0" dy="2" stdDeviation="${shadowStd}" flood-color="${OLIVE_DARK}" flood-opacity="${shadowOpacity}"/>`;
  svg += `</filter>`;
  if (isPremium) {
    svg += `<linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">`;
    svg += `<stop offset="0%" stop-color="${PREMIUM_GOLD}"/>`;
    svg += `<stop offset="100%" stop-color="${PREMIUM_GOLD_DARK}"/>`;
    svg += `</linearGradient>`;
  }
  svg += `</defs>`;

  // Active glow ring
  if (isActive) {
    svg += `<circle cx="${cx}" cy="${cy}" r="${mainR + 4}" fill="none" stroke="${SOFT_SAGE}" stroke-width="2.5" opacity="0.6"/>`;
  }

  // Main circle with gradient
  svg += `<circle cx="${cx}" cy="${cy}" r="${mainR}" fill="url(#mg)" filter="url(#ms)"/>`;

  // Subtle inner ring
  svg += `<circle cx="${cx}" cy="${cy}" r="${mainR - 2}" fill="none" stroke="white" stroke-width="1" opacity="0.2"/>`;

  // White circle for emoji
  svg += `<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="${WARM_WHITE}"/>`;

  // Emoji text
  svg += `<text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${emojiSize}">${emoji}</text>`;

  // Premium badge (top-right diamond)
  if (isPremium) {
    const badgeX = cx + mainR * 0.55;
    const badgeY = cy - mainR * 0.55;
    const badgeR = Math.max(6, size * 0.14);
    svg += `<circle cx="${badgeX}" cy="${badgeY}" r="${badgeR + 1.5}" fill="white"/>`;
    svg += `<circle cx="${badgeX}" cy="${badgeY}" r="${badgeR}" fill="url(#pg)"/>`;
    // Star/sparkle inside badge
    const starSize = badgeR * 0.7;
    svg += `<text x="${badgeX}" y="${badgeY}" text-anchor="middle" dominant-baseline="central" font-size="${starSize * 2}" fill="white">✦</text>`;
  }

  svg += `</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

// ── Public API ─────────────────────────────────────────────────

/**
 * Create a branded marker icon configuration for google.maps.Marker.
 *
 * @param emoji   - emoji string for the marker center
 * @param state   - "default" | "active"
 * @param isPremium - whether to show premium badge
 * @returns google.maps.Icon-compatible object
 */
export const createMarkerIcon = (
  emoji: string,
  state: MarkerState = "default",
  isPremium = false,
): google.maps.Icon => {
  const size = state === "active" ? MARKER_SIZE_ACTIVE : MARKER_SIZE_DEFAULT;
  const padding = state === "active" ? 6 : 0;
  const totalSize = size + padding * 2;

  return {
    url: createBrandedMarkerSvg(emoji, size, state, isPremium),
    scaledSize: new google.maps.Size(totalSize, totalSize),
    anchor: new google.maps.Point(totalSize / 2, totalSize / 2),
  };
};

/**
 * Simple branded pin for static maps (e.g. place detail page).
 * Renders an olive gradient circle with a white dot center.
 */
export const createStaticPinSvg = (size = 32): string => {
  const r = size / 2 - 2;
  const cx = size / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="spg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${OLIVE_PRIMARY}"/>
      <stop offset="100%" stop-color="${OLIVE_DARK}"/>
    </linearGradient>
    <filter id="sps" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="${OLIVE_DARK}" flood-opacity="0.3"/>
    </filter>
  </defs>
  <circle cx="${cx}" cy="${cx}" r="${r}" fill="url(#spg)" filter="url(#sps)"/>
  <circle cx="${cx}" cy="${cx}" r="${r * 0.35}" fill="${WARM_WHITE}"/>
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

/**
 * Custom cluster renderer for Google Maps MarkerClusterer.
 *
 * Minimal, premium style:
 * - Frosted-glass look: semi-transparent olive background + white border
 * - Clean white count text with Inter/system font
 * - Three size tiers: small (2–9), medium (10–49), large (50+)
 * - Subtle drop shadow
 */
import type { Cluster, ClusterStats, Renderer } from "@googlemaps/markerclusterer";

/** Brand color constants */
const OLIVE_PRIMARY = "#8F9E4F";
const OLIVE_DARK = "#556036";

/** Size tiers for cluster markers */
type SizeTier = "small" | "medium" | "large";

const CLUSTER_SIZES: Record<SizeTier, { diameter: number; fontSize: number }> = {
  small:  { diameter: 38, fontSize: 13 },
  medium: { diameter: 48, fontSize: 14 },
  large:  { diameter: 58, fontSize: 15 },
};

/** Determine size tier based on marker count */
const getSizeTier = (count: number): SizeTier => {
  if (count >= 50) return "large";
  if (count >= 10) return "medium";
  return "small";
};

/**
 * Generate SVG data URL for a cluster marker.
 * Frosted circle with olive fill, white border, white text, subtle shadow.
 */
const createClusterSvg = (count: number, diameter: number, fontSize: number): string => {
  const r = diameter / 2;
  const text = count > 999 ? "999+" : String(count);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}">
  <defs>
    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${OLIVE_PRIMARY}"/>
      <stop offset="100%" stop-color="${OLIVE_DARK}"/>
    </linearGradient>
    <filter id="cs" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="${OLIVE_DARK}" flood-opacity="0.3"/>
    </filter>
  </defs>
  <circle cx="${r}" cy="${r}" r="${r - 2}" fill="url(#cg)" opacity="0.88" filter="url(#cs)"/>
  <circle cx="${r}" cy="${r}" r="${r - 4}" fill="none" stroke="white" stroke-width="1.5" opacity="0.35"/>
  <text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central" fill="white" font-family="Inter, system-ui, sans-serif" font-size="${fontSize}" font-weight="600" letter-spacing="0.3">${text}</text>
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

/**
 * Custom renderer implementing the @googlemaps/markerclusterer Renderer interface.
 * Returns a google.maps.Marker styled as a branded cluster circle.
 */
export class MaporiaClusterRenderer implements Renderer {
  render(cluster: Cluster, _stats: ClusterStats, map: google.maps.Map): google.maps.Marker {
    const { count, position } = cluster;
    const tier = getSizeTier(count);
    const { diameter, fontSize } = CLUSTER_SIZES[tier];

    const svgUrl = createClusterSvg(count, diameter, fontSize);

    const marker = new google.maps.Marker({
      position,
      map,
      icon: {
        url: svgUrl,
        scaledSize: new google.maps.Size(diameter, diameter),
        anchor: new google.maps.Point(diameter / 2, diameter / 2),
      },
      // Clusters render above individual markers
      zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
      // Accessible tooltip
      title: `${count} places`,
    });

    return marker;
  }
}

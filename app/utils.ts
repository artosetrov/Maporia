/**
 * Shared utility functions for Maporia
 */

/**
 * Combines class names, filtering out falsy values
 */
export function cx(...classes: Array<string | false | undefined | null>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Generates initials from a display name
 */
export function initialsFromName(name?: string | null): string {
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

/**
 * Generates initials from an email address
 */
export function initialsFromEmail(email?: string | null): string {
  if (!email) return "U";
  const name = email.split("@")[0] || "U";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? name[1] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

/**
 * Formats a timestamp as a relative time string (e.g., "2h ago", "3d ago")
 */
export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Gets recently viewed place IDs from localStorage
 */
export function getRecentlyViewedPlaceIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('recentlyViewedPlaces');
    if (!stored) return [];
    const data = JSON.parse(stored);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error reading recently viewed places:', error);
    return [];
  }
}

/**
 * Saves a place ID to recently viewed in localStorage
 */
export function saveToRecentlyViewed(placeId: string, maxItems: number = 20): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getRecentlyViewedPlaceIds();
    // Remove if already exists
    const filtered = current.filter(id => id !== placeId);
    // Add to front
    const updated = [placeId, ...filtered].slice(0, maxItems);
    localStorage.setItem('recentlyViewedPlaces', JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving recently viewed place:', error);
  }
}

/**
 * Converts an Instagram Reel URL to embed format
 * Supports formats:
 * - https://www.instagram.com/reel/{id}/
 * - https://www.instagram.com/reel/{id}
 * - https://instagram.com/reel/{id}/
 * - https://instagram.com/reel/{id}
 * 
 * @param url - Instagram Reel URL
 * @returns Embed URL or null if invalid
 */
export function convertInstagramReelToEmbed(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  
  const trimmed = url.trim();
  
  // Extract reel ID from various URL formats
  const reelMatch = trimmed.match(/instagram\.com\/reel\/([A-Za-z0-9_-]+)/);
  if (!reelMatch || !reelMatch[1]) return null;
  
  const reelId = reelMatch[1];
  // Add parameters to minimize Instagram UI elements (best-effort; Instagram may ignore some)
  return `https://www.instagram.com/reel/${reelId}/embed/?hidecaption=1&autoplay=1&muted=1&embed_source=iframe`;
}

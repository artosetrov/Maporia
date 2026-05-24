type GoogleMapsLinkTarget = {
  title?: string | null;
  address?: string | null;
  city?: string | null;
  city_name_cached?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  google_place_id?: string | null;
  link?: string | null;
};

const GOOGLE_MAPS_SEARCH_URL = "https://www.google.com/maps/search/";

function cleanText(value?: string | null): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function finiteNumber(value?: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pushUnique(parts: string[], value?: string | null) {
  const text = cleanText(value);
  if (!text) return;

  const lower = text.toLowerCase();
  if (!parts.some((part) => part.toLowerCase() === lower)) {
    parts.push(text);
  }
}

function isGoogleMapsHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    host === "maps.google.com" ||
    (host.endsWith(".google.com") && url.pathname.startsWith("/maps"))
  );
}

function buildQuery(target: GoogleMapsLinkTarget): string | null {
  const parts: string[] = [];
  pushUnique(parts, target.title);
  pushUnique(parts, target.address);
  pushUnique(parts, target.city_name_cached);
  pushUnique(parts, target.city);
  pushUnique(parts, target.country);

  if (parts.length > 0) return parts.join(", ");

  const lat = finiteNumber(target.lat);
  const lng = finiteNumber(target.lng);
  return lat !== null && lng !== null ? `${lat},${lng}` : null;
}

export function buildGoogleMapsSearchUrl(
  target: GoogleMapsLinkTarget,
  googlePlaceId = target.google_place_id,
): string | null {
  const query = buildQuery(target) ?? cleanText(googlePlaceId);
  if (!query) return null;

  const params = new URLSearchParams({
    api: "1",
    query,
  });
  const placeId = cleanText(googlePlaceId);
  if (placeId) params.set("query_place_id", placeId);

  return `${GOOGLE_MAPS_SEARCH_URL}?${params.toString()}`;
}

export function normalizeGoogleMapsUrl(
  url: string | null | undefined,
  target: GoogleMapsLinkTarget = {},
): string | null {
  const rawUrl = cleanText(url);
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    if (!isGoogleMapsHost(parsed)) return null;

    const query = parsed.searchParams.get("query") ?? parsed.searchParams.get("q");
    const queryPlaceId = parsed.searchParams.get("query_place_id");
    const legacyPlaceId = query?.startsWith("place_id:") ? query.slice("place_id:".length) : null;

    if (queryPlaceId || legacyPlaceId) {
      return buildGoogleMapsSearchUrl(target, queryPlaceId ?? legacyPlaceId);
    }

    if (query && parsed.pathname.includes("/place/")) {
      const params = new URLSearchParams({ api: "1", query });
      return `${GOOGLE_MAPS_SEARCH_URL}?${params.toString()}`;
    }

    return rawUrl;
  } catch {
    return null;
  }
}

export function getGoogleMapsPlaceUrl(target: GoogleMapsLinkTarget): string | null {
  if (target.google_place_id) {
    return buildGoogleMapsSearchUrl(target, target.google_place_id);
  }

  return normalizeGoogleMapsUrl(target.link, target) ?? buildGoogleMapsSearchUrl(target);
}

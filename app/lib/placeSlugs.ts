const RESERVED_ROOT_SLUGS = new Set([
  "add",
  "admin",
  "api",
  "auth",
  "brand-guide",
  "collections",
  "explore",
  "favorites",
  "feed",
  "id",
  "login",
  "map",
  "places",
  "pricing",
  "profile",
  "saved",
  "search",
  "settings",
  "signup",
]);

export function normalizePlaceSlug(input: string | null | undefined): string | null {
  const slug = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");

  if (slug.length < 3) return null;
  if (RESERVED_ROOT_SLUGS.has(slug)) return null;
  return slug;
}

export function isValidPlaceSlug(input: string | null | undefined): boolean {
  const slug = input ?? "";
  return normalizePlaceSlug(slug) === slug && /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug);
}

export function getPlacePublicHref(place: { id: string; slug?: string | null }): string {
  const slug = normalizePlaceSlug(place.slug);
  return slug ? `/${slug}` : `/id/${place.id}`;
}

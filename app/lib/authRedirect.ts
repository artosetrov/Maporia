/**
 * Auth redirect helpers: safe "from" validation and auth URL building.
 * Use getAuthUrl(from) or useAuthRedirect() so ?from= is consistent and safe.
 */

/** Paths we never redirect to after login (auth, logout, etc.) */
const BLOCKED_REDIRECT_PATHS = ["/auth", "/logout"];

function isBlockedRedirectPath(path: string): boolean {
  const normalized = path.toLowerCase().trim();
  if (BLOCKED_REDIRECT_PATHS.includes(normalized)) return true;
  if (normalized.startsWith("/auth/") || normalized.startsWith("/logout/")) return true;
  return false;
}

/**
 * Returns a safe redirect path for ?from=, or null.
 * - Same-origin only: must start with /, not //
 * - Never /auth, /logout or /auth/*, /logout/*
 */
export function getSafeRedirectFrom(from: string | null): string | null {
  if (!from || typeof from !== "string") return null;
  const trimmed = from.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (isBlockedRedirectPath(trimmed)) return null;
  return trimmed;
}

/**
 * Builds /auth URL with optional ?from= (validated).
 * Use for router.push(getAuthUrl(pathname)) or links href={getAuthUrl(pathname)}.
 */
export function getAuthUrl(from?: string | null): string {
  const safe = getSafeRedirectFrom(from ?? null);
  return safe ? `/auth?from=${encodeURIComponent(safe)}` : "/auth";
}

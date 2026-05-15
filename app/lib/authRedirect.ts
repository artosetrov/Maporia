/**
 * Auth redirect helpers: safe "from" validation and auth URL building.
 * Use getAuthUrl(from) (alias getLoginUrl) или useAuthRedirect() so ?from=
 * is consistent and safe.
 *
 * Note: /auth is now only a backwards-compatible bridge. The canonical auth
 * screen is /login, which starts with passwordless Google/email-code auth and
 * keeps password sign-in as a secondary legacy path. Сами защищённые
 * страницы используют getAuthUrl, поэтому правка одной функции
 * автоматически перенаправляет всё, что должно было идти на /auth.
 */

/** Paths we never redirect to after login (auth pages, logout, etc.) */
const BLOCKED_REDIRECT_PATHS = [
  "/auth",
  "/login",
  "/signup",
  "/logout",
];

function isBlockedRedirectPath(path: string): boolean {
  const normalized = path.toLowerCase().trim();
  // Strip query and hash before comparing.
  const pathOnly = normalized.split("?")[0]!.split("#")[0]!;

  if (BLOCKED_REDIRECT_PATHS.includes(pathOnly)) return true;
  if (
    pathOnly.startsWith("/auth/") ||
    pathOnly.startsWith("/logout/") ||
    pathOnly.startsWith("/login/") ||
    pathOnly.startsWith("/signup/")
  ) {
    return true;
  }
  return false;
}

/**
 * Returns a safe redirect path for ?from=, or null.
 * - Same-origin only: must start with /, not //
 * - Never /auth, /login, /signup, /logout (and their /...subpaths)
 */
export function getSafeRedirectFrom(from: string | null): string | null {
  if (!from || typeof from !== "string") return null;
  const trimmed = from.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (isBlockedRedirectPath(trimmed)) return null;
  return trimmed;
}

/**
 * Builds /login URL with optional ?from= (validated).
 * Use for router.push(getAuthUrl(pathname)) or links href={getAuthUrl(pathname)}.
 *
 * Imя getAuthUrl сохранено для обратной совместимости со всеми существующими
 * вызовами в коде.
 */
export function getAuthUrl(from?: string | null): string {
  const safe = getSafeRedirectFrom(from ?? null);
  return safe ? `/login?from=${encodeURIComponent(safe)}` : "/login";
}

/** Alias для смыслового соответствия новой странице. */
export const getLoginUrl = getAuthUrl;

/** Прямая ссылка на /signup (с тем же ?from=). */
export function getSignupUrl(from?: string | null): string {
  const safe = getSafeRedirectFrom(from ?? null);
  return safe ? `/signup?from=${encodeURIComponent(safe)}` : "/signup";
}

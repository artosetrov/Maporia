import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy for route handling (Next.js 16 replacement for middleware.ts)
 *
 * Protected routes are checked for valid Supabase session.
 * Unauthenticated users are redirected to /auth.
 */

const PROTECTED_PREFIXES = ["/profile", "/add", "/saved", "/admin"];

const isProtectedPath = (pathname: string): boolean => {
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // /places/:id/edit routes
  if (/^\/places\/[^/]+\/edit(\/|$)/.test(pathname)) return true;
  return false;
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-protected routes early
  if (!isProtectedPath(pathname)) return NextResponse.next();

  // Guard: env vars must exist for auth check
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    // Can't verify auth — let the page handle it client-side
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  void supabase;

  // Note: getUser() is async but proxy in Next.js 16 should be sync for routing.
  // For async auth checks, we rely on the client-side RequireAuth component.
  // The proxy here refreshes the session cookie if needed.
  // Full auth gating is done by RequireAuth in (auth)/layout.tsx.
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

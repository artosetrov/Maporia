import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Proxy for route handling (replaces deprecated middleware.ts)
 * 
 * Note: Authentication checks are handled by individual pages using useUserAccess hook.
 * This proxy is kept minimal - pages like /profile, /saved, /add handle their own auth redirects.
 * 
 * Proxy in Next.js 16 is for routing only: rewrites, redirects, and headers.
 * Complex logic and authentication should be in Server Components or API routes.
 */
export function proxy(request: NextRequest) {
  // Let all requests pass through - pages handle their own auth checks
  // This avoids issues with Supabase session checking
  return NextResponse.next();
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

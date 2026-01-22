import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for route protection based on user roles
 * 
 * Note: Authentication checks are handled by individual pages using useUserAccess hook.
 * This middleware is kept minimal to avoid issues with session checking in edge runtime.
 * Pages like /profile, /saved, /add already handle their own auth redirects.
 */
export async function middleware(request: NextRequest) {
  // Let all requests pass through - pages handle their own auth checks
  // This avoids issues with Supabase session checking in middleware edge runtime
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

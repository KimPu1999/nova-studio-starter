import { NextResponse, type NextRequest } from 'next/server';

/**
 * Phase 19 — route-level guardrail middleware.
 *
 * SECURITY NOTE: this middleware only checks for the PRESENCE of a session
 * cookie — it cannot validate the session (middleware cannot query Postgres in
 * this runtime). Every protected page and server action still enforces real
 * authentication server-side via requireUser/requireAdmin/currentUser. The
 * middleware's job is defense-in-depth + UX: an unauthenticated visitor is
 * redirected to login before a protected page even starts rendering.
 */
const SESSION_COOKIE = 'nova_admin_session';

export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();
  if (pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/account/:path*',
    '/billing/:path*',
    '/developers/:path*',
    '/vendor/:path*',
    '/hosting/:path*',
    '/workspaces/:path*',
    '/ai/:path*',
  ],
};

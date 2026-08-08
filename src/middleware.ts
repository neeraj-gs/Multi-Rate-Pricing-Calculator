import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/**
 * Edge-side gatekeeping for *page* navigation.
 *
 * This exists for user experience, not for security: it turns a request for
 * `/documents` from an anonymous visitor into a redirect to `/login` before any
 * app code runs, instead of a flash of an empty dashboard. Every API route
 * independently re-checks the session and scopes its queries by user id, so
 * this file being bypassed would not expose a single record.
 *
 * `jose` is used precisely because it runs in the Edge runtime — a Node-only
 * JWT library would force this into a serverless function and add latency to
 * every navigation.
 */

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/documents',
  '/reports',
  '/activity',
  '/settings',
];

const AUTH_PAGES = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) && !session) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve the destination so signing in lands where the user was going.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (AUTH_PAGES.includes(pathname) && session) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/documents/:path*',
    '/reports/:path*',
    '/activity/:path*',
    '/settings/:path*',
    '/login',
    '/signup',
  ],
};
